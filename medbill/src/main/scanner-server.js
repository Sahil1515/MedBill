/**
 * Phone Camera Scanner Server
 *
 * Starts a local HTTPS + WSS server on the LAN.
 * The pharmacist opens the URL (or scans the QR code) on their phone,
 * which opens a browser-based barcode scanner using the phone camera.
 * Detected barcodes are sent back via WebSocket to the Electron app.
 *
 * Requires: ws (npm dependency)
 * Compatible phones: Chrome on Android, Safari on iOS 17+
 */

const https = require('https');
const { WebSocketServer } = require('ws');
const os = require('os');
const selfsigned = require('selfsigned');

const PORT = 8765;

// Generate a self-signed cert once per process lifetime (cached).
// IP SAN is required — Chrome rejects certs without it on local-network IPs.
// selfsigned v5+ is async, so this returns a Promise.
let _tlsContext = null;
async function getTLSContext(ip) {
  if (!_tlsContext) {
    const attrs = [{ name: 'commonName', value: ip }];
    const pems = await selfsigned.generate(attrs, {
      days: 365,
      keySize: 2048,
      extensions: [
        { name: 'subjectAltName', altNames: [{ type: 7, ip }] }
      ]
    });
    _tlsContext = { key: pems.private, cert: pems.cert };
  }
  return _tlsContext;
}
let server = null;
let wss = null;
let serverInfo = null;

function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

function getScannerHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <title>MedBill Scanner</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0f172a; color: #f8fafc;
      min-height: 100vh; display: flex; flex-direction: column;
      align-items: center; justify-content: center; padding: 1rem; gap: 1rem;
    }
    h1 { font-size: 1.1rem; font-weight: 600; letter-spacing: 0.01em; }
    #viewfinder {
      position: relative;
      width: min(90vw, 380px); height: min(90vw, 380px);
      border-radius: 14px; overflow: hidden; background: #1e293b;
      box-shadow: 0 0 0 3px #334155;
    }
    video { width: 100%; height: 100%; object-fit: cover; display: block; }
    .frame {
      position: absolute; inset: 0;
      display: flex; align-items: center; justify-content: center;
      pointer-events: none;
    }
    .frame-box {
      width: 72%; height: 38%;
      border: 2.5px solid rgba(255,255,255,0.8);
      border-radius: 8px;
      box-shadow: 0 0 0 9999px rgba(0,0,0,0.38);
    }
    #status { font-size: 0.82rem; opacity: 0.65; text-align: center; display: flex; align-items: center; gap: 6px; }
    .dot { width: 9px; height: 9px; border-radius: 50%; background: #94a3b8; flex-shrink: 0; }
    .dot.on { background: #4ade80; }
    #result {
      padding: 0.55rem 1.4rem; background: #16a34a; border-radius: 8px;
      font-size: 1rem; font-weight: 600; text-align: center;
      max-width: 90vw; word-break: break-all; opacity: 0;
      transition: opacity 0.15s;
    }
    #result.show { opacity: 1; }
    #error { color: #f87171; text-align: center; font-size: 0.88rem; max-width: 90vw; line-height: 1.6; }
  </style>
</head>
<body>
  <h1>📷 MedBill Phone Scanner</h1>
  <div id="viewfinder">
    <video id="video" autoplay playsinline muted></video>
    <div class="frame"><div class="frame-box"></div></div>
  </div>
  <div id="status"><span class="dot" id="dot"></span><span id="statusText">Connecting to MedBill…</span></div>
  <div id="result"></div>
  <div id="error"></div>

  <script>
    const dotEl = document.getElementById('dot');
    const statusText = document.getElementById('statusText');
    const resultEl = document.getElementById('result');
    const errorEl = document.getElementById('error');
    const video = document.getElementById('video');

    // WebSocket — same host:port as the HTTP page
    const ws = new WebSocket('wss://' + location.host);
    ws.onopen = () => {
      dotEl.className = 'dot on';
      statusText.textContent = 'Connected — point at barcode';
    };
    ws.onclose = ws.onerror = () => {
      dotEl.className = 'dot';
      statusText.textContent = 'Disconnected from MedBill';
    };

    let lastCode = '', lastTime = 0;
    function sendBarcode(code) {
      if (ws.readyState !== WebSocket.OPEN) return;
      const now = Date.now();
      if (code === lastCode && now - lastTime < 2000) return; // debounce same code
      lastCode = code; lastTime = now;
      ws.send(JSON.stringify({ type: 'barcode', barcode: code }));
      resultEl.textContent = '✓ ' + code;
      resultEl.classList.add('show');
      clearTimeout(resultEl._t);
      resultEl._t = setTimeout(() => resultEl.classList.remove('show'), 2000);
    }

    if (!('BarcodeDetector' in window)) {
      errorEl.innerHTML =
        'Camera scanning is not supported on this browser.<br>' +
        'Please use <strong>Chrome on Android</strong> or <strong>Safari on iOS 17+</strong>.';
    } else {
      const detector = new BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'itf']
      });

      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } } })
        .then(stream => {
          video.srcObject = stream;
          function scan() {
            if (video.readyState >= 2) {
              detector.detect(video)
                .then(barcodes => { for (const b of barcodes) sendBarcode(b.rawValue); })
                .catch(() => {});
            }
            requestAnimationFrame(scan);
          }
          scan();
        })
        .catch(err => {
          errorEl.textContent = 'Camera access denied: ' + err.message;
        });
    }
  </script>
</body>
</html>`;
}

/**
 * Start the scanner HTTP + WebSocket server.
 * @param {(barcode: string) => void} onBarcode — called when phone scans a barcode
 * @returns {Promise<{ ip: string, port: number, url: string }>}
 */
async function start(onBarcode) {
  const ip = getLocalIP();
  const tls = await getTLSContext(ip);

  server = https.createServer(tls, (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(getScannerHTML());
  });

  wss = new WebSocketServer({ server });
  wss.on('connection', (ws) => {
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'barcode' && typeof msg.barcode === 'string' && onBarcode) {
          onBarcode(msg.barcode.trim());
        }
      } catch (_) {}
    });
  });

  return new Promise((resolve, reject) => {
    // Attach a permanent error handler so Node never throws an uncaught exception
    // if the server errors after the promise has already settled.
    server.on('error', (err) => {
      console.warn('Scanner server error:', err.message);
      serverInfo = null;
      reject(err); // no-op if promise already settled
    });
    server.listen(PORT, '0.0.0.0', () => {
      serverInfo = { ip, port: PORT, url: `https://${ip}:${PORT}` };
      resolve(serverInfo);
    });
  });
}

function stop() {
  if (wss) { try { wss.close(); } catch (_) {} wss = null; }
  if (server) { try { server.close(); } catch (_) {} server = null; }
  serverInfo = null;
}

function getInfo() {
  return serverInfo;
}

module.exports = { start, stop, getInfo };

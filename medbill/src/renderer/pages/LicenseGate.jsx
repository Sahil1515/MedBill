import React, { useState } from 'react';

export default function LicenseGate({ expired, expiredOn, onActivated }) {
  const [key, setKey]     = useState('');
  const [err, setErr]     = useState('');
  const [msg, setMsg]     = useState('');
  const [busy, setBusy]   = useState(false);

  const activate = async () => {
    setErr(''); setMsg('');
    if (!key.trim()) return setErr('Paste your license key above.');
    setBusy(true);
    const res = await window.api.activateLicense(key.trim());
    setBusy(false);
    if (res.ok) {
      setMsg('License activated!');
      setTimeout(() => onActivated(res.data), 600);
    } else {
      setErr(res.error);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <span style={styles.dot} />
          MedBill
        </div>

        {expired ? (
          <>
            <div style={styles.badge('expired')}>License Expired</div>
            <p style={styles.sub}>
              Your license expired on <strong>{expiredOn}</strong>.<br />
              Enter a new key to continue using MedBill.
            </p>
          </>
        ) : (
          <>
            <div style={styles.badge('activate')}>Activation Required</div>
            <p style={styles.sub}>
              Enter your license key to activate MedBill.<br />
              <span style={{ fontSize: 12, opacity: 0.7 }}>
                Keys are sent to your email after purchase.
              </span>
            </p>
          </>
        )}

        <label style={styles.label}>License Key</label>
        <textarea
          rows={4}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Paste your license key here..."
          style={styles.textarea}
          autoFocus
        />

        {err && <div style={styles.err}>{err}</div>}
        {msg && <div style={styles.ok}>{msg}</div>}

        <button
          style={styles.btn}
          onClick={activate}
          disabled={busy}
        >
          {busy ? 'Verifying…' : 'Activate License'}
        </button>

        <div style={styles.help}>
          Need a license? Visit <strong>medbill.in</strong> or contact your vendor.
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'var(--bg, #f5f7fb)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 99999,
  },
  card: {
    background: 'var(--panel, #fff)',
    border: '1px solid var(--border, #e3e7ef)',
    borderRadius: 14,
    padding: '36px 40px',
    width: 460,
    boxShadow: '0 8px 40px rgba(0,0,0,.10)',
    display: 'flex', flexDirection: 'column', gap: 12,
  },
  logo: {
    fontSize: 22, fontWeight: 700, color: 'var(--primary, #2563eb)',
    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4,
  },
  dot: {
    display: 'inline-block', width: 10, height: 10,
    borderRadius: '50%', background: 'var(--primary, #2563eb)',
  },
  badge: (type) => ({
    display: 'inline-block',
    padding: '3px 12px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 600,
    alignSelf: 'flex-start',
    background: type === 'expired' ? 'var(--danger-soft, #fff1f0)' : 'var(--primary-soft, #eff6ff)',
    color:      type === 'expired' ? 'var(--danger, #d32f2f)'      : 'var(--primary, #2563eb)',
    border: `1px solid ${type === 'expired' ? 'var(--danger, #d32f2f)' : 'var(--primary, #2563eb)'}`,
  }),
  sub: {
    margin: 0, fontSize: 13.5, color: 'var(--text-soft, #3b4558)', lineHeight: 1.6,
  },
  label: {
    fontSize: 12, fontWeight: 600, color: 'var(--text-soft, #3b4558)',
  },
  textarea: {
    width: '100%', fontFamily: 'monospace', fontSize: 11.5,
    padding: '10px 12px', borderRadius: 7,
    border: '1px solid var(--border-strong, #cbd3df)',
    background: 'var(--bg-alt, #f5f7fb)',
    color: 'var(--text, #1a2233)',
    resize: 'vertical', boxSizing: 'border-box',
  },
  err: { fontSize: 13, color: 'var(--danger, #d32f2f)', fontWeight: 500 },
  ok:  { fontSize: 13, color: 'var(--success, #16a34a)', fontWeight: 500 },
  btn: {
    padding: '10px 0', borderRadius: 8, border: 'none',
    background: 'var(--primary, #2563eb)', color: '#fff',
    fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  help: {
    fontSize: 12, color: 'var(--muted, #6b7488)', textAlign: 'center', marginTop: 4,
  },
};

// Renamed conceptually but kept same filename for deploy continuity.
// Handles Razorpay webhook: subscription.charged → generate license → email customer.
const crypto = require('crypto');

function generateLicenseKey(pharmacyName, plan, billing, privateKeyPem) {
  const days = billing === 'yearly' ? 366 : 32;
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const issuedAt = new Date().toISOString().slice(0, 10);

  const body = `${pharmacyName}|${plan}|${expires}|${issuedAt}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(body);
  const sig = signer.sign(privateKeyPem, 'base64');

  const payload = { pharmacy_name: pharmacyName, plan, expires_at: expires, issued_at: issuedAt, sig };
  return {
    key: Buffer.from(JSON.stringify(payload)).toString('base64'),
    expires,
  };
}

async function sendLicenseEmail(toEmail, pharmacyName, licenseKey, plan, billing, expiresAt) {
  const planLabel = plan === 'pro' ? 'Pro' : 'Standard';
  const billingLabel = billing === 'yearly' ? 'Annual' : 'Monthly';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.FROM_EMAIL || 'MedBill <noreply@medbill.app>',
      to: toEmail,
      subject: `Your MedBill ${planLabel} License Key`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px;color:#1e293b">
          <h2 style="color:#1d4ed8;margin-bottom:4px">Welcome to MedBill ${planLabel}!</h2>
          <p style="margin-top:0;color:#64748b">${billingLabel} subscription activated</p>
          <p>Hi <strong>${pharmacyName}</strong>,</p>
          <p>Your payment was successful. Here is your license key — keep it safe.</p>
          <div style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;font-family:monospace;font-size:12px;word-break:break-all;margin:24px 0;color:#0f172a">
            ${licenseKey}
          </div>
          <h3 style="margin-bottom:8px">How to activate</h3>
          <ol style="line-height:1.8">
            <li>Open <strong>MedBill</strong> on your PC</li>
            <li>Paste the key above into the activation screen</li>
            <li>Click <strong>Activate</strong></li>
          </ol>
          <p style="margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;color:#64748b;font-size:13px">
            Plan: ${planLabel} · Expires: ${expiresAt}<br>
            Questions? Reply to this email — we're happy to help.
          </p>
        </div>
      `,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend error ${res.status}: ${text}`);
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Verify Razorpay webhook signature
  const signature = event.headers['x-razorpay-signature'];
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const hmac = crypto.createHmac('sha256', webhookSecret);
  hmac.update(event.body);
  const digest = hmac.digest('hex');
  if (digest !== signature) {
    console.error('Razorpay webhook signature mismatch');
    return { statusCode: 400, body: 'Invalid signature' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: 'Bad Request' };
  }

  // Only process first successful charge on a subscription
  if (payload.event !== 'subscription.charged') {
    return { statusCode: 200, body: 'OK' };
  }

  const payment = payload.payload?.payment?.entity;
  const subscription = payload.payload?.subscription?.entity;

  const customerEmail = payment?.email;
  const notes = subscription?.notes || {};
  const pharmacyName = notes.pharmacy_name || customerEmail;
  const plan = notes.plan || 'standard';
  const billing = notes.billing || 'monthly';

  if (!customerEmail) {
    console.error('No customer email in webhook payload');
    return { statusCode: 200, body: 'OK' };
  }

  const privateKeyPem = process.env.LICENSE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!privateKeyPem) {
    console.error('LICENSE_PRIVATE_KEY env var is not set');
    return { statusCode: 500, body: 'Server configuration error' };
  }

  try {
    const { key: licenseKey, expires } = generateLicenseKey(pharmacyName, plan, billing, privateKeyPem);
    await sendLicenseEmail(customerEmail, pharmacyName, licenseKey, plan, billing, expires);
    console.log(`License sent to ${customerEmail} | plan=${plan}/${billing} | expires=${expires}`);
  } catch (err) {
    console.error('License/email error:', err.message);
    return { statusCode: 500, body: 'Internal error' };
  }

  return { statusCode: 200, body: 'OK' };
};

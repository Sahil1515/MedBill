import React from 'react';
import { fmt, fmtDateTime, amountInWords } from '../lib/helpers.js';

export default function Receipt({ bill, settings }) {
  const format = settings.receipt_format || '80mm';
  if (format === 'a4') return <ReceiptA4 bill={bill} settings={settings} />;
  return <ReceiptThermal bill={bill} settings={settings} width={format} />;
}

// --------------------------------------------------
// Thermal receipt (80mm / 58mm) — monospace, fixed width
// --------------------------------------------------
function ReceiptThermal({ bill, settings, width }) {
  const W = width === '58mm' ? 32 : 42;
  const line = (c = '-') => c.repeat(W);
  const center = (s) => {
    s = String(s || '');
    if (s.length >= W) return s.slice(0, W);
    const pad = Math.floor((W - s.length) / 2);
    return ' '.repeat(pad) + s;
  };
  const lr = (l, r) => {
    l = String(l); r = String(r);
    const sp = Math.max(1, W - l.length - r.length);
    return l + ' '.repeat(sp) + r;
  };

  const out = [];
  out.push(center(settings.pharmacy_name || 'PHARMACY'));
  if (settings.address) settings.address.split('\n').forEach((l) => out.push(center(l)));
  if (settings.phone) out.push(center('Ph: ' + settings.phone));
  if (settings.gst_number) out.push(center('GSTIN: ' + settings.gst_number));
  if (settings.license_number) out.push(center('DL: ' + settings.license_number));
  out.push(line('='));

  const dt = new Date(bill.created_at || Date.now());
  out.push(lr('Bill: ' + bill.bill_number, dt.toLocaleDateString('en-IN')));
  out.push(lr('', dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })));

  if (bill.customer_name) out.push('Patient: ' + bill.customer_name);
  if (bill.doctor_name) out.push('Doctor : ' + bill.doctor_name);
  if (bill.phone) out.push('Phone  : ' + bill.phone);
  out.push(line('-'));

  if (width === '58mm') {
    out.push('Item          Qty Rate   Amt');
  } else {
    out.push('Item                   Qty   Rate    Amt');
  }
  out.push(line('-'));

  for (const it of bill.items) {
    const name = it.medicine_name.slice(0, width === '58mm' ? 28 : 40);
    const qty = String(it.quantity).padStart(3);
    const rate = Number(it.price).toFixed(2).padStart(6);
    const amt = Number(it.amount).toFixed(2).padStart(7);
    const nameLine = width === '58mm' ? name.padEnd(12) : name.padEnd(22);
    out.push(nameLine + ' ' + qty + ' ' + rate + ' ' + amt);
    if (it.batch_no) {
      out.push('  (B:' + it.batch_no + (it.expiry ? ' E:' + it.expiry : '') + ')');
    }
  }
  out.push(line('-'));
  out.push(lr('Subtotal', fmt(bill.subtotal)));
  if (bill.discount_amount > 0)
    out.push(lr(`Discount(${bill.discount_percent}%)`, '-' + fmt(bill.discount_amount)));
  if (bill.cgst_amount > 0) out.push(lr('CGST', fmt(bill.cgst_amount)));
  if (bill.sgst_amount > 0) out.push(lr('SGST', fmt(bill.sgst_amount)));
  if (bill.igst_amount > 0) out.push(lr('IGST', fmt(bill.igst_amount)));
  if (bill.round_off) out.push(lr('Round off', fmt(bill.round_off)));
  out.push(line('='));
  out.push(lr('TOTAL', fmt(bill.total)));
  out.push(line('='));
  out.push(lr('Paid (' + (bill.payment_mode || 'cash').toUpperCase() + ')', fmt(bill.amount_paid)));
  if (bill.balance > 0) out.push(lr('Balance due', fmt(bill.balance)));
  out.push('');
  if (settings.footer_note) out.push(center(settings.footer_note));
  out.push('');

  return (
    <div className="receipt-wrap">
      <div className={`receipt w-${width}`}>{out.join('\n')}</div>
    </div>
  );
}

// --------------------------------------------------
// A4 tax invoice
// --------------------------------------------------
function ReceiptA4({ bill, settings }) {
  return (
    <div className="receipt-wrap">
      <div className="receipt w-a4">
        <h1>TAX INVOICE</h1>
        <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 'bold' }}>
          {settings.pharmacy_name}
        </div>
        <div style={{ textAlign: 'center', fontSize: 11, lineHeight: 1.5 }}>
          {settings.address && <div>{settings.address}</div>}
          <div>
            {settings.phone && <>Phone: {settings.phone} · </>}
            {settings.gst_number && <>GSTIN: {settings.gst_number}</>}
          </div>
          {settings.license_number && <div>Drug License: {settings.license_number}</div>}
        </div>
        <hr style={{ margin: '14px 0', borderTop: '2px solid #000' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
          <div>
            <div><b>Bill to:</b> {bill.customer_name || 'Walk-in'}</div>
            {bill.phone && <div>Phone: {bill.phone}</div>}
            {bill.doctor_name && <div><b>Doctor:</b> {bill.doctor_name}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div><b>Invoice:</b> {bill.bill_number}</div>
            <div><b>Date:</b> {fmtDateTime(bill.created_at)}</div>
            <div><b>Payment:</b> {(bill.payment_mode || 'cash').toUpperCase()} · {bill.payment_status}</div>
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th>#</th>
              <th style={{ textAlign: 'left' }}>Item</th>
              <th>HSN</th>
              <th>Batch</th>
              <th>Exp</th>
              <th>Qty</th>
              <th>MRP</th>
              <th>Rate</th>
              <th>GST%</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {bill.items.map((it, i) => (
              <tr key={it.id || i}>
                <td style={{ textAlign: 'center' }}>{i + 1}</td>
                <td>{it.medicine_name}</td>
                <td style={{ textAlign: 'center' }}>{it.hsn || '-'}</td>
                <td style={{ textAlign: 'center' }}>{it.batch_no || '-'}</td>
                <td style={{ textAlign: 'center' }}>{it.expiry || '-'}</td>
                <td style={{ textAlign: 'center' }}>{it.quantity}</td>
                <td style={{ textAlign: 'right' }}>{Number(it.mrp || 0).toFixed(2)}</td>
                <td style={{ textAlign: 'right' }}>{Number(it.price).toFixed(2)}</td>
                <td style={{ textAlign: 'center' }}>{it.gst_rate}%</td>
                <td style={{ textAlign: 'right' }}>{Number(it.amount).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <table style={{ width: 300, borderCollapse: 'collapse' }}>
            <tbody>
              <tr><td>Subtotal</td><td style={{ textAlign: 'right' }}>{fmt(bill.subtotal)}</td></tr>
              {bill.discount_amount > 0 && (
                <tr>
                  <td>Discount ({bill.discount_percent}%)</td>
                  <td style={{ textAlign: 'right' }}>- {fmt(bill.discount_amount)}</td>
                </tr>
              )}
              {bill.cgst_amount > 0 && <tr><td>CGST</td><td style={{ textAlign: 'right' }}>{fmt(bill.cgst_amount)}</td></tr>}
              {bill.sgst_amount > 0 && <tr><td>SGST</td><td style={{ textAlign: 'right' }}>{fmt(bill.sgst_amount)}</td></tr>}
              {bill.igst_amount > 0 && <tr><td>IGST</td><td style={{ textAlign: 'right' }}>{fmt(bill.igst_amount)}</td></tr>}
              {bill.round_off !== 0 && <tr><td>Round off</td><td style={{ textAlign: 'right' }}>{fmt(bill.round_off)}</td></tr>}
              <tr style={{ fontSize: 14, fontWeight: 'bold', borderTop: '2px solid #000' }}>
                <td>TOTAL</td><td style={{ textAlign: 'right' }}>{fmt(bill.total)}</td>
              </tr>
              <tr><td>Paid</td><td style={{ textAlign: 'right' }}>{fmt(bill.amount_paid)}</td></tr>
              {bill.balance > 0 && <tr><td>Balance</td><td style={{ textAlign: 'right' }}>{fmt(bill.balance)}</td></tr>}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 10, fontSize: 11, fontStyle: 'italic' }}>
          Amount in words: <b>{amountInWords(bill.total)}</b>
        </div>

        <div style={{ marginTop: 40, display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
          <div>
            {settings.footer_note && <div>{settings.footer_note}</div>}
            <div style={{ marginTop: 6, color: '#555' }}>Computer-generated invoice</div>
          </div>
          <div style={{ textAlign: 'center', minWidth: 180 }}>
            <div style={{ height: 50, borderBottom: '1px solid #000' }}></div>
            <div>Authorised Signatory</div>
          </div>
        </div>
      </div>
    </div>
  );
}

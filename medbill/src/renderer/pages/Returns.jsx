import React, { useState, useEffect } from 'react';
import Modal from '../components/Modal.jsx';
import { fmt, fmtDate } from '../lib/helpers.js';

export default function Returns({ showToast }) {
  const [returns, setReturns] = useState([]);
  const [showNew, setShowNew] = useState(false);

  const load = async () => {
    const res = await window.api.getReturns();
    if (res.ok) setReturns(res.data);
  };
  useEffect(() => { load(); }, []);

  return (
    <div>
      <div className="page-header">
        <div><h1>Sales Returns</h1><div className="subtitle">{returns.length} returns processed</div></div>
        <button className="primary" onClick={() => setShowNew(true)}>+ New Return</button>
      </div>

      <div className="card flush">
        <table>
          <thead><tr><th>Return #</th><th>Bill #</th><th>Date</th><th>Reason</th><th>Refund</th><th className="text-right">Total</th></tr></thead>
          <tbody>
            {returns.length === 0 && <tr><td colSpan="6"><div className="empty"><div className="emoji">↩</div><h3>No returns</h3></div></td></tr>}
            {returns.map((r) => (
              <tr key={r.id}>
                <td className="mono">{r.return_number}</td>
                <td className="mono">{r.bill_number || '-'}</td>
                <td>{fmtDate(r.created_at)}</td>
                <td>{r.reason || '-'}</td>
                <td>{r.refund_mode}</td>
                <td className="text-right bold">{fmt(r.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showNew && <ReturnForm onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); load(); showToast('Return processed · Stock restored'); }} showToast={showToast} />}
    </div>
  );
}

function ReturnForm({ onClose, onSaved, showToast }) {
  const [billNumber, setBillNumber] = useState('');
  const [bill, setBill] = useState(null);
  const [selections, setSelections] = useState({}); // bill_item_id -> qty
  const [reason, setReason] = useState('');
  const [refundMode, setRefundMode] = useState('cash');
  const [err, setErr] = useState('');

  const lookup = async () => {
    setErr('');
    const res = await window.api.getBills({ search: billNumber });
    if (res.ok && res.data.length > 0) {
      const b = res.data.find((x) => x.bill_number === billNumber) || res.data[0];
      const detail = await window.api.getBill(b.id);
      if (detail.ok) {
        setBill(detail.data);
        setSelections({});
      }
    } else setErr('Bill not found');
  };

  const total = bill ? bill.items.reduce((s, it) => s + (it.price * (selections[it.id] || 0)), 0) : 0;

  const save = async () => {
    const items = Object.entries(selections)
      .filter(([, q]) => q > 0)
      .map(([bill_item_id, quantity]) => ({ bill_item_id: parseInt(bill_item_id), quantity: parseInt(quantity) }));
    if (items.length === 0) return setErr('Select at least one item');
    const res = await window.api.saveReturn({
      bill_id: bill.id,
      customer_id: bill.customer_id,
      reason,
      refund_mode: refundMode,
      items,
    });
    if (res.ok) onSaved();
    else setErr(res.error);
  };

  return (
    <Modal title="Process Return" onClose={onClose} wide
      actions={bill ? <><button onClick={onClose}>Cancel</button><button className="primary" onClick={save}>Process Return · {fmt(total)}</button></> : <button onClick={onClose}>Cancel</button>}>
      <div className="row" style={{ marginBottom: 14 }}>
        <input placeholder="Enter bill number (e.g. MB202604100001)" value={billNumber} onChange={(e) => setBillNumber(e.target.value)} />
        <button onClick={lookup}>Lookup</button>
      </div>

      {bill && (
        <>
          <div className="muted" style={{ marginBottom: 8 }}>
            {bill.customer_name} · {fmtDate(bill.created_at)} · Total {fmt(bill.total)}
          </div>
          <table className="compact">
            <thead><tr><th>Medicine</th><th>Batch</th><th>Billed Qty</th><th>Return Qty</th><th className="text-right">Amount</th></tr></thead>
            <tbody>
              {bill.items.map((it) => (
                <tr key={it.id}>
                  <td>{it.medicine_name}</td>
                  <td className="mono">{it.batch_no}</td>
                  <td>{it.quantity}</td>
                  <td>
                    <input type="number" min="0" max={it.quantity} value={selections[it.id] || 0}
                      onChange={(e) => setSelections({ ...selections, [it.id]: parseInt(e.target.value) || 0 })}
                      className="qty-input" />
                  </td>
                  <td className="text-right">{fmt(it.price * (selections[it.id] || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="grid-2" style={{ marginTop: 14 }}>
            <div><label>Reason</label><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Wrong medicine / damaged / etc" /></div>
            <div><label>Refund Mode</label>
              <select value={refundMode} onChange={(e) => setRefundMode(e.target.value)}>
                <option value="cash">Cash</option><option value="upi">UPI</option><option value="credit_note">Credit Note</option>
              </select>
            </div>
          </div>
        </>
      )}
      {err && <div style={{ color: 'var(--danger)', marginTop: 10 }}>{err}</div>}
    </Modal>
  );
}

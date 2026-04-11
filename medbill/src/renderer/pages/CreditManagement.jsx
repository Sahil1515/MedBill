import React, { useState, useEffect, useCallback } from 'react';
import Modal from '../components/Modal.jsx';
import { fmt, fmtDate, fmtDateTime, todayISO } from '../lib/helpers.js';

export default function CreditManagement({ showToast }) {
  const [customers, setCustomers] = useState([]);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    const res = await window.api.getCreditCustomers();
    if (res.ok) setCustomers(res.data);
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalOutstanding = customers.reduce((s, c) => s + (c.outstanding || c.balance), 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Credit Management</h1>
          <div className="subtitle">Customers with outstanding dues</div>
        </div>
        <button onClick={load}>↺ Refresh</button>
      </div>

      <div className="grid-4" style={{ marginBottom: 14 }}>
        <div className="stat"><div className="stat-label">Credit Customers</div><div className="stat-value">{customers.length}</div></div>
        <div className="stat primary"><div className="stat-label">Total Outstanding</div><div className="stat-value">{fmt(totalOutstanding)}</div></div>
        <div className="stat"><div className="stat-label">Pending Bills</div><div className="stat-value">{customers.reduce((s, c) => s + c.pending_bills, 0)}</div></div>
        <div className="stat"><div className="stat-label">Avg Per Customer</div><div className="stat-value">{customers.length ? fmt(totalOutstanding / customers.length) : fmt(0)}</div></div>
      </div>

      <div className="card flush">
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Phone</th>
              <th>Pending Bills</th>
              <th className="text-right">Total Spent</th>
              <th className="text-right">Outstanding</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {customers.length === 0 && (
              <tr><td colSpan="6">
                <div className="empty"><div className="emoji">◐</div><h3>No credit customers</h3><div>All customers are cleared.</div></div>
              </td></tr>
            )}
            {customers.map((c) => (
              <tr key={c.id}>
                <td className="bold">{c.name}</td>
                <td>{c.phone || '-'}</td>
                <td>{c.pending_bills}</td>
                <td className="text-right">{fmt(c.total_spent)}</td>
                <td className="text-right"><span className="badge amber">{fmt(c.balance)}</span></td>
                <td>
                  <button className="primary sm" onClick={() => setSelected(c)}>Collect</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <CollectModal
          customer={selected}
          onClose={() => setSelected(null)}
          onSaved={() => { setSelected(null); load(); showToast('Payment recorded'); }}
          showToast={showToast}
        />
      )}
    </div>
  );
}

function CollectModal({ customer, onClose, onSaved, showToast }) {
  const [bills, setBills] = useState([]);
  const [form, setForm] = useState({ amount: '', mode: 'cash', notes: '', bill_id: '' });
  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    window.api.getBills({ search: customer.phone, status: 'active' }).then((r) => {
      if (r.ok) setBills(r.data.filter((b) => b.payment_status !== 'paid'));
    });
  }, [customer.phone]);

  const unpaidTotal = bills.reduce((s, b) => s + (b.balance || 0), 0);

  const selectedBill = form.bill_id ? bills.find((b) => String(b.id) === String(form.bill_id)) : null;

  const submit = async () => {
    if (!form.amount || parseFloat(form.amount) <= 0) return setErr('Enter a valid amount');
    setSubmitting(true);
    const res = await window.api.collectPayment({
      customer_id: customer.id,
      bill_id: form.bill_id ? parseInt(form.bill_id) : null,
      amount: parseFloat(form.amount),
      mode: form.mode,
      notes: form.notes,
    });
    setSubmitting(false);
    if (res.ok) onSaved();
    else setErr(res.error);
  };

  return (
    <Modal
      title={`Collect Payment — ${customer.name}`}
      onClose={onClose}
      wide
      actions={<><button onClick={onClose}>Cancel</button><button className="primary" onClick={submit} disabled={submitting}>{submitting ? 'Saving...' : 'Record Payment'}</button></>}
    >
      <div className="grid-4" style={{ marginBottom: 14 }}>
        <div className="stat"><div className="stat-label">Customer</div><div className="stat-value" style={{ fontSize: 15 }}>{customer.name}</div></div>
        <div className="stat"><div className="stat-label">Phone</div><div className="stat-value" style={{ fontSize: 15 }}>{customer.phone || '-'}</div></div>
        <div className="stat"><div className="stat-label">Pending Bills</div><div className="stat-value">{bills.length}</div></div>
        <div className="stat primary"><div className="stat-label">Outstanding</div><div className="stat-value">{fmt(customer.balance)}</div></div>
      </div>

      {bills.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <h3 style={{ marginBottom: 8 }}>Unpaid Bills</h3>
          <div className="card flush" style={{ marginBottom: 12 }}>
            <table className="compact">
              <thead><tr><th>Bill #</th><th>Date</th><th>Total</th><th>Paid</th><th className="text-right">Balance</th></tr></thead>
              <tbody>
                {bills.map((b) => (
                  <tr
                    key={b.id}
                    style={{ cursor: 'pointer', background: String(b.id) === String(form.bill_id) ? 'var(--primary-soft)' : '' }}
                    onClick={() => setForm({ ...form, bill_id: String(b.id), amount: String(b.balance || '') })}
                  >
                    <td className="mono">{b.bill_number}</td>
                    <td>{fmtDateTime(b.created_at)}</td>
                    <td>{fmt(b.total)}</td>
                    <td>{fmt(b.amount_paid)}</td>
                    <td className="text-right"><span className="badge amber">{fmt(b.balance)}</span></td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                  <td colSpan="4">Total Outstanding</td>
                  <td className="text-right">{fmt(unpaidTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 12 }}>Click a row to pre-fill the amount. Leave Bill empty to record a general payment.</p>
        </div>
      )}

      <div className="grid-2">
        <div>
          <label>Amount *</label>
          <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="₹" autoFocus />
        </div>
        <div>
          <label>Payment Mode</label>
          <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="card">Card</option>
            <option value="cheque">Cheque</option>
          </select>
        </div>
      </div>
      <div>
        <label>Apply to Bill</label>
        <select value={form.bill_id} onChange={(e) => setForm({ ...form, bill_id: e.target.value })}>
          <option value="">-- General payment --</option>
          {bills.map((b) => <option key={b.id} value={b.id}>{b.bill_number} — {fmt(b.balance)} pending</option>)}
        </select>
      </div>
      <div><label>Notes</label><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
      {err && <div style={{ color: 'var(--danger)', marginTop: 8 }}>{err}</div>}
    </Modal>
  );
}

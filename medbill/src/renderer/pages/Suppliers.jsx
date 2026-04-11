import React, { useState, useEffect, useCallback } from 'react';
import Modal from '../components/Modal.jsx';
import { fmt, fmtDate, todayISO } from '../lib/helpers.js';

export default function Suppliers({ showToast }) {
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null);
  const [ledgerSupplier, setLedgerSupplier] = useState(null);

  const load = useCallback(async () => {
    const res = await window.api.getSuppliers(query);
    if (res.ok) setRows(res.data);
  }, [query]);
  useEffect(() => { const t = setTimeout(load, 150); return () => clearTimeout(t); }, [load]);

  const remove = async (s) => {
    if (!confirm(`Delete ${s.name}?`)) return;
    const res = await window.api.deleteSupplier(s.id);
    if (res.ok) { showToast('Deleted'); load(); }
    else showToast(res.error, 'error');
  };

  return (
    <div>
      <div className="page-header">
        <div><h1>Suppliers</h1><div className="subtitle">{rows.length} suppliers</div></div>
        <button className="primary" onClick={() => setEditing({})}>+ Add Supplier</button>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <input placeholder="Search suppliers..." value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="card flush">
        <table>
          <thead><tr><th>Name</th><th>Contact</th><th>Phone</th><th>GSTIN</th><th>Drug License</th><th>Balance</th><th></th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan="7"><div className="empty"><div className="emoji">◑</div><h3>No suppliers</h3></div></td></tr>}
            {rows.map((s) => (
              <tr key={s.id}>
                <td className="bold">{s.name}</td>
                <td>{s.contact_person || '-'}</td>
                <td>{s.phone || '-'}</td>
                <td>{s.gst_number || '-'}</td>
                <td>{s.drug_license || '-'}</td>
                <td>{s.balance > 0 ? <span className="badge amber">{fmt(s.balance)} owed</span> : <span className="muted">—</span>}</td>
                <td className="text-right">
                  <button className="ghost sm" onClick={() => setLedgerSupplier(s)}>Ledger</button>
                  <button className="ghost sm" onClick={() => setEditing(s)}>Edit</button>
                  <button className="ghost sm danger" onClick={() => remove(s)}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && <SupplierForm supplier={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); showToast('Saved'); }} />}
      {ledgerSupplier && <SupplierLedger supplier={ledgerSupplier} onClose={() => { setLedgerSupplier(null); load(); }} showToast={showToast} />}
    </div>
  );
}

function SupplierLedger({ supplier, onClose, showToast }) {
  const [data, setData] = useState(null);
  const [payForm, setPayForm] = useState({ amount: '', mode: 'cash', reference: '', notes: '', payment_date: todayISO() });
  const [payErr, setPayErr] = useState('');
  const [addingPay, setAddingPay] = useState(false);

  const load = useCallback(async () => {
    const res = await window.api.getSupplierLedger(supplier.id);
    if (res.ok) setData(res.data);
  }, [supplier.id]);

  useEffect(() => { load(); }, [load]);

  const recordPayment = async () => {
    if (!payForm.amount || parseFloat(payForm.amount) <= 0) return setPayErr('Enter a valid amount');
    const res = await window.api.addSupplierPayment({ supplier_id: supplier.id, ...payForm, amount: parseFloat(payForm.amount) });
    if (res.ok) {
      setPayErr(''); setAddingPay(false);
      setPayForm({ amount: '', mode: 'cash', reference: '', notes: '', payment_date: todayISO() });
      load(); showToast('Payment recorded');
    } else setPayErr(res.error);
  };

  return (
    <Modal title={`Ledger — ${supplier.name}`} onClose={onClose} wide
      actions={<button onClick={onClose}>Close</button>}>
      {data && (
        <>
          <div className="grid-4" style={{ marginBottom: 14 }}>
            <div className="stat"><div className="stat-label">Total Purchases</div><div className="stat-value">{data.purchases.length}</div></div>
            <div className="stat"><div className="stat-label">Total Billed</div><div className="stat-value">{fmt(data.purchases.reduce((s, p) => s + p.total, 0))}</div></div>
            <div className="stat"><div className="stat-label">Total Paid</div><div className="stat-value text-success">{fmt(data.payments.reduce((s, p) => s + p.amount, 0))}</div></div>
            <div className="stat" style={{ background: data.supplier.balance > 0 ? 'var(--warn-soft)' : 'var(--surface)' }}>
              <div className="stat-label">Outstanding</div>
              <div className={`stat-value ${data.supplier.balance > 0 ? 'text-warn' : ''}`}>{fmt(data.supplier.balance)}</div>
            </div>
          </div>

          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>Payment History</h3>
            <button className="primary sm" onClick={() => setAddingPay(true)}>+ Record Payment</button>
          </div>

          {addingPay && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="grid-4">
                <div><label>Amount *</label><input type="number" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} autoFocus /></div>
                <div><label>Mode</label>
                  <select value={payForm.mode} onChange={(e) => setPayForm({ ...payForm, mode: e.target.value })}>
                    <option value="cash">Cash</option><option value="cheque">Cheque</option><option value="neft">NEFT/RTGS</option><option value="upi">UPI</option>
                  </select>
                </div>
                <div><label>Date</label><input type="date" value={payForm.payment_date} onChange={(e) => setPayForm({ ...payForm, payment_date: e.target.value })} /></div>
                <div><label>Reference / Cheque No</label><input value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} /></div>
              </div>
              <div><label>Notes</label><input value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} /></div>
              {payErr && <div style={{ color: 'var(--danger)', marginTop: 6 }}>{payErr}</div>}
              <div className="row" style={{ marginTop: 10 }}>
                <button onClick={() => setAddingPay(false)}>Cancel</button>
                <button className="primary" onClick={recordPayment}>Record Payment</button>
              </div>
            </div>
          )}

          <div className="card flush" style={{ marginBottom: 14 }}>
            <table className="compact">
              <thead><tr><th>Date</th><th>Mode</th><th>Reference</th><th>Notes</th><th className="text-right">Amount</th></tr></thead>
              <tbody>
                {data.payments.map((p) => (
                  <tr key={p.id}>
                    <td>{fmtDate(p.payment_date)}</td>
                    <td>{p.mode}</td>
                    <td>{p.reference || '-'}</td>
                    <td>{p.notes || '-'}</td>
                    <td className="text-right text-success bold">{fmt(p.amount)}</td>
                  </tr>
                ))}
                {data.payments.length === 0 && <tr><td colSpan="5" className="text-center muted">No payments recorded</td></tr>}
              </tbody>
            </table>
          </div>

          <h3>Purchase History</h3>
          <div className="card flush">
            <table className="compact">
              <thead><tr><th>Invoice</th><th>Date</th><th className="text-right">Total</th><th className="text-right">Paid</th><th>Status</th></tr></thead>
              <tbody>
                {data.purchases.map((p) => (
                  <tr key={p.id}>
                    <td className="mono">{p.invoice_no || '-'}</td>
                    <td>{fmtDate(p.purchase_date)}</td>
                    <td className="text-right">{fmt(p.total)}</td>
                    <td className="text-right">{fmt(p.amount_paid)}</td>
                    <td><span className={`badge ${p.payment_status === 'paid' ? 'green' : p.payment_status === 'partial' ? 'amber' : 'red'}`}>{p.payment_status}</span></td>
                  </tr>
                ))}
                {data.purchases.length === 0 && <tr><td colSpan="5" className="text-center muted">No purchases</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}

function SupplierForm({ supplier, onClose, onSaved }) {
  const [f, setF] = useState({ name: '', contact_person: '', phone: '', email: '', address: '', gst_number: '', drug_license: '', notes: '', ...supplier });
  const [err, setErr] = useState('');
  const save = async () => {
    if (!f.name) return setErr('Name required');
    const res = f.id ? await window.api.updateSupplier(f) : await window.api.addSupplier(f);
    if (res.ok) onSaved(); else setErr(res.error);
  };
  return (
    <Modal title={f.id ? 'Edit Supplier' : 'Add Supplier'} onClose={onClose} wide
      actions={<><button onClick={onClose}>Cancel</button><button className="primary" onClick={save}>Save</button></>}>
      <div className="grid-2">
        <div><label>Name *</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></div>
        <div><label>Contact Person</label><input value={f.contact_person || ''} onChange={(e) => setF({ ...f, contact_person: e.target.value })} /></div>
        <div><label>Phone</label><input value={f.phone || ''} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
        <div><label>Email</label><input value={f.email || ''} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div><label>GSTIN</label><input value={f.gst_number || ''} onChange={(e) => setF({ ...f, gst_number: e.target.value })} /></div>
        <div><label>Drug License</label><input value={f.drug_license || ''} onChange={(e) => setF({ ...f, drug_license: e.target.value })} /></div>
      </div>
      <div><label>Address</label><textarea rows="2" value={f.address || ''} onChange={(e) => setF({ ...f, address: e.target.value })} /></div>
      <div><label>Notes</label><textarea rows="2" value={f.notes || ''} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
      {err && <div style={{ color: 'var(--danger)' }}>{err}</div>}
    </Modal>
  );
}

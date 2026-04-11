import React, { useState, useEffect, useCallback } from 'react';
import Modal from '../components/Modal.jsx';
import { fmt, fmtDate } from '../lib/helpers.js';

export default function Customers({ showToast }) {
  const [customers, setCustomers] = useState([]);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);

  const load = useCallback(async () => {
    const res = await window.api.getCustomers(query);
    if (res.ok) setCustomers(res.data);
  }, [query]);

  useEffect(() => { const t = setTimeout(load, 150); return () => clearTimeout(t); }, [load]);

  const remove = async (c) => {
    if (!confirm(`Delete ${c.name}?`)) return;
    const res = await window.api.deleteCustomer(c.id);
    if (res.ok) { showToast('Deleted'); load(); }
    else showToast(res.error, 'error');
  };

  const openHistory = async (c) => {
    const res = await window.api.customerHistory(c.id);
    if (res.ok) setViewing(res.data);
  };

  return (
    <div>
      <div className="page-header">
        <div><h1>Customers</h1><div className="subtitle">{customers.length} customers</div></div>
        <button className="primary" onClick={() => setEditing({})}>+ Add Customer</button>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <input placeholder="Search by name or phone..." value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="card flush">
        <table>
          <thead><tr><th>Name</th><th>Phone</th><th>Age/Gender</th><th>Visits</th><th>Total Spent</th><th>Balance</th><th></th></tr></thead>
          <tbody>
            {customers.length === 0 && <tr><td colSpan="7"><div className="empty"><div className="emoji">◐</div><h3>No customers</h3></div></td></tr>}
            {customers.map((c) => (
              <tr key={c.id}>
                <td className="bold">{c.name}</td>
                <td>{c.phone || '-'}</td>
                <td>{c.age || '-'} {c.gender ? `/ ${c.gender}` : ''}</td>
                <td>{c.visit_count}</td>
                <td>{fmt(c.total_spent)}</td>
                <td>{c.balance > 0 ? <span className="badge amber">{fmt(c.balance)} due</span> : <span className="muted">—</span>}</td>
                <td className="text-right">
                  <button className="ghost sm" onClick={() => openHistory(c)}>History</button>
                  <button className="ghost sm" onClick={() => setEditing(c)}>Edit</button>
                  <button className="ghost sm danger" onClick={() => remove(c)}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && <CustomerForm customer={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); showToast('Saved'); }} />}
      {viewing && (
        <Modal title={`${viewing.name} — History`} onClose={() => setViewing(null)} wide actions={<button onClick={() => setViewing(null)}>Close</button>}>
          <div className="muted">Phone: {viewing.phone || '-'} · Visits: {viewing.visit_count} · Spent: {fmt(viewing.total_spent)} · Balance: {fmt(viewing.balance)}</div>
          {viewing.allergies && <div className="text-danger" style={{ marginTop: 6 }}>⚠ Allergies: {viewing.allergies}</div>}
          <table className="compact" style={{ marginTop: 14 }}>
            <thead><tr><th>Bill #</th><th>Date</th><th>Status</th><th className="text-right">Total</th></tr></thead>
            <tbody>
              {viewing.bills.length === 0 && <tr><td colSpan="4" className="muted text-center">No bills yet</td></tr>}
              {viewing.bills.map((b) => (
                <tr key={b.id}>
                  <td className="mono">{b.bill_number}</td>
                  <td>{fmtDate(b.created_at)}</td>
                  <td><span className={`badge ${b.payment_status === 'paid' ? 'green' : 'amber'}`}>{b.payment_status}</span></td>
                  <td className="text-right bold">{fmt(b.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Modal>
      )}
    </div>
  );
}

function CustomerForm({ customer, onClose, onSaved }) {
  const [f, setF] = useState({
    name: '', phone: '', email: '', address: '', age: '', gender: '',
    blood_group: '', allergies: '', notes: '', ...customer,
  });
  const [err, setErr] = useState('');
  const save = async () => {
    setErr('');
    if (!f.name) return setErr('Name required');
    const res = f.id ? await window.api.updateCustomer(f) : await window.api.addCustomer(f);
    if (res.ok) onSaved();
    else setErr(res.error);
  };
  return (
    <Modal
      title={f.id ? 'Edit Customer' : 'Add Customer'}
      onClose={onClose} wide
      actions={<><button onClick={onClose}>Cancel</button><button className="primary" onClick={save}>Save</button></>}
    >
      <div className="grid-2">
        <div><label>Name *</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></div>
        <div><label>Phone</label><input value={f.phone || ''} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
        <div><label>Email</label><input value={f.email || ''} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div><label>Age</label><input type="number" value={f.age || ''} onChange={(e) => setF({ ...f, age: e.target.value })} /></div>
        <div><label>Gender</label>
          <select value={f.gender || ''} onChange={(e) => setF({ ...f, gender: e.target.value })}>
            <option value="">-</option><option>Male</option><option>Female</option><option>Other</option>
          </select>
        </div>
        <div><label>Blood Group</label>
          <select value={f.blood_group || ''} onChange={(e) => setF({ ...f, blood_group: e.target.value })}>
            {['', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map((b) => <option key={b}>{b}</option>)}
          </select>
        </div>
      </div>
      <div><label>Address</label><textarea rows="2" value={f.address || ''} onChange={(e) => setF({ ...f, address: e.target.value })} /></div>
      <div><label>Allergies</label><input value={f.allergies || ''} onChange={(e) => setF({ ...f, allergies: e.target.value })} placeholder="e.g. Penicillin, Sulfa drugs" /></div>
      <div><label>Notes</label><textarea rows="2" value={f.notes || ''} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
      {err && <div style={{ color: 'var(--danger)' }}>{err}</div>}
    </Modal>
  );
}

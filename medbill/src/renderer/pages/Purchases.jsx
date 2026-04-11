import React, { useState, useEffect } from 'react';
import Modal from '../components/Modal.jsx';
import { fmt, fmtDate, todayISO } from '../lib/helpers.js';

export default function Purchases({ showToast }) {
  const [purchases, setPurchases] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [viewing, setViewing] = useState(null);

  const load = async () => {
    const res = await window.api.getPurchases({});
    if (res.ok) setPurchases(res.data);
  };
  useEffect(() => { load(); }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Purchase Orders</h1>
          <div className="subtitle">{purchases.length} purchases</div>
        </div>
        <button className="primary" onClick={() => setShowForm(true)}>+ New Purchase</button>
      </div>

      <div className="card flush">
        <table>
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Supplier</th>
              <th>Date</th>
              <th>Items</th>
              <th className="text-right">Total</th>
              <th>Paid</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {purchases.length === 0 && (
              <tr><td colSpan="7"><div className="empty"><div className="emoji">⇣</div><h3>No purchases</h3><div>Record your first stock purchase.</div></div></td></tr>
            )}
            {purchases.map((p) => (
              <tr key={p.id}>
                <td className="mono">{p.invoice_no || '#' + p.id}</td>
                <td>{p.supplier_name || '-'}</td>
                <td>{fmtDate(p.purchase_date)}</td>
                <td>{p.item_count}</td>
                <td className="text-right bold">{fmt(p.total)}</td>
                <td><span className={`badge ${p.payment_status === 'paid' ? 'green' : p.payment_status === 'partial' ? 'amber' : 'red'}`}>{p.payment_status}</span></td>
                <td><button className="ghost sm" onClick={async () => {
                  const r = await window.api.getPurchase(p.id);
                  if (r.ok) setViewing(r.data);
                }}>View</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && <PurchaseForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); showToast('Purchase saved · Stock updated'); }} showToast={showToast} />}
      {viewing && <PurchaseDetail purchase={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

// ------------------------------------------------
function PurchaseForm({ onClose, onSaved, showToast }) {
  const [suppliers, setSuppliers] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [form, setForm] = useState({
    invoice_no: '',
    supplier_id: '',
    purchase_date: todayISO(),
    discount_amount: 0,
    other_charges: 0,
    amount_paid: 0,
    payment_mode: 'cash',
    notes: '',
  });
  const [items, setItems] = useState([]);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    window.api.getSuppliers().then((r) => r.ok && setSuppliers(r.data));
    window.api.getMedicines().then((r) => r.ok && setMedicines(r.data));
  }, []);

  const addRow = () =>
    setItems((c) => [...c, {
      medicine_id: '', medicine_name: '', batch_no: '', expiry: '',
      quantity: 1, free_qty: 0, purchase_price: 0, mrp: 0, sale_price: 0, gst_rate: 12,
    }]);

  const updateItem = (idx, k, v) =>
    setItems((c) => c.map((i, n) => (n === idx ? { ...i, [k]: v } : i)));

  const selectMed = (idx, medId) => {
    const m = medicines.find((m) => m.id === parseInt(medId));
    if (m) {
      updateItem(idx, 'medicine_id', m.id);
      updateItem(idx, 'medicine_name', m.name);
      updateItem(idx, 'gst_rate', m.gst_rate || 12);
    }
  };

  const removeRow = (idx) => setItems((c) => c.filter((_, n) => n !== idx));

  const subtotal = items.reduce((s, i) => s + (parseFloat(i.purchase_price) || 0) * (parseInt(i.quantity) || 0), 0);
  const gstTotal = items.reduce((s, i) => s + ((parseFloat(i.purchase_price) || 0) * (parseInt(i.quantity) || 0) * ((parseFloat(i.gst_rate) || 0) / 100)), 0);
  const grand = subtotal - (parseFloat(form.discount_amount) || 0) + gstTotal + (parseFloat(form.other_charges) || 0);

  const save = async () => {
    setErr('');
    if (items.length === 0) return setErr('Add at least one item');
    for (const it of items) {
      if (!it.medicine_id) return setErr('Select medicine for every row');
      if (!it.purchase_price) return setErr('Enter purchase price');
      if (!it.mrp) return setErr('Enter MRP');
    }
    setSaving(true);
    const res = await window.api.savePurchase({ ...form, items });
    setSaving(false);
    if (res.ok) onSaved();
    else setErr(res.error);
  };

  return (
    <Modal
      title="New Purchase Order"
      onClose={onClose}
      wide
      actions={
        <>
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : `Save · ${fmt(grand)}`}</button>
        </>
      }
    >
      <div className="grid-4">
        <div><label>Invoice No</label><input value={form.invoice_no} onChange={(e) => setForm({ ...form, invoice_no: e.target.value })} /></div>
        <div><label>Supplier</label>
          <select value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}>
            <option value="">Select...</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div><label>Date</label><input type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} /></div>
        <div><label>Payment Mode</label>
          <select value={form.payment_mode} onChange={(e) => setForm({ ...form, payment_mode: e.target.value })}>
            <option value="cash">Cash</option><option value="bank">Bank Transfer</option><option value="cheque">Cheque</option><option value="credit">Credit</option>
          </select>
        </div>
      </div>

      <div className="form-section-title" style={{ marginTop: 16 }}>Items</div>
      <table className="compact">
        <thead>
          <tr><th>Medicine</th><th>Batch</th><th>Expiry</th><th>Qty</th><th>Free</th><th>Purchase ₹</th><th>MRP</th><th>Sale ₹</th><th>GST%</th><th></th></tr>
        </thead>
        <tbody>
          {items.map((it, idx) => (
            <tr key={idx}>
              <td style={{ minWidth: 180 }}>
                <select value={it.medicine_id} onChange={(e) => selectMed(idx, e.target.value)}>
                  <option value="">Select...</option>
                  {medicines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </td>
              <td><input value={it.batch_no} onChange={(e) => updateItem(idx, 'batch_no', e.target.value)} /></td>
              <td><input type="month" value={it.expiry} onChange={(e) => updateItem(idx, 'expiry', e.target.value)} /></td>
              <td><input type="number" value={it.quantity} onChange={(e) => updateItem(idx, 'quantity', e.target.value)} style={{ width: 60 }} /></td>
              <td><input type="number" value={it.free_qty} onChange={(e) => updateItem(idx, 'free_qty', e.target.value)} style={{ width: 60 }} /></td>
              <td><input type="number" step="0.01" value={it.purchase_price} onChange={(e) => updateItem(idx, 'purchase_price', e.target.value)} style={{ width: 80 }} /></td>
              <td><input type="number" step="0.01" value={it.mrp} onChange={(e) => updateItem(idx, 'mrp', e.target.value)} style={{ width: 80 }} /></td>
              <td><input type="number" step="0.01" value={it.sale_price} onChange={(e) => updateItem(idx, 'sale_price', e.target.value)} style={{ width: 80 }} /></td>
              <td><input type="number" value={it.gst_rate} onChange={(e) => updateItem(idx, 'gst_rate', e.target.value)} style={{ width: 60 }} /></td>
              <td><button className="ghost sm danger" onClick={() => removeRow(idx)}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={addRow} style={{ marginTop: 8 }}>+ Add Row</button>

      <div className="grid-4" style={{ marginTop: 14 }}>
        <div><label>Discount ₹</label><input type="number" value={form.discount_amount} onChange={(e) => setForm({ ...form, discount_amount: e.target.value })} /></div>
        <div><label>Other Charges</label><input type="number" value={form.other_charges} onChange={(e) => setForm({ ...form, other_charges: e.target.value })} /></div>
        <div><label>Amount Paid</label><input type="number" value={form.amount_paid} onChange={(e) => setForm({ ...form, amount_paid: e.target.value })} /></div>
        <div style={{ alignSelf: 'end' }}>
          <div className="muted">Subtotal: {fmt(subtotal)} · GST: {fmt(gstTotal)}</div>
          <div className="bold" style={{ fontSize: 18 }}>Total: {fmt(grand)}</div>
        </div>
      </div>

      {err && <div style={{ color: 'var(--danger)', marginTop: 10 }}>{err}</div>}
    </Modal>
  );
}

function PurchaseDetail({ purchase, onClose }) {
  return (
    <Modal title={`Purchase ${purchase.invoice_no || '#' + purchase.id}`} onClose={onClose} wide actions={<button onClick={onClose}>Close</button>}>
      <div className="muted">Date: {fmtDate(purchase.purchase_date)} · Status: {purchase.payment_status}</div>
      <table className="compact" style={{ marginTop: 10 }}>
        <thead><tr><th>Medicine</th><th>Batch</th><th>Expiry</th><th>Qty</th><th>Free</th><th>Purchase</th><th>MRP</th><th>Amt</th></tr></thead>
        <tbody>
          {purchase.items.map((it) => (
            <tr key={it.id}>
              <td>{it.medicine_name}</td>
              <td className="mono">{it.batch_no}</td>
              <td>{it.expiry}</td>
              <td>{it.quantity}</td>
              <td>{it.free_qty}</td>
              <td>{fmt(it.purchase_price)}</td>
              <td>{fmt(it.mrp)}</td>
              <td>{fmt(it.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="divider" />
      <div className="text-right">
        Subtotal: {fmt(purchase.subtotal)} · GST: {fmt(purchase.gst_amount)} · <b>Total: {fmt(purchase.total)}</b>
      </div>
    </Modal>
  );
}

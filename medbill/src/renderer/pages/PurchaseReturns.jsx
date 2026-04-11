import React, { useState, useEffect, useCallback } from 'react';
import Modal from '../components/Modal.jsx';
import { fmt, fmtDate, fmtDateTime, todayISO } from '../lib/helpers.js';

export default function PurchaseReturns({ showToast }) {
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState({ from: new Date(new Date().setDate(1)).toISOString().slice(0, 10), to: todayISO() });
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState(null);

  const load = useCallback(async () => {
    const res = await window.api.getPurchaseReturns(filter);
    if (res.ok) setRows(res.data);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const totalReturned = rows.reduce((s, r) => s + r.total, 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Purchase Returns</h1>
          <div className="subtitle">Debit notes for goods returned to suppliers</div>
        </div>
        <button className="primary" onClick={() => setCreating(true)}>+ New Return</button>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row">
          <input type="date" value={filter.from} onChange={(e) => setFilter({ ...filter, from: e.target.value })} />
          <span className="muted">to</span>
          <input type="date" value={filter.to} onChange={(e) => setFilter({ ...filter, to: e.target.value })} />
        </div>
      </div>

      <div className="stat primary" style={{ marginBottom: 14, maxWidth: 300 }}>
        <div className="stat-label">Total Returns Value</div>
        <div className="stat-value">{fmt(totalReturned)}</div>
      </div>

      <div className="card flush">
        <table>
          <thead>
            <tr>
              <th>Return #</th>
              <th>Date</th>
              <th>Supplier</th>
              <th>Reason</th>
              <th className="text-right">GST</th>
              <th className="text-right">Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan="7">
                <div className="empty"><div className="emoji">↩</div><h3>No purchase returns</h3><div>Create a return when sending goods back to a supplier.</div></div>
              </td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="mono bold">{r.return_number}</td>
                <td>{fmtDate(r.return_date)}</td>
                <td>{r.supplier_name || '-'}</td>
                <td>{r.reason || '-'}</td>
                <td className="text-right">{fmt(r.gst_amount)}</td>
                <td className="text-right bold">{fmt(r.total)}</td>
                <td>
                  <button className="ghost sm" onClick={async () => {
                    const res = await window.api.getPurchaseReturn(r.id);
                    if (res.ok) setDetail(res.data);
                  }}>View</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creating && (
        <CreateReturnModal
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); load(); showToast('Purchase return recorded · Supplier balance updated'); }}
          showToast={showToast}
        />
      )}

      {detail && (
        <ReturnDetailModal
          data={detail}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}

function CreateReturnModal({ onClose, onSaved, showToast }) {
  const [suppliers, setSuppliers] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [form, setForm] = useState({
    supplier_id: '', purchase_id: '', return_date: todayISO(), reason: '', notes: '',
  });
  const [returnItems, setReturnItems] = useState([]);
  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    window.api.getSuppliers('').then((r) => r.ok && setSuppliers(r.data));
  }, []);

  useEffect(() => {
    if (!form.supplier_id) { setPurchases([]); return; }
    window.api.getPurchases({}).then((r) => {
      if (r.ok) {
        const filtered = r.data.filter((p) => String(p.supplier_id) === String(form.supplier_id));
        setPurchases(filtered);
      }
    });
  }, [form.supplier_id]);

  const loadPurchase = async (purchaseId) => {
    if (!purchaseId) { setSelectedPurchase(null); setReturnItems([]); return; }
    const res = await window.api.getPurchase(parseInt(purchaseId));
    if (res.ok) {
      setSelectedPurchase(res.data);
      setReturnItems(res.data.items.map((it) => ({ ...it, return_qty: 0 })));
    }
  };

  const total = returnItems.reduce((s, it) => s + it.purchase_price * (it.return_qty || 0), 0);

  const submit = async () => {
    const items = returnItems.filter((it) => (it.return_qty || 0) > 0);
    if (items.length === 0) return setErr('Select at least one item to return');
    for (const it of items) {
      if (it.return_qty > it.quantity) return setErr(`Return qty exceeds received qty for ${it.medicine_name}`);
    }
    setSubmitting(true);
    const res = await window.api.savePurchaseReturn({
      ...form,
      supplier_id: form.supplier_id || null,
      purchase_id: form.purchase_id || null,
      items: items.map((it) => ({
        purchase_item_id: it.id,
        medicine_id: it.medicine_id,
        batch_id: it.batch_id,
        medicine_name: it.medicine_name,
        batch_no: it.batch_no,
        quantity: it.return_qty,
        purchase_price: it.purchase_price,
        gst_rate: it.gst_rate || 0,
      })),
    });
    setSubmitting(false);
    if (res.ok) onSaved();
    else setErr(res.error);
  };

  return (
    <Modal title="New Purchase Return / Debit Note" onClose={onClose} wide
      actions={<><button onClick={onClose}>Cancel</button><button className="primary" onClick={submit} disabled={submitting}>{submitting ? 'Saving...' : 'Save Return'}</button></>}>
      <div className="grid-2">
        <div>
          <label>Supplier</label>
          <select value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value, purchase_id: '' })}>
            <option value="">-- Select supplier --</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label>Return Date</label>
          <input type="date" value={form.return_date} onChange={(e) => setForm({ ...form, return_date: e.target.value })} />
        </div>
        <div>
          <label>Link to Purchase Invoice (optional)</label>
          <select value={form.purchase_id} onChange={(e) => { setForm({ ...form, purchase_id: e.target.value }); loadPurchase(e.target.value); }}>
            <option value="">-- Select purchase --</option>
            {purchases.map((p) => <option key={p.id} value={p.id}>{p.invoice_no || `#${p.id}`} — {fmtDate(p.purchase_date)} — {fmt(p.total)}</option>)}
          </select>
        </div>
        <div>
          <label>Reason</label>
          <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Damaged, expired, wrong item..." />
        </div>
      </div>
      <div><label>Notes</label><textarea rows="2" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>

      {selectedPurchase && returnItems.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 8 }}>Select Items to Return</h3>
          <div className="card flush">
            <table className="compact">
              <thead><tr><th>Medicine</th><th>Batch</th><th>Received Qty</th><th>Cost</th><th>Return Qty</th><th className="text-right">Amount</th></tr></thead>
              <tbody>
                {returnItems.map((it, idx) => (
                  <tr key={idx}>
                    <td className="bold">{it.medicine_name}</td>
                    <td className="mono">{it.batch_no}</td>
                    <td>{it.quantity}</td>
                    <td>{fmt(it.purchase_price)}</td>
                    <td>
                      <input
                        type="number" min="0" max={it.quantity} value={it.return_qty || 0}
                        onChange={(e) => setReturnItems((cur) => cur.map((r, i) => i === idx ? { ...r, return_qty: parseInt(e.target.value) || 0 } : r))}
                        style={{ width: 80 }}
                      />
                    </td>
                    <td className="text-right">{fmt(it.purchase_price * (it.return_qty || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="totals" style={{ marginTop: 8 }}>
            <div className="line grand"><span>Return Total</span><span>{fmt(total)}</span></div>
          </div>
        </div>
      )}

      {!selectedPurchase && (
        <div className="muted" style={{ marginTop: 12, padding: 12, background: 'var(--bg)', borderRadius: 6 }}>
          Select a purchase invoice above to populate line items, or skip and the return will be recorded without itemised details.
        </div>
      )}

      {err && <div style={{ color: 'var(--danger)', marginTop: 10 }}>{err}</div>}
    </Modal>
  );
}

function ReturnDetailModal({ data, onClose }) {
  return (
    <Modal title={`Return — ${data.return_number}`} onClose={onClose} wide
      actions={<button onClick={onClose}>Close</button>}>
      <div className="grid-4" style={{ marginBottom: 14 }}>
        <div className="stat"><div className="stat-label">Date</div><div className="stat-value" style={{ fontSize: 16 }}>{fmtDate(data.return_date)}</div></div>
        <div className="stat"><div className="stat-label">Subtotal</div><div className="stat-value" style={{ fontSize: 16 }}>{fmt(data.subtotal)}</div></div>
        <div className="stat"><div className="stat-label">GST</div><div className="stat-value" style={{ fontSize: 16 }}>{fmt(data.gst_amount)}</div></div>
        <div className="stat primary"><div className="stat-label">Total</div><div className="stat-value">{fmt(data.total)}</div></div>
      </div>
      {data.reason && <p><strong>Reason:</strong> {data.reason}</p>}
      {data.items && data.items.length > 0 && (
        <div className="card flush">
          <table className="compact">
            <thead><tr><th>Medicine</th><th>Batch</th><th>Qty</th><th>Cost</th><th className="text-right">Amount</th></tr></thead>
            <tbody>
              {data.items.map((it) => (
                <tr key={it.id}>
                  <td>{it.medicine_name}</td>
                  <td className="mono">{it.batch_no}</td>
                  <td>{it.quantity}</td>
                  <td>{fmt(it.purchase_price)}</td>
                  <td className="text-right">{fmt(it.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

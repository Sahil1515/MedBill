import React, { useState, useEffect, useCallback } from 'react';
import Modal from '../components/Modal.jsx';
import { fmt, isExpired, isExpiringSoon, stockBadge, parseCSV } from '../lib/helpers.js';

const UNITS = ['tab', 'cap', 'ml', 'strip', 'bottle', 'sachet', 'box', 'tube', 'pcs'];
const GST_RATES = [0, 5, 12, 18, 28];
const SCHEDULES = ['', 'G', 'H', 'H1', 'X', 'OTC'];

export default function Inventory({ showToast, goTo }) {
  const [meds, setMeds] = useState([]);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null);
  const [batchModalMed, setBatchModalMed] = useState(null);
  const [filter, setFilter] = useState('all'); // all | low | expiring | out
  const [writeoffModal, setWriteoffModal] = useState(false);
  const [reorderData, setReorderData] = useState(null);

  const load = useCallback(async () => {
    const res = await window.api.getMedicines(query);
    if (res.ok) setMeds(res.data);
  }, [query]);

  useEffect(() => {
    const t = setTimeout(load, 150);
    return () => clearTimeout(t);
  }, [load]);

  const filteredMeds = meds.filter((m) => {
    if (filter === 'low') return m.total_stock > 0 && m.total_stock <= (m.reorder_level || 10);
    if (filter === 'out') return m.total_stock === 0;
    if (filter === 'expiring') return isExpiringSoon(m.current_expiry) || isExpired(m.current_expiry);
    return true;
  });

  const remove = async (m) => {
    if (!confirm(`Delete "${m.name}"?`)) return;
    const res = await window.api.deleteMedicine(m.id);
    if (res.ok) { showToast('Medicine removed'); load(); }
    else showToast(res.error, 'error');
  };

  const importCSV = async () => {
    const res = await window.api.readTextFile();
    if (!res.ok) return;
    const rows = parseCSV(res.data.text);
    if (rows.length === 0) return showToast('CSV is empty', 'error');
    const imp = await window.api.importMedicines(rows);
    if (imp.ok) { showToast(`Imported ${imp.data.imported} medicines`); load(); }
    else showToast(imp.error, 'error');
  };

  const exportCSV = async () => {
    const rows = meds.map((m) => ({
      name: m.name, generic_name: m.generic_name, manufacturer: m.manufacturer,
      category: m.category, unit: m.unit, hsn: m.hsn, gst_rate: m.gst_rate,
      barcode: m.barcode, rack_location: m.rack_location, schedule: m.schedule,
      reorder_level: m.reorder_level, current_mrp: m.current_mrp,
      total_stock: m.total_stock,
    }));
    const res = await window.api.exportCsv({ name: 'medicines', rows });
    if (res.ok) showToast('Exported to ' + res.data);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Medicines & Batches</h1>
          <div className="subtitle">{meds.length} medicines · Click a row to manage batches</div>
        </div>
        <div className="row">
          <button onClick={async () => { const r = await window.api.reorderSuggestions(); if (r.ok) setReorderData(r.data); }}>
            ⬇ Reorder Suggestions
          </button>
          <button onClick={() => setWriteoffModal(true)}>Write-off Expired</button>
          <button onClick={exportCSV}>⇡ Export</button>
          <button onClick={importCSV}>⇣ Import CSV</button>
          <button className="primary" onClick={() => setEditing({})}>+ Add Medicine</button>
        </div>
      </div>

      {reorderData && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>Reorder Suggestions ({reorderData.length})</h3>
            <div className="row" style={{ gap: 8 }}>
              <button onClick={async () => {
                const rows = reorderData.map((r) => ({ name: r.name, manufacturer: r.manufacturer, current_stock: r.current_stock, reorder_level: r.reorder_level, suggest_qty: Math.max(r.reorder_level * 2, 50), supplier: r.supplier_name || '', last_cost: r.last_cost || '' }));
                await window.api.exportCsv({ name: 'reorder-suggestions', rows });
              }}>⇡ Export CSV</button>
              <button onClick={() => setReorderData(null)}>✕ Close</button>
            </div>
          </div>
          <table className="compact">
            <thead><tr><th>Medicine</th><th>Stock</th><th>Reorder Level</th><th>Suggest Qty</th><th>Supplier</th><th>Last Cost</th></tr></thead>
            <tbody>
              {reorderData.map((r) => (
                <tr key={r.id}>
                  <td><div className="bold">{r.name}</div><div className="muted">{r.manufacturer}</div></td>
                  <td><span className={`badge ${r.current_stock <= 0 ? 'red' : 'amber'}`}>{r.current_stock}</span></td>
                  <td>{r.reorder_level}</td>
                  <td className="bold">{Math.max(r.reorder_level * 2, 50)}</td>
                  <td>{r.supplier_name || <span className="muted">—</span>}</td>
                  <td>{r.last_cost ? fmt(r.last_cost) : '—'}</td>
                </tr>
              ))}
              {reorderData.length === 0 && <tr><td colSpan="6" className="text-center muted">All medicines are adequately stocked</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row">
          <input
            placeholder="Search by name, generic, barcode or manufacturer..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ flex: 1 }}
          />
          <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 180 }}>
            <option value="all">All medicines</option>
            <option value="low">Low stock only</option>
            <option value="out">Out of stock</option>
            <option value="expiring">Expiring / expired</option>
          </select>
        </div>
      </div>

      <div className="card flush">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Manufacturer</th>
              <th>Category</th>
              <th>Rack</th>
              <th>MRP</th>
              <th>Rate</th>
              <th>Stock</th>
              <th>Batch</th>
              <th>Expiry</th>
              <th>GST</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredMeds.length === 0 && (
              <tr><td colSpan="11"><div className="empty"><div className="emoji">℞</div><h3>No medicines</h3><div>Add or import to get started.</div></div></td></tr>
            )}
            {filteredMeds.map((m) => {
              const badge = stockBadge(m.total_stock || 0, m.reorder_level || 10);
              return (
                <tr key={m.id}>
                  <td>
                    <div className="bold">{m.name}</div>
                    {m.generic_name && <div className="muted">{m.generic_name}</div>}
                  </td>
                  <td>{m.manufacturer || '-'}</td>
                  <td>{m.category || '-'}</td>
                  <td>{m.rack_location || '-'}</td>
                  <td>{fmt(m.current_mrp || 0)}</td>
                  <td>{fmt(m.current_price || 0)}</td>
                  <td><span className={`badge ${badge.cls}`}>{badge.label}</span></td>
                  <td className="mono">{m.current_batch || '-'}</td>
                  <td>
                    {m.current_expiry || '-'}{' '}
                    {isExpired(m.current_expiry) ? <span className="badge red">Expired</span>
                      : isExpiringSoon(m.current_expiry) ? <span className="badge amber">Soon</span> : null}
                  </td>
                  <td>{m.gst_rate}%</td>
                  <td className="text-right">
                    <button className="ghost sm" onClick={() => setBatchModalMed(m)}>Batches</button>
                    <button className="ghost sm" onClick={() => setEditing(m)}>Edit</button>
                    <button className="ghost sm danger" onClick={() => remove(m)}>×</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <MedicineForm
          medicine={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); showToast('Saved'); }}
        />
      )}

      {batchModalMed && (
        <BatchesModal
          medicine={batchModalMed}
          onClose={() => setBatchModalMed(null)}
          onChange={load}
          showToast={showToast}
        />
      )}

      {writeoffModal && (
        <WriteoffModal
          meds={meds}
          onClose={() => { setWriteoffModal(false); load(); }}
          showToast={showToast}
        />
      )}
    </div>
  );
}

// ------------------------------------------------
function WriteoffModal({ meds, onClose, showToast }) {
  const [selected, setSelected] = useState({}); // batch_id -> qty
  const [batches, setBatches] = useState([]);
  const [reason, setReason] = useState('Expired stock write-off');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Load all expired / expiring batches across all medicines
    const allBatches = [];
    meds.forEach((m) => {
      if (m.current_expiry) {
        const [y, mo] = m.current_expiry.split('-').map(Number);
        const exp = new Date(y, mo, 0);
        if (exp <= new Date()) {
          allBatches.push({ ...m, batch_id: null, batch_expiry: m.current_expiry, batch_no: m.current_batch, batch_stock: m.total_stock });
        }
      }
    });
    // Fetch detailed batches for expired medicines
    Promise.all(meds.filter((m) => {
      if (!m.current_expiry) return false;
      const [y, mo] = m.current_expiry.split('-').map(Number);
      return new Date(y, mo, 0) <= new Date();
    }).map((m) => window.api.getMedicine(m.id))).then((results) => {
      const exp = [];
      results.forEach((r) => {
        if (!r.ok) return;
        r.data.batches.forEach((b) => {
          if (!b.expiry || b.stock <= 0) return;
          const [y, mo] = b.expiry.split('-').map(Number);
          if (new Date(y, mo, 0) <= new Date()) {
            exp.push({ ...b, medicine_name: r.data.name, medicine_id: r.data.id });
          }
        });
      });
      setBatches(exp);
      const init = {};
      exp.forEach((b) => { init[b.id] = b.stock; });
      setSelected(init);
    });
  }, []);

  const doWriteoff = async () => {
    const items = batches
      .filter((b) => selected[b.id] > 0)
      .map((b) => ({ batch_id: b.id, medicine_id: b.medicine_id, quantity: selected[b.id] || 0, reason }));
    if (items.length === 0) return showToast('Select at least one batch', 'error');
    setSubmitting(true);
    const res = await window.api.writeoffStock(items);
    setSubmitting(false);
    if (res.ok) { showToast(`Wrote off ${items.length} batch(es)`); onClose(); }
    else showToast(res.error, 'error');
  };

  return (
    <Modal title="Expired Stock Write-off" onClose={onClose} wide
      actions={<><button onClick={onClose}>Cancel</button><button className="primary danger" onClick={doWriteoff} disabled={submitting}>{submitting ? 'Writing off...' : 'Confirm Write-off'}</button></>}>
      <p className="muted" style={{ marginBottom: 12 }}>
        The following expired batches will have their stock zeroed out and recorded in the adjustment log.
      </p>
      {batches.length === 0 && <div className="muted text-center" style={{ padding: 20 }}>No expired batches with stock found.</div>}
      {batches.length > 0 && (
        <>
          <div><label>Reason</label><input value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <div className="card flush" style={{ marginTop: 12 }}>
            <table className="compact">
              <thead><tr><th>Medicine</th><th>Batch</th><th>Expiry</th><th>Stock</th><th>Write-off Qty</th></tr></thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td className="bold">{b.medicine_name}</td>
                    <td className="mono">{b.batch_no}</td>
                    <td><span className="badge red">{b.expiry}</span></td>
                    <td>{b.stock}</td>
                    <td>
                      <input
                        type="number" min="0" max={b.stock}
                        value={selected[b.id] || 0}
                        onChange={(e) => setSelected((s) => ({ ...s, [b.id]: parseInt(e.target.value) || 0 }))}
                        style={{ width: 80 }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}

// ------------------------------------------------
function MedicineForm({ medicine, onClose, onSaved }) {
  const isNew = !medicine.id;
  const [f, setF] = useState({
    name: '', generic_name: '', manufacturer: '', category: '', unit: 'tab',
    hsn: '', gst_rate: 12, barcode: '', rack_location: '', schedule: '',
    composition: '', reorder_level: 10, notes: '',
    // only for new medicine: initial batch
    batch_no: '', expiry: '', purchase_price: '', mrp: '', sale_price: '', stock: '',
    ...medicine,
  });
  const [err, setErr] = useState('');
  const update = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setErr('');
    if (!f.name.trim()) return setErr('Name required');
    const payload = { ...f, gst_rate: parseFloat(f.gst_rate), reorder_level: parseInt(f.reorder_level) || 10 };
    if (isNew) {
      payload.mrp = parseFloat(f.mrp) || 0;
      payload.sale_price = parseFloat(f.sale_price) || payload.mrp;
      payload.purchase_price = parseFloat(f.purchase_price) || 0;
      payload.stock = parseInt(f.stock) || 0;
    }
    const res = isNew ? await window.api.addMedicine(payload) : await window.api.updateMedicine(payload);
    if (res.ok) onSaved();
    else setErr(res.error);
  };

  return (
    <Modal
      title={isNew ? 'Add Medicine' : `Edit: ${f.name}`}
      onClose={onClose}
      wide
      actions={
        <>
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={save}>Save</button>
        </>
      }
    >
      <div className="form-section">
        <div className="form-section-title">Basic Info</div>
        <div className="grid-2">
          <div><label>Name *</label><input value={f.name} onChange={(e) => update('name', e.target.value)} autoFocus /></div>
          <div><label>Generic Name</label><input value={f.generic_name || ''} onChange={(e) => update('generic_name', e.target.value)} /></div>
          <div><label>Manufacturer</label><input value={f.manufacturer || ''} onChange={(e) => update('manufacturer', e.target.value)} /></div>
          <div><label>Category</label><input value={f.category || ''} onChange={(e) => update('category', e.target.value)} placeholder="e.g. Analgesic" /></div>
          <div><label>Composition / Strength</label><input value={f.composition || ''} onChange={(e) => update('composition', e.target.value)} /></div>
          <div><label>Unit</label>
            <select value={f.unit} onChange={(e) => update('unit', e.target.value)}>
              {UNITS.map((u) => <option key={u}>{u}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="form-section">
        <div className="form-section-title">Tax & Tracking</div>
        <div className="grid-4">
          <div><label>HSN Code</label><input value={f.hsn || ''} onChange={(e) => update('hsn', e.target.value)} /></div>
          <div><label>GST %</label>
            <select value={f.gst_rate} onChange={(e) => update('gst_rate', parseFloat(e.target.value))}>
              {GST_RATES.map((g) => <option key={g} value={g}>{g}%</option>)}
            </select>
          </div>
          <div><label>Schedule</label>
            <select value={f.schedule || ''} onChange={(e) => update('schedule', e.target.value)}>
              {SCHEDULES.map((s) => <option key={s} value={s}>{s || '-'}</option>)}
            </select>
          </div>
          <div><label>Barcode</label><input value={f.barcode || ''} onChange={(e) => update('barcode', e.target.value)} /></div>
          <div><label>Rack Location</label><input value={f.rack_location || ''} onChange={(e) => update('rack_location', e.target.value)} placeholder="e.g. R3-B2" /></div>
          <div><label>Reorder Level</label><input type="number" value={f.reorder_level || 10} onChange={(e) => update('reorder_level', e.target.value)} /></div>
        </div>
      </div>

      {isNew && (
        <div className="form-section">
          <div className="form-section-title">Initial Batch (optional)</div>
          <div className="grid-4">
            <div><label>Batch No</label><input value={f.batch_no || ''} onChange={(e) => update('batch_no', e.target.value)} placeholder="B001" /></div>
            <div><label>Expiry (YYYY-MM)</label><input type="month" value={f.expiry || ''} onChange={(e) => update('expiry', e.target.value)} /></div>
            <div><label>Purchase Price</label><input type="number" step="0.01" value={f.purchase_price || ''} onChange={(e) => update('purchase_price', e.target.value)} /></div>
            <div><label>MRP</label><input type="number" step="0.01" value={f.mrp || ''} onChange={(e) => update('mrp', e.target.value)} /></div>
            <div><label>Sale Price</label><input type="number" step="0.01" value={f.sale_price || ''} onChange={(e) => update('sale_price', e.target.value)} /></div>
            <div><label>Stock</label><input type="number" value={f.stock || ''} onChange={(e) => update('stock', e.target.value)} /></div>
          </div>
        </div>
      )}

      <div><label>Notes</label><textarea rows="2" value={f.notes || ''} onChange={(e) => update('notes', e.target.value)} /></div>

      {err && <div style={{ color: 'var(--danger)', marginTop: 10 }}>{err}</div>}
    </Modal>
  );
}

// ------------------------------------------------
function BatchesModal({ medicine, onClose, onChange, showToast }) {
  const [full, setFull] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    const res = await window.api.getMedicine(medicine.id);
    if (res.ok) setFull(res.data);
  };
  useEffect(() => { load(); }, []);

  const remove = async (b) => {
    if (!confirm(`Delete batch ${b.batch_no}?`)) return;
    const res = await window.api.deleteBatch(b.id);
    if (res.ok) { load(); onChange(); }
    else showToast(res.error, 'error');
  };

  return (
    <Modal
      title={`Batches — ${medicine.name}`}
      onClose={onClose}
      wide
      actions={<button className="primary" onClick={() => setEditing({ medicine_id: medicine.id })}>+ Add Batch</button>}
    >
      {!full ? <div className="muted">Loading...</div> : (
        <table className="compact">
          <thead>
            <tr><th>Batch No</th><th>Expiry</th><th>Purchase ₹</th><th>MRP</th><th>Sale ₹</th><th>Stock</th><th></th></tr>
          </thead>
          <tbody>
            {full.batches.length === 0 && <tr><td colSpan="7" className="muted text-center">No batches</td></tr>}
            {full.batches.map((b) => (
              <tr key={b.id}>
                <td className="mono">{b.batch_no}</td>
                <td>{b.expiry || '-'}</td>
                <td>{fmt(b.purchase_price)}</td>
                <td>{fmt(b.mrp)}</td>
                <td>{fmt(b.sale_price)}</td>
                <td>{b.stock}</td>
                <td className="text-right">
                  <button className="ghost sm" onClick={() => setEditing(b)}>Edit</button>
                  <button className="ghost sm danger" onClick={() => remove(b)}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <BatchForm
          batch={editing}
          medId={medicine.id}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); onChange(); }}
        />
      )}
    </Modal>
  );
}

function BatchForm({ batch, medId, onClose, onSaved }) {
  const [f, setF] = useState({
    batch_no: '', expiry: '', purchase_price: '', mrp: '', sale_price: '', stock: '',
    ...batch,
  });
  const [err, setErr] = useState('');
  const save = async () => {
    setErr('');
    const payload = {
      ...f,
      medicine_id: medId,
      purchase_price: parseFloat(f.purchase_price) || 0,
      mrp: parseFloat(f.mrp) || 0,
      sale_price: parseFloat(f.sale_price) || 0,
      stock: parseInt(f.stock) || 0,
    };
    const res = f.id ? await window.api.updateBatch(payload) : await window.api.addBatch(payload);
    if (res.ok) onSaved();
    else setErr(res.error);
  };
  return (
    <Modal
      title={f.id ? 'Edit Batch' : 'Add Batch'}
      onClose={onClose}
      actions={<><button onClick={onClose}>Cancel</button><button className="primary" onClick={save}>Save</button></>}
    >
      <div className="grid-2">
        <div><label>Batch No</label><input value={f.batch_no || ''} onChange={(e) => setF({ ...f, batch_no: e.target.value })} autoFocus /></div>
        <div><label>Expiry</label><input type="month" value={f.expiry || ''} onChange={(e) => setF({ ...f, expiry: e.target.value })} /></div>
        <div><label>Purchase Price</label><input type="number" step="0.01" value={f.purchase_price || ''} onChange={(e) => setF({ ...f, purchase_price: e.target.value })} /></div>
        <div><label>MRP</label><input type="number" step="0.01" value={f.mrp || ''} onChange={(e) => setF({ ...f, mrp: e.target.value })} /></div>
        <div><label>Sale Price</label><input type="number" step="0.01" value={f.sale_price || ''} onChange={(e) => setF({ ...f, sale_price: e.target.value })} /></div>
        <div><label>Stock</label><input type="number" value={f.stock || ''} onChange={(e) => setF({ ...f, stock: e.target.value })} /></div>
      </div>
      {err && <div style={{ color: 'var(--danger)', marginTop: 10 }}>{err}</div>}
    </Modal>
  );
}

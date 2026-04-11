import React, { useState, useEffect, useCallback } from 'react';
import Modal from '../components/Modal.jsx';
import { fmt, todayISO } from '../lib/helpers.js';

const SCHEME_TYPES = [
  { value: 'percent', label: '% Discount' },
  { value: 'flat', label: 'Flat ₹ Discount' },
  { value: 'bogo', label: 'Buy X Get Y Free' },
];

const APPLIES_TO = [
  { value: 'all', label: 'All medicines' },
  { value: 'medicine', label: 'Specific medicine' },
  { value: 'category', label: 'Category' },
];

const CATEGORIES = ['Analgesic', 'Antibiotic', 'Antacid', 'Antihistamine', 'Diabetes', 'BP', 'Cholesterol', 'Cardiac', 'Thyroid', 'Supplement', 'Antiseptic', 'Cough', 'Cold', 'ENT', 'Pediatric', 'Topical', 'Device', 'Other'];

export default function Schemes({ showToast }) {
  const [schemes, setSchemes] = useState([]);
  const [editing, setEditing] = useState(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    const res = await window.api.getSchemes({ activeOnly: false });
    if (res.ok) setSchemes(res.data);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (scheme) => {
    const res = await window.api.updateScheme({ ...scheme, active: scheme.active ? 0 : 1 });
    if (res.ok) { load(); showToast(scheme.active ? 'Scheme deactivated' : 'Scheme activated'); }
  };

  const remove = async (id) => {
    if (!confirm('Delete this scheme?')) return;
    const res = await window.api.deleteScheme(id);
    if (res.ok) { load(); showToast('Deleted'); }
  };

  const visible = showAll ? schemes : schemes.filter((s) => s.active);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Schemes & Offers</h1>
          <div className="subtitle">Discount offers applied during billing</div>
        </div>
        <div className="row">
          <button onClick={() => setShowAll(!showAll)}>{showAll ? 'Active Only' : 'Show All'}</button>
          <button className="primary" onClick={() => setEditing({})}>+ Add Scheme</button>
        </div>
      </div>

      <div className="grid-4" style={{ marginBottom: 14 }}>
        <div className="stat"><div className="stat-label">Total Schemes</div><div className="stat-value">{schemes.length}</div></div>
        <div className="stat primary"><div className="stat-label">Active</div><div className="stat-value">{schemes.filter((s) => s.active).length}</div></div>
        <div className="stat"><div className="stat-label">% Discount</div><div className="stat-value">{schemes.filter((s) => s.scheme_type === 'percent' && s.active).length}</div></div>
        <div className="stat"><div className="stat-label">Flat Discount</div><div className="stat-value">{schemes.filter((s) => s.scheme_type === 'flat' && s.active).length}</div></div>
      </div>

      <div className="card flush">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Value</th>
              <th>Applies To</th>
              <th>Min Qty</th>
              <th>Valid From</th>
              <th>Valid To</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan="9">
                <div className="empty">
                  <div className="emoji">🏷</div>
                  <h3>{showAll ? 'No schemes created' : 'No active schemes'}</h3>
                  <div>Create a scheme to automatically apply discounts during billing.</div>
                </div>
              </td></tr>
            )}
            {visible.map((s) => (
              <tr key={s.id}>
                <td className="bold">{s.name}</td>
                <td>{SCHEME_TYPES.find((t) => t.value === s.scheme_type)?.label || s.scheme_type}</td>
                <td>
                  {s.scheme_type === 'percent' ? `${s.discount_value}%`
                    : s.scheme_type === 'flat' ? fmt(s.discount_value)
                    : `${s.discount_value} free`}
                </td>
                <td>
                  {s.applies_to === 'all' ? 'All medicines'
                    : s.applies_to === 'category' ? `Category: ${s.category}`
                    : `Medicine #${s.medicine_id}`}
                </td>
                <td>{s.min_qty}</td>
                <td>{s.valid_from || '—'}</td>
                <td>{s.valid_to || '—'}</td>
                <td>
                  <span className={`badge ${s.active ? 'green' : 'gray'}`}>
                    {s.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="text-right">
                  <button className="ghost sm" onClick={() => toggle(s)}>
                    {s.active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button className="ghost sm" onClick={() => setEditing(s)}>Edit</button>
                  <button className="ghost sm danger" onClick={() => remove(s.id)}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <SchemeForm
          scheme={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); showToast('Scheme saved'); }}
        />
      )}
    </div>
  );
}

function SchemeForm({ scheme, onClose, onSaved }) {
  const [f, setF] = useState({
    name: '', scheme_type: 'percent', discount_value: 10, applies_to: 'all',
    medicine_id: '', category: '', min_qty: 1, active: 1,
    valid_from: '', valid_to: '', notes: '',
    ...scheme,
  });
  const [err, setErr] = useState('');

  const save = async () => {
    if (!f.name.trim()) return setErr('Name is required');
    if (!f.discount_value || parseFloat(f.discount_value) <= 0) return setErr('Discount value must be > 0');
    if (f.scheme_type === 'percent' && parseFloat(f.discount_value) > 100) return setErr('Percent cannot exceed 100');
    const payload = { ...f, discount_value: parseFloat(f.discount_value), min_qty: parseInt(f.min_qty) || 1 };
    const res = f.id ? await window.api.updateScheme(payload) : await window.api.addScheme(payload);
    if (res.ok) onSaved(); else setErr(res.error);
  };

  return (
    <Modal
      title={f.id ? 'Edit Scheme' : 'New Scheme / Offer'}
      onClose={onClose}
      wide
      actions={<><button onClick={onClose}>Cancel</button><button className="primary" onClick={save}>Save</button></>}
    >
      <div className="grid-2">
        <div><label>Scheme Name *</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus placeholder="e.g. Summer Sale 15% off" /></div>
        <div>
          <label>Type</label>
          <select value={f.scheme_type} onChange={(e) => setF({ ...f, scheme_type: e.target.value })}>
            {SCHEME_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label>{f.scheme_type === 'percent' ? 'Discount %' : f.scheme_type === 'flat' ? 'Flat Discount ₹' : 'Free Qty'}</label>
          <input type="number" min="0" value={f.discount_value} onChange={(e) => setF({ ...f, discount_value: e.target.value })} />
        </div>
        <div>
          <label>Min Qty to Qualify</label>
          <input type="number" min="1" value={f.min_qty} onChange={(e) => setF({ ...f, min_qty: e.target.value })} />
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 8 }}>
        <div>
          <label>Applies To</label>
          <select value={f.applies_to} onChange={(e) => setF({ ...f, applies_to: e.target.value })}>
            {APPLIES_TO.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </div>
        {f.applies_to === 'category' && (
          <div>
            <label>Category</label>
            <select value={f.category || ''} onChange={(e) => setF({ ...f, category: e.target.value })}>
              <option value="">-- Select --</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}
        {f.applies_to === 'medicine' && (
          <div><label>Medicine ID</label><input type="number" value={f.medicine_id || ''} onChange={(e) => setF({ ...f, medicine_id: e.target.value })} placeholder="Enter medicine ID" /></div>
        )}
      </div>

      <div className="grid-2" style={{ marginTop: 8 }}>
        <div><label>Valid From</label><input type="date" value={f.valid_from || ''} onChange={(e) => setF({ ...f, valid_from: e.target.value })} /></div>
        <div><label>Valid To</label><input type="date" value={f.valid_to || ''} onChange={(e) => setF({ ...f, valid_to: e.target.value })} /></div>
      </div>

      <div style={{ marginTop: 8 }}>
        <label>
          <input type="checkbox" checked={!!f.active} onChange={(e) => setF({ ...f, active: e.target.checked ? 1 : 0 })} style={{ marginRight: 6 }} />
          Active (appears in billing scheme selector)
        </label>
      </div>
      <div><label>Notes</label><textarea rows="2" value={f.notes || ''} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
      {err && <div style={{ color: 'var(--danger)', marginTop: 8 }}>{err}</div>}
    </Modal>
  );
}

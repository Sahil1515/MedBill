import React, { useState, useEffect, useCallback } from 'react';
import Modal from '../components/Modal.jsx';

export default function Doctors({ showToast }) {
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    const res = await window.api.getDoctors(query);
    if (res.ok) setRows(res.data);
  }, [query]);
  useEffect(() => { const t = setTimeout(load, 150); return () => clearTimeout(t); }, [load]);

  const remove = async (d) => {
    if (!confirm(`Delete ${d.name}?`)) return;
    const res = await window.api.deleteDoctor(d.id);
    if (res.ok) { showToast('Deleted'); load(); }
    else showToast(res.error, 'error');
  };

  return (
    <div>
      <div className="page-header">
        <div><h1>Doctors</h1><div className="subtitle">{rows.length} doctors</div></div>
        <button className="primary" onClick={() => setEditing({})}>+ Add Doctor</button>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <input placeholder="Search doctors..." value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="card flush">
        <table>
          <thead><tr><th>Name</th><th>Specialization</th><th>Clinic</th><th>Phone</th><th>Reg #</th><th></th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan="6"><div className="empty"><div className="emoji">✚</div><h3>No doctors</h3></div></td></tr>}
            {rows.map((d) => (
              <tr key={d.id}>
                <td className="bold">{d.name}</td>
                <td>{d.specialization || '-'}</td>
                <td>{d.clinic || '-'}</td>
                <td>{d.phone || '-'}</td>
                <td>{d.registration_no || '-'}</td>
                <td className="text-right">
                  <button className="ghost sm" onClick={() => setEditing(d)}>Edit</button>
                  <button className="ghost sm danger" onClick={() => remove(d)}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && <DoctorForm doctor={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); showToast('Saved'); }} />}
    </div>
  );
}

function DoctorForm({ doctor, onClose, onSaved }) {
  const [f, setF] = useState({ name: '', phone: '', clinic: '', specialization: '', registration_no: '', commission_percent: 0, notes: '', ...doctor });
  const [err, setErr] = useState('');
  const save = async () => {
    if (!f.name) return setErr('Name required');
    const res = f.id ? await window.api.updateDoctor(f) : await window.api.addDoctor(f);
    if (res.ok) onSaved(); else setErr(res.error);
  };
  return (
    <Modal title={f.id ? 'Edit Doctor' : 'Add Doctor'} onClose={onClose} wide
      actions={<><button onClick={onClose}>Cancel</button><button className="primary" onClick={save}>Save</button></>}>
      <div className="grid-2">
        <div><label>Name *</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></div>
        <div><label>Phone</label><input value={f.phone || ''} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
        <div><label>Clinic/Hospital</label><input value={f.clinic || ''} onChange={(e) => setF({ ...f, clinic: e.target.value })} /></div>
        <div><label>Specialization</label><input value={f.specialization || ''} onChange={(e) => setF({ ...f, specialization: e.target.value })} placeholder="e.g. Pediatrics" /></div>
        <div><label>Registration No</label><input value={f.registration_no || ''} onChange={(e) => setF({ ...f, registration_no: e.target.value })} /></div>
        <div><label>Commission %</label><input type="number" value={f.commission_percent || 0} onChange={(e) => setF({ ...f, commission_percent: e.target.value })} /></div>
      </div>
      <div><label>Notes</label><textarea rows="2" value={f.notes || ''} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
      {err && <div style={{ color: 'var(--danger)' }}>{err}</div>}
    </Modal>
  );
}

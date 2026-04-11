import React, { useEffect, useState, useCallback } from 'react';
import Receipt from '../components/Receipt.jsx';
import Modal from '../components/Modal.jsx';
import { fmt, fmtDateTime, todayISO } from '../lib/helpers.js';

export default function History({ settings, showToast }) {
  const [bills, setBills] = useState([]);
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selected, setSelected] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState('');

  const load = useCallback(async () => {
    const res = await window.api.getBills({ search, from: from || null, to: to || null });
    if (res.ok) setBills(res.data);
  }, [search, from, to]);

  useEffect(() => { const t = setTimeout(load, 150); return () => clearTimeout(t); }, [load]);

  const open = async (b) => {
    const res = await window.api.getBill(b.id);
    if (res.ok) setSelected(res.data);
    else showToast(res.error, 'error');
  };

  const doCancel = async () => {
    const res = await window.api.cancelBill({ id: cancelTarget.id, reason: cancelReason });
    if (res.ok) { showToast('Bill cancelled · Stock restored'); setCancelTarget(null); setCancelReason(''); load(); }
    else showToast(res.error, 'error');
  };

  if (selected) {
    return (
      <div>
        <div className="page-header no-print">
          <div>
            <h1>Bill #{selected.bill_number}</h1>
            <div className="subtitle">{fmtDateTime(selected.created_at)} {selected.status === 'cancelled' && <span className="badge red">Cancelled</span>}</div>
          </div>
          <div className="row">
            <button onClick={() => setSelected(null)}>← Back</button>
            <button className="primary" onClick={() => window.print()}>Print</button>
          </div>
        </div>
        <Receipt bill={selected} settings={settings} />
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div><h1>Bill History</h1><div className="subtitle">{bills.length} bills shown</div></div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="grid-4">
          <div><label>Search</label><input placeholder="Bill #, name, phone..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <div><label>From</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><label>To</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div style={{ alignSelf: 'end' }}><button onClick={() => { setSearch(''); setFrom(''); setTo(''); }}>Clear</button></div>
        </div>
      </div>

      <div className="card flush">
        <table>
          <thead><tr><th>Bill #</th><th>Customer</th><th>Date</th><th>Items</th><th>Mode</th><th>Status</th><th className="text-right">Total</th><th></th></tr></thead>
          <tbody>
            {bills.length === 0 && <tr><td colSpan="8"><div className="empty"><div className="emoji">◎</div><h3>No bills</h3></div></td></tr>}
            {bills.map((b) => (
              <tr key={b.id} style={b.status === 'cancelled' ? { opacity: 0.6 } : {}}>
                <td className="mono">{b.bill_number}</td>
                <td>{b.customer_name || '-'}<div className="muted">{b.phone}</div></td>
                <td>{fmtDateTime(b.created_at)}</td>
                <td>{b.item_count}</td>
                <td>{b.payment_mode}</td>
                <td>
                  {b.status === 'cancelled' ? <span className="badge red">Cancelled</span>
                  : <span className={`badge ${b.payment_status === 'paid' ? 'green' : b.payment_status === 'partial' ? 'amber' : 'red'}`}>{b.payment_status}</span>}
                </td>
                <td className="text-right bold">{fmt(b.total)}</td>
                <td className="text-right">
                  <button className="ghost sm" onClick={() => open(b)}>View</button>
                  {b.status !== 'cancelled' && <button className="ghost sm danger" onClick={() => setCancelTarget(b)}>Cancel</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {cancelTarget && (
        <Modal
          title={`Cancel bill ${cancelTarget.bill_number}?`}
          onClose={() => setCancelTarget(null)}
          actions={<><button onClick={() => setCancelTarget(null)}>Nope</button><button className="primary" onClick={doCancel}>Cancel Bill</button></>}
        >
          <div className="muted">This will restore all stock. Action is recorded in the audit log.</div>
          <div style={{ marginTop: 12 }}>
            <label>Reason</label>
            <textarea rows="3" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
          </div>
        </Modal>
      )}
    </div>
  );
}

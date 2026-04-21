import React, { useEffect, useState } from 'react';
import { fmt, fmtDate } from '../lib/helpers.js';

export default function Dashboard({ showToast, goTo }) {
  const [data, setData] = useState(null);

  const load = async () => {
    const res = await window.api.dashboard();
    if (res.ok) setData(res.data);
    else showToast(res.error, 'error');
  };

  useEffect(() => { load(); }, []);

  if (!data) return <div className="muted">Loading dashboard...</div>;

  const maxTrend = Math.max(1, ...data.weekly_trend.map((t) => t.s));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <div className="subtitle">Overview of today's operations</div>
        </div>
        <div className="row">
          <button onClick={load}>↻ Refresh</button>
          <button className="primary" onClick={() => goTo('billing')}>+ New Bill</button>
        </div>
      </div>

      <div className="grid-5" style={{ marginBottom: 18 }}>
        <div className="stat primary">
          <div className="stat-label">Today's Sales</div>
          <div className="stat-value">{fmt(data.today.total)}</div>
          <div className="stat-sub">{data.today.count} bills</div>
        </div>
        <div className="stat">
          <div className="stat-label">This Month</div>
          <div className="stat-value">{fmt(data.month.total)}</div>
          <div className="stat-sub">{data.month.count} bills</div>
        </div>
        <div className="stat">
          <div className="stat-label">Pending Receivable</div>
          <div className="stat-value text-warning">{fmt(data.pending_receivable)}</div>
          <div className="stat-sub">from customers</div>
        </div>
        <div className="stat">
          <div className="stat-label">Medicines</div>
          <div className="stat-value">{data.medicines}</div>
          <div className="stat-sub">in inventory</div>
        </div>
        <div className="stat">
          <div className="stat-label">Customers</div>
          <div className="stat-value">{data.customers}</div>
          <div className="stat-sub">registered</div>
        </div>
      </div>

      <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
        <div className="card">
          <h3>Last 7 days</h3>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 140, marginTop: 10 }}>
            {data.weekly_trend.length === 0 && <div className="muted">No sales yet</div>}
            {data.weekly_trend.map((t) => (
              <div key={t.d} style={{ flex: 1, textAlign: 'center' }}>
                <div
                  style={{
                    height: `${(t.s / maxTrend) * 110}px`,
                    background: 'linear-gradient(180deg, var(--primary), var(--primary-dark))',
                    borderRadius: '6px 6px 0 0',
                    minHeight: 4,
                    marginBottom: 4,
                  }}
                  title={`${fmt(t.s)} · ${t.c} bills`}
                />
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                  {new Date(t.d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3>Top-Selling Medicines (This Month)</h3>
          {data.top_medicines.length === 0 ? (
            <div className="muted">No sales yet</div>
          ) : (
            <table className="compact">
              <thead><tr><th>Medicine</th><th>Qty</th><th className="text-right">Amount</th></tr></thead>
              <tbody>
                {data.top_medicines.map((m, i) => (
                  <tr key={i}>
                    <td>{m.name}</td>
                    <td>{m.qty}</td>
                    <td className="text-right">{fmt(m.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="grid-2" style={{ gap: 16 }}>
        <div className="card">
          <h3>⚠ Low Stock Alerts</h3>
          {data.low_stock.length === 0 ? (
            <div className="muted">All good — no reorders needed</div>
          ) : (
            <table className="compact">
              <thead><tr><th>Medicine</th><th>Current</th><th>Reorder At</th></tr></thead>
              <tbody>
                {data.low_stock.map((m) => (
                  <tr key={m.id}>
                    <td>{m.name}</td>
                    <td><span className={`badge ${m.stock === 0 ? 'red' : 'amber'}`}>{m.stock}</span></td>
                    <td>{m.reorder_level}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h3>⏱ Expiring Soon ({data.expiry_alert_days} days)</h3>
          {data.expiring_soon.length === 0 ? (
            <div className="muted">No batches expiring soon</div>
          ) : (
            <table className="compact">
              <thead><tr><th>Medicine</th><th>Batch</th><th>Expiry</th><th>Qty</th></tr></thead>
              <tbody>
                {data.expiring_soon.map((b) => (
                  <tr key={b.id}>
                    <td>{b.name}</td>
                    <td className="mono">{b.batch_no}</td>
                    <td><span className="badge amber">{b.expiry}</span></td>
                    <td>{b.stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

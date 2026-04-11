import React, { useState, useEffect } from 'react';
import { fmt, fmtDate, fmtDateTime, todayISO } from '../lib/helpers.js';

const TABS = [
  { id: 'sales',      label: 'Sales' },
  { id: 'stock',      label: 'Stock Valuation' },
  { id: 'gst',        label: 'GST Summary' },
  { id: 'expiry',     label: 'Expiry' },
  { id: 'profit',     label: 'Profit' },
  { id: 'daybook',    label: 'Daybook' },
  { id: 'shiftclose', label: 'Shift Close' },
  { id: 'doctor',     label: 'Doctor Commission' },
  { id: 'audit',      label: 'Audit Log' },
];

export default function Reports({ showToast }) {
  const [tab, setTab] = useState('sales');
  return (
    <div>
      <div className="page-header"><div><h1>Reports</h1><div className="subtitle">Business insights and compliance</div></div></div>
      <div className="ptabs">
        {TABS.map((t) => (
          <button key={t.id} className={`ptab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>
      {tab === 'sales'      && <SalesReport showToast={showToast} />}
      {tab === 'stock'      && <StockReport showToast={showToast} />}
      {tab === 'gst'        && <GstReport showToast={showToast} />}
      {tab === 'expiry'     && <ExpiryReport showToast={showToast} />}
      {tab === 'profit'     && <ProfitReport showToast={showToast} />}
      {tab === 'daybook'    && <Daybook showToast={showToast} />}
      {tab === 'shiftclose' && <ShiftCloseReport showToast={showToast} />}
      {tab === 'doctor'     && <DoctorCommissionReport showToast={showToast} />}
      {tab === 'audit'      && <AuditLog />}
    </div>
  );
}

function DateRange({ from, to, setFrom, setTo, onChange }) {
  return (
    <div className="row">
      <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); onChange && onChange(); }} />
      <span className="muted">to</span>
      <input type="date" value={to} onChange={(e) => { setTo(e.target.value); onChange && onChange(); }} />
    </div>
  );
}

function SalesReport({ showToast }) {
  const first = new Date(); first.setDate(1);
  const [from, setFrom] = useState(first.toISOString().slice(0, 10));
  const [to, setTo] = useState(todayISO());
  const [data, setData] = useState(null);

  const load = async () => {
    const res = await window.api.salesReport({ from, to });
    if (res.ok) setData(res.data);
  };
  useEffect(() => { load(); }, [from, to]);

  const exportCsv = async () => {
    if (!data) return;
    const rows = data.bills.map((b) => ({
      bill_number: b.bill_number, date: fmtDate(b.created_at), customer: b.customer_name, phone: b.phone,
      subtotal: b.subtotal, discount: b.discount_amount, gst: b.gst_amount, total: b.total, status: b.payment_status,
    }));
    const res = await window.api.exportCsv({ name: 'sales-report', rows });
    if (res.ok) showToast('Exported');
  };

  return (
    <div>
      <div className="row" style={{ marginBottom: 14, justifyContent: 'space-between' }}>
        <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />
        <button onClick={exportCsv}>⇡ Export CSV</button>
      </div>
      {!data ? <div className="muted">Loading...</div> : (
        <>
          <div className="grid-5" style={{ marginBottom: 14 }}>
            <div className="stat"><div className="stat-label">Bills</div><div className="stat-value">{data.summary.count}</div></div>
            <div className="stat"><div className="stat-label">Subtotal</div><div className="stat-value">{fmt(data.summary.subtotal)}</div></div>
            <div className="stat"><div className="stat-label">Discount</div><div className="stat-value">{fmt(data.summary.discount)}</div></div>
            <div className="stat"><div className="stat-label">GST</div><div className="stat-value">{fmt(data.summary.gst)}</div></div>
            <div className="stat primary"><div className="stat-label">Total Sales</div><div className="stat-value">{fmt(data.summary.total)}</div></div>
          </div>
          <div className="card flush">
            <table>
              <thead><tr><th>Bill #</th><th>Date</th><th>Customer</th><th>Payment</th><th>Status</th><th className="text-right">Total</th></tr></thead>
              <tbody>
                {data.bills.map((b) => (
                  <tr key={b.id}>
                    <td className="mono">{b.bill_number}</td>
                    <td>{fmtDateTime(b.created_at)}</td>
                    <td>{b.customer_name || '-'}</td>
                    <td>{b.payment_mode}</td>
                    <td><span className={`badge ${b.payment_status === 'paid' ? 'green' : 'amber'}`}>{b.payment_status}</span></td>
                    <td className="text-right bold">{fmt(b.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function StockReport({ showToast }) {
  const [rows, setRows] = useState([]);
  useEffect(() => { window.api.stockReport().then((r) => r.ok && setRows(r.data)); }, []);
  const totalCost = rows.reduce((s, r) => s + r.stock_value, 0);
  const totalMrp = rows.reduce((s, r) => s + r.stock_mrp, 0);
  const exportCsv = async () => {
    const res = await window.api.exportCsv({ name: 'stock-report', rows });
    if (res.ok) showToast('Exported');
  };
  return (
    <div>
      <div className="grid-4" style={{ marginBottom: 14 }}>
        <div className="stat"><div className="stat-label">SKUs</div><div className="stat-value">{rows.length}</div></div>
        <div className="stat"><div className="stat-label">Total Units</div><div className="stat-value">{rows.reduce((s, r) => s + r.total_stock, 0)}</div></div>
        <div className="stat"><div className="stat-label">Stock Value (Cost)</div><div className="stat-value">{fmt(totalCost)}</div></div>
        <div className="stat primary"><div className="stat-label">Stock Value (MRP)</div><div className="stat-value">{fmt(totalMrp)}</div></div>
      </div>
      <div className="row" style={{ marginBottom: 10, justifyContent: 'flex-end' }}><button onClick={exportCsv}>⇡ Export CSV</button></div>
      <div className="card flush">
        <table>
          <thead><tr><th>Medicine</th><th>Manufacturer</th><th>Stock</th><th>Reorder</th><th className="text-right">Cost Value</th><th className="text-right">MRP Value</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="bold">{r.name}</td>
                <td>{r.manufacturer || '-'}</td>
                <td>{r.total_stock}</td>
                <td>{r.reorder_level}</td>
                <td className="text-right">{fmt(r.stock_value)}</td>
                <td className="text-right">{fmt(r.stock_mrp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GstReport({ showToast }) {
  const first = new Date(); first.setDate(1);
  const [from, setFrom] = useState(first.toISOString().slice(0, 10));
  const [to, setTo] = useState(todayISO());
  const [rows, setRows] = useState([]);
  useEffect(() => { window.api.gstReport({ from, to }).then((r) => r.ok && setRows(r.data)); }, [from, to]);
  const totals = rows.reduce((a, r) => ({
    taxable: a.taxable + r.taxable, cgst: a.cgst + r.cgst, sgst: a.sgst + r.sgst, igst: a.igst + r.igst, total: a.total + r.total,
  }), { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 });
  return (
    <div>
      <div className="row" style={{ marginBottom: 14 }}><DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} /></div>
      <div className="card flush">
        <table>
          <thead><tr><th>HSN</th><th>GST %</th><th className="text-right">Taxable</th><th className="text-right">CGST</th><th className="text-right">SGST</th><th className="text-right">IGST</th><th className="text-right">Total</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan="7" className="text-center muted">No data</td></tr>}
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{r.hsn || '-'}</td>
                <td>{r.gst_rate}%</td>
                <td className="text-right">{fmt(r.taxable)}</td>
                <td className="text-right">{fmt(r.cgst)}</td>
                <td className="text-right">{fmt(r.sgst)}</td>
                <td className="text-right">{fmt(r.igst)}</td>
                <td className="text-right bold">{fmt(r.total)}</td>
              </tr>
            ))}
            <tr style={{ borderTop: '2px solid var(--border-strong)', fontWeight: 700 }}>
              <td colSpan="2">TOTAL</td>
              <td className="text-right">{fmt(totals.taxable)}</td>
              <td className="text-right">{fmt(totals.cgst)}</td>
              <td className="text-right">{fmt(totals.sgst)}</td>
              <td className="text-right">{fmt(totals.igst)}</td>
              <td className="text-right">{fmt(totals.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExpiryReport({ showToast }) {
  const [days, setDays] = useState(60);
  const [rows, setRows] = useState([]);
  useEffect(() => { window.api.expiryReport({ days }).then((r) => r.ok && setRows(r.data)); }, [days]);
  return (
    <div>
      <div className="row" style={{ marginBottom: 14 }}>
        <label style={{ margin: 0 }}>Window (days):</label>
        <select value={days} onChange={(e) => setDays(parseInt(e.target.value))} style={{ width: 120 }}>
          <option value={30}>30 days</option><option value={60}>60 days</option><option value={90}>90 days</option><option value={180}>180 days</option>
        </select>
      </div>
      <div className="card flush">
        <table>
          <thead><tr><th>Medicine</th><th>Manufacturer</th><th>Batch</th><th>Expiry</th><th>Stock</th><th>MRP</th><th className="text-right">Value</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan="7" className="text-center muted">No batches expiring in {days} days</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="bold">{r.name}</td>
                <td>{r.manufacturer || '-'}</td>
                <td className="mono">{r.batch_no}</td>
                <td><span className="badge amber">{r.expiry}</span></td>
                <td>{r.stock}</td>
                <td>{fmt(r.mrp)}</td>
                <td className="text-right">{fmt(r.stock * r.mrp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProfitReport({ showToast }) {
  const first = new Date(); first.setDate(1);
  const [from, setFrom] = useState(first.toISOString().slice(0, 10));
  const [to, setTo] = useState(todayISO());
  const [data, setData] = useState(null);
  useEffect(() => { window.api.profitReport({ from, to }).then((r) => r.ok && setData(r.data)); }, [from, to]);
  return (
    <div>
      <div className="row" style={{ marginBottom: 14 }}><DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} /></div>
      {data && (
        <div className="stat primary" style={{ marginBottom: 14, maxWidth: 400 }}>
          <div className="stat-label">Total Gross Profit</div>
          <div className="stat-value">{fmt(data.total_profit)}</div>
        </div>
      )}
      <div className="card flush">
        <table>
          <thead><tr><th>Medicine</th><th>Qty</th><th className="text-right">Sale ₹</th><th className="text-right">Cost ₹</th><th className="text-right">Profit</th></tr></thead>
          <tbody>
            {data?.rows.map((r, i) => (
              <tr key={i}>
                <td>{r.name}</td>
                <td>{r.quantity}</td>
                <td className="text-right">{fmt(r.sale_price)}</td>
                <td className="text-right">{fmt(r.cost)}</td>
                <td className="text-right bold text-success">{fmt(r.profit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Daybook({ showToast }) {
  const [date, setDate] = useState(todayISO());
  const [data, setData] = useState(null);
  useEffect(() => { window.api.daybook({ date }).then((r) => r.ok && setData(r.data)); }, [date]);
  return (
    <div>
      <div className="row" style={{ marginBottom: 14 }}>
        <label style={{ margin: 0 }}>Date:</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 200 }} />
      </div>
      {data && (
        <>
          <div className="grid-4" style={{ marginBottom: 14 }}>
            <div className="stat"><div className="stat-label">Sales</div><div className="stat-value">{data.bills.length}</div></div>
            <div className="stat"><div className="stat-label">Cash In</div><div className="stat-value text-success">{fmt(data.cash_in)}</div></div>
            <div className="stat"><div className="stat-label">Cash Out</div><div className="stat-value text-danger">{fmt(data.cash_out)}</div></div>
            <div className="stat primary"><div className="stat-label">Net Cash</div><div className="stat-value">{fmt(data.cash_in - data.cash_out)}</div></div>
          </div>
          <div className="card" style={{ marginBottom: 14 }}>
            <h3>Bills ({data.bills.length})</h3>
            <table className="compact">
              <thead><tr><th>Bill #</th><th>Customer</th><th>Mode</th><th className="text-right">Total</th></tr></thead>
              <tbody>
                {data.bills.map((b) => (
                  <tr key={b.id}><td className="mono">{b.bill_number}</td><td>{b.customer_name || '-'}</td><td>{b.payment_mode}</td><td className="text-right">{fmt(b.total)}</td></tr>
                ))}
                {data.bills.length === 0 && <tr><td colSpan="4" className="muted text-center">No bills</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="card">
            <h3>Purchases ({data.purchases.length})</h3>
            <table className="compact">
              <thead><tr><th>Invoice</th><th>Supplier</th><th>Mode</th><th className="text-right">Total</th></tr></thead>
              <tbody>
                {data.purchases.map((p) => (
                  <tr key={p.id}><td className="mono">{p.invoice_no}</td><td>{p.supplier_name}</td><td>{p.payment_mode}</td><td className="text-right">{fmt(p.total)}</td></tr>
                ))}
                {data.purchases.length === 0 && <tr><td colSpan="4" className="muted text-center">No purchases</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function ShiftCloseReport({ showToast }) {
  const [date, setDate] = useState(todayISO());
  const [data, setData] = useState(null);
  useEffect(() => {
    window.api.shiftCloseReport({ date }).then((r) => r.ok && setData(r.data));
  }, [date]);

  const exportCsv = async () => {
    if (!data) return;
    const res = await window.api.exportCsv({ name: `shift-close-${date}`, rows: data.bills.map((b) => ({
      bill_number: b.bill_number, customer: b.customer_name, total: b.total,
      paid: b.amount_paid, balance: b.balance, mode: b.payment_mode, status: b.payment_status,
    }))});
    if (res.ok) showToast('Exported');
  };

  return (
    <div>
      <div className="row" style={{ marginBottom: 14, justifyContent: 'space-between' }}>
        <div className="row">
          <label style={{ margin: 0 }}>Date:</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 200 }} />
        </div>
        <button onClick={exportCsv}>⇡ Export CSV</button>
      </div>
      {data && (
        <>
          <div className="grid-4" style={{ marginBottom: 14 }}>
            <div className="stat"><div className="stat-label">Bills Issued</div><div className="stat-value">{data.bills.length}</div></div>
            <div className="stat"><div className="stat-label">Gross Total</div><div className="stat-value">{fmt(data.gross_total)}</div></div>
            <div className="stat"><div className="stat-label">Net Collected</div><div className="stat-value text-success">{fmt(data.net_collected)}</div></div>
            <div className="stat" style={{ background: 'var(--warn-soft)' }}><div className="stat-label">Credit / Pending</div><div className="stat-value text-warn">{fmt(data.credit_total)}</div></div>
          </div>
          <div className="grid-4" style={{ marginBottom: 14 }}>
            <div className="stat"><div className="stat-label">Cash</div><div className="stat-value">{fmt(data.cash_sales)}</div></div>
            <div className="stat"><div className="stat-label">UPI</div><div className="stat-value">{fmt(data.upi_sales)}</div></div>
            <div className="stat"><div className="stat-label">Card</div><div className="stat-value">{fmt(data.card_sales)}</div></div>
            <div className="stat"><div className="stat-label">Returns</div><div className="stat-value text-danger">{fmt(data.returns?.total || 0)}</div></div>
          </div>
          <div className="card flush">
            <table className="compact">
              <thead><tr><th>Bill #</th><th>Customer</th><th>Mode</th><th className="text-right">Total</th><th className="text-right">Collected</th><th className="text-right">Balance</th></tr></thead>
              <tbody>
                {data.bills.map((b) => (
                  <tr key={b.id}>
                    <td className="mono">{b.bill_number}</td>
                    <td>{b.customer_name || '-'}</td>
                    <td>{b.payment_mode}</td>
                    <td className="text-right">{fmt(b.total)}</td>
                    <td className="text-right">{fmt(b.amount_paid)}</td>
                    <td className="text-right">{b.balance > 0 ? <span className="badge amber">{fmt(b.balance)}</span> : <span className="badge green">Paid</span>}</td>
                  </tr>
                ))}
                {data.bills.length === 0 && <tr><td colSpan="6" className="text-center muted">No bills today</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function DoctorCommissionReport({ showToast }) {
  const first = new Date(); first.setDate(1);
  const [from, setFrom] = useState(first.toISOString().slice(0, 10));
  const [to, setTo] = useState(todayISO());
  const [data, setData] = useState(null);
  useEffect(() => {
    window.api.doctorCommissionReport({ from, to }).then((r) => r.ok && setData(r.data));
  }, [from, to]);

  const exportCsv = async () => {
    if (!data) return;
    const res = await window.api.exportCsv({ name: 'doctor-commission', rows: data.rows.map((r) => ({
      doctor: r.name, clinic: r.clinic, specialization: r.specialization,
      bills: r.bill_count, billed: r.total_billed,
      commission_pct: r.commission_percent, commission_amount: r.commission_amount,
    }))});
    if (res.ok) showToast('Exported');
  };

  return (
    <div>
      <div className="row" style={{ marginBottom: 14, justifyContent: 'space-between' }}>
        <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />
        <button onClick={exportCsv}>⇡ Export CSV</button>
      </div>
      {data && (
        <>
          <div className="stat primary" style={{ marginBottom: 14, maxWidth: 400 }}>
            <div className="stat-label">Total Commission Payable</div>
            <div className="stat-value">{fmt(data.total_commission)}</div>
          </div>
          <div className="card flush">
            <table>
              <thead>
                <tr>
                  <th>Doctor</th><th>Clinic</th><th>Specialization</th>
                  <th className="text-right">Bills</th>
                  <th className="text-right">Total Billed</th>
                  <th className="text-right">Commission %</th>
                  <th className="text-right">Commission ₹</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="bold">{r.name}</td>
                    <td>{r.clinic || '-'}</td>
                    <td>{r.specialization || '-'}</td>
                    <td className="text-right">{r.bill_count}</td>
                    <td className="text-right">{fmt(r.total_billed)}</td>
                    <td className="text-right">{r.commission_percent}%</td>
                    <td className="text-right bold text-success">{fmt(r.commission_amount)}</td>
                  </tr>
                ))}
                {data.rows.length === 0 && <tr><td colSpan="7" className="text-center muted">No doctors</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function AuditLog() {
  const [rows, setRows] = useState([]);
  useEffect(() => { window.api.auditLog({ limit: 300 }).then((r) => r.ok && setRows(r.data)); }, []);
  return (
    <div className="card flush">
      <table className="compact">
        <thead><tr><th>When</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{fmtDateTime(r.created_at)}</td>
              <td><span className="badge blue">{r.action}</span></td>
              <td>{r.entity}#{r.entity_id}</td>
              <td>{r.details}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan="4" className="muted text-center">No entries</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

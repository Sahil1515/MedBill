import React, { useState, useEffect, useRef, useCallback } from 'react';
import Receipt from '../components/Receipt.jsx';
import { fmt } from '../lib/helpers.js';

export default function Billing({ settings, showToast }) {
  const [patient, setPatient] = useState({ name: '', phone: '', doctor: '' });
  const [items, setItems] = useState([]); // {id, name, batch_id, batch_no, expiry, mrp, price, quantity, unit, stock, gst_rate, hsn}
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [discountPct, setDiscountPct] = useState(0);
  const [paymentMode, setPaymentMode] = useState('cash');
  const [amountPaid, setAmountPaid] = useState('');
  const [interstate, setInterstate] = useState(false);
  const [notes, setNotes] = useState('');
  const [savedBill, setSavedBill] = useState(null);
  const [saving, setSaving] = useState(false);
  const searchRef = useRef();

  // Barcode scanner state (USB HID scanners type very fast + Enter)
  const barcodeBuffer = useRef('');
  const barcodeTimer = useRef(null);

  // Phone camera scanner modal
  const [showScanModal, setShowScanModal] = useState(false);
  const [phoneScanQR, setPhoneScanQR] = useState(null); // { url, qr }

  // Out-of-stock alert popup
  const [outOfStockAlert, setOutOfStockAlert] = useState(null); // { barcode, name? }

  // Drug interaction warnings
  const [interactions, setInteractions] = useState([]);

  // Active schemes
  const [schemes, setSchemes] = useState([]);
  const [appliedScheme, setAppliedScheme] = useState(null);

  // Prescription attachment for saved bill
  const [prescriptions, setPrescriptions] = useState([]);

  useEffect(() => {
    window.api.getSchemes({ activeOnly: true }).then((r) => {
      if (r.ok) setSchemes(r.data);
    });
  }, []);

  // Check drug interactions whenever items change
  useEffect(() => {
    if (items.length < 2) { setInteractions([]); return; }
    const names = items.map((i) => i.name);
    window.api.checkInteractions(names).then((r) => {
      if (r.ok) setInteractions(r.data);
    });
  }, [items]);

  // Live medicine search
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    let cancel = false;
    const t = setTimeout(async () => {
      const res = await window.api.getMedicines(query);
      if (!cancel && res.ok) {
        setResults(res.data.filter((m) => m.total_stock > 0).slice(0, 8));
        setActiveIdx(0);
      }
    }, 100);
    return () => { cancel = true; clearTimeout(t); };
  }, [query]);

  const addMedicine = useCallback(async (med) => {
    // Fetch batches for medicine
    const res = await window.api.getMedicine(med.id);
    if (!res.ok) return showToast(res.error, 'error');
    const batches = (res.data.batches || []).filter((b) => b.stock > 0).sort((a, b) => (a.expiry || '').localeCompare(b.expiry || ''));
    if (batches.length === 0) return showToast('Out of stock', 'error');
    const batch = batches[0]; // FEFO - First Expiry First Out

    setItems((cur) => {
      const existing = cur.find((i) => i.batch_id === batch.id);
      if (existing) {
        if (existing.quantity + 1 > batch.stock) {
          showToast(`Only ${batch.stock} in stock for this batch`, 'error');
          return cur;
        }
        return cur.map((i) => (i.batch_id === batch.id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [
        ...cur,
        {
          id: med.id,
          name: med.name,
          batch_id: batch.id,
          batch_no: batch.batch_no,
          expiry: batch.expiry,
          mrp: batch.mrp,
          price: batch.sale_price,
          stock: batch.stock,
          quantity: 1,
          unit: med.unit,
          hsn: med.hsn,
          gst_rate: med.gst_rate || 0,
          all_batches: batches,
        },
      ];
    });
    setQuery('');
    setResults([]);
    searchRef.current?.focus();
  }, [showToast]);

  // Shared barcode processing — used by both USB HID scanner and phone camera scanner
  const processBarcode = useCallback(async (code) => {
    // Ignore manufacturer/verification QR codes (URLs) — only process numeric barcodes
    if (code.startsWith('http://') || code.startsWith('https://')) {
      console.log(`[Scanner] Ignoring URL QR code: ${code}`);
      return;
    }
    console.log(`[Scanner] Barcode scanned: ${code} at ${new Date().toISOString()}`);
    const r = await window.api.getMedicines(code);
    if (!r.ok) {
      console.error('[Scanner] Lookup failed:', r.error);
      return;
    }
    const match = r.data.find((m) => m.barcode === code);
    const exact = match && match.total_stock > 0 ? match : null;
    if (exact) {
      console.log(`[Scanner] Found in stock: ${exact.name} (stock: ${exact.total_stock})`);
      addMedicine(exact);
      setQuery('');
      setResults([]);
    } else {
      const name = match ? match.name : null;
      console.warn(`[Scanner] Barcode ${code} — ${match ? `found "${match.name}" but OUT OF STOCK` : 'not found in database'}`);
      setOutOfStockAlert({ barcode: code, name });
    }
  }, [addMedicine, showToast]);

  // USB HID scanner: characters arrive in <30ms intervals then Enter
  const handleBarcodeKeyDown = useCallback((e) => {
    if (e.target !== searchRef.current) return;
    if (e.key === 'Enter' && barcodeBuffer.current.length >= 4) {
      return; // handled below after buffer check
    }
    if (e.key.length === 1) {
      if (!barcodeTimer.current) {
        barcodeBuffer.current = e.key;
        barcodeTimer.current = setTimeout(() => {
          barcodeBuffer.current = '';
          barcodeTimer.current = null;
        }, 100);
      } else {
        barcodeBuffer.current += e.key;
      }
    }
    if (e.key === 'Enter' && barcodeBuffer.current.length >= 4) {
      clearTimeout(barcodeTimer.current);
      const code = barcodeBuffer.current;
      barcodeBuffer.current = '';
      barcodeTimer.current = null;
      processBarcode(code);
    }
  }, [processBarcode]);

  useEffect(() => {
    window.addEventListener('keydown', handleBarcodeKeyDown);
    return () => window.removeEventListener('keydown', handleBarcodeKeyDown);
  }, [handleBarcodeKeyDown]);

  // Phone camera scanner: receive barcodes sent from the phone via WebSocket → IPC
  useEffect(() => {
    const cleanup = window.events.onPhoneBarcode((code) => {
      processBarcode(code);
      showToast('📷 Scanned: ' + code, 'success');
    });
    return cleanup;
  }, [processBarcode, showToast]);

  // Lookup customer by phone
  useEffect(() => {
    if (!patient.phone || patient.phone.length < 10) return;
    const t = setTimeout(async () => {
      const res = await window.api.findCustomer(patient.phone);
      if (res.ok && res.data && !patient.name) {
        setPatient((p) => ({ ...p, name: res.data.name }));
        showToast(`Customer: ${res.data.name}`, 'success');
      }
    }, 400);
    return () => clearTimeout(t);
  }, [patient.phone]);

  const updateQty = (idx, qty) => {
    setItems((cur) =>
      cur.map((i, k) => {
        if (k !== idx) return i;
        const q = Math.max(1, parseInt(qty) || 1);
        if (q > i.stock) {
          showToast(`Only ${i.stock} in stock`, 'error');
          return { ...i, quantity: i.stock };
        }
        return { ...i, quantity: q };
      })
    );
  };

  const updatePrice = (idx, val) => {
    const p = parseFloat(val) || 0;
    setItems((cur) => cur.map((i, k) => (k === idx ? { ...i, price: p } : i)));
  };

  const switchBatch = (idx, batchId) => {
    setItems((cur) =>
      cur.map((i, k) => {
        if (k !== idx) return i;
        const nb = i.all_batches.find((b) => b.id === parseInt(batchId));
        if (!nb) return i;
        return { ...i, batch_id: nb.id, batch_no: nb.batch_no, expiry: nb.expiry, mrp: nb.mrp, price: nb.sale_price, stock: nb.stock, quantity: Math.min(i.quantity, nb.stock) };
      })
    );
  };

  const removeItem = (idx) => setItems((cur) => cur.filter((_, k) => k !== idx));

  const onSearchKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(results.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (results[activeIdx]) addMedicine(results[activeIdx]); }
    else if (e.key === 'Escape') { setResults([]); setQuery(''); }
  };


  const openPhoneScanner = async () => {
    setPhoneScanQR(null);
    setShowScanModal(true);
    const r = await window.api.getPhoneScannerQR();
    if (r.ok) {
      setPhoneScanQR(r.data);
    } else {
      showToast('Could not start phone scanner: ' + r.error, 'error');
      setShowScanModal(false);
    }
  };

  const reset = () => {
    setPatient({ name: '', phone: '', doctor: '' });
    setItems([]);
    setDiscountPct(0);
    setPaymentMode('cash');
    setAmountPaid('');
    setInterstate(false);
    setNotes('');
    setSavedBill(null);
    setQuery('');
    setInteractions([]);
    setAppliedScheme(null);
    setPrescriptions([]);
  };

  // WhatsApp share after bill saved
  const shareWhatsApp = (bill) => {
    const ph = bill.phone ? bill.phone.replace(/\D/g, '') : '';
    if (!ph) return showToast('No phone number on bill to share', 'error');
    const lines = [
      `*${settings.pharmacy_name}*`,
      `Bill No: ${bill.bill_number}`,
      `Date: ${new Date(bill.created_at).toLocaleDateString('en-IN')}`,
      `Total: ₹${bill.total}`,
      `Status: ${bill.payment_status}`,
      `\nThank you for choosing us! Get well soon.`,
    ];
    const msg = encodeURIComponent(lines.join('\n'));
    const url = `https://wa.me/91${ph}?text=${msg}`;
    window.open(url, '_blank');
  };

  // Attach prescription to saved bill
  const attachPrescription = async () => {
    const r = await window.api.pickPrescriptionFile();
    if (!r.ok) return;
    const ar = await window.api.addPrescription({ bill_id: savedBill.id, file_path: r.data.path, file_name: r.data.name });
    if (ar.ok) {
      setPrescriptions((p) => [...p, ar.data]);
      showToast('Prescription attached');
    }
  };

  const loadPrescriptions = useCallback(async (billId) => {
    const r = await window.api.getPrescriptions(billId);
    if (r.ok) setPrescriptions(r.data);
  }, []);

  const save = async () => {
    if (items.length === 0) return showToast('Add at least one medicine', 'error');
    if (interactions.some((i) => i.severity === 'major') &&
        !window.confirm('⚠ Major drug interaction detected!\n' +
          interactions.filter((i) => i.severity === 'major').map((i) => `${i.drug_a} + ${i.drug_b}: ${i.description}`).join('\n') +
          '\n\nProceed anyway?')) return;
    setSaving(true);
    const payload = {
      customer_name: patient.name,
      phone: patient.phone,
      doctor_name: patient.doctor,
      discount_percent: discountPct,
      interstate,
      payment_mode: paymentMode,
      amount_paid: amountPaid === '' ? total : parseFloat(amountPaid),
      notes,
      items: items.map((i) => ({
        id: i.id,
        batch_id: i.batch_id,
        batch_no: i.batch_no,
        expiry: i.expiry,
        name: i.name,
        price: i.price,
        mrp: i.mrp,
        quantity: i.quantity,
        unit: i.unit,
        gst_rate: i.gst_rate,
        hsn: i.hsn,
      })),
    };
    const res = await window.api.saveBill(payload);
    setSaving(false);
    if (!res.ok) return showToast(res.error, 'error');
    setSavedBill(res.data);
    await loadPrescriptions(res.data.id);
    showToast('Bill saved · Stock deducted', 'success');
  };

  // ------------ Saved bill view ------------
  if (savedBill) {
    return (
      <div>
        <div className="page-header no-print">
          <div>
            <h1>Bill #{savedBill.bill_number}</h1>
            <div className="subtitle">Saved successfully · Stock deducted</div>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button onClick={attachPrescription} title="Attach prescription image/PDF">
              📎 Attach Prescription
            </button>
            {savedBill.phone && (
              <button onClick={() => shareWhatsApp(savedBill)} style={{ background: '#25d366', color: '#fff', border: 'none' }}>
                WhatsApp Share
              </button>
            )}
            <button onClick={reset}>+ New Bill</button>
            <button className="primary" onClick={() => window.print()}>Print Receipt</button>
          </div>
        </div>
        {prescriptions.length > 0 && (
          <div className="card no-print" style={{ marginBottom: 12 }}>
            <div className="bold" style={{ marginBottom: 6 }}>Attached Prescriptions</div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              {prescriptions.map((p) => (
                <button key={p.id} className="ghost" onClick={() => window.api.openPrescription(p.file_path)}>
                  📄 {p.file_name}
                </button>
              ))}
            </div>
          </div>
        )}
        <Receipt bill={savedBill} settings={settings} />
      </div>
    );
  }

  // Effective discount — scheme takes priority over manual input
  const effectiveDiscount = appliedScheme && appliedScheme.scheme_type === 'percent'
    ? appliedScheme.discount_value
    : discountPct;

  // Totals
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const discountAmt = +(subtotal * (effectiveDiscount / 100)).toFixed(2);
  const factor = subtotal > 0 ? (subtotal - discountAmt) / subtotal : 1;
  let cgst = 0, sgst = 0, igst = 0;
  items.forEach((i) => {
    const taxable = i.price * i.quantity * factor;
    const gst = taxable * ((i.gst_rate || 0) / 100);
    if (interstate) igst += gst;
    else { cgst += gst / 2; sgst += gst / 2; }
  });
  const gstTotal = +(cgst + sgst + igst).toFixed(2);
  const rawTotal = subtotal - discountAmt + gstTotal;
  const total = Math.round(rawTotal);
  const roundOff = +(total - rawTotal).toFixed(2);

  // ------------ Main billing UI ------------
  return (
    <>
    <div className="billing-grid">
      <div className="billing-left">
        {interactions.length > 0 && (
          <div style={{ background: interactions.some((i) => i.severity === 'major') ? '#fff1f0' : '#fffbe6',
                        border: `1px solid ${interactions.some((i) => i.severity === 'major') ? '#ffa39e' : '#ffe58f'}`,
                        borderRadius: 6, padding: '10px 14px', marginBottom: 10 }}>
            <div className="bold" style={{ marginBottom: 4 }}>
              ⚠ Drug Interaction{interactions.length > 1 ? 's' : ''} Detected
            </div>
            {interactions.map((it, i) => (
              <div key={i} style={{ fontSize: 13, marginBottom: 2 }}>
                <span className={`badge ${it.severity === 'major' ? 'red' : it.severity === 'moderate' ? 'amber' : 'blue'}`}>
                  {it.severity}
                </span>
                {' '}<strong>{it.drug_a}</strong> + <strong>{it.drug_b}</strong>: {it.description}
              </div>
            ))}
          </div>
        )}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <label style={{ margin: 0 }}>Search medicine by name / barcode / manufacturer — or scan barcode</label>
            <button
              className="secondary"
              style={{ flexShrink: 0, marginLeft: 12, fontSize: 13, padding: '4px 12px' }}
              onClick={openPhoneScanner}
              title="Use your phone camera to scan a barcode"
            >
              📷 Scan with Phone
            </button>
          </div>
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKey}
            placeholder="Type to search..."
            autoFocus
          />
          {results.length > 0 && (
            <div className="search-results" style={{ marginTop: 8 }}>
              {results.map((r, idx) => (
                <div
                  key={r.id}
                  className={`search-result ${idx === activeIdx ? 'active' : ''}`}
                  onClick={() => addMedicine(r)}
                  onMouseEnter={() => setActiveIdx(idx)}
                >
                  <div>
                    <div className="bold">{r.name} {r.manufacturer && <span className="muted">· {r.manufacturer}</span>}</div>
                    <div className="meta">
                      {fmt(r.current_price || 0)} / {r.unit} · Stock: {r.total_stock} · GST {r.gst_rate}%
                    </div>
                  </div>
                  <span className="badge gray">{r.current_batch || '-'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bill-items">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Medicine</th>
                <th>Batch / Expiry</th>
                <th>MRP</th>
                <th>Rate</th>
                <th>Qty</th>
                <th>GST</th>
                <th className="text-right">Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan="9">
                    <div className="empty">
                      <div className="emoji">🔍</div>
                      <h3>No items yet</h3>
                      <div>Search above to add medicines. Press Enter to add top result.</div>
                    </div>
                  </td>
                </tr>
              )}
              {items.map((i, idx) => (
                <tr key={idx}>
                  <td>{idx + 1}</td>
                  <td>
                    <div className="bold">{i.name}</div>
                    <div className="muted">{i.unit} · HSN {i.hsn || '-'}</div>
                  </td>
                  <td>
                    {i.all_batches && i.all_batches.length > 1 ? (
                      <select value={i.batch_id} onChange={(e) => switchBatch(idx, e.target.value)}>
                        {i.all_batches.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.batch_no} · {b.expiry || 'no exp'} · stk {b.stock}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <>
                        <div className="mono">{i.batch_no}</div>
                        <div className="muted">{i.expiry || '-'}</div>
                      </>
                    )}
                  </td>
                  <td>{fmt(i.mrp)}</td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      value={i.price}
                      onChange={(e) => updatePrice(idx, e.target.value)}
                      className="qty-input"
                      style={{ width: 80 }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="1"
                      max={i.stock}
                      value={i.quantity}
                      onChange={(e) => updateQty(idx, e.target.value)}
                      className="qty-input"
                    />
                  </td>
                  <td>{i.gst_rate}%</td>
                  <td className="text-right bold">{fmt(i.price * i.quantity)}</td>
                  <td>
                    <button className="ghost danger sm" onClick={() => removeItem(idx)}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* RIGHT: patient + totals */}
      <div className="billing-right">
        <div className="card">
          <h3>Patient Details</h3>
          <div className="col">
            <div>
              <label>Phone</label>
              <input
                value={patient.phone}
                onChange={(e) => setPatient({ ...patient, phone: e.target.value })}
                placeholder="Auto-fetches saved customer"
              />
            </div>
            <div>
              <label>Name</label>
              <input value={patient.name} onChange={(e) => setPatient({ ...patient, name: e.target.value })} />
            </div>
            <div>
              <label>Doctor</label>
              <input value={patient.doctor} onChange={(e) => setPatient({ ...patient, doctor: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="card">
          {schemes.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <label>Apply Scheme / Offer</label>
              <select
                value={appliedScheme ? appliedScheme.id : ''}
                onChange={(e) => {
                  const s = schemes.find((s) => s.id === parseInt(e.target.value));
                  setAppliedScheme(s || null);
                  if (s && s.scheme_type === 'percent') setDiscountPct(s.discount_value);
                  else setDiscountPct(0);
                }}
              >
                <option value="">-- No scheme --</option>
                {schemes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.scheme_type === 'percent' ? `${s.discount_value}% off` : `₹${s.discount_value} flat`})
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid-2">
            <div>
              <label>Discount %</label>
              <input
                type="number" min="0" max="100"
                value={appliedScheme ? effectiveDiscount : discountPct}
                onChange={(e) => { setDiscountPct(parseFloat(e.target.value) || 0); setAppliedScheme(null); }}
              />
            </div>
            <div>
              <label>Payment Mode</label>
              <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="upi">UPI</option>
                <option value="credit">Credit</option>
              </select>
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <label>
              <input
                type="checkbox"
                checked={interstate}
                onChange={(e) => setInterstate(e.target.checked)}
                style={{ marginRight: 6 }}
              />
              Inter-state sale (IGST instead of CGST+SGST)
            </label>
          </div>
        </div>

        <div className="totals">
          <div className="line"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
          {discountPct > 0 && (
            <div className="line text-success"><span>Discount ({discountPct}%)</span><span>- {fmt(discountAmt)}</span></div>
          )}
          {cgst > 0 && <div className="line"><span>CGST</span><span>{fmt(cgst)}</span></div>}
          {sgst > 0 && <div className="line"><span>SGST</span><span>{fmt(sgst)}</span></div>}
          {igst > 0 && <div className="line"><span>IGST</span><span>{fmt(igst)}</span></div>}
          {roundOff !== 0 && <div className="line muted"><span>Round off</span><span>{fmt(roundOff)}</span></div>}
          <div className="line grand"><span>Total</span><span>{fmt(total)}</span></div>

          <div style={{ marginTop: 12 }}>
            <label>Amount Paid</label>
            <input
              type="number"
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
              placeholder={`Leave empty for full ${fmt(total)}`}
            />
          </div>
        </div>

        <button className="primary lg block" onClick={save} disabled={saving || items.length === 0}>
          {saving ? 'Saving...' : `Save & Generate Bill · ${fmt(total)}`}
        </button>
      </div>
    </div>

    {/* Out-of-stock alert modal */}
    {outOfStockAlert && (
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 1100,
          background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        onClick={() => setOutOfStockAlert(null)}
      >
        <div
          style={{
            background: '#fff', borderRadius: 14, padding: '32px 36px',
            minWidth: 320, maxWidth: 420, textAlign: 'center',
            boxShadow: '0 8px 40px rgba(0,0,0,0.28)',
            border: '2px solid #fca5a5',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#dc2626', marginBottom: 8 }}>
            Out of Stock
          </div>
          {outOfStockAlert.name ? (
            <div style={{ fontSize: 15, color: '#1e293b', marginBottom: 6 }}>
              <strong>{outOfStockAlert.name}</strong> is currently out of stock.
            </div>
          ) : (
            <div style={{ fontSize: 15, color: '#1e293b', marginBottom: 6 }}>
              No medicine found for this barcode.
            </div>
          )}
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>
            Barcode: <span style={{ fontFamily: 'monospace' }}>{outOfStockAlert.barcode}</span>
          </div>
          <button
            className="primary"
            style={{ width: '100%', background: '#dc2626', border: 'none' }}
            onClick={() => setOutOfStockAlert(null)}
          >
            OK
          </button>
        </div>
      </div>
    )}

    {/* Phone camera scanner modal */}
    {showScanModal && (
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(15,23,42,0.72)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        onClick={() => setShowScanModal(false)}
      >
        <div
          style={{
            background: '#fff', borderRadius: 14, padding: '28px 32px',
            minWidth: 300, textAlign: 'center', boxShadow: '0 8px 40px rgba(0,0,0,0.25)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>📷 Scan with Phone</div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16, lineHeight: 1.5 }}>
            Make sure your phone and this computer are on the <strong>same Wi-Fi</strong>.<br />
            Open the URL below (or scan the QR code) in <strong>Chrome</strong> or <strong>Safari</strong>.
          </div>

          {!phoneScanQR ? (
            <div style={{ color: '#94a3b8', padding: '24px 0' }}>Loading…</div>
          ) : (
            <>
              <img
                src={phoneScanQR.qr}
                alt="QR code"
                style={{ width: 200, height: 200, borderRadius: 8, border: '1px solid #e2e8f0' }}
              />
              <div style={{
                marginTop: 14, padding: '8px 14px', background: '#f1f5f9',
                borderRadius: 8, fontFamily: 'monospace', fontSize: 14,
                wordBreak: 'break-all', userSelect: 'all', color: '#0f172a',
              }}>
                {phoneScanQR.url}
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
                Scanned barcodes will be added to the bill automatically.
              </div>
            </>
          )}

          <button
            className="secondary"
            style={{ marginTop: 18, width: '100%' }}
            onClick={() => setShowScanModal(false)}
          >
            Close
          </button>
        </div>
      </div>
    )}
    </>
  );
}

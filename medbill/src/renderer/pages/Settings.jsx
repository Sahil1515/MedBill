import React, { useState, useEffect } from 'react';

export default function Settings({ settings, onSaved, showToast, firstLaunch = false }) {
  const [tab, setTab] = useState('business');
  const [form, setForm] = useState({
    pharmacy_name: '',
    address: '',
    phone: '',
    gst_number: '',
    license_number: '',
    state_code: '29',
    interstate_default: '0',
    footer_note: 'Thank you. Get well soon!',
    receipt_format: '80mm',
    currency_symbol: '₹',
    expiry_alert_days: '60',
    low_stock_alert: '1',
    ...settings,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [license, setLicense] = useState(null);
  const [licenseKey, setLicenseKey] = useState('');
  const [licenseErr, setLicenseErr] = useState('');
  const [licenseMsg, setLicenseMsg] = useState('');

  useEffect(() => {
    window.api.getLicense().then((r) => { if (r.ok) setLicense(r.data); });
  }, []);

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setErr('');
    if (!form.pharmacy_name?.trim()) return setErr('Pharmacy name required');
    setSaving(true);
    const res = await window.api.saveSettings(form);
    setSaving(false);
    if (res.ok) {
      // Notify main process to reschedule auto-backup
      if (typeof window.api.saveSettings === 'function') {
        try { window.api.notifySettingsChanged?.(); } catch (_) {}
      }
      onSaved(res.data);
    } else setErr(res.error);
  };

  const activateLicense = async () => {
    setLicenseErr(''); setLicenseMsg('');
    if (!licenseKey.trim()) return setLicenseErr('Paste your license key above');
    const res = await window.api.activateLicense(licenseKey.trim());
    if (res.ok) { setLicense(res.data); setLicenseMsg('License activated successfully!'); setLicenseKey(''); }
    else setLicenseErr(res.error);
  };

  const pickAutoBackupFolder = async () => {
    const res = await window.api.pickAutoBackupFolder();
    if (res.ok) {
      const updated = { ...form, auto_backup_folder: res.data, auto_backup_enabled: '1' };
      setForm(updated);
      await window.api.saveSettings(updated);
      showToast('Auto-backup folder set');
    }
  };

  const runAutoBackup = async () => {
    const res = await window.api.runAutoBackup();
    if (res.ok) showToast('Auto-backup completed');
    else showToast(res.error, 'error');
  };

  const doBackup = async () => {
    const res = await window.api.backup();
    if (res.ok) showToast('Backup saved');
    else if (res.error !== 'cancelled') showToast(res.error, 'error');
  };

  const doRestore = async () => {
    if (!confirm('Restoring will replace your current database. Continue?')) return;
    const res = await window.api.restore();
    if (res.ok) { showToast('Restored. Reloading...'); setTimeout(() => location.reload(), 800); }
    else if (res.error !== 'cancelled') showToast(res.error, 'error');
  };

  const showDbPath = async () => {
    const res = await window.api.getDbPath();
    if (res.ok) alert('Database location:\n\n' + res.data);
  };

  return (
    <div>
      {!firstLaunch && (
        <div className="page-header"><div><h1>Settings</h1><div className="subtitle">Pharmacy, invoices, backup</div></div></div>
      )}

      {firstLaunch && (
        <div className="card" style={{ marginBottom: 14, background: 'var(--primary-soft)', borderColor: 'var(--primary)' }}>
          <div className="bold" style={{ color: 'var(--primary)' }}>Welcome to MedBill</div>
          <div className="muted">Fill in your pharmacy details to get started. These appear on every receipt.</div>
        </div>
      )}

      <div className="ptabs">
        <button className={`ptab ${tab === 'business' ? 'active' : ''}`} onClick={() => setTab('business')}>Business</button>
        <button className={`ptab ${tab === 'invoice' ? 'active' : ''}`} onClick={() => setTab('invoice')}>Invoice</button>
        <button className={`ptab ${tab === 'alerts' ? 'active' : ''}`} onClick={() => setTab('alerts')}>Alerts</button>
        {!firstLaunch && <button className={`ptab ${tab === 'backup' ? 'active' : ''}`} onClick={() => setTab('backup')}>Backup</button>}
        {!firstLaunch && <button className={`ptab ${tab === 'license' ? 'active' : ''}`} onClick={() => setTab('license')}>License</button>}
      </div>

      <div className="card" style={{ maxWidth: 820 }}>
        {tab === 'business' && (
          <div className="col">
            <div><label>Pharmacy Name *</label><input value={form.pharmacy_name} onChange={(e) => update('pharmacy_name', e.target.value)} /></div>
            <div><label>Address</label><textarea rows="2" value={form.address} onChange={(e) => update('address', e.target.value)} /></div>
            <div className="grid-2">
              <div><label>Phone</label><input value={form.phone} onChange={(e) => update('phone', e.target.value)} /></div>
              <div><label>GSTIN</label><input value={form.gst_number} onChange={(e) => update('gst_number', e.target.value)} /></div>
              <div><label>Drug License</label><input value={form.license_number} onChange={(e) => update('license_number', e.target.value)} /></div>
              <div><label>State Code</label><input value={form.state_code} onChange={(e) => update('state_code', e.target.value)} placeholder="e.g. 29 (Karnataka)" /></div>
            </div>
          </div>
        )}

        {tab === 'invoice' && (
          <div className="col">
            <div>
              <label>Receipt Format</label>
              <select value={form.receipt_format} onChange={(e) => update('receipt_format', e.target.value)}>
                <option value="58mm">58mm Thermal (small printer)</option>
                <option value="80mm">80mm Thermal (standard POS)</option>
                <option value="a4">A4 Tax Invoice (for GST, laser printer)</option>
              </select>
            </div>
            <div>
              <label>Footer Note</label>
              <input value={form.footer_note} onChange={(e) => update('footer_note', e.target.value)} />
            </div>
            <div><label>Currency Symbol</label><input value={form.currency_symbol} onChange={(e) => update('currency_symbol', e.target.value)} style={{ width: 120 }} /></div>
          </div>
        )}

        {tab === 'alerts' && (
          <div className="col">
            <div><label>Expiry Alert Window (days)</label><input type="number" value={form.expiry_alert_days} onChange={(e) => update('expiry_alert_days', e.target.value)} /></div>
            <div>
              <label>
                <input type="checkbox" checked={form.low_stock_alert === '1'} onChange={(e) => update('low_stock_alert', e.target.checked ? '1' : '0')} style={{ marginRight: 8 }} />
                Show low stock alerts on dashboard
              </label>
            </div>
          </div>
        )}

        {tab === 'backup' && !firstLaunch && (
          <div className="col">
            <div className="muted">All your data is stored locally in a SQLite database. Back up regularly to avoid data loss.</div>
            <div className="row">
              <button className="primary" onClick={doBackup}>⇣ Backup Now</button>
              <button onClick={doRestore}>⇡ Restore from File</button>
              <button onClick={showDbPath}>Show DB Location</button>
            </div>
            <div className="divider" />
            <div className="bold">Auto-Backup</div>
            <div className="muted">Automatically creates a daily backup in a folder you choose. Keeps the last 30 backups.</div>
            <div>
              <label>
                <input
                  type="checkbox"
                  checked={form.auto_backup_enabled === '1'}
                  onChange={(e) => setForm({ ...form, auto_backup_enabled: e.target.checked ? '1' : '0' })}
                  style={{ marginRight: 8 }}
                />
                Enable auto-backup
              </label>
            </div>
            <div className="row">
              <div style={{ flex: 1 }}>
                <label>Backup Folder</label>
                <input value={form.auto_backup_folder || ''} readOnly placeholder="Click to choose folder..." onClick={pickAutoBackupFolder} style={{ cursor: 'pointer' }} />
              </div>
              <div style={{ paddingTop: 20 }}>
                <button onClick={pickAutoBackupFolder}>Choose Folder</button>
              </div>
            </div>
            {form.auto_backup_folder && (
              <div><button onClick={runAutoBackup}>Run Backup Now</button></div>
            )}
            <div className="muted" style={{ fontSize: 12 }}>
              Tip: Point this to a Google Drive / Dropbox / OneDrive folder for automatic cloud sync.
            </div>
          </div>
        )}

        {tab === 'license' && !firstLaunch && (
          <div className="col">
            {license ? (
              <div style={{ background: 'var(--success-soft, #f6ffed)', border: '1px solid var(--success)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                <div className="bold" style={{ marginBottom: 6 }}>License Active</div>
                <div className="grid-2">
                  <div><div className="muted" style={{ fontSize: 12 }}>Pharmacy</div><div>{license.pharmacy_name}</div></div>
                  <div><div className="muted" style={{ fontSize: 12 }}>Plan</div><div style={{ textTransform: 'capitalize' }}>{license.plan}</div></div>
                  <div><div className="muted" style={{ fontSize: 12 }}>Activated</div><div>{license.activated_at}</div></div>
                  <div><div className="muted" style={{ fontSize: 12 }}>Expires</div>
                    <div style={{ color: new Date(license.expires_at) < new Date() ? 'var(--danger)' : 'inherit' }}>
                      {license.expires_at}
                      {new Date(license.expires_at) < new Date() && ' — EXPIRED'}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ background: 'var(--warn-soft, #fffbe6)', border: '1px solid var(--warn)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                <div className="bold">No License Activated</div>
                <div className="muted">This app is running in unlicensed mode. Contact your vendor to get a license key.</div>
              </div>
            )}
            <div>
              <label>Enter / Renew License Key</label>
              <textarea
                rows="4"
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value)}
                placeholder="Paste your license key here..."
                style={{ fontFamily: 'monospace', fontSize: 12 }}
              />
            </div>
            {licenseErr && <div style={{ color: 'var(--danger)' }}>{licenseErr}</div>}
            {licenseMsg && <div style={{ color: 'var(--success)' }}>{licenseMsg}</div>}
            <div><button className="primary" onClick={activateLicense}>Activate License</button></div>
            <div className="muted" style={{ fontSize: 12 }}>
              License keys are issued by your MedBill vendor. Each key encodes your pharmacy name, plan, and expiry date.
              Contact support to get a new key if yours has expired.
            </div>
          </div>
        )}

        {err && <div style={{ color: 'var(--danger)', marginTop: 10 }}>{err}</div>}

        {tab !== 'backup' && (
          <div style={{ marginTop: 16 }}>
            <button className="primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Settings'}</button>
          </div>
        )}
      </div>

      {/* Dev-only: test the update banner without a real release */}
      {import.meta.env.DEV && (
        <div style={{ marginTop: 24, padding: '12px 16px', border: '1px dashed var(--border-strong)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>DEV</span>
          <button style={{ fontSize: 12 }} onClick={() => window.api.simulateUpdate()}>
            Simulate Update Notification
          </button>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Plays the full available → downloading → ready flow</span>
        </div>
      )}
    </div>
  );
}

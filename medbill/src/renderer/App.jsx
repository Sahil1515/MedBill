import React, { useEffect, useState, useCallback } from 'react';
import Dashboard from './pages/Dashboard.jsx';
import Billing from './pages/Billing.jsx';
import Inventory from './pages/Inventory.jsx';
import Purchases from './pages/Purchases.jsx';
import Customers from './pages/Customers.jsx';
import Suppliers from './pages/Suppliers.jsx';
import Doctors from './pages/Doctors.jsx';
import History from './pages/History.jsx';
import Returns from './pages/Returns.jsx';
import PurchaseReturns from './pages/PurchaseReturns.jsx';
import CreditManagement from './pages/CreditManagement.jsx';
import Schemes from './pages/Schemes.jsx';
import Reports from './pages/Reports.jsx';
import Settings from './pages/Settings.jsx';
import Toast from './components/Toast.jsx';

const NAV = [
  { section: 'Main' },
  { id: 'dashboard',        label: 'Dashboard',        icon: '◉' },
  { id: 'billing',          label: 'New Bill',          icon: '✚' },
  { id: 'history',          label: 'Bill History',      icon: '◎' },
  { id: 'returns',          label: 'Sales Returns',     icon: '↩' },
  { id: 'credit',           label: 'Credit',            icon: '₹' },

  { section: 'Inventory' },
  { id: 'inventory',        label: 'Medicines',         icon: '℞' },
  { id: 'purchases',        label: 'Purchases',         icon: '⇣' },
  { id: 'purchase_returns', label: 'Purchase Returns',  icon: '↩' },
  { id: 'schemes',          label: 'Schemes & Offers',  icon: '🏷' },

  { section: 'Parties' },
  { id: 'customers',        label: 'Customers',         icon: '◐' },
  { id: 'suppliers',        label: 'Suppliers',         icon: '◑' },
  { id: 'doctors',          label: 'Doctors',           icon: '+' },

  { section: 'Insights' },
  { id: 'reports',          label: 'Reports',           icon: '▤' },
  { id: 'settings',         label: 'Settings',          icon: '⚙' },
];

export default function App() {
  const [tab, setTab] = useState('dashboard');
  const [settings, setSettings] = useState(null);
  const [toast, setToast] = useState(null);
  const [theme, setTheme] = useState('light');

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadSettings = useCallback(async () => {
    const res = await window.api.getSettings();
    if (res.ok) {
      setSettings(res.data);
      const t = res.data.theme || 'light';
      setTheme(t);
      document.documentElement.setAttribute('data-theme', t);
    }
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  // menu events
  useEffect(() => {
    if (!window.events) return;
    window.events.onNav((target) => setTab(target));
    window.events.onAction(async (action) => {
      if (action === 'backup') {
        const res = await window.api.backup();
        if (res.ok) showToast('Backup saved');
        else if (res.error !== 'cancelled') showToast(res.error, 'error');
      } else if (action === 'restore') {
        if (!confirm('Restore will replace current data. Continue?')) return;
        const res = await window.api.restore();
        if (res.ok) { showToast('Restored. Reloading...'); setTimeout(() => location.reload(), 800); }
        else if (res.error !== 'cancelled') showToast(res.error, 'error');
      } else if (action === 'auto_backup') {
        const res = await window.api.runAutoBackup();
        if (res.ok) showToast('Auto-backup completed');
        else showToast(res.error || 'Auto-backup failed — configure folder in Settings', 'error');
      }
    });
  }, [showToast]);

  const toggleTheme = async () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    await window.api.saveSettings({ ...settings, theme: next });
    setSettings((s) => ({ ...s, theme: next }));
  };

  if (settings === null) {
    return <div style={{ padding: 40 }}>Loading MedBill...</div>;
  }

  const isConfigured = settings && settings.pharmacy_name;
  if (!isConfigured) {
    return (
      <div className="app">
        <div className="main">
          <div className="topbar">
            <h1>MedBill — Initial Setup</h1>
          </div>
          <div className="page">
            <div className="page-inner">
              <Settings
                settings={settings}
                onSaved={(s) => { setSettings(s); showToast('Welcome! Settings saved'); }}
                showToast={showToast}
                firstLaunch
              />
            </div>
          </div>
        </div>
        {toast && <Toast {...toast} />}
      </div>
    );
  }

  const pageTitle = {
    dashboard:        'Dashboard',
    billing:          'New Bill',
    history:          'Bill History',
    returns:          'Sales Returns',
    credit:           'Credit Management',
    inventory:        'Medicines & Batches',
    purchases:        'Purchase Orders',
    purchase_returns: 'Purchase Returns',
    schemes:          'Schemes & Offers',
    customers:        'Customers',
    suppliers:        'Suppliers',
    doctors:          'Doctors',
    reports:          'Reports',
    settings:         'Settings',
  }[tab];

  const pageProps = { settings, showToast, goTo: setTab };

  return (
    <div className="app">
      <aside className="sidebar no-print">
        <div className="brand">
          <span className="dot" />
          MedBill
        </div>
        <nav className="sidebar-nav">
          {NAV.map((n, i) =>
            n.section ? (
              <div className="nav-section" key={'s' + i}>{n.section}</div>
            ) : (
              <button
                key={n.id}
                className={`nav-item ${tab === n.id ? 'active' : ''}`}
                onClick={() => setTab(n.id)}
              >
                <span className="icon">{n.icon}</span>
                {n.label}
              </button>
            )
          )}
        </nav>
        <div className="sidebar-footer">
          <div className="theme-toggle" onClick={toggleTheme}>
            <span>{theme === 'light' ? '☀ Light' : '☾ Dark'}</span>
            <span>↔</span>
          </div>
          <div style={{ fontSize: 11 }}>v2.0.0 · Offline</div>
        </div>
      </aside>

      <div className="main">
        <div className="topbar no-print">
          <h1>{pageTitle}</h1>
          <div className="spacer" />
          <div className="pharmacy-info">
            <div className="bold">{settings.pharmacy_name}</div>
            <div>{settings.phone} · GSTIN: {settings.gst_number || '—'}</div>
          </div>
        </div>

        <div className="page">
          <div className="page-inner">
            {tab === 'dashboard'        && <Dashboard       {...pageProps} />}
            {tab === 'billing'          && <Billing         {...pageProps} />}
            {tab === 'history'          && <History         {...pageProps} />}
            {tab === 'returns'          && <Returns         {...pageProps} />}
            {tab === 'credit'           && <CreditManagement {...pageProps} />}
            {tab === 'inventory'        && <Inventory       {...pageProps} />}
            {tab === 'purchases'        && <Purchases       {...pageProps} />}
            {tab === 'purchase_returns' && <PurchaseReturns {...pageProps} />}
            {tab === 'schemes'          && <Schemes         {...pageProps} />}
            {tab === 'customers'        && <Customers       {...pageProps} />}
            {tab === 'suppliers'        && <Suppliers       {...pageProps} />}
            {tab === 'doctors'          && <Doctors         {...pageProps} />}
            {tab === 'reports'          && <Reports         {...pageProps} />}
            {tab === 'settings'         && <Settings settings={settings} onSaved={(s) => { setSettings(s); showToast('Settings saved'); }} showToast={showToast} />}
          </div>
        </div>
      </div>

      {toast && <Toast {...toast} />}
    </div>
  );
}

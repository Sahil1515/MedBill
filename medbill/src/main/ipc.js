const { ipcMain, dialog, BrowserWindow, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./database');

// License secret — change this to your own random string before shipping
const LICENSE_SECRET = 'medbill-saas-secret-2026';

function wrap(fn) {
  return async (_evt, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      console.error('IPC error:', err);
      return { ok: false, error: err.message || String(err) };
    }
  };
}

function registerIpc() {
  // Settings
  ipcMain.handle('settings:get', wrap(() => db.getSettings()));
  ipcMain.handle('settings:save', wrap((data) => db.saveSettings(data)));

  // Medicines
  ipcMain.handle('medicines:list', wrap((q) => db.getMedicines(q)));
  ipcMain.handle('medicines:get', wrap((id) => db.getMedicineById(id)));
  ipcMain.handle('medicines:add', wrap((data) => db.addMedicine(data)));
  ipcMain.handle('medicines:update', wrap((data) => db.updateMedicine(data)));
  ipcMain.handle('medicines:delete', wrap((id) => db.deleteMedicine(id)));
  ipcMain.handle('medicines:import', wrap((rows) => db.importMedicinesCSV(rows)));

  // Batches
  ipcMain.handle('batches:add', wrap((data) => db.addBatch(data)));
  ipcMain.handle('batches:update', wrap((data) => db.updateBatch(data)));
  ipcMain.handle('batches:delete', wrap((id) => db.deleteBatch(id)));
  ipcMain.handle('stock:adjust', wrap((data) => db.adjustStock(data)));

  // Suppliers
  ipcMain.handle('suppliers:list', wrap((q) => db.getSuppliers(q)));
  ipcMain.handle('suppliers:add', wrap((data) => db.addSupplier(data)));
  ipcMain.handle('suppliers:update', wrap((data) => db.updateSupplier(data)));
  ipcMain.handle('suppliers:delete', wrap((id) => db.deleteSupplier(id)));

  // Customers
  ipcMain.handle('customers:list', wrap((q) => db.getCustomers(q)));
  ipcMain.handle('customers:find', wrap((phone) => db.findCustomerByPhone(phone)));
  ipcMain.handle('customers:add', wrap((data) => db.addCustomer(data)));
  ipcMain.handle('customers:update', wrap((data) => db.updateCustomer(data)));
  ipcMain.handle('customers:delete', wrap((id) => db.deleteCustomer(id)));
  ipcMain.handle('customers:history', wrap((id) => db.getCustomerHistory(id)));

  // Doctors
  ipcMain.handle('doctors:list', wrap((q) => db.getDoctors(q)));
  ipcMain.handle('doctors:add', wrap((data) => db.addDoctor(data)));
  ipcMain.handle('doctors:update', wrap((data) => db.updateDoctor(data)));
  ipcMain.handle('doctors:delete', wrap((id) => db.deleteDoctor(id)));

  // Bills
  ipcMain.handle('bills:save', wrap((data) => db.saveBill(data)));
  ipcMain.handle('bills:get', wrap((id) => db.getBill(id)));
  ipcMain.handle('bills:list', wrap((filter) => db.getBills(filter)));
  ipcMain.handle('bills:cancel', wrap((data) => db.cancelBill(data)));

  // Purchases
  ipcMain.handle('purchases:save', wrap((data) => db.savePurchase(data)));
  ipcMain.handle('purchases:get', wrap((id) => db.getPurchase(id)));
  ipcMain.handle('purchases:list', wrap((filter) => db.getPurchases(filter)));

  // Returns
  ipcMain.handle('returns:save', wrap((data) => db.saveReturn(data)));
  ipcMain.handle('returns:list', wrap(() => db.getReturns()));

  // Reports
  ipcMain.handle('reports:dashboard', wrap(() => db.getDashboardStats()));
  ipcMain.handle('reports:sales', wrap((f) => db.getSalesReport(f)));
  ipcMain.handle('reports:stock', wrap(() => db.getStockReport()));
  ipcMain.handle('reports:expiry', wrap((f) => db.getExpiryReport(f)));
  ipcMain.handle('reports:gst', wrap((f) => db.getGstReport(f)));
  ipcMain.handle('reports:profit', wrap((f) => db.getProfitReport(f)));
  ipcMain.handle('reports:daybook', wrap((f) => db.getDaybook(f)));
  ipcMain.handle('reports:audit', wrap((f) => db.getAuditLog(f)));

  // Backup / Restore / CSV file pickers
  ipcMain.handle('backup:save', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Save backup',
      defaultPath: `medbill-backup-${new Date().toISOString().slice(0, 10)}.db`,
      filters: [{ name: 'Database', extensions: ['db'] }],
    });
    if (canceled || !filePath) return { ok: false, error: 'cancelled' };
    try {
      const res = db.backup(filePath);
      return { ok: true, data: res };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('backup:restore', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Select backup file',
      properties: ['openFile'],
      filters: [{ name: 'Database', extensions: ['db'] }],
    });
    if (canceled || !filePaths[0]) return { ok: false, error: 'cancelled' };
    try {
      const res = db.restore(filePaths[0]);
      return { ok: true, data: res };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('export:json', async (_e, payload) => {
    const win = BrowserWindow.getFocusedWindow();
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Export JSON',
      defaultPath: `${payload.name || 'export'}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (canceled || !filePath) return { ok: false };
    fs.writeFileSync(filePath, JSON.stringify(payload.data, null, 2));
    return { ok: true, data: filePath };
  });

  ipcMain.handle('export:csv', async (_e, payload) => {
    const win = BrowserWindow.getFocusedWindow();
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Export CSV',
      defaultPath: `${payload.name || 'export'}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (canceled || !filePath) return { ok: false };
    const rows = payload.rows || [];
    if (rows.length === 0) {
      fs.writeFileSync(filePath, '');
      return { ok: true, data: filePath };
    }
    const headers = Object.keys(rows[0]);
    const esc = (v) => {
      if (v == null) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const csv =
      headers.join(',') +
      '\n' +
      rows.map((r) => headers.map((h) => esc(r[h])).join(',')).join('\n');
    fs.writeFileSync(filePath, csv);
    return { ok: true, data: filePath };
  });

  ipcMain.handle('file:readText', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (canceled || !filePaths[0]) return { ok: false };
    const text = fs.readFileSync(filePaths[0], 'utf-8');
    return { ok: true, data: { text, name: path.basename(filePaths[0]) } };
  });

  ipcMain.handle('app:getDbPath', wrap(() => db.getDbPath()));

  // Purchase Returns
  ipcMain.handle('purchase_returns:save', wrap((data) => db.savePurchaseReturn(data)));
  ipcMain.handle('purchase_returns:list', wrap((f) => db.getPurchaseReturns(f)));
  ipcMain.handle('purchase_returns:get', wrap((id) => db.getPurchaseReturn(id)));

  // Stock Write-off
  ipcMain.handle('stock:writeoff', wrap((items) => db.writeoffExpiredBatches(items)));

  // Schemes
  ipcMain.handle('schemes:list', wrap((q) => db.getSchemes(q)));
  ipcMain.handle('schemes:add', wrap((d) => db.addScheme(d)));
  ipcMain.handle('schemes:update', wrap((d) => db.updateScheme(d)));
  ipcMain.handle('schemes:delete', wrap((id) => db.deleteScheme(id)));

  // Drug Interactions
  ipcMain.handle('drugs:interactions', wrap((names) => db.checkDrugInteractions(names)));

  // Prescription Attachments
  ipcMain.handle('prescriptions:add', wrap((d) => db.addPrescriptionAttachment(d)));
  ipcMain.handle('prescriptions:list', wrap((bill_id) => db.getPrescriptionAttachments(bill_id)));
  ipcMain.handle('prescriptions:pick', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Select Prescription',
      properties: ['openFile'],
      filters: [{ name: 'Images / PDF', extensions: ['jpg', 'jpeg', 'png', 'pdf'] }],
    });
    if (canceled || !filePaths[0]) return { ok: false };
    return { ok: true, data: { path: filePaths[0], name: path.basename(filePaths[0]) } };
  });
  ipcMain.handle('prescriptions:open', async (_e, filePath) => {
    await shell.openPath(filePath);
    return { ok: true };
  });

  // Supplier Payments / Ledger
  ipcMain.handle('supplier_payments:add', wrap((d) => db.addSupplierPayment(d)));
  ipcMain.handle('supplier_payments:ledger', wrap((id) => db.getSupplierLedger(id)));

  // Reports — new
  ipcMain.handle('reports:doctor_commission', wrap((f) => db.getDoctorCommissionReport(f)));
  ipcMain.handle('reports:shift_close', wrap((f) => db.getShiftCloseReport(f)));
  ipcMain.handle('reports:reorder', wrap(() => db.getReorderSuggestions()));

  // Credit / receivables
  ipcMain.handle('customers:credit_list', wrap(() => db.getCreditCustomers()));
  ipcMain.handle('customers:collect_payment', wrap((d) => db.collectCustomerPayment(d)));

  // License
  ipcMain.handle('license:get', wrap(() => db.getLicense()));
  ipcMain.handle('license:activate', wrap((key) => {
    // Decode key: base64(JSON) with HMAC signature
    let payload;
    try {
      const decoded = Buffer.from(key, 'base64').toString('utf8');
      payload = JSON.parse(decoded);
    } catch {
      throw new Error('Invalid license key format');
    }
    const { pharmacy_name, plan, expires_at, sig } = payload;
    if (!sig || !pharmacy_name || !expires_at) throw new Error('Malformed license key');
    // Verify signature
    const body = `${pharmacy_name}|${plan}|${expires_at}`;
    const expected = crypto.createHmac('sha256', LICENSE_SECRET).update(body).digest('hex').slice(0, 16);
    if (sig !== expected) throw new Error('License key is invalid or has been tampered with');
    // Check expiry
    if (new Date(expires_at) < new Date()) throw new Error('License has expired. Please renew.');
    // Persist
    const machineId = crypto.createHash('md5').update(require('os').hostname() + require('os').platform()).digest('hex');
    return db.setLicense({
      license_key: key,
      pharmacy_name,
      plan,
      activated_at: new Date().toISOString().slice(0, 10),
      expires_at,
      machine_id: machineId,
    });
  }));
  // Tool to generate a license key (call from dev console for issuing keys)
  ipcMain.handle('license:generate', wrap(({ pharmacy_name, plan, expires_at }) => {
    const body = `${pharmacy_name}|${plan}|${expires_at}`;
    const sig = crypto.createHmac('sha256', LICENSE_SECRET).update(body).digest('hex').slice(0, 16);
    const key = Buffer.from(JSON.stringify({ pharmacy_name, plan, expires_at, sig })).toString('base64');
    return { key };
  }));

  // Auto-backup config
  ipcMain.handle('backup:auto_folder', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Select Auto-Backup Folder',
      properties: ['openDirectory'],
    });
    if (canceled || !filePaths[0]) return { ok: false };
    return { ok: true, data: filePaths[0] };
  });
  ipcMain.handle('backup:auto_now', wrap(() => {
    const settings = db.getSettings();
    const folder = settings.auto_backup_folder;
    if (!folder || !fs.existsSync(folder)) throw new Error('Auto-backup folder not configured or not found');
    const fname = `medbill-auto-${new Date().toISOString().slice(0, 10)}.db`;
    return db.backup(path.join(folder, fname));
  }));
}

module.exports = { registerIpc };

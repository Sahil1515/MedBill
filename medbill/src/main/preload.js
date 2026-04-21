const { contextBridge, ipcRenderer } = require('electron');

const invoke = (ch, ...a) => ipcRenderer.invoke(ch, ...a);

contextBridge.exposeInMainWorld('events', {
  onNav: (cb) => ipcRenderer.on('nav', (_e, target) => cb(target)),
  onAction: (cb) => ipcRenderer.on('action', (_e, a) => cb(a)),
  // Returns a cleanup function that removes the listener
  onPhoneBarcode: (cb) => {
    const handler = (_e, barcode) => cb(barcode);
    ipcRenderer.on('scanner:barcode', handler);
    return () => ipcRenderer.removeListener('scanner:barcode', handler);
  },
  onUpdateAvailable: (cb) => ipcRenderer.on('updater:available', (_e, info) => cb(info)),
  onUpdateProgress:  (cb) => ipcRenderer.on('updater:progress',  (_e, p)    => cb(p)),
  onUpdateDownloaded:(cb) => ipcRenderer.on('updater:downloaded', (_e, info) => cb(info)),
});

contextBridge.exposeInMainWorld('api', {
  // Settings
  getSettings: () => invoke('settings:get'),
  saveSettings: (d) => invoke('settings:save', d),

  // Medicines
  getMedicines: (q) => invoke('medicines:list', q),
  getMedicine: (id) => invoke('medicines:get', id),
  addMedicine: (d) => invoke('medicines:add', d),
  updateMedicine: (d) => invoke('medicines:update', d),
  deleteMedicine: (id) => invoke('medicines:delete', id),
  importMedicines: (rows) => invoke('medicines:import', rows),

  // Batches
  addBatch: (d) => invoke('batches:add', d),
  updateBatch: (d) => invoke('batches:update', d),
  deleteBatch: (id) => invoke('batches:delete', id),
  adjustStock: (d) => invoke('stock:adjust', d),

  // Suppliers
  getSuppliers: (q) => invoke('suppliers:list', q),
  addSupplier: (d) => invoke('suppliers:add', d),
  updateSupplier: (d) => invoke('suppliers:update', d),
  deleteSupplier: (id) => invoke('suppliers:delete', id),

  // Customers
  getCustomers: (q) => invoke('customers:list', q),
  findCustomer: (phone) => invoke('customers:find', phone),
  addCustomer: (d) => invoke('customers:add', d),
  updateCustomer: (d) => invoke('customers:update', d),
  deleteCustomer: (id) => invoke('customers:delete', id),
  customerHistory: (id) => invoke('customers:history', id),

  // Doctors
  getDoctors: (q) => invoke('doctors:list', q),
  addDoctor: (d) => invoke('doctors:add', d),
  updateDoctor: (d) => invoke('doctors:update', d),
  deleteDoctor: (id) => invoke('doctors:delete', id),

  // Bills
  saveBill: (d) => invoke('bills:save', d),
  getBill: (id) => invoke('bills:get', id),
  getBills: (f) => invoke('bills:list', f),
  cancelBill: (d) => invoke('bills:cancel', d),

  // Purchases
  savePurchase: (d) => invoke('purchases:save', d),
  getPurchase: (id) => invoke('purchases:get', id),
  getPurchases: (f) => invoke('purchases:list', f),

  // Returns
  saveReturn: (d) => invoke('returns:save', d),
  getReturns: () => invoke('returns:list'),

  // Reports
  dashboard: () => invoke('reports:dashboard'),
  salesReport: (f) => invoke('reports:sales', f),
  stockReport: () => invoke('reports:stock'),
  expiryReport: (f) => invoke('reports:expiry', f),
  gstReport: (f) => invoke('reports:gst', f),
  profitReport: (f) => invoke('reports:profit', f),
  daybook: (f) => invoke('reports:daybook', f),
  auditLog: (f) => invoke('reports:audit', f),

  // Backup + export + file
  backup: () => invoke('backup:save'),
  restore: () => invoke('backup:restore'),
  exportJson: (payload) => invoke('export:json', payload),
  exportCsv: (payload) => invoke('export:csv', payload),
  readTextFile: () => invoke('file:readText'),
  getDbPath: () => invoke('app:getDbPath'),

  // Purchase Returns
  savePurchaseReturn: (d) => invoke('purchase_returns:save', d),
  getPurchaseReturns: (f) => invoke('purchase_returns:list', f),
  getPurchaseReturn: (id) => invoke('purchase_returns:get', id),

  // Stock Write-off
  writeoffStock: (items) => invoke('stock:writeoff', items),

  // Schemes
  getSchemes: (q) => invoke('schemes:list', q),
  addScheme: (d) => invoke('schemes:add', d),
  updateScheme: (d) => invoke('schemes:update', d),
  deleteScheme: (id) => invoke('schemes:delete', id),

  // Drug Interactions
  checkInteractions: (names) => invoke('drugs:interactions', names),

  // Prescription Attachments
  addPrescription: (d) => invoke('prescriptions:add', d),
  getPrescriptions: (bill_id) => invoke('prescriptions:list', bill_id),
  pickPrescriptionFile: () => invoke('prescriptions:pick'),
  openPrescription: (filePath) => invoke('prescriptions:open', filePath),

  // Supplier Payments / Ledger
  addSupplierPayment: (d) => invoke('supplier_payments:add', d),
  getSupplierLedger: (id) => invoke('supplier_payments:ledger', id),

  // Reports — new
  doctorCommissionReport: (f) => invoke('reports:doctor_commission', f),
  shiftCloseReport: (f) => invoke('reports:shift_close', f),
  reorderSuggestions: () => invoke('reports:reorder'),

  // Credit management
  getCreditCustomers: () => invoke('customers:credit_list'),
  collectPayment: (d) => invoke('customers:collect_payment', d),

  // License
  getLicense: () => invoke('license:get'),
  activateLicense: (key) => invoke('license:activate', key),

  // Updater
  checkForUpdates:  () => invoke('updater:check'),
  downloadUpdate:   () => ipcRenderer.send('updater:download'),
  installUpdate:    () => ipcRenderer.send('updater:install'),
  simulateUpdate:   () => ipcRenderer.send('updater:simulate'),

  // Auto-backup
  pickAutoBackupFolder: () => invoke('backup:auto_folder'),
  runAutoBackup: () => invoke('backup:auto_now'),

  // Notify main to re-schedule auto-backup after settings change
  notifySettingsChanged: () => ipcRenderer.send('settings:changed'),

  // Phone camera scanner
  getPhoneScannerQR: () => invoke('scanner:getQR'),
});

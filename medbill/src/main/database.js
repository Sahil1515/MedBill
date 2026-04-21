const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

let db;

function init() {
  const dbPath = path.join(app.getPath('userData'), 'medbill.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  createSchema();
  migrateLegacy();
  seedDefaults();
  return db;
}

function getDbPath() {
  return path.join(app.getPath('userData'), 'medbill.db');
}

// ------------------------------------------------------------------
// SCHEMA
// ------------------------------------------------------------------
function createSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      contact_person TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      gst_number TEXT,
      drug_license TEXT,
      balance REAL DEFAULT 0,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS medicines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      generic_name TEXT,
      manufacturer TEXT,
      category TEXT,
      unit TEXT DEFAULT 'tab',
      hsn TEXT,
      gst_rate REAL DEFAULT 12,
      barcode TEXT,
      rack_location TEXT,
      schedule TEXT,
      composition TEXT,
      reorder_level INTEGER DEFAULT 10,
      notes TEXT,
      archived INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_med_name ON medicines(name);

    CREATE TABLE IF NOT EXISTS batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
      batch_no TEXT,
      expiry TEXT,
      purchase_price REAL DEFAULT 0,
      mrp REAL NOT NULL,
      sale_price REAL NOT NULL,
      stock INTEGER DEFAULT 0,
      supplier_id INTEGER REFERENCES suppliers(id),
      received_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT UNIQUE,
      email TEXT,
      address TEXT,
      age INTEGER,
      gender TEXT,
      blood_group TEXT,
      allergies TEXT,
      balance REAL DEFAULT 0,
      total_spent REAL DEFAULT 0,
      visit_count INTEGER DEFAULT 0,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS doctors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      clinic TEXT,
      specialization TEXT,
      registration_no TEXT,
      commission_percent REAL DEFAULT 0,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_no TEXT,
      supplier_id INTEGER REFERENCES suppliers(id),
      purchase_date TEXT,
      subtotal REAL,
      discount_amount REAL DEFAULT 0,
      gst_amount REAL DEFAULT 0,
      other_charges REAL DEFAULT 0,
      total REAL,
      amount_paid REAL DEFAULT 0,
      payment_mode TEXT,
      payment_status TEXT DEFAULT 'unpaid',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS purchase_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id INTEGER REFERENCES purchases(id) ON DELETE CASCADE,
      medicine_id INTEGER REFERENCES medicines(id),
      batch_id INTEGER REFERENCES batches(id),
      medicine_name TEXT,
      batch_no TEXT,
      expiry TEXT,
      quantity INTEGER,
      free_qty INTEGER DEFAULT 0,
      purchase_price REAL,
      mrp REAL,
      sale_price REAL,
      gst_rate REAL,
      amount REAL
    );

    CREATE TABLE IF NOT EXISTS bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_number TEXT UNIQUE,
      customer_id INTEGER REFERENCES customers(id),
      customer_name TEXT,
      phone TEXT,
      doctor_id INTEGER REFERENCES doctors(id),
      doctor_name TEXT,
      subtotal REAL,
      discount_percent REAL DEFAULT 0,
      discount_amount REAL DEFAULT 0,
      cgst_amount REAL DEFAULT 0,
      sgst_amount REAL DEFAULT 0,
      igst_amount REAL DEFAULT 0,
      gst_amount REAL DEFAULT 0,
      round_off REAL DEFAULT 0,
      total REAL,
      amount_paid REAL DEFAULT 0,
      balance REAL DEFAULT 0,
      payment_mode TEXT DEFAULT 'cash',
      payment_status TEXT DEFAULT 'paid',
      notes TEXT,
      status TEXT DEFAULT 'active',
      cancel_reason TEXT,
      cancelled_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bill_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id INTEGER REFERENCES bills(id) ON DELETE CASCADE,
      medicine_id INTEGER REFERENCES medicines(id),
      batch_id INTEGER REFERENCES batches(id),
      medicine_name TEXT,
      batch_no TEXT,
      expiry TEXT,
      hsn TEXT,
      mrp REAL,
      price REAL,
      quantity INTEGER,
      unit TEXT,
      gst_rate REAL,
      cgst REAL DEFAULT 0,
      sgst REAL DEFAULT 0,
      igst REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      amount REAL
    );

    CREATE TABLE IF NOT EXISTS returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_number TEXT UNIQUE,
      bill_id INTEGER REFERENCES bills(id),
      customer_id INTEGER REFERENCES customers(id),
      subtotal REAL,
      gst_amount REAL,
      total REAL,
      reason TEXT,
      refund_mode TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS return_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_id INTEGER REFERENCES returns(id) ON DELETE CASCADE,
      bill_item_id INTEGER REFERENCES bill_items(id),
      medicine_id INTEGER REFERENCES medicines(id),
      batch_id INTEGER REFERENCES batches(id),
      medicine_name TEXT,
      quantity INTEGER,
      price REAL,
      amount REAL
    );

    CREATE TABLE IF NOT EXISTS stock_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      medicine_id INTEGER REFERENCES medicines(id),
      batch_id INTEGER REFERENCES batches(id),
      adjustment_type TEXT,
      quantity INTEGER,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      party_type TEXT,
      party_id INTEGER,
      bill_id INTEGER,
      purchase_id INTEGER,
      amount REAL,
      mode TEXT,
      kind TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT,
      entity TEXT,
      entity_id INTEGER,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS purchase_returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_number TEXT UNIQUE,
      purchase_id INTEGER REFERENCES purchases(id),
      supplier_id INTEGER REFERENCES suppliers(id),
      return_date TEXT,
      subtotal REAL DEFAULT 0,
      gst_amount REAL DEFAULT 0,
      total REAL DEFAULT 0,
      reason TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS purchase_return_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_return_id INTEGER REFERENCES purchase_returns(id) ON DELETE CASCADE,
      purchase_item_id INTEGER REFERENCES purchase_items(id),
      medicine_id INTEGER REFERENCES medicines(id),
      batch_id INTEGER REFERENCES batches(id),
      medicine_name TEXT,
      batch_no TEXT,
      quantity INTEGER,
      purchase_price REAL,
      amount REAL
    );

    CREATE TABLE IF NOT EXISTS schemes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      scheme_type TEXT DEFAULT 'percent',
      discount_value REAL DEFAULT 0,
      applies_to TEXT DEFAULT 'all',
      medicine_id INTEGER REFERENCES medicines(id),
      category TEXT,
      min_qty INTEGER DEFAULT 1,
      active INTEGER DEFAULT 1,
      valid_from TEXT,
      valid_to TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS drug_interactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      drug_a TEXT NOT NULL,
      drug_b TEXT NOT NULL,
      severity TEXT DEFAULT 'moderate',
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS prescription_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id INTEGER REFERENCES bills(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      file_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS supplier_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER REFERENCES suppliers(id),
      purchase_id INTEGER REFERENCES purchases(id),
      amount REAL NOT NULL,
      mode TEXT DEFAULT 'cash',
      reference TEXT,
      notes TEXT,
      payment_date TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS license_info (
      id INTEGER PRIMARY KEY,
      license_key TEXT,
      pharmacy_name TEXT,
      plan TEXT DEFAULT 'starter',
      activated_at TEXT,
      expires_at TEXT,
      machine_id TEXT
    );
  `);

  // Add columns for older DBs that already had these tables
  ensureColumn('medicines', 'generic_name', 'TEXT');
  ensureColumn('medicines', 'manufacturer', 'TEXT');
  ensureColumn('medicines', 'category', 'TEXT');
  ensureColumn('medicines', 'gst_rate', 'REAL DEFAULT 12');
  ensureColumn('medicines', 'barcode', 'TEXT');
  ensureColumn('medicines', 'rack_location', 'TEXT');
  ensureColumn('medicines', 'schedule', 'TEXT');
  ensureColumn('medicines', 'composition', 'TEXT');
  ensureColumn('medicines', 'reorder_level', 'INTEGER DEFAULT 10');
  ensureColumn('medicines', 'notes', 'TEXT');
  ensureColumn('medicines', 'archived', 'INTEGER DEFAULT 0');

  // Bills — new columns for v2
  ensureColumn('bills', 'customer_id', 'INTEGER');
  ensureColumn('bills', 'customer_name', 'TEXT');
  ensureColumn('bills', 'phone', 'TEXT');
  ensureColumn('bills', 'doctor_id', 'INTEGER');
  ensureColumn('bills', 'doctor_name', 'TEXT');
  ensureColumn('bills', 'discount_percent', 'REAL DEFAULT 0');
  ensureColumn('bills', 'discount_amount', 'REAL DEFAULT 0');
  ensureColumn('bills', 'cgst_amount', 'REAL DEFAULT 0');
  ensureColumn('bills', 'sgst_amount', 'REAL DEFAULT 0');
  ensureColumn('bills', 'igst_amount', 'REAL DEFAULT 0');
  ensureColumn('bills', 'gst_amount', 'REAL DEFAULT 0');
  ensureColumn('bills', 'round_off', 'REAL DEFAULT 0');
  ensureColumn('bills', 'amount_paid', 'REAL DEFAULT 0');
  ensureColumn('bills', 'balance', 'REAL DEFAULT 0');
  ensureColumn('bills', 'payment_mode', "TEXT DEFAULT 'cash'");
  ensureColumn('bills', 'payment_status', "TEXT DEFAULT 'paid'");
  ensureColumn('bills', 'notes', 'TEXT');
  ensureColumn('bills', 'status', "TEXT DEFAULT 'active'");
  ensureColumn('bills', 'cancel_reason', 'TEXT');
  ensureColumn('bills', 'cancelled_at', 'DATETIME');

  // Bill items — new columns
  ensureColumn('bill_items', 'batch_id', 'INTEGER');
  ensureColumn('bill_items', 'batch_no', 'TEXT');
  ensureColumn('bill_items', 'expiry', 'TEXT');
  ensureColumn('bill_items', 'hsn', 'TEXT');
  ensureColumn('bill_items', 'mrp', 'REAL');
  ensureColumn('bill_items', 'unit', 'TEXT');
  ensureColumn('bill_items', 'gst_rate', 'REAL DEFAULT 0');
  ensureColumn('bill_items', 'cgst', 'REAL DEFAULT 0');
  ensureColumn('bill_items', 'sgst', 'REAL DEFAULT 0');
  ensureColumn('bill_items', 'igst', 'REAL DEFAULT 0');
  ensureColumn('bill_items', 'discount', 'REAL DEFAULT 0');

  // New columns for older DBs
  ensureColumn('bills', 'prescription_path', 'TEXT');
  ensureColumn('purchases', 'return_amount', 'REAL DEFAULT 0');
  ensureColumn('suppliers', 'payment_terms', 'TEXT');

  // Seed static drug interaction data (only if table is empty)
  const diCount = db.prepare('SELECT COUNT(*) c FROM drug_interactions').get().c;
  if (diCount === 0) {
    const diStmt = db.prepare(
      'INSERT INTO drug_interactions (drug_a, drug_b, severity, description) VALUES (?, ?, ?, ?)'
    );
    const interactions = [
      ['warfarin', 'aspirin', 'major', 'Increased bleeding risk. Avoid combination.'],
      ['warfarin', 'ibuprofen', 'major', 'Increased anticoagulant effect and GI bleeding risk.'],
      ['metformin', 'alcohol', 'moderate', 'Increased risk of lactic acidosis.'],
      ['metoprolol', 'amlodipine', 'minor', 'Additive blood pressure lowering effect. Monitor closely.'],
      ['amoxicillin', 'methotrexate', 'major', 'Methotrexate toxicity risk increases.'],
      ['ciprofloxacin', 'antacid', 'moderate', 'Antacids reduce ciprofloxacin absorption. Take 2h apart.'],
      ['digoxin', 'amiodarone', 'major', 'Amiodarone increases digoxin levels. Risk of toxicity.'],
      ['simvastatin', 'erythromycin', 'major', 'Risk of myopathy/rhabdomyolysis. Avoid combination.'],
      ['clopidogrel', 'omeprazole', 'moderate', 'Omeprazole may reduce clopidogrel effectiveness.'],
      ['lisinopril', 'potassium', 'moderate', 'Risk of hyperkalemia. Monitor potassium levels.'],
      ['atorvastatin', 'clarithromycin', 'major', 'Increased statin levels; risk of muscle damage.'],
      ['phenytoin', 'fluconazole', 'major', 'Fluconazole increases phenytoin levels. Risk of toxicity.'],
      ['insulin', 'alcohol', 'moderate', 'Hypoglycaemia risk. Monitor blood glucose closely.'],
      ['metformin', 'iodinated contrast', 'major', 'Risk of lactic acidosis. Stop metformin before contrast.'],
      ['levothyroxine', 'calcium', 'moderate', 'Calcium impairs levothyroxine absorption. Take 4h apart.'],
    ];
    const tx = db.transaction((rows) => { for (const r of rows) diStmt.run(...r); });
    tx(interactions);
  }

  // Create all indexes safely after columns are guaranteed to exist
  const idxs = [
    'CREATE INDEX IF NOT EXISTS idx_med_name ON medicines(name)',
    'CREATE INDEX IF NOT EXISTS idx_med_barcode ON medicines(barcode)',
    'CREATE INDEX IF NOT EXISTS idx_batch_med ON batches(medicine_id)',
    'CREATE INDEX IF NOT EXISTS idx_batch_expiry ON batches(expiry)',
    'CREATE INDEX IF NOT EXISTS idx_cust_phone ON customers(phone)',
    'CREATE INDEX IF NOT EXISTS idx_bill_created ON bills(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_bill_customer ON bills(customer_id)',
  ];
  for (const sql of idxs) { try { db.exec(sql); } catch (_) {} }
}

function ensureColumn(table, col, def) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    if (!cols.includes(col)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
    }
  } catch (_) {}
}

function migrateLegacy() {
  // If medicines table still has legacy 'price'/'stock' columns, move data into batches.
  const cols = db.prepare(`PRAGMA table_info(medicines)`).all().map((c) => c.name);
  if (cols.includes('price') && cols.includes('stock')) {
    const legacy = db.prepare('SELECT id, price, stock, expiry FROM medicines WHERE stock > 0').all();
    const existing = db.prepare('SELECT COUNT(*) c FROM batches').get().c;
    if (existing === 0 && legacy.length) {
      const stmt = db.prepare(
        `INSERT INTO batches (medicine_id, batch_no, expiry, purchase_price, mrp, sale_price, stock)
         VALUES (?, 'LEGACY', ?, ?, ?, ?, ?)`
      );
      const tx = db.transaction((rows) => {
        for (const r of rows) {
          stmt.run(r.id, r.expiry || null, (r.price || 0) * 0.8, r.price || 0, r.price || 0, r.stock);
        }
      });
      tx(legacy);
    }

    // Rebuild medicines table to remove the legacy NOT NULL constraint on price/stock
    // so that new INSERTs (which no longer include those columns) don't fail.
    db.pragma('foreign_keys = OFF');
    db.exec(`
      BEGIN;
      CREATE TABLE IF NOT EXISTS medicines_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        generic_name TEXT,
        manufacturer TEXT,
        category TEXT,
        unit TEXT DEFAULT 'tab',
        hsn TEXT,
        gst_rate REAL DEFAULT 12,
        barcode TEXT,
        rack_location TEXT,
        schedule TEXT,
        composition TEXT,
        reorder_level INTEGER DEFAULT 10,
        notes TEXT,
        archived INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO medicines_new
        (id, name, generic_name, manufacturer, category, unit, hsn, gst_rate,
         barcode, rack_location, schedule, composition, reorder_level, notes, archived, created_at)
      SELECT
        id, name, generic_name, manufacturer, category, unit, hsn, gst_rate,
        barcode, rack_location, schedule, composition, reorder_level, notes, archived, created_at
      FROM medicines;
      DROP TABLE medicines;
      ALTER TABLE medicines_new RENAME TO medicines;
      CREATE INDEX IF NOT EXISTS idx_med_name ON medicines(name);
      COMMIT;
    `);
    db.pragma('foreign_keys = ON');
  }
}

function seedDefaults() {
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  );
  const defaults = {
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
    theme: 'light',
    low_stock_alert: '1',
    expiry_alert_days: '60',
  };
  for (const [k, v] of Object.entries(defaults)) stmt.run(k, v);
}

// ------------------------------------------------------------------
// SETTINGS
// ------------------------------------------------------------------
function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = {};
  rows.forEach((r) => (out[r.key] = r.value));
  return out;
}

function saveSettings(settings) {
  const stmt = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  const tx = db.transaction((entries) => {
    for (const [k, v] of entries) stmt.run(k, v == null ? '' : String(v));
  });
  tx(Object.entries(settings));
  return getSettings();
}

// ------------------------------------------------------------------
// MEDICINES + BATCHES
// ------------------------------------------------------------------
function getMedicines(query = '') {
  const base = `
    SELECT m.*,
      COALESCE((SELECT SUM(stock) FROM batches WHERE medicine_id = m.id), 0) AS total_stock,
      (SELECT mrp FROM batches WHERE medicine_id = m.id AND stock > 0 ORDER BY expiry ASC LIMIT 1) AS current_mrp,
      (SELECT sale_price FROM batches WHERE medicine_id = m.id AND stock > 0 ORDER BY expiry ASC LIMIT 1) AS current_price,
      (SELECT batch_no FROM batches WHERE medicine_id = m.id AND stock > 0 ORDER BY expiry ASC LIMIT 1) AS current_batch,
      (SELECT expiry FROM batches WHERE medicine_id = m.id AND stock > 0 ORDER BY expiry ASC LIMIT 1) AS current_expiry
    FROM medicines m
    WHERE archived = 0
  `;
  if (query && query.trim()) {
    return db
      .prepare(base + ' AND (m.name LIKE ? OR m.generic_name LIKE ? OR m.barcode = ? OR m.manufacturer LIKE ?) ORDER BY m.name LIMIT 200')
      .all(`%${query}%`, `%${query}%`, query, `%${query}%`);
  }
  return db.prepare(base + ' ORDER BY m.name').all();
}

function getMedicineById(id) {
  const m = db.prepare('SELECT * FROM medicines WHERE id = ?').get(id);
  if (!m) return null;
  m.batches = db.prepare('SELECT * FROM batches WHERE medicine_id = ? ORDER BY expiry').all(id);
  m.total_stock = m.batches.reduce((s, b) => s + b.stock, 0);
  return m;
}

function addMedicine(m) {
  const info = db.prepare(
    `INSERT INTO medicines
     (name, generic_name, manufacturer, category, unit, hsn, gst_rate, barcode,
      rack_location, schedule, composition, reorder_level, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    m.name,
    m.generic_name || null,
    m.manufacturer || null,
    m.category || null,
    m.unit || 'tab',
    m.hsn || null,
    m.gst_rate != null ? m.gst_rate : 12,
    m.barcode || null,
    m.rack_location || null,
    m.schedule || null,
    m.composition || null,
    m.reorder_level || 10,
    m.notes || null
  );
  const medId = info.lastInsertRowid;
  // Optional initial batch
  if (m.batch_no || m.stock || m.mrp) {
    addBatch({
      medicine_id: medId,
      batch_no: m.batch_no || 'B001',
      expiry: m.expiry || null,
      purchase_price: m.purchase_price || 0,
      mrp: m.mrp || m.sale_price || 0,
      sale_price: m.sale_price || m.mrp || 0,
      stock: m.stock || 0,
      supplier_id: m.supplier_id || null,
    });
  }
  audit('create', 'medicine', medId, m.name);
  return getMedicineById(medId);
}

function updateMedicine(m) {
  db.prepare(
    `UPDATE medicines SET
       name=?, generic_name=?, manufacturer=?, category=?, unit=?, hsn=?, gst_rate=?,
       barcode=?, rack_location=?, schedule=?, composition=?, reorder_level=?, notes=?
     WHERE id=?`
  ).run(
    m.name,
    m.generic_name || null,
    m.manufacturer || null,
    m.category || null,
    m.unit || 'tab',
    m.hsn || null,
    m.gst_rate != null ? m.gst_rate : 12,
    m.barcode || null,
    m.rack_location || null,
    m.schedule || null,
    m.composition || null,
    m.reorder_level || 10,
    m.notes || null,
    m.id
  );
  audit('update', 'medicine', m.id, m.name);
  return getMedicineById(m.id);
}

function deleteMedicine(id) {
  // Soft delete if bill_items refer to it
  const used = db.prepare('SELECT COUNT(*) c FROM bill_items WHERE medicine_id = ?').get(id).c;
  if (used > 0) {
    db.prepare('UPDATE medicines SET archived = 1 WHERE id = ?').run(id);
    audit('archive', 'medicine', id, '');
  } else {
    db.prepare('DELETE FROM medicines WHERE id = ?').run(id);
    audit('delete', 'medicine', id, '');
  }
  return { ok: true };
}

function addBatch(b) {
  const info = db.prepare(
    `INSERT INTO batches
     (medicine_id, batch_no, expiry, purchase_price, mrp, sale_price, stock, supplier_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    b.medicine_id,
    b.batch_no || 'B001',
    b.expiry || null,
    b.purchase_price || 0,
    b.mrp || 0,
    b.sale_price || b.mrp || 0,
    b.stock || 0,
    b.supplier_id || null
  );
  audit('create', 'batch', info.lastInsertRowid, `med:${b.medicine_id}`);
  return db.prepare('SELECT * FROM batches WHERE id = ?').get(info.lastInsertRowid);
}

function updateBatch(b) {
  db.prepare(
    `UPDATE batches SET batch_no=?, expiry=?, purchase_price=?, mrp=?, sale_price=?, stock=? WHERE id=?`
  ).run(b.batch_no, b.expiry || null, b.purchase_price || 0, b.mrp || 0, b.sale_price || 0, b.stock || 0, b.id);
  audit('update', 'batch', b.id, '');
  return db.prepare('SELECT * FROM batches WHERE id = ?').get(b.id);
}

function deleteBatch(id) {
  db.prepare('DELETE FROM batches WHERE id = ?').run(id);
  audit('delete', 'batch', id, '');
  return { ok: true };
}

function importMedicinesCSV(rows) {
  const tx = db.transaction((items) => {
    let count = 0;
    for (const r of items) {
      if (!r.name) continue;
      addMedicine({
        name: r.name,
        generic_name: r.generic_name,
        manufacturer: r.manufacturer,
        category: r.category,
        unit: r.unit || 'tab',
        hsn: r.hsn,
        gst_rate: r.gst_rate != null && r.gst_rate !== '' ? parseFloat(r.gst_rate) : 12,
        barcode: r.barcode,
        rack_location: r.rack_location,
        schedule: r.schedule,
        reorder_level: parseInt(r.reorder_level) || 10,
        batch_no: r.batch_no || 'B001',
        expiry: r.expiry,
        purchase_price: parseFloat(r.purchase_price) || 0,
        mrp: parseFloat(r.mrp) || parseFloat(r.sale_price) || parseFloat(r.price) || 0,
        sale_price: parseFloat(r.sale_price) || parseFloat(r.price) || parseFloat(r.mrp) || 0,
        stock: parseInt(r.stock) || 0,
      });
      count++;
    }
    return count;
  });
  return { imported: tx(rows) };
}

// ------------------------------------------------------------------
// SUPPLIERS
// ------------------------------------------------------------------
function getSuppliers(query = '') {
  if (query) {
    return db
      .prepare(
        'SELECT * FROM suppliers WHERE name LIKE ? OR phone LIKE ? ORDER BY name'
      )
      .all(`%${query}%`, `%${query}%`);
  }
  return db.prepare('SELECT * FROM suppliers ORDER BY name').all();
}
function addSupplier(s) {
  const info = db.prepare(
    `INSERT INTO suppliers (name, contact_person, phone, email, address, gst_number, drug_license, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(s.name, s.contact_person || null, s.phone || null, s.email || null, s.address || null, s.gst_number || null, s.drug_license || null, s.notes || null);
  audit('create', 'supplier', info.lastInsertRowid, s.name);
  return db.prepare('SELECT * FROM suppliers WHERE id = ?').get(info.lastInsertRowid);
}
function updateSupplier(s) {
  db.prepare(
    `UPDATE suppliers SET name=?, contact_person=?, phone=?, email=?, address=?, gst_number=?, drug_license=?, notes=? WHERE id=?`
  ).run(s.name, s.contact_person || null, s.phone || null, s.email || null, s.address || null, s.gst_number || null, s.drug_license || null, s.notes || null, s.id);
  return db.prepare('SELECT * FROM suppliers WHERE id = ?').get(s.id);
}
function deleteSupplier(id) {
  db.prepare('DELETE FROM suppliers WHERE id = ?').run(id);
  return { ok: true };
}

// ------------------------------------------------------------------
// CUSTOMERS
// ------------------------------------------------------------------
function getCustomers(query = '') {
  if (query) {
    return db
      .prepare('SELECT * FROM customers WHERE name LIKE ? OR phone LIKE ? ORDER BY name LIMIT 100')
      .all(`%${query}%`, `%${query}%`);
  }
  return db.prepare('SELECT * FROM customers ORDER BY name LIMIT 500').all();
}
function findCustomerByPhone(phone) {
  if (!phone) return null;
  return db.prepare('SELECT * FROM customers WHERE phone = ?').get(phone);
}
function addCustomer(c) {
  const info = db.prepare(
    `INSERT INTO customers (name, phone, email, address, age, gender, blood_group, allergies, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(c.name, c.phone || null, c.email || null, c.address || null, c.age || null, c.gender || null, c.blood_group || null, c.allergies || null, c.notes || null);
  audit('create', 'customer', info.lastInsertRowid, c.name);
  return db.prepare('SELECT * FROM customers WHERE id = ?').get(info.lastInsertRowid);
}
function updateCustomer(c) {
  db.prepare(
    `UPDATE customers SET name=?, phone=?, email=?, address=?, age=?, gender=?, blood_group=?, allergies=?, notes=? WHERE id=?`
  ).run(c.name, c.phone || null, c.email || null, c.address || null, c.age || null, c.gender || null, c.blood_group || null, c.allergies || null, c.notes || null, c.id);
  return db.prepare('SELECT * FROM customers WHERE id = ?').get(c.id);
}
function deleteCustomer(id) {
  db.prepare('DELETE FROM customers WHERE id = ?').run(id);
  return { ok: true };
}
function getCustomerHistory(id) {
  const cust = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  if (!cust) return null;
  cust.bills = db
    .prepare('SELECT id, bill_number, total, payment_status, created_at FROM bills WHERE customer_id = ? ORDER BY id DESC LIMIT 100')
    .all(id);
  return cust;
}

// ------------------------------------------------------------------
// DOCTORS
// ------------------------------------------------------------------
function getDoctors(query = '') {
  if (query) {
    return db
      .prepare('SELECT * FROM doctors WHERE name LIKE ? OR phone LIKE ? ORDER BY name')
      .all(`%${query}%`, `%${query}%`);
  }
  return db.prepare('SELECT * FROM doctors ORDER BY name').all();
}
function addDoctor(d) {
  const info = db.prepare(
    `INSERT INTO doctors (name, phone, clinic, specialization, registration_no, commission_percent, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(d.name, d.phone || null, d.clinic || null, d.specialization || null, d.registration_no || null, d.commission_percent || 0, d.notes || null);
  return db.prepare('SELECT * FROM doctors WHERE id = ?').get(info.lastInsertRowid);
}
function updateDoctor(d) {
  db.prepare(
    `UPDATE doctors SET name=?, phone=?, clinic=?, specialization=?, registration_no=?, commission_percent=?, notes=? WHERE id=?`
  ).run(d.name, d.phone || null, d.clinic || null, d.specialization || null, d.registration_no || null, d.commission_percent || 0, d.notes || null, d.id);
  return db.prepare('SELECT * FROM doctors WHERE id = ?').get(d.id);
}
function deleteDoctor(id) {
  db.prepare('DELETE FROM doctors WHERE id = ?').run(id);
  return { ok: true };
}

// ------------------------------------------------------------------
// BILLS (SALES)
// ------------------------------------------------------------------
function generateBillNumber() {
  const t = new Date();
  const ymd = `${t.getFullYear()}${String(t.getMonth() + 1).padStart(2, '0')}${String(t.getDate()).padStart(2, '0')}`;
  const row = db.prepare(`SELECT COUNT(*) c FROM bills WHERE bill_number LIKE ?`).get(`MB${ymd}%`);
  const seq = String((row.c || 0) + 1).padStart(4, '0');
  return `MB${ymd}${seq}`;
}

function saveBill(bill) {
  // bill = { customer_id, customer_name, phone, doctor_id, doctor_name, items[], discount_percent,
  //          interstate, amount_paid, payment_mode, notes }
  const tx = db.transaction((b) => {
    // Validate every item's batch has enough stock
    for (const it of b.items) {
      const batch = db.prepare('SELECT id, stock FROM batches WHERE id = ?').get(it.batch_id);
      if (!batch) throw new Error(`Batch missing for ${it.name}`);
      if (batch.stock < it.quantity)
        throw new Error(`Insufficient stock for ${it.name} (have ${batch.stock}, need ${it.quantity})`);
    }

    // Compute line totals & GST
    const interstate = !!b.interstate;
    let subtotal = 0;
    let cgst_total = 0, sgst_total = 0, igst_total = 0;
    const computedItems = b.items.map((it) => {
      const line = it.price * it.quantity;
      subtotal += line;
      return { ...it, line };
    });

    const discount_percent = parseFloat(b.discount_percent) || 0;
    const discount_amount = +(subtotal * (discount_percent / 100)).toFixed(2);
    const factor = subtotal > 0 ? (subtotal - discount_amount) / subtotal : 1;

    const itemsWithTax = computedItems.map((it) => {
      const taxable = +(it.line * factor).toFixed(2);
      const gst = +(taxable * (it.gst_rate / 100)).toFixed(2);
      const cgst = interstate ? 0 : +(gst / 2).toFixed(2);
      const sgst = interstate ? 0 : +(gst / 2).toFixed(2);
      const igst = interstate ? gst : 0;
      cgst_total += cgst;
      sgst_total += sgst;
      igst_total += igst;
      return { ...it, cgst, sgst, igst, amount: +(taxable + gst).toFixed(2) };
    });

    const gst_amount = +(cgst_total + sgst_total + igst_total).toFixed(2);
    const rawTotal = subtotal - discount_amount + gst_amount;
    const total = Math.round(rawTotal);
    const round_off = +(total - rawTotal).toFixed(2);

    const amount_paid = parseFloat(b.amount_paid);
    const paid = isNaN(amount_paid) ? total : amount_paid;
    const balance = +(total - paid).toFixed(2);
    const payment_status = balance <= 0 ? 'paid' : paid === 0 ? 'unpaid' : 'partial';

    // Auto-create or find customer by phone
    let customer_id = b.customer_id || null;
    if (!customer_id && b.phone) {
      const found = findCustomerByPhone(b.phone);
      if (found) customer_id = found.id;
      else if (b.customer_name) {
        customer_id = addCustomer({ name: b.customer_name, phone: b.phone }).id;
      }
    }

    const bill_number = generateBillNumber();

    const info = db.prepare(
      `INSERT INTO bills
       (bill_number, customer_id, customer_name, phone, doctor_id, doctor_name,
        subtotal, discount_percent, discount_amount,
        cgst_amount, sgst_amount, igst_amount, gst_amount, round_off, total,
        amount_paid, balance, payment_mode, payment_status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      bill_number,
      customer_id,
      b.customer_name || '',
      b.phone || '',
      b.doctor_id || null,
      b.doctor_name || '',
      subtotal,
      discount_percent,
      discount_amount,
      cgst_total,
      sgst_total,
      igst_total,
      gst_amount,
      round_off,
      total,
      paid,
      balance,
      b.payment_mode || 'cash',
      payment_status,
      b.notes || ''
    );
    const billId = info.lastInsertRowid;

    const itemStmt = db.prepare(
      `INSERT INTO bill_items
       (bill_id, medicine_id, batch_id, medicine_name, batch_no, expiry, hsn,
        mrp, price, quantity, unit, gst_rate, cgst, sgst, igst, amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const stockStmt = db.prepare('UPDATE batches SET stock = stock - ? WHERE id = ?');

    for (const it of itemsWithTax) {
      itemStmt.run(
        billId,
        it.id,
        it.batch_id,
        it.name,
        it.batch_no || null,
        it.expiry || null,
        it.hsn || null,
        it.mrp || it.price,
        it.price,
        it.quantity,
        it.unit || 'pcs',
        it.gst_rate,
        it.cgst,
        it.sgst,
        it.igst,
        it.amount
      );
      stockStmt.run(it.quantity, it.batch_id);
    }

    // Update customer stats
    if (customer_id) {
      db.prepare(
        'UPDATE customers SET total_spent = total_spent + ?, visit_count = visit_count + 1, balance = balance + ? WHERE id = ?'
      ).run(total, balance, customer_id);
      if (paid > 0) {
        db.prepare(
          `INSERT INTO payments (party_type, party_id, bill_id, amount, mode, kind)
           VALUES ('customer', ?, ?, ?, ?, 'receipt')`
        ).run(customer_id, billId, paid, b.payment_mode || 'cash');
      }
    }

    audit('create', 'bill', billId, bill_number);
    return getBill(billId);
  });
  return tx(bill);
}

function getBill(id) {
  const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(id);
  if (!bill) return null;
  bill.items = db.prepare('SELECT * FROM bill_items WHERE bill_id = ?').all(id);
  return bill;
}

function getBills({ search = '', from = null, to = null, status = null } = {}) {
  let q = `
    SELECT id, bill_number, customer_name, phone, doctor_name, total,
           payment_mode, payment_status, status, created_at,
           (SELECT COUNT(*) FROM bill_items WHERE bill_id = bills.id) as item_count
    FROM bills WHERE 1=1`;
  const params = [];
  if (search) {
    q += ' AND (bill_number LIKE ? OR customer_name LIKE ? OR phone LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (from) { q += ' AND date(created_at) >= date(?)'; params.push(from); }
  if (to)   { q += ' AND date(created_at) <= date(?)'; params.push(to); }
  if (status) { q += ' AND status = ?'; params.push(status); }
  q += ' ORDER BY id DESC LIMIT 1000';
  return db.prepare(q).all(...params);
}

function cancelBill({ id, reason }) {
  const tx = db.transaction(() => {
    const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(id);
    if (!bill) throw new Error('Bill not found');
    if (bill.status === 'cancelled') throw new Error('Already cancelled');

    // Restore stock
    const items = db.prepare('SELECT * FROM bill_items WHERE bill_id = ?').all(id);
    const up = db.prepare('UPDATE batches SET stock = stock + ? WHERE id = ?');
    for (const it of items) if (it.batch_id) up.run(it.quantity, it.batch_id);

    db.prepare(
      `UPDATE bills SET status='cancelled', cancel_reason=?, cancelled_at=CURRENT_TIMESTAMP WHERE id=?`
    ).run(reason || '', id);

    if (bill.customer_id) {
      db.prepare(
        'UPDATE customers SET total_spent = total_spent - ?, balance = balance - ? WHERE id = ?'
      ).run(bill.total, bill.balance, bill.customer_id);
    }
    audit('cancel', 'bill', id, bill.bill_number);
    return getBill(id);
  });
  return tx();
}

// ------------------------------------------------------------------
// PURCHASES
// ------------------------------------------------------------------
function savePurchase(p) {
  const tx = db.transaction((pr) => {
    let subtotal = 0, gst_total = 0;
    for (const it of pr.items) {
      const lineCost = it.purchase_price * it.quantity;
      subtotal += lineCost;
      gst_total += +(lineCost * ((it.gst_rate || 0) / 100)).toFixed(2);
    }
    const discount = parseFloat(pr.discount_amount) || 0;
    const other = parseFloat(pr.other_charges) || 0;
    const total = +(subtotal - discount + gst_total + other).toFixed(2);
    const amount_paid = parseFloat(pr.amount_paid) || 0;
    const payment_status = amount_paid >= total ? 'paid' : amount_paid > 0 ? 'partial' : 'unpaid';

    const info = db.prepare(
      `INSERT INTO purchases
       (invoice_no, supplier_id, purchase_date, subtotal, discount_amount, gst_amount,
        other_charges, total, amount_paid, payment_mode, payment_status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      pr.invoice_no || '',
      pr.supplier_id || null,
      pr.purchase_date || new Date().toISOString().slice(0, 10),
      subtotal, discount, gst_total, other, total, amount_paid,
      pr.payment_mode || 'cash', payment_status, pr.notes || ''
    );
    const purchaseId = info.lastInsertRowid;

    const itemStmt = db.prepare(
      `INSERT INTO purchase_items
       (purchase_id, medicine_id, batch_id, medicine_name, batch_no, expiry,
        quantity, free_qty, purchase_price, mrp, sale_price, gst_rate, amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const it of pr.items) {
      const totalQty = (parseInt(it.quantity) || 0) + (parseInt(it.free_qty) || 0);
      // Create batch
      const batch = addBatch({
        medicine_id: it.medicine_id,
        batch_no: it.batch_no,
        expiry: it.expiry,
        purchase_price: it.purchase_price,
        mrp: it.mrp,
        sale_price: it.sale_price || it.mrp,
        stock: totalQty,
        supplier_id: pr.supplier_id,
      });
      itemStmt.run(
        purchaseId,
        it.medicine_id,
        batch.id,
        it.medicine_name || '',
        it.batch_no || '',
        it.expiry || null,
        parseInt(it.quantity) || 0,
        parseInt(it.free_qty) || 0,
        it.purchase_price,
        it.mrp,
        it.sale_price || it.mrp,
        it.gst_rate || 0,
        it.purchase_price * (parseInt(it.quantity) || 0)
      );
    }

    if (pr.supplier_id) {
      db.prepare('UPDATE suppliers SET balance = balance + ? WHERE id = ?').run(total - amount_paid, pr.supplier_id);
    }

    audit('create', 'purchase', purchaseId, pr.invoice_no || '');
    return getPurchase(purchaseId);
  });
  return tx(p);
}

function getPurchase(id) {
  const p = db.prepare('SELECT * FROM purchases WHERE id = ?').get(id);
  if (!p) return null;
  p.items = db.prepare('SELECT * FROM purchase_items WHERE purchase_id = ?').all(id);
  return p;
}

function getPurchases({ from = null, to = null } = {}) {
  let q = `
    SELECT p.*, s.name as supplier_name,
      (SELECT COUNT(*) FROM purchase_items WHERE purchase_id = p.id) as item_count
    FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id
    WHERE 1=1`;
  const params = [];
  if (from) { q += ' AND date(p.purchase_date) >= date(?)'; params.push(from); }
  if (to)   { q += ' AND date(p.purchase_date) <= date(?)'; params.push(to); }
  q += ' ORDER BY p.id DESC LIMIT 500';
  return db.prepare(q).all(...params);
}

// ------------------------------------------------------------------
// RETURNS
// ------------------------------------------------------------------
function saveReturn(r) {
  const tx = db.transaction((ret) => {
    const billItems = db.prepare('SELECT * FROM bill_items WHERE bill_id = ?').all(ret.bill_id);
    const biMap = new Map(billItems.map((i) => [i.id, i]));

    let subtotal = 0, gst_total = 0;
    for (const it of ret.items) {
      const bi = biMap.get(it.bill_item_id);
      if (!bi) throw new Error('Invalid bill item');
      if (it.quantity > bi.quantity) throw new Error(`Return qty exceeds billed qty for ${bi.medicine_name}`);
      const amt = bi.price * it.quantity;
      subtotal += amt;
      gst_total += +(amt * ((bi.gst_rate || 0) / 100)).toFixed(2);
    }
    const total = +(subtotal + gst_total).toFixed(2);

    const rnum = 'RN' + Date.now().toString().slice(-10);
    const info = db.prepare(
      `INSERT INTO returns (return_number, bill_id, customer_id, subtotal, gst_amount, total, reason, refund_mode)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(rnum, ret.bill_id, ret.customer_id || null, subtotal, gst_total, total, ret.reason || '', ret.refund_mode || 'cash');
    const rid = info.lastInsertRowid;

    const itemStmt = db.prepare(
      `INSERT INTO return_items (return_id, bill_item_id, medicine_id, batch_id, medicine_name, quantity, price, amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const stockStmt = db.prepare('UPDATE batches SET stock = stock + ? WHERE id = ?');
    for (const it of ret.items) {
      const bi = biMap.get(it.bill_item_id);
      itemStmt.run(rid, bi.id, bi.medicine_id, bi.batch_id, bi.medicine_name, it.quantity, bi.price, bi.price * it.quantity);
      if (bi.batch_id) stockStmt.run(it.quantity, bi.batch_id);
    }

    audit('create', 'return', rid, rnum);
    return db.prepare('SELECT * FROM returns WHERE id = ?').get(rid);
  });
  return tx(r);
}

function getReturns() {
  return db.prepare(
    `SELECT r.*, b.bill_number FROM returns r LEFT JOIN bills b ON b.id = r.bill_id ORDER BY r.id DESC LIMIT 500`
  ).all();
}

// ------------------------------------------------------------------
// STOCK ADJUSTMENTS
// ------------------------------------------------------------------
function adjustStock({ batch_id, adjustment_type, quantity, reason }) {
  const tx = db.transaction(() => {
    const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(batch_id);
    if (!batch) throw new Error('Batch not found');
    const delta = adjustment_type === 'add' ? quantity : -quantity;
    if (batch.stock + delta < 0) throw new Error('Cannot go below zero stock');
    db.prepare('UPDATE batches SET stock = stock + ? WHERE id = ?').run(delta, batch_id);
    db.prepare(
      `INSERT INTO stock_adjustments (medicine_id, batch_id, adjustment_type, quantity, reason)
       VALUES (?, ?, ?, ?, ?)`
    ).run(batch.medicine_id, batch_id, adjustment_type, quantity, reason || '');
    audit('adjust', 'stock', batch_id, `${adjustment_type} ${quantity}`);
  });
  tx();
  return { ok: true };
}

// ------------------------------------------------------------------
// REPORTS
// ------------------------------------------------------------------
function getDashboardStats() {
  const now = new Date();
  const todayISO = now.toISOString().slice(0, 10);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const weekStart = new Date(now.getTime() - 6 * 86400000).toISOString().slice(0, 10);

  const settings = getSettings();
  const expiryDays = parseInt(settings.expiry_alert_days) || 60;

  const row = (sql, ...p) => db.prepare(sql).get(...p);

  const today = row(
    `SELECT COUNT(*) c, COALESCE(SUM(total),0) s FROM bills WHERE date(created_at)=date(?) AND status='active'`,
    todayISO
  );
  const month = row(
    `SELECT COUNT(*) c, COALESCE(SUM(total),0) s FROM bills WHERE date(created_at)>=date(?) AND status='active'`,
    monthStart
  );
  const pending = row(
    `SELECT COALESCE(SUM(balance),0) s FROM bills WHERE payment_status != 'paid' AND status='active'`
  );
  const customers = row(`SELECT COUNT(*) c FROM customers`);
  const medicines = row(`SELECT COUNT(*) c FROM medicines WHERE archived = 0`);

  const lowStock = db.prepare(
    `SELECT * FROM (
       SELECT m.id, m.name, m.reorder_level,
              COALESCE((SELECT SUM(stock) FROM batches WHERE medicine_id=m.id), 0) as stock
       FROM medicines m WHERE archived = 0
     ) WHERE stock <= reorder_level
     ORDER BY stock ASC LIMIT 10`
  ).all();

  const expiring = db.prepare(
    `SELECT b.id, b.batch_no, b.expiry, b.stock, m.name
     FROM batches b JOIN medicines m ON m.id = b.medicine_id
     WHERE b.stock > 0 AND b.expiry IS NOT NULL
       AND date(b.expiry || '-01', '+1 month', '-1 day') <= date('now', '+${expiryDays} days')
     ORDER BY b.expiry ASC LIMIT 10`
  ).all();

  // Weekly trend
  const trend = db.prepare(
    `SELECT date(created_at) d, COALESCE(SUM(total),0) s, COUNT(*) c
     FROM bills WHERE date(created_at) >= date(?) AND status='active'
     GROUP BY date(created_at) ORDER BY d`
  ).all(weekStart);

  const topMeds = db.prepare(
    `SELECT bi.medicine_name as name, SUM(bi.quantity) qty, SUM(bi.amount) amount
     FROM bill_items bi JOIN bills b ON b.id = bi.bill_id
     WHERE date(b.created_at) >= date(?) AND b.status='active'
     GROUP BY bi.medicine_name ORDER BY qty DESC LIMIT 5`
  ).all(monthStart);

  return {
    today: { count: today.c, total: today.s },
    month: { count: month.c, total: month.s },
    pending_receivable: pending.s,
    customers: customers.c,
    medicines: medicines.c,
    low_stock: lowStock,
    expiring_soon: expiring,
    expiry_alert_days: expiryDays,
    weekly_trend: trend,
    top_medicines: topMeds,
  };
}

function getSalesReport({ from, to }) {
  const bills = db.prepare(
    `SELECT * FROM bills WHERE date(created_at) BETWEEN date(?) AND date(?) AND status='active' ORDER BY id DESC`
  ).all(from, to);
  const summary = bills.reduce(
    (a, b) => ({
      count: a.count + 1,
      subtotal: a.subtotal + b.subtotal,
      discount: a.discount + b.discount_amount,
      gst: a.gst + b.gst_amount,
      total: a.total + b.total,
    }),
    { count: 0, subtotal: 0, discount: 0, gst: 0, total: 0 }
  );
  return { bills, summary };
}

function getStockReport() {
  return db.prepare(
    `SELECT m.id, m.name, m.manufacturer, m.category, m.unit, m.reorder_level,
       COALESCE((SELECT SUM(stock) FROM batches WHERE medicine_id=m.id), 0) as total_stock,
       COALESCE((SELECT SUM(stock * purchase_price) FROM batches WHERE medicine_id=m.id), 0) as stock_value,
       COALESCE((SELECT SUM(stock * mrp) FROM batches WHERE medicine_id=m.id), 0) as stock_mrp
     FROM medicines m WHERE archived = 0 ORDER BY m.name`
  ).all();
}

function getExpiryReport({ days = 60 }) {
  return db.prepare(
    `SELECT b.id, b.batch_no, b.expiry, b.stock, b.mrp, m.name, m.manufacturer
     FROM batches b JOIN medicines m ON m.id = b.medicine_id
     WHERE b.stock > 0 AND b.expiry IS NOT NULL
       AND date(b.expiry || '-01', '+1 month', '-1 day') <= date('now', '+${parseInt(days) || 60} days')
     ORDER BY b.expiry ASC`
  ).all();
}

function getGstReport({ from, to }) {
  const rows = db.prepare(
    `SELECT bi.hsn, bi.gst_rate,
            SUM(bi.quantity * bi.price - bi.cgst - bi.sgst - bi.igst) as taxable,
            SUM(bi.cgst) as cgst, SUM(bi.sgst) as sgst, SUM(bi.igst) as igst,
            SUM(bi.amount) as total
     FROM bill_items bi JOIN bills b ON b.id = bi.bill_id
     WHERE date(b.created_at) BETWEEN date(?) AND date(?) AND b.status='active'
     GROUP BY bi.hsn, bi.gst_rate
     ORDER BY bi.gst_rate`
  ).all(from, to);
  return rows;
}

function getProfitReport({ from, to }) {
  const rows = db.prepare(
    `SELECT bi.medicine_name as name, bi.quantity,
       bi.price as sale_price,
       COALESCE((SELECT purchase_price FROM batches WHERE id = bi.batch_id), 0) as cost,
       (bi.price - COALESCE((SELECT purchase_price FROM batches WHERE id = bi.batch_id), 0)) * bi.quantity as profit,
       b.created_at
     FROM bill_items bi JOIN bills b ON b.id = bi.bill_id
     WHERE date(b.created_at) BETWEEN date(?) AND date(?) AND b.status='active'
     ORDER BY profit DESC`
  ).all(from, to);
  const totalProfit = rows.reduce((s, r) => s + r.profit, 0);
  return { rows, total_profit: totalProfit };
}

function getDaybook({ date }) {
  const bills = db.prepare(
    `SELECT id, bill_number, customer_name, total, payment_mode, payment_status, created_at
     FROM bills WHERE date(created_at) = date(?) AND status='active' ORDER BY id`
  ).all(date);
  const returns = db.prepare(
    `SELECT * FROM returns WHERE date(created_at) = date(?) ORDER BY id`
  ).all(date);
  const purchases = db.prepare(
    `SELECT p.*, s.name as supplier_name FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id
     WHERE date(p.purchase_date) = date(?) ORDER BY p.id`
  ).all(date);
  const cash_in = bills.filter((b) => b.payment_mode === 'cash' && b.payment_status === 'paid').reduce((s, b) => s + b.total, 0);
  const cash_out = purchases.filter((p) => p.payment_mode === 'cash').reduce((s, p) => s + (p.amount_paid || 0), 0);
  return { bills, returns, purchases, cash_in, cash_out };
}

// ------------------------------------------------------------------
// AUDIT LOG
// ------------------------------------------------------------------
function audit(action, entity, entity_id, details) {
  try {
    db.prepare(
      'INSERT INTO audit_log (action, entity, entity_id, details) VALUES (?, ?, ?, ?)'
    ).run(action, entity, entity_id, String(details || ''));
  } catch (_) {}
}

function getAuditLog({ limit = 200 } = {}) {
  return db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(limit);
}

// ------------------------------------------------------------------
// PURCHASE RETURNS (returns to supplier / debit notes)
// ------------------------------------------------------------------
function savePurchaseReturn(r) {
  const tx = db.transaction((ret) => {
    let subtotal = 0, gst_total = 0;
    for (const it of ret.items) {
      const amt = it.purchase_price * it.quantity;
      subtotal += amt;
      gst_total += +(amt * ((it.gst_rate || 0) / 100)).toFixed(2);
    }
    const total = +(subtotal + gst_total).toFixed(2);
    const rnum = 'PR' + Date.now().toString().slice(-10);
    const info = db.prepare(
      `INSERT INTO purchase_returns
       (return_number, purchase_id, supplier_id, return_date, subtotal, gst_amount, total, reason, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(rnum, ret.purchase_id || null, ret.supplier_id || null,
      ret.return_date || new Date().toISOString().slice(0, 10),
      subtotal, gst_total, total, ret.reason || '', ret.notes || '');
    const rid = info.lastInsertRowid;

    const itemStmt = db.prepare(
      `INSERT INTO purchase_return_items
       (purchase_return_id, purchase_item_id, medicine_id, batch_id, medicine_name, batch_no, quantity, purchase_price, amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const stockStmt = db.prepare('UPDATE batches SET stock = stock - ? WHERE id = ? AND stock >= ?');
    for (const it of ret.items) {
      itemStmt.run(rid, it.purchase_item_id || null, it.medicine_id, it.batch_id,
        it.medicine_name, it.batch_no || '', it.quantity, it.purchase_price, it.purchase_price * it.quantity);
      if (it.batch_id) {
        const b = db.prepare('SELECT stock FROM batches WHERE id = ?').get(it.batch_id);
        if (b && b.stock < it.quantity) throw new Error(`Insufficient stock for ${it.medicine_name}`);
        stockStmt.run(it.quantity, it.batch_id, it.quantity);
      }
    }
    // Reduce supplier balance (debit note reduces what we owe them)
    if (ret.supplier_id) {
      db.prepare('UPDATE suppliers SET balance = balance - ? WHERE id = ?').run(total, ret.supplier_id);
    }
    audit('create', 'purchase_return', rid, rnum);
    return db.prepare('SELECT * FROM purchase_returns WHERE id = ?').get(rid);
  });
  return tx(r);
}

function getPurchaseReturns({ from = null, to = null } = {}) {
  let q = `
    SELECT pr.*, s.name as supplier_name
    FROM purchase_returns pr LEFT JOIN suppliers s ON s.id = pr.supplier_id
    WHERE 1=1`;
  const params = [];
  if (from) { q += ' AND date(pr.return_date) >= date(?)'; params.push(from); }
  if (to)   { q += ' AND date(pr.return_date) <= date(?)'; params.push(to); }
  q += ' ORDER BY pr.id DESC LIMIT 500';
  return db.prepare(q).all(...params);
}

function getPurchaseReturn(id) {
  const r = db.prepare('SELECT * FROM purchase_returns WHERE id = ?').get(id);
  if (!r) return null;
  r.items = db.prepare('SELECT * FROM purchase_return_items WHERE purchase_return_id = ?').all(id);
  return r;
}

// ------------------------------------------------------------------
// EXPIRED STOCK WRITE-OFF
// ------------------------------------------------------------------
function writeoffExpiredBatches(items) {
  // items = [{batch_id, medicine_id, quantity, reason}]
  const tx = db.transaction((rows) => {
    const stmt = db.prepare('UPDATE batches SET stock = stock - ? WHERE id = ? AND stock >= ?');
    const adjStmt = db.prepare(
      `INSERT INTO stock_adjustments (medicine_id, batch_id, adjustment_type, quantity, reason)
       VALUES (?, ?, 'writeoff', ?, ?)`
    );
    for (const row of rows) {
      const b = db.prepare('SELECT stock FROM batches WHERE id = ?').get(row.batch_id);
      if (!b) throw new Error(`Batch ${row.batch_id} not found`);
      if (b.stock < row.quantity) throw new Error(`Cannot write off more than available stock`);
      stmt.run(row.quantity, row.batch_id, row.quantity);
      adjStmt.run(row.medicine_id, row.batch_id, row.quantity, row.reason || 'Expired stock write-off');
      audit('writeoff', 'batch', row.batch_id, `qty:${row.quantity}`);
    }
  });
  tx(items);
  return { ok: true };
}

// ------------------------------------------------------------------
// SCHEMES / OFFERS
// ------------------------------------------------------------------
function getSchemes({ activeOnly = false } = {}) {
  const q = activeOnly
    ? 'SELECT * FROM schemes WHERE active = 1 ORDER BY name'
    : 'SELECT * FROM schemes ORDER BY name';
  return db.prepare(q).all();
}

function addScheme(s) {
  const info = db.prepare(
    `INSERT INTO schemes (name, scheme_type, discount_value, applies_to, medicine_id, category, min_qty, active, valid_from, valid_to, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    s.name, s.scheme_type || 'percent', s.discount_value || 0,
    s.applies_to || 'all', s.medicine_id || null, s.category || null,
    s.min_qty || 1, s.active != null ? s.active : 1,
    s.valid_from || null, s.valid_to || null, s.notes || null
  );
  return db.prepare('SELECT * FROM schemes WHERE id = ?').get(info.lastInsertRowid);
}

function updateScheme(s) {
  db.prepare(
    `UPDATE schemes SET name=?, scheme_type=?, discount_value=?, applies_to=?, medicine_id=?, category=?, min_qty=?, active=?, valid_from=?, valid_to=?, notes=? WHERE id=?`
  ).run(
    s.name, s.scheme_type || 'percent', s.discount_value || 0,
    s.applies_to || 'all', s.medicine_id || null, s.category || null,
    s.min_qty || 1, s.active != null ? s.active : 1,
    s.valid_from || null, s.valid_to || null, s.notes || null, s.id
  );
  return db.prepare('SELECT * FROM schemes WHERE id = ?').get(s.id);
}

function deleteScheme(id) {
  db.prepare('DELETE FROM schemes WHERE id = ?').run(id);
  return { ok: true };
}

// ------------------------------------------------------------------
// DRUG INTERACTIONS
// ------------------------------------------------------------------
function checkDrugInteractions(names) {
  // names = array of medicine/generic names
  if (!names || names.length < 2) return [];
  const warnings = [];
  const lower = names.map((n) => (n || '').toLowerCase());
  const all = db.prepare('SELECT * FROM drug_interactions').all();
  for (const row of all) {
    const aMatch = lower.find((n) => n.includes(row.drug_a.toLowerCase()) || row.drug_a.toLowerCase().includes(n));
    const bMatch = lower.find((n) => n.includes(row.drug_b.toLowerCase()) || row.drug_b.toLowerCase().includes(n));
    if (aMatch && bMatch && aMatch !== bMatch) {
      warnings.push(row);
    }
  }
  return warnings;
}

// ------------------------------------------------------------------
// PRESCRIPTION ATTACHMENTS
// ------------------------------------------------------------------
function addPrescriptionAttachment(data) {
  const info = db.prepare(
    'INSERT INTO prescription_attachments (bill_id, file_path, file_name) VALUES (?, ?, ?)'
  ).run(data.bill_id, data.file_path, data.file_name || '');
  return db.prepare('SELECT * FROM prescription_attachments WHERE id = ?').get(info.lastInsertRowid);
}

function getPrescriptionAttachments(bill_id) {
  return db.prepare('SELECT * FROM prescription_attachments WHERE bill_id = ? ORDER BY id').all(bill_id);
}

// ------------------------------------------------------------------
// SUPPLIER PAYMENTS (LEDGER)
// ------------------------------------------------------------------
function addSupplierPayment(p) {
  const info = db.prepare(
    `INSERT INTO supplier_payments (supplier_id, purchase_id, amount, mode, reference, notes, payment_date)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    p.supplier_id, p.purchase_id || null, p.amount,
    p.mode || 'cash', p.reference || null, p.notes || null,
    p.payment_date || new Date().toISOString().slice(0, 10)
  );
  // Reduce supplier balance
  db.prepare('UPDATE suppliers SET balance = balance - ? WHERE id = ?').run(p.amount, p.supplier_id);
  audit('payment', 'supplier', p.supplier_id, `₹${p.amount}`);
  return db.prepare('SELECT * FROM supplier_payments WHERE id = ?').get(info.lastInsertRowid);
}

function getSupplierLedger(supplier_id) {
  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(supplier_id);
  if (!supplier) return null;
  const purchases = db.prepare(
    'SELECT id, invoice_no, purchase_date, total, amount_paid, payment_status FROM purchases WHERE supplier_id = ? ORDER BY id DESC LIMIT 200'
  ).all(supplier_id);
  const payments = db.prepare(
    'SELECT * FROM supplier_payments WHERE supplier_id = ? ORDER BY id DESC LIMIT 200'
  ).all(supplier_id);
  return { supplier, purchases, payments };
}

// ------------------------------------------------------------------
// DOCTOR COMMISSION REPORT
// ------------------------------------------------------------------
function getDoctorCommissionReport({ from, to }) {
  const rows = db.prepare(
    `SELECT d.id, d.name, d.commission_percent, d.clinic, d.specialization,
       COUNT(b.id) as bill_count,
       COALESCE(SUM(b.total), 0) as total_billed,
       COALESCE(SUM(b.total) * d.commission_percent / 100, 0) as commission_amount
     FROM doctors d
     LEFT JOIN bills b ON b.doctor_id = d.id
       AND date(b.created_at) BETWEEN date(?) AND date(?)
       AND b.status = 'active'
     GROUP BY d.id
     ORDER BY commission_amount DESC`
  ).all(from, to);
  const total_commission = rows.reduce((s, r) => s + r.commission_amount, 0);
  return { rows, total_commission };
}

// ------------------------------------------------------------------
// SHIFT CLOSE / DAY-END REPORT
// ------------------------------------------------------------------
function getShiftCloseReport({ date }) {
  const d = date || new Date().toISOString().slice(0, 10);
  const bills = db.prepare(
    `SELECT payment_mode, payment_status,
       COUNT(*) as count, COALESCE(SUM(total), 0) as total,
       COALESCE(SUM(amount_paid), 0) as collected
     FROM bills WHERE date(created_at) = date(?) AND status = 'active'
     GROUP BY payment_mode, payment_status`
  ).all(d);

  const returns = db.prepare(
    `SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total
     FROM returns WHERE date(created_at) = date(?)`
  ).all(d)[0];

  const billsAll = db.prepare(
    `SELECT id, bill_number, customer_name, total, amount_paid, balance, payment_mode, payment_status, created_at
     FROM bills WHERE date(created_at) = date(?) AND status = 'active' ORDER BY id`
  ).all(d);

  const cash_sales = bills.filter((b) => b.payment_mode === 'cash').reduce((s, b) => s + b.collected, 0);
  const upi_sales  = bills.filter((b) => b.payment_mode === 'upi').reduce((s, b) => s + b.collected, 0);
  const card_sales = bills.filter((b) => b.payment_mode === 'card').reduce((s, b) => s + b.collected, 0);
  const credit_total = bills.filter((b) => b.payment_status !== 'paid').reduce((s, b) => s + (b.total - b.collected), 0);
  const gross_total = bills.reduce((s, b) => s + b.total, 0);

  return {
    date: d,
    bills: billsAll,
    summary: bills,
    returns,
    cash_sales,
    upi_sales,
    card_sales,
    credit_total,
    gross_total,
    net_collected: cash_sales + upi_sales + card_sales,
  };
}

// ------------------------------------------------------------------
// REORDER SUGGESTIONS
// ------------------------------------------------------------------
function getReorderSuggestions() {
  return db.prepare(
    `SELECT m.id, m.name, m.manufacturer, m.category, m.reorder_level, m.unit,
       COALESCE((SELECT SUM(stock) FROM batches WHERE medicine_id = m.id), 0) as current_stock,
       (SELECT supplier_id FROM batches WHERE medicine_id = m.id ORDER BY received_date DESC LIMIT 1) as last_supplier_id,
       (SELECT name FROM suppliers WHERE id = (
         SELECT supplier_id FROM batches WHERE medicine_id = m.id ORDER BY received_date DESC LIMIT 1
       )) as supplier_name,
       (SELECT purchase_price FROM batches WHERE medicine_id = m.id ORDER BY received_date DESC LIMIT 1) as last_cost,
       (SELECT mrp FROM batches WHERE medicine_id = m.id ORDER BY received_date DESC LIMIT 1) as last_mrp
     FROM medicines m
     WHERE m.archived = 0
       AND COALESCE((SELECT SUM(stock) FROM batches WHERE medicine_id = m.id), 0) <= m.reorder_level
     ORDER BY current_stock ASC`
  ).all();
}

// ------------------------------------------------------------------
// LICENSE
// ------------------------------------------------------------------
function getLicense() {
  return db.prepare('SELECT * FROM license_info WHERE id = 1').get() || null;
}

function setLicense(data) {
  const existing = db.prepare('SELECT id FROM license_info WHERE id = 1').get();
  if (existing) {
    db.prepare(
      'UPDATE license_info SET license_key=?, pharmacy_name=?, plan=?, activated_at=?, expires_at=?, machine_id=? WHERE id=1'
    ).run(data.license_key, data.pharmacy_name, data.plan, data.activated_at, data.expires_at, data.machine_id);
  } else {
    db.prepare(
      'INSERT INTO license_info (id, license_key, pharmacy_name, plan, activated_at, expires_at, machine_id) VALUES (1, ?, ?, ?, ?, ?, ?)'
    ).run(data.license_key, data.pharmacy_name, data.plan, data.activated_at, data.expires_at, data.machine_id);
  }
  return getLicense();
}

// ------------------------------------------------------------------
// CREDIT CUSTOMERS
// ------------------------------------------------------------------
function getCreditCustomers() {
  return db.prepare(
    `SELECT c.id, c.name, c.phone, c.balance, c.total_spent, c.visit_count,
       COUNT(b.id) as pending_bills,
       COALESCE(SUM(b.balance), 0) as outstanding
     FROM customers c
     LEFT JOIN bills b ON b.customer_id = c.id AND b.payment_status != 'paid' AND b.status = 'active'
     WHERE c.balance > 0
     GROUP BY c.id
     ORDER BY c.balance DESC`
  ).all();
}

function collectCustomerPayment({ customer_id, bill_id, amount, mode, notes }) {
  const tx = db.transaction(() => {
    const paid = parseFloat(amount) || 0;
    if (paid <= 0) throw new Error('Amount must be positive');

    if (bill_id) {
      const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(bill_id);
      if (!bill) throw new Error('Bill not found');
      const newBalance = Math.max(0, +(bill.balance - paid).toFixed(2));
      const newPaid = +(bill.amount_paid + paid).toFixed(2);
      const newStatus = newBalance <= 0 ? 'paid' : 'partial';
      db.prepare('UPDATE bills SET amount_paid=?, balance=?, payment_status=? WHERE id=?')
        .run(newPaid, newBalance, newStatus, bill_id);
    }

    db.prepare(
      `INSERT INTO payments (party_type, party_id, bill_id, amount, mode, kind, notes)
       VALUES ('customer', ?, ?, ?, ?, 'receipt', ?)`
    ).run(customer_id, bill_id || null, paid, mode || 'cash', notes || '');

    // Update customer balance
    const newCustBal = db.prepare('SELECT COALESCE(SUM(balance),0) s FROM bills WHERE customer_id=? AND status=\'active\'').get(customer_id).s;
    db.prepare('UPDATE customers SET balance=? WHERE id=?').run(newCustBal, customer_id);

    audit('payment', 'customer', customer_id, `₹${paid}`);
    return { ok: true };
  });
  return tx();
}

// ------------------------------------------------------------------
// BACKUP / RESTORE
// ------------------------------------------------------------------
function backup(targetPath) {
  const src = getDbPath();
  fs.copyFileSync(src, targetPath);
  return { ok: true, path: targetPath };
}

function restore(sourcePath) {
  const dest = getDbPath();
  try { db.close(); } catch (_) {}
  fs.copyFileSync(sourcePath, dest);
  // Re-open
  db = new Database(dest);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return { ok: true };
}

module.exports = {
  init, getDbPath,
  getSettings, saveSettings,
  getMedicines, getMedicineById, addMedicine, updateMedicine, deleteMedicine,
  addBatch, updateBatch, deleteBatch, importMedicinesCSV,
  getSuppliers, addSupplier, updateSupplier, deleteSupplier,
  getCustomers, findCustomerByPhone, addCustomer, updateCustomer, deleteCustomer, getCustomerHistory,
  getDoctors, addDoctor, updateDoctor, deleteDoctor,
  saveBill, getBill, getBills, cancelBill,
  savePurchase, getPurchase, getPurchases,
  saveReturn, getReturns,
  adjustStock,
  getDashboardStats, getSalesReport, getStockReport, getExpiryReport, getGstReport, getProfitReport, getDaybook,
  getAuditLog,
  backup, restore,
  // New features
  savePurchaseReturn, getPurchaseReturns, getPurchaseReturn,
  writeoffExpiredBatches,
  getSchemes, addScheme, updateScheme, deleteScheme,
  checkDrugInteractions,
  addPrescriptionAttachment, getPrescriptionAttachments,
  addSupplierPayment, getSupplierLedger,
  getDoctorCommissionReport,
  getShiftCloseReport,
  getReorderSuggestions,
  getLicense, setLicense,
  getCreditCustomers, collectCustomerPayment,
};

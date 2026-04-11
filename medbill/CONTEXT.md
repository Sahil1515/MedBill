# MedBill — Developer Context

> This file is the single source of truth for any developer (or AI session) picking up this codebase.
> It captures every architectural decision, every "why", every known issue, and the current state of the project.

---

## What This Is

A fully offline desktop pharmacy billing + ERP application for Indian pharmacies. Built entirely from scratch as a professional-grade product, not a demo. The target deployment is Windows 10+ (NSIS installer), developed and tested on macOS.

**Sold as subscription-licensed desktop SaaS** — license keys are issued per-pharmacy using an HMAC-signed base64 payload. No internet required; validation is offline. See `LICENSE_SECRET` in `src/main/ipc.js`.

**Core constraints that shaped every decision:**
1. 100% offline — no internet dependency ever
2. Must run on modest Windows hardware (low-RAM pharmacy counters)
3. Indian GST compliance (CGST/SGST/IGST split, HSN codes, A4 tax invoice)
4. Single-user (one billing terminal per pharmacy)
5. Data must never be lost — atomic SQLite transactions throughout

---

## Stack Decisions

### Electron 33
Chosen because: cross-platform desktop app with file system + native dialog access, ships as a single `.exe` installer. No web server needed — the app IS the server.

**Critical gotcha:** If `ELECTRON_RUN_AS_NODE=1` is set in the shell environment (common in dev setups), Electron behaves as plain Node.js and crashes with `Cannot read properties of undefined (reading 'whenReady')`. The npm scripts explicitly clear this: `ELECTRON_RUN_AS_NODE= electron .` using `cross-env`. Users should also remove the export from `~/.zshrc`.

### React 18 + Vite 5 (not CRA)
Vite was chosen over CRA because:
- Much faster build and HMR
- Simple config (`vite.config.js` is 17 lines)
- No ejecting needed for custom root
- Renderer root is `src/renderer/` with output to `dist/`

No UI library (no MUI, no Ant Design, no Chakra). Everything is plain CSS with CSS variables. Reason: no internet for npm installs at customer site, smaller bundle, full control over print styles.

### better-sqlite3 (not node-sqlite3, not sql.js)
- Synchronous API — no callback/promise hell in IPC handlers
- WAL mode for concurrent reads during print
- Must be rebuilt against Electron's Node version via `electron-rebuild` (`npm run rebuild`)
- The `postinstall` script runs `electron-builder install-app-deps` to handle this automatically

### No Redux / No Zustand / No external state
All state is either local React useState or fetched fresh via `window.api` IPC calls on every render/effect. The DB is the source of truth. This keeps the codebase simple and avoids stale state bugs.

---

## Process Architecture

```
Electron Main Process (Node.js)
  ├── main.js       — window creation, app lifecycle, native menus
  ├── database.js   — all SQLite queries (synchronous, better-sqlite3)
  ├── ipc.js        — ~40 ipcMain.handle() registrations
  └── preload.js    — contextBridge exposing window.api + window.events

Electron Renderer Process (Chromium + React)
  ├── main.jsx      — ReactDOM.createRoot mount
  ├── App.jsx       — top-level state (settings, theme, toast, tab routing)
  ├── pages/        — 11 page components
  ├── components/   — Modal, Receipt, Toast
  └── lib/helpers.js — pure utility functions
```

### IPC Pattern
Every IPC handler is wrapped in `wrap(fn)` from `ipc.js`:
```js
function wrap(fn) {
  return async (_evt, ...args) => {
    try { return { ok: true, data: await fn(...args) }; }
    catch (err) { return { ok: false, error: err.message }; }
  };
}
```
Every call from the renderer gets back `{ ok, data, error }`. This means the renderer never throws on IPC — it always checks `res.ok`. No unhandled promise rejections in the renderer.

### window.api (preload bridge)
`preload.js` uses `contextBridge.exposeInMainWorld('api', {...})` with `contextIsolation: true` and `nodeIntegration: false`. The renderer has zero Node.js access — it only talks through this typed API surface. This is the secure Electron v12+ pattern.

### window.events (menu → renderer)
Native menu actions (Ctrl+N, Backup, Restore) send IPC events from main to renderer: `mainWindow.webContents.send('nav', 'billing')` or `send('action', 'backup')`. The renderer subscribes in `App.jsx` via `window.events.onNav` and `window.events.onAction`.

---

## Database Schema

All 14 tables, with notes on non-obvious decisions:

### `medicines`
The medicine *master* record. Does NOT store price or stock. Those live in `batches`.
- `schedule`: OTC, H (prescription-only Schedule H), X (narcotic)
- `archived`: soft-delete flag, archived medicines still appear in old bills but not in billing search
- `barcode`: reserved for future scanner integration, currently unused in UI
- `reorder_level`: per-medicine threshold for low-stock alerts

### `batches`
The central inventory unit. One row = one physical batch received.
- `expiry` is stored as `YYYY-MM` text (not a full date) — standard pharma practice
- `stock` is the authoritative count — billing deducts from here, returns/cancellations add back
- Multiple batches per medicine = different prices, expiries, batch numbers can coexist
- FEFO (First Expiry First Out): billing queries batches `ORDER BY expiry ASC` — oldest expiry sold first

### `bills`
Sale headers. Notable columns:
- `bill_number`: generated as `MB{YYYYMMDD}{4-digit-seq}`, e.g. `MB202604100001`
- `cgst_amount`, `sgst_amount`, `igst_amount`, `gst_amount`: stored separately for GST report
- `round_off`: `Math.round(rawTotal) - rawTotal`, stored so it's auditable
- `status`: `active` or `cancelled` — never hard-deleted
- `payment_status`: `paid`, `partial`, `credit`

### `bill_items`
Sale line items. Captures a snapshot at time of sale:
- `medicine_name`, `batch_no`, `expiry`, `hsn`, `mrp` are denormalized — if medicine is edited later, old bills are unaffected
- `cgst`, `sgst`, `igst` per line — proportionally allocated based on discount factor

### `purchases` + `purchase_items`
Purchases create batches automatically in `savePurchase()`. Each `purchase_item` links to the batch it created/updated.

### `returns` + `return_items`
Linked back to original `bill_item_id`. `saveReturn()` adds stock back to the original batch via `batch_id`.

### `customers`
- `phone` has UNIQUE constraint — phone is the lookup key during billing
- `balance`, `total_spent`, `visit_count` are maintained by triggers in `saveBill()` and `cancelBill()`
- `allergies`: free text, displayed as a warning banner on the billing screen and customer history

### `settings`
Key-value store. Keys used:
- `pharmacy_name`, `address`, `phone`, `gst_number`, `license_number`, `state_code`
- `interstate_default`: `'0'` or `'1'` — sets IGST vs CGST+SGST default for new bills
- `receipt_format`: `'58mm'`, `'80mm'`, `'a4'`
- `footer_note`, `currency_symbol`
- `expiry_alert_days`: default `'60'`
- `low_stock_alert`: `'1'` or `'0'`
- `theme`: `'light'` or `'dark'`

### `audit_log`
Append-only. Written by `audit(action, entity, entity_id, details)` helper. Currently called on: bill created, bill cancelled, return processed, stock adjusted.

---

## Critical Business Logic

### GST Computation (in `saveBill`)
```
base_price = price / (1 + gst_rate/100)   // back-calculate base from inclusive price
discount_factor = 1 - (discount_percent / 100)
taxable_amount = base_price * qty * discount_factor
cgst = taxable_amount * (gst_rate / 2) / 100
sgst = cgst   // equal split
igst = taxable_amount * gst_rate / 100   // used if interstate
```
Intra-state → CGST + SGST. Inter-state → IGST only. Toggle per bill.

### Round-off
```
rawTotal = subtotal - discountAmount + gstTotal
total = Math.round(rawTotal)
round_off = total - rawTotal   // stored, shown on receipt
```

### Bill Number Generation
```sql
SELECT COUNT(*) FROM bills WHERE date(created_at) = date('now')
```
Sequence resets daily. Format: `MB` + `YYYYMMDD` + 4-digit zero-padded count.

### FEFO Batch Selection
Billing page calls `getMedicines({ search })` which joins batches and returns `current_batch`, `current_expiry`, `current_mrp`, `current_price` from the oldest-expiry batch with stock. The billing dropdown also fetches `all_batches` per medicine to allow override.

### Cancel Bill → Stock Restore
`cancelBill({ id, reason })` runs as a transaction:
1. Marks bill `status = 'cancelled'`
2. For each `bill_item`, adds `quantity` back to `batches.stock` via `batch_id`
3. Updates `customers.balance` and `total_spent` if applicable
4. Writes audit log entry

### Schema Migration (upgrade safety)
`createSchema()` uses `CREATE TABLE IF NOT EXISTS` — safe to run repeatedly.
`ensureColumn(table, col, def)` runs `ALTER TABLE ADD COLUMN` only if column is absent — handles DB files created by older app versions.
All `CREATE INDEX` statements are deferred to run after all `ensureColumn` calls, each wrapped in `try/catch` — avoids failure on columns that don't exist yet in old DBs.
`migrateLegacy()` moves data from old `medicines.price` + `medicines.stock` columns into the `batches` table if batches is empty.

---

## Renderer Architecture

### Routing
Single-page app with tab-based routing. `App.jsx` holds `tab` state. No React Router. Navigation is `setTab(id)` — fast and simple given ~11 pages. Menu events from Electron main use `window.events.onNav(target => setTab(target))`.

### Theme
`data-theme` attribute on `<html>` element switches CSS variable sets in `global.css`. Value persisted to `settings.theme` in SQLite. Loaded on app start in `App.jsx`.

### First Launch Gate
If `settings.pharmacy_name` is empty, the app shows only the Settings page (`firstLaunch` prop) before showing anything else. This ensures the pharmacy name is set before any bill is printed.

### Props flow
Every page receives `{ settings, showToast, goTo }` from `App.jsx`. No Context API. Simple and predictable.

---

## Receipt Printing

Three formats, all in `components/Receipt.jsx`:

### 58mm Thermal
Column width: 32 chars. Uses `padEnd`/`padStart` with monospace font. No HTML table.
Item line: `name (truncated to 18 chars) | qty | amount` all padded to fit 32 cols.

### 80mm Thermal
Column width: 42 chars. Same approach, wider.

### A4 Tax Invoice
Full HTML table layout. Includes:
- GSTIN, drug license, state code in header
- Columns: Sr, Medicine, Batch, Expiry, HSN, Qty, MRP, Rate, GST%, CGST, SGST/IGST, Amount
- Summary: subtotal, discount, CGST total, SGST total, round-off, grand total
- Amount in words (Indian Lakh/Crore system via `amountInWords()`)
- Customer/doctor if present
- Signature line

### Print CSS
`@media print { * { display: none } .receipt-wrap { display: block } }` — everything hidden except the receipt wrapper when `window.print()` is called.

---

## Key Utility Functions (`lib/helpers.js`)

| Function | Purpose |
|----------|---------|
| `fmt(n)` | Format as `₹1,23,456.00` (Indian locale) |
| `fmtDate(s)` | `15 Apr 2026` |
| `fmtDateTime(s)` | `15 Apr 2026, 03:45 PM` |
| `todayISO()` | `2026-04-15` |
| `isExpired(ym)` | True if `YYYY-MM` is in the past |
| `isExpiringSoon(ym, days)` | True if expiry within `days` days |
| `stockBadge(stock, reorder)` | Returns `{ cls, label }` for badge rendering |
| `parseCSV(text)` | Handles quoted fields, returns array of objects keyed by header |
| `num(s)` | Safe parse to float, returns 0 for NaN |
| `amountInWords(n)` | Indian Lakh/Crore words, e.g. "One Thousand Two Hundred Rupees Only" |

---

## CSS System

`global.css` uses CSS custom properties. Key variables:
```css
--primary, --primary-soft    /* blue tones */
--danger, --success, --warn  /* red/green/amber */
--bg, --surface, --border    /* layout backgrounds */
--text, --muted              /* typography */
```

Dark mode: `[data-theme="dark"]` overrides the same variables.

Key layout classes:
- `.app` → flex row: sidebar + main
- `.sidebar` → 220px fixed left
- `.main` → flex column: topbar + page
- `.page → .page-inner` → scrollable content area
- `.card` → white rounded container, `.flush` removes padding for tables
- `.grid-2`, `.grid-4` → CSS grid helpers
- `.row`, `.col` → flex helpers
- `.badge.green/.amber/.red/.blue/.cyan/.gray` → status pills
- `.ptabs → .ptab.active` → tab bar (used in Reports, Settings)
- `.billing-grid` → `1.7fr 1fr` split for billing page
- `w-58mm`, `w-80mm`, `w-a4` → receipt width containers

---

## File Ownership Map

| File | What to touch it for |
|------|---------------------|
| `src/main/database.js` | Schema changes, new queries, business logic |
| `src/main/ipc.js` | Adding a new IPC channel, `LICENSE_SECRET` |
| `src/main/preload.js` | Exposing a new IPC call to renderer |
| `src/main/main.js` | Window config, native menus, auto-backup scheduler, app lifecycle |
| `src/renderer/App.jsx` | Navigation, global state, theme, first-launch |
| `src/renderer/styles/global.css` | Visual design, new component styles |
| `src/renderer/lib/helpers.js` | New shared utilities |
| `src/renderer/components/Receipt.jsx` | Receipt layout / print changes |
| `src/renderer/pages/Billing.jsx` | Billing — barcode scanner, drug interactions, schemes, WhatsApp share, prescription attachment |
| `src/renderer/pages/PurchaseReturns.jsx` | Purchase returns / debit notes |
| `src/renderer/pages/CreditManagement.jsx` | Credit customers, payment collection |
| `src/renderer/pages/Schemes.jsx` | Discount scheme management |
| `src/renderer/pages/Reports.jsx` | All reports including shift-close and doctor commission |
| `src/renderer/pages/Suppliers.jsx` | Supplier list + payment ledger modal |
| `src/renderer/pages/Inventory.jsx` | Medicine list + write-off + reorder panel |
| `src/renderer/pages/Settings.jsx` | Settings + auto-backup + license key |
| `src/renderer/pages/*.jsx` | Other feature pages |

---

## Known Issues & Gotchas

### ELECTRON_RUN_AS_NODE
If you see `Cannot read properties of undefined (reading 'whenReady')`, the env var `ELECTRON_RUN_AS_NODE=1` is set globally. The npm scripts clear it with `ELECTRON_RUN_AS_NODE=` prefix but a globally exported value in `~/.zshrc` or `~/.zshenv` overrides this on macOS. Remove it from the shell profile permanently.

### CREATE INDEX before ensureColumn
Early versions crashed on first run with existing DBs because `CREATE INDEX ON medicines(barcode)` ran before `ensureColumn` added the `barcode` column. Fixed by removing all `CREATE INDEX` from the main `db.exec()` block and running them separately with `try/catch` after all `ensureColumn` calls.

### HAVING without GROUP BY
`getDashboardStats()` originally used `HAVING stock <= reorder_level` without `GROUP BY`. SQLite rejected this. Fixed by wrapping in a subquery: `SELECT * FROM (...) WHERE stock <= reorder_level`.

### Expiry as YYYY-MM text
Expiry dates are stored as `YYYY-MM` strings (standard pharma format). The full last-day-of-month date is computed at runtime: `new Date(y, m, 0)` (month is 1-indexed, day 0 = last day of prior month). SQL date comparisons use: `date(expiry || '-01', '+1 month', '-1 day')`.

### better-sqlite3 native rebuild
On `npm install`, `postinstall` runs `electron-builder install-app-deps` which rebuilds `better-sqlite3` against Electron's Node ABI. If you upgrade Electron, run `npm run rebuild` manually. Symptoms of ABI mismatch: `Error: The module was compiled against a different Node.js version`.

### Windows cross-compile from Mac
`npm run build:win` works for creating the unsigned NSIS installer on macOS without Wine. Code-signing for Windows (`certificateFile`, `certificatePassword` in electron-builder config) requires a Windows `.pfx` certificate. Not configured — the unsigned installer works for internal/direct distribution.

---

## What's Not Built Yet (Future Work)

- **Multi-terminal sync** — would require SQLite WAL + file sharing or a local HTTP API layer
- **electron-updater** — code stub present in main.js comments; requires GitHub releases + `electron-builder` publish config and `electron-updater` npm package
- **SMS gateway integration** — WhatsApp share opens wa.me web URL; direct SMS requires a third-party gateway (e.g., Twilio, MSG91)
- **Tally export** — XML format for Tally ERP import is well-defined; could be added as a report export
- **Drug license expiry alerts** — `license_number` stored in settings; needs a date field + dashboard alert

---

## Build Commands Reference

```bash
npm install              # Install all deps + rebuild better-sqlite3
npm run dev              # Hot-reload dev (Vite + Electron concurrently)
npm run build:renderer   # Compile React → dist/ (Vite production build)
npm start                # Build renderer + launch Electron from dist/
npm run build:win        # Full Windows .exe installer → release/
npm run build:mac        # Full macOS .dmg → release/
npm run rebuild          # Manually rebuild better-sqlite3 for Electron
```

---

## Data File Location at Runtime

| OS | SQLite path |
|----|------------|
| macOS (dev) | `~/Library/Application Support/medbill/medbill.db` |
| Windows | `C:\Users\<user>\AppData\Roaming\medbill\medbill.db` |

`app.getPath('userData')` resolves this correctly on both platforms.

---

## Sample Data

`sample-data/medicines.csv` — 53 medicines covering common Indian pharmacy categories:
Analgesic, Antibiotic, Antacid, Antihistamine, Cold, Cough, Diabetes, BP, Cholesterol, Cardiac, Thyroid, Supplement, Antiseptic, First Aid, PPE, Topical, ENT, Rehydration, Pediatric, Device.

Import via: Inventory → Import CSV.

---

---

## New Features Added in v2.0.0

### Billing Enhancements
- **Barcode Scanner** — USB HID scanners (act as keyboard) detected via fast-keypress buffering. If characters arrive within 100ms and end with Enter, the buffer is treated as a barcode and triggers an exact-match medicine lookup.
- **Drug Interaction Warnings** — 15 pre-seeded common interactions (e.g. warfarin+aspirin, simvastatin+erythromycin). Shown as colored banner in billing. Major interactions require confirmation before saving.
- **Scheme / Offer Application** — Active schemes loaded on billing open; user can apply from a dropdown. Percent discount schemes auto-set the discount field.
- **WhatsApp Bill Sharing** — After save, opens `wa.me/91{phone}?text=...` with bill summary. Requires customer phone number.
- **Prescription Attachment** — After save, attach image/PDF via file picker. Stored path in `prescription_attachments` table; can be reopened via `shell.openPath`.

### New Pages (14 → 17 pages)
- **Purchase Returns** (`/purchase_returns`) — Debit notes for goods returned to supplier. Links to original purchase invoice, deducts stock from batches, reduces supplier balance.
- **Credit Management** (`/credit`) — Lists all customers with `balance > 0`. Click to collect payment against a specific bill or as a general payment.
- **Schemes & Offers** (`/schemes`) — Full CRUD for discount schemes. Types: percent, flat, bogo. Can apply to all medicines, a category, or a specific medicine.

### New Report Tabs
- **Shift Close** — End-of-day summary: gross total, net collected by mode (cash/UPI/card), credit outstanding, returns. Exportable.
- **Doctor Commission** — Per-doctor: bill count, total billed, commission %. Calculates payable amount. Exportable.

### Supplier Ledger
- Per-supplier ledger modal in Suppliers page. Shows all purchases, all payments, running balance. Record payments (cash/cheque/NEFT/UPI) with reference numbers.

### Inventory Improvements
- **Expired Stock Write-off** — Scans for expired batches with stock > 0. Confirm quantities to write off. Records in `stock_adjustments` with `adjustment_type = 'writeoff'`.
- **Reorder Suggestions** — One-click panel listing all medicines at/below reorder level with suggested qty, last supplier, last cost. Exportable as CSV for sending to suppliers.

### Auto-Backup Scheduler
- Configure a folder in Settings → Backup → Auto-Backup.
- Runs once on startup and every 24 hours thereafter.
- Keeps last 30 daily `.db` files. Old ones auto-deleted.
- Triggered by `main.js:scheduleAutoBackup()` via `setInterval`.

### License Key System
- Offline HMAC-SHA256 validation. No internet required.
- Key format: `base64(JSON({ pharmacy_name, plan, expires_at, sig }))`
- `sig = HMAC-SHA256(pharmacy_name|plan|expires_at, LICENSE_SECRET).slice(0, 16)`
- Change `LICENSE_SECRET` in `src/main/ipc.js` before shipping.
- To generate a key: call `window.api.generateLicense({ pharmacy_name, plan, expires_at })` from DevTools console.
- License stored in `license_info` table. Shown in Settings → License tab.

### New DB Tables
`purchase_returns`, `purchase_return_items`, `schemes`, `drug_interactions` (15 rows pre-seeded), `prescription_attachments`, `supplier_payments`, `license_info`

---

## Shipping as Subscription SaaS

### Issuing License Keys
Open DevTools console in a running app (dev mode):
```js
const r = await window.api.generateLicense({ pharmacy_name: 'ABC Pharmacy', plan: 'pro', expires_at: '2027-01-01' });
console.log(r.data.key); // copy this to the customer
```
Or build a small Node.js script using the same HMAC logic from `ipc.js`.

### Plans
| Plan     | Suggested Price | Notes |
|----------|----------------|-------|
| starter  | ₹499/mo | 1 terminal |
| pro      | ₹999/mo | Barcode, auto-backup |
| clinic   | ₹1,999/mo | Multi-doctor, full reports |

### Delivery
1. `npm run build:win` → unsigned NSIS `.exe` in `release/`
2. Share via WhatsApp or Google Drive
3. Remote setup via AnyDesk (15 min)
4. Issue license key from your admin tool

---

*Last updated: 2026-04-11. App version: 2.0.0.*

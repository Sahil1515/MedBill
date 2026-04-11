# MedBill — Professional Pharmacy Billing Software

A full-featured, 100% offline pharmacy management and billing system for Indian pharmacies. Built with Electron + React + SQLite.

---

## Features

### Billing & Sales
- Fast billing with live medicine search (keyboard-navigable dropdown)
- FEFO batch selection — oldest expiry sold first automatically
- Per-item batch override for manual batch selection
- GST computation: CGST+SGST (intra-state) or IGST (inter-state) toggle
- Discount (% or flat), round-off to nearest rupee
- Payment modes: Cash, UPI, Card, Credit
- Partial payment tracking with outstanding balance
- Print receipts in 58mm thermal, 80mm thermal, or A4 tax invoice format
- Saved bill view with re-print at any time

### Inventory Management
- Medicine master with batch tracking
- Multiple batches per medicine (different expiry/price)
- Stock filters: All / Low Stock / Out of Stock / Expiring Soon
- Rack location, schedule (H / OTC / X), reorder level per medicine
- Barcode field for future scanner integration
- CSV import/export (bulk load from spreadsheet)
- Stock adjustment (damage, theft, correction)

### Purchases
- Full purchase entry with per-item: batch, expiry, qty, free qty, purchase price, MRP, sale price, GST
- Grand total with subtotal / GST / discount / other charges
- Linked to supplier; updates batch stock automatically
- Purchase history with detail view

### Customers & Doctors
- Customer profiles: age, gender, blood group, allergies
- Full billing history per customer with allergy warning banner
- Outstanding balance tracking
- Doctor master with specialization, registration number, commission %

### Suppliers
- Supplier CRUD with GST, drug license, contact details
- Running balance / ledger ready

### Reports (7 tabs)
| Report | What it shows |
|--------|---------------|
| Sales Report | Bills in date range, summary stats, CSV export |
| Stock Report | Current stock with cost & MRP valuation |
| GST Report | HSN-wise CGST/SGST/IGST with totals row |
| Expiry Report | Batches expiring within configurable window |
| Profit Report | Sale price vs purchase price per bill line |
| Daybook | Daily cash in/out, bills, purchases for a date |
| Audit Log | Every create/cancel/adjust action timestamped |

### Returns
- Sales return against original bill number
- Per-item, per-qty return selection
- Refund mode: Cash / UPI / Credit Note
- Stock automatically restored on return

### Bill History
- Search by bill number, customer name, phone
- Date range filter
- Cancel bill with reason (stock restored, audit recorded)
- View + reprint any past bill

### Settings
- Pharmacy name, address, phone, GSTIN, drug license, state code
- Receipt format selection (58mm / 80mm / A4)
- Footer note, currency symbol
- Expiry alert window (days)
- Low stock dashboard alerts toggle
- Backup / Restore database
- Show database file location

### Security & Data
- 100% offline — no internet required for any feature
- All data stored locally in SQLite (WAL mode)
- Atomic transactions — no partial saves
- Backup to any folder; restore from backup file
- Audit log for all critical operations

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron 33 |
| UI framework | React 18 + Vite 5 |
| Database | SQLite via better-sqlite3 11 |
| Styling | Plain CSS with CSS variables (light/dark) |
| Packaging | electron-builder (NSIS for Windows, DMG for Mac) |

No external UI library, no cloud dependency, no telemetry.

---

## Project Structure

```
medbill/
├── src/
│   ├── main/
│   │   ├── main.js          # Electron main process, window, menus
│   │   ├── database.js      # All SQLite queries and business logic
│   │   ├── ipc.js           # IPC handlers (main ↔ renderer bridge)
│   │   └── preload.js       # Exposes window.api to renderer safely
│   └── renderer/
│       ├── main.jsx         # React entry point
│       ├── App.jsx          # Sidebar nav, routing, theme toggle
│       ├── styles/
│       │   └── global.css   # Full design system (variables, components)
│       ├── lib/
│       │   └── helpers.js   # fmt, fmtDate, amountInWords, parseCSV, etc.
│       ├── components/
│       │   ├── Modal.jsx    # Reusable modal with ESC support
│       │   ├── Receipt.jsx  # Thermal (58/80mm) + A4 invoice renderers
│       │   └── Toast.jsx    # Notification toasts
│       └── pages/
│           ├── Dashboard.jsx
│           ├── Billing.jsx
│           ├── Inventory.jsx
│           ├── Purchases.jsx
│           ├── Customers.jsx
│           ├── Suppliers.jsx
│           ├── Doctors.jsx
│           ├── Reports.jsx
│           ├── Returns.jsx
│           ├── History.jsx
│           └── Settings.jsx
├── sample-data/
│   └── medicines.csv        # 53 sample medicines for demo
├── build/
│   └── icon.png             # App icon (replace with your own)
├── dist/                    # Compiled renderer output (gitignore)
├── package.json
└── vite.config.js
```

---

## Development Setup

### Prerequisites
- Node.js 18+
- npm 9+
- macOS / Windows / Linux

### Install dependencies

```bash
cd medbill
npm install
```

### Run in development mode

```bash
npm run dev
```

This starts two processes in parallel:
1. `vite` dev server on `http://localhost:5173`
2. Electron loading from the dev server (hot reload enabled)

> **macOS note:** If you see `Cannot read properties of undefined (reading 'whenReady')`, you have `ELECTRON_RUN_AS_NODE=1` set globally in your shell. Fix it:
> ```bash
> # Remove from ~/.zshrc or ~/.zshenv, then:
> unset ELECTRON_RUN_AS_NODE
> npm run dev
> ```

### Run production build locally

```bash
npm run build:renderer   # Compile React to dist/
npm start                # Launch Electron loading from dist/
```

---

## Loading Sample Data

1. Launch the app and complete first-launch settings.
2. Go to **Inventory** → click **Import CSV**.
3. Select `sample-data/medicines.csv`.
4. 53 medicines will be imported with batches, pricing, and stock levels.

### CSV format for medicines import

The CSV must have these columns (order doesn't matter, header required):

```
name, generic_name, manufacturer, category, unit, hsn, gst_rate,
schedule, rack_location, reorder_level, batch_no, expiry,
purchase_price, mrp, sale_price, stock
```

- `expiry` format: `YYYY-MM` (e.g. `2027-06`)
- `unit`: tab, cap, bottle, sachet, tube, strip, pcs
- `schedule`: OTC, H, X
- `gst_rate`: 0, 5, 12, 18
- Missing optional fields are imported as blank/default

---

## Building Installers

### Windows (.exe installer)

Run this from macOS (cross-compilation via wine is not needed — electron-builder handles it):

```bash
npm run build:win
```

Output: `dist-electron/MedBill Setup 1.0.0.exe`

The NSIS installer:
- Installs to `C:\Program Files\MedBill`
- Creates Desktop + Start Menu shortcuts
- One-click uninstall from Programs
- Data stored in `%APPDATA%\medbill\` (never deleted on uninstall)

### macOS (.dmg)

```bash
npm run build:mac
```

Output: `dist-electron/MedBill-1.0.0.dmg`

---

## Database

SQLite file location:

| OS | Path |
|----|------|
| Windows | `C:\Users\<user>\AppData\Roaming\medbill\medbill.db` |
| macOS | `~/Library/Application Support/medbill/medbill.db` |

Find it from within the app: **Settings → Backup → Show DB Location**

### Schema overview

```
suppliers          — supplier master
medicines          — medicine master (name, HSN, GST rate, rack, schedule)
batches            — one row per batch per medicine (stock lives here)
customers          — patient profiles with allergy/balance tracking
doctors            — doctor master
purchases          — purchase headers
purchase_items     — purchase line items (links to batches)
bills              — sale headers (GST split, round-off, payment status)
bill_items         — sale line items (per-batch, per-GST-rate)
returns            — sales return headers
return_items       — return line items
stock_adjustments  — manual stock edits with reason
payments           — payment ledger (in/out per party)
audit_log          — immutable action trail
settings           — key-value store for app config
```

### Backup & Restore

**Backup:** Settings → Backup → Backup Now → choose save location.  
The backup is a plain SQLite file you can copy anywhere (USB drive, Google Drive, email).

**Restore:** Settings → Backup → Restore from File → select backup file → app reloads.

**Tip:** On Windows, point Google Drive or Dropbox sync at  
`C:\Users\<user>\AppData\Roaming\medbill\` for automatic cloud backup.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | New Bill |
| `↑` / `↓` | Navigate medicine search dropdown |
| `Enter` | Select medicine from dropdown |
| `Escape` | Close dropdown / modal |
| `Ctrl+P` | Print (on bill view / receipt view) |

---

## GST Compliance

- Supports CGST + SGST split for **intra-state** sales (default)
- Switch to **IGST** per bill for inter-state sales
- HSN code stored per medicine for GST Report
- GST Report groups by HSN + rate with taxable value, CGST, SGST, IGST columns
- A4 tax invoice includes: GSTIN, HSN, batch, expiry, amount in words, signature line

---

## Printing

Three receipt formats selectable in Settings:

| Format | Use case |
|--------|----------|
| 58mm thermal | Small counter printer (Rongta, TVS) |
| 80mm thermal | Standard POS thermal (Epson TM-T20) |
| A4 tax invoice | Laser/inkjet — for GST-registered buyers |

Print via `Ctrl+P` or the **Print** button on any bill view.  
The `@media print` CSS hides all app chrome — only the receipt is printed.

---

## Updating / Upgrading

The app performs **automatic schema migration** on every launch:
- New columns are added with `ALTER TABLE ... ADD COLUMN` if missing
- Legacy `price`/`stock` columns from v1 are migrated to the batch system
- No manual migration steps required

---

## Known Limitations

- No multi-user / multi-terminal support (single SQLite file)
- No network sync (by design — fully offline)
- Barcode scanner integration requires additional hardware driver setup
- Cross-compilation for Windows on macOS requires `wine` for code-signing; the unsigned installer works for internal use

---

## License

MIT — free for personal and commercial use.

---

*Built for Indian pharmacies. Works offline. No subscriptions.*

const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const db = require('./database');
const { registerIpc } = require('./ipc');

const isDev = process.env.NODE_ENV === 'development';
let mainWindow;
let autoBackupTimer = null;

function scheduleAutoBackup() {
  if (autoBackupTimer) { clearInterval(autoBackupTimer); autoBackupTimer = null; }
  const settings = db.getSettings();
  if (settings.auto_backup_enabled !== '1') return;
  const folder = settings.auto_backup_folder;
  if (!folder || !fs.existsSync(folder)) return;

  // Run once on startup, then every 24 hours
  const doBackup = () => {
    try {
      const fname = `medbill-auto-${new Date().toISOString().slice(0, 10)}.db`;
      const dest = path.join(folder, fname);
      // Skip if today's backup already exists
      if (!fs.existsSync(dest)) {
        db.backup(dest);
        // Keep only last 30 backups
        const files = fs.readdirSync(folder)
          .filter((f) => f.startsWith('medbill-auto-') && f.endsWith('.db'))
          .sort();
        if (files.length > 30) {
          files.slice(0, files.length - 30).forEach((f) => {
            try { fs.unlinkSync(path.join(folder, f)); } catch (_) {}
          });
        }
      }
    } catch (e) {
      console.error('Auto-backup failed:', e.message);
    }
  };

  doBackup();
  autoBackupTimer = setInterval(doBackup, 24 * 60 * 60 * 1000);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 860,
    minWidth: 1180,
    minHeight: 680,
    backgroundColor: '#f5f7fb',
    title: 'MedBill — Pharmacy Management',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Bill',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow.webContents.send('nav', 'billing'),
        },
        { type: 'separator' },
        {
          label: 'Purchase Returns',
          click: () => mainWindow.webContents.send('nav', 'purchase_returns'),
        },
        {
          label: 'Credit Management',
          click: () => mainWindow.webContents.send('nav', 'credit'),
        },
        { type: 'separator' },
        {
          label: 'Backup Database',
          click: () => mainWindow.webContents.send('action', 'backup'),
        },
        {
          label: 'Restore Database',
          click: () => mainWindow.webContents.send('action', 'restore'),
        },
        {
          label: 'Run Auto-Backup Now',
          click: () => mainWindow.webContents.send('action', 'auto_backup'),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Open Data Folder',
          click: () => shell.showItemInFolder(db.getDbPath()),
        },
        {
          label: 'License & Activation',
          click: () => mainWindow.webContents.send('nav', 'settings'),
        },
        {
          label: 'About MedBill',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About MedBill',
              message: 'MedBill v2.0.0',
              detail:
                'Offline pharmacy management software\n\n' +
                'Billing · Inventory · Purchases · Returns · Customers · Suppliers · Doctors · Reports · GST\n' +
                'Barcode Scanner · Drug Interactions · Schemes · Auto-Backup · License Management\n\n' +
                '100% offline. All data stored locally.',
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  db.init();
  registerIpc();
  createWindow();
  scheduleAutoBackup();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Allow renderer to trigger re-schedule after settings change
require('electron').ipcMain.on('settings:changed', () => scheduleAutoBackup());

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

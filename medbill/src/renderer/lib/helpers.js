// Shared utility helpers used across renderer pages.

export const fmt = (n, symbol = '₹') => {
  const v = parseFloat(n) || 0;
  return `${symbol}${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const fmtDate = (s) => {
  if (!s) return '-';
  const d = new Date(s);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const fmtDateTime = (s) => {
  if (!s) return '-';
  const d = new Date(s);
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const isExpired = (ym) => {
  if (!ym) return false;
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return false;
  const exp = new Date(y, m, 0);
  return exp < new Date();
};

export const isExpiringSoon = (ym, days = 60) => {
  if (!ym) return false;
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return false;
  const exp = new Date(y, m, 0);
  const diff = (exp - new Date()) / 86400000;
  return diff >= 0 && diff <= days;
};

export const stockBadge = (stock, reorderLevel = 10) => {
  if (stock <= 0) return { cls: 'red', label: 'Out of stock' };
  if (stock <= reorderLevel) return { cls: 'amber', label: `Low (${stock})` };
  return { cls: 'green', label: `${stock}` };
};

export const parseCSV = (text) => {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ''));
  return lines.slice(1).map((line) => {
    const cols = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; continue; }
      if (c === ',' && !inQ) { cols.push(cur); cur = ''; continue; }
      cur += c;
    }
    cols.push(cur);
    const row = {};
    headers.forEach((h, i) => { row[h] = (cols[i] || '').trim(); });
    return row;
  });
};

export const num = (s) => {
  const v = typeof s === 'string' ? parseFloat(s.replace(/[^\d.-]/g, '')) : parseFloat(s);
  return isNaN(v) ? 0 : v;
};

export const amountInWords = (n) => {
  // Indian numbering
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const toWords = (x) => {
    if (x < 20) return a[x];
    if (x < 100) return b[Math.floor(x / 10)] + (x % 10 ? ' ' + a[x % 10] : '');
    if (x < 1000) return a[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' + toWords(x % 100) : '');
    return '';
  };
  const rupees = Math.floor(n);
  const paise = Math.round((n - rupees) * 100);
  if (rupees === 0 && paise === 0) return 'Zero Rupees';
  let s = '';
  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thou = Math.floor((rupees % 100000) / 1000);
  const rest = rupees % 1000;
  if (crore) s += toWords(crore) + ' Crore ';
  if (lakh) s += toWords(lakh) + ' Lakh ';
  if (thou) s += toWords(thou) + ' Thousand ';
  if (rest) s += toWords(rest);
  s = s.trim() + ' Rupees';
  if (paise) s += ' and ' + toWords(paise) + ' Paise';
  return s + ' Only';
};

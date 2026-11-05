// Parsing shared by every field type, in the browser and on the server. Canonical forms: amounts '-1234.50'
// (dot, fixed decimals), dates 'YYYY-MM-DD'. Nothing here may import React, server-only or grid.ts.

export const trimmed = (v: unknown): string => (v == null ? '' : String(v).trim());

/**
 * Digits of a whole-number text that may carry thousands grouping: '1,234', '1,23,456', '12,34,567'.
 * Plain digits pass through; null when a comma is not grouping ('12,5', '1,2345') or the text is not digits.
 */
export function stripGrouping(t: string): string | null {
  if (!t.includes(',')) return /^\d+$/.test(t) ? t : null;
  // Western (1,234,567) or Indian (1,23,456) groups, the last one always three digits.
  return /^\d{1,3}(,\d{2,3})*,\d{3}$/.test(t) ? t.replace(/,/g, '') : null;
}

/**
 * '1,23,456.5', '(1,234.50)', '1234.5-' (SAP trailing minus), '-12' → canonical with `scale` decimals.
 * '' stays ''. null when the text is not a number, has a comma that is not thousands grouping,
 * or has non-zero digits beyond `scale`.
 */
export function parseAmount(v: unknown, scale: number): string | null {
  let t = trimmed(v).replace(/\s/g, '');
  if (!t) return '';
  let negative = false;
  if (/^\(.*\)$/.test(t)) { negative = true; t = t.slice(1, -1); }
  if (t.endsWith('-')) { negative = !negative; t = t.slice(0, -1); }
  if (t.startsWith('-')) { negative = !negative; t = t.slice(1); } else if (t.startsWith('+')) t = t.slice(1);
  const m = /^([\d,]*)(?:\.(\d*))?$/.exec(t);
  if (!m || (!m[1] && !m[2])) return null;
  const digits = m[1] ? stripGrouping(m[1]) : '';
  if (digits === null) return null;
  const fraction = m[2] ?? '';
  if (/[1-9]/.test(fraction.slice(scale))) return null;
  const whole = (digits || '0').replace(/^0+(?=\d)/, '');
  const body = scale > 0 ? `${whole}.${fraction.slice(0, scale).padEnd(scale, '0')}` : whole;
  return negative && /[1-9]/.test(body) ? `-${body}` : body;
}

/** Move a decimal point exactly, without floating-point rounding. */
export function shiftAmount(value: string, by: number, minScale: number): string {
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = value.replace(/^-/, '').split('.');
  const digits = whole + fraction;
  const point = whole.length + by;
  const left = (point <= 0 ? '0' : digits.slice(0, point).padEnd(point, '0')).replace(/^0+(?=\d)/, '');
  const right = (point < 0 ? '0'.repeat(-point) + digits : digits.slice(point)).replace(/0+$/, '').padEnd(minScale, '0');
  const body = right ? `${left}.${right}` : left;
  return negative && /[1-9]/.test(body) ? `-${body}` : body;
}

const AMOUNT_SUFFIXES: Record<string, number> = {
  k: 3, thousand: 3, thousands: 3,
  l: 5, lac: 5, lacs: 5, lakh: 5, lakhs: 5,
  m: 6, mn: 6, mm: 6, million: 6, millions: 6,
  cr: 7, crore: 7, crores: 7,
  b: 9, bn: 9, billion: 9, billions: 9,
  t: 12, tn: 12, trillion: 12, trillions: 12
};

/** Amount entry: 1L, 2.5 Cr, 500K, 1 million or 1B -> the full base amount, with the currency's scale. */
export function parseAmountInput(value: unknown, scale: number): string | null {
  const text = trimmed(value);
  const parentheses = /^\(.*\)$/.test(text);
  const body = parentheses ? text.slice(1, -1) : text;
  const match = /^(.*?)\s*([a-z]+)(-?)$/i.exec(body);
  if (!match) return parseAmount(value, scale);
  const suffix = match[2].toLowerCase();
  const power = Object.hasOwn(AMOUNT_SUFFIXES, suffix) ? AMOUNT_SUFFIXES[suffix] : undefined;
  if (power === undefined) return null;
  const numeric = `${match[1]}${match[3]}`;
  if (!numeric.trim()) return null;
  const parsed = parseAmount(parentheses ? `(${numeric})` : numeric, scale + power);
  return parsed === null || parsed === '' ? parsed : shiftAmount(parsed, power, scale);
}

/** 1234567 → 12,34,567 (ALM formats amounts with en-IN grouping). */
export function groupIndian(int: string): string {
  if (int.length <= 3) return int;
  return `${int.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${int.slice(-3)}`;
}

/** Canonical amount for display; anything else is returned as is. */
export function formatAmount(v: string): string {
  if (!/^-?\d+(\.\d+)?$/.test(v)) return v;
  const negative = v.startsWith('-');
  const [whole, fraction] = v.replace('-', '').split('.');
  return `${negative ? '-' : ''}${groupIndian(whole)}${fraction !== undefined ? `.${fraction}` : ''}`;
}

const pad = (n: number) => String(n).padStart(2, '0');
function ymd(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (y < 1000 || date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * 'YYYY-MM-DD[T…]', 'YYYYMMDD', 'DD-MM-YYYY', 'DD.MM.YYYY', 'DD/MM/YYYY' or an Excel serial day → 'YYYY-MM-DD'.
 * '' for blank or SAP's 00000000; null when it is not a real date.
 */
export function parseDate(v: unknown): string | null {
  const t = trimmed(v);
  if (!t || /^0{8}$/.test(t)) return '';
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(t) ?? /^(\d{4})(\d{2})(\d{2})$/.exec(t);
  if (m) return ymd(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/.exec(t);
  if (m) return ymd(Number(m[3]), Number(m[2]), Number(m[1]));
  if (/^\d{5}$/.test(t) && Number(t) >= 10000) {
    // Excel serial day in the 1900 date system (10000-99999), as a pasted unformatted cell arrives.
    const date = new Date(Date.UTC(1899, 11, 30) + Number(t) * 86400000);
    return ymd(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }
  return null;
}

export const formatDate = (v: string): string => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v.slice(8, 10)}-${v.slice(5, 7)}-${v.slice(0, 4)}` : v);

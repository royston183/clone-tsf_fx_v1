// tests/support/odata-filter.ts
// The $filter subset the template sends, evaluated by the mock SAP server: contains(), eq, ge, le, and, or,
// parentheses; literals 'text' (quotes doubled), numbers, dates (YYYY-MM-DD) and true/false. Anything else throws,
// so a query the template should never build fails the test.
export type FilterRow = Record<string, unknown>;

/** Numbers numerically, booleans by value, everything else as text by code point (as SAP compares). */
export function compareValues(a: unknown, b: unknown): number {
  if (typeof b === 'number') return Number(a) - b;
  if (typeof a === 'number' && typeof b !== 'string') return a - Number(b);
  if (typeof a === 'boolean' || typeof b === 'boolean') return a === b ? 0 : a ? 1 : -1;
  const x = a == null ? '' : String(a), y = b == null ? '' : String(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

function tokenize(text: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === ' ') { i++; continue; }
    if ('(),'.includes(ch)) { out.push(ch); i++; continue; }
    if (ch === "'") {
      let j = i + 1, s = '';
      for (;;) {
        if (j >= text.length) throw new Error(`Unterminated string in ${text}`);
        if (text[j] === "'") { if (text[j + 1] === "'") { s += "'"; j += 2; continue; } break; }
        s += text[j++];
      }
      out.push(`'${s}`); // a leading quote marks a string token
      i = j + 1;
      continue;
    }
    let j = i;
    while (j < text.length && !" (),'".includes(text[j])) j++;
    out.push(text.slice(i, j));
    i = j;
  }
  return out;
}

const literalOf = (token: string): unknown => {
  if (token.startsWith("'")) return token.slice(1);
  if (token === 'true' || token === 'false') return token === 'true';
  if (/^\d{4}-\d{2}-\d{2}$/.test(token)) return token;
  if (/^-?\d+(\.\d+)?$/.test(token)) return Number(token);
  throw new Error(`Unsupported literal ${token}`);
};

export function compileFilter(text: string): (row: FilterRow) => boolean {
  const tokens = tokenize(text);
  let i = 0;
  const next = () => tokens[i++];
  const expect = (t: string) => { if (next() !== t) throw new Error(`Expected ${t} in ${text}`); };
  type Pred = (row: FilterRow) => boolean;
  function factor(): Pred {
    if (tokens[i] === '(') { next(); const e = expr(); expect(')'); return e; }
    if (tokens[i] === 'contains') {
      next(); expect('(');
      const prop = next();
      expect(',');
      const value = String(literalOf(next()));
      expect(')');
      return r => String(r[prop] ?? '').includes(value);
    }
    const prop = next(), op = next(), value = literalOf(next());
    if (op === 'eq') return r => compareValues(r[prop], value) === 0;
    if (op === 'ge') return r => compareValues(r[prop], value) >= 0;
    if (op === 'le') return r => compareValues(r[prop], value) <= 0;
    throw new Error(`Unsupported operator ${op}`);
  }
  function term(): Pred { let left = factor(); while (tokens[i] === 'and') { next(); const a = left, b = factor(); left = r => a(r) && b(r); } return left; }
  function expr(): Pred { let left = term(); while (tokens[i] === 'or') { next(); const a = left, b = term(); left = r => a(r) || b(r); } return left; }
  const pred = expr();
  if (i !== tokens.length) throw new Error(`Unexpected ${tokens[i]} in ${text}`);
  return pred;
}

/** `Amount desc,Deal asc` */
export function orderRows<T extends FilterRow>(rows: T[], orderby: string): T[] {
  const keys = orderby.split(',').map(p => { const [prop, dir = 'asc'] = p.trim().split(/\s+/); return { prop, dir: dir === 'desc' ? -1 : 1 }; });
  return [...rows].sort((a, b) => { for (const k of keys) { const c = compareValues(a[k.prop], b[k.prop]); if (c) return c * k.dir; } return 0; });
}

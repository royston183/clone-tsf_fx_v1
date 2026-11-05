import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const ALM = 'D:/SAP Tool/SAP - ALM Application/src/';
const COPIES = ['manualdata.css', 'trmrepay.css', 'tbdata.css', 'trmdeal.css', 'overview.css'];

describe('ALM stylesheets', () => {
  it.each(COPIES)('%s is a byte-identical copy of ALM', async name => {
    const alm = await readFile(`${ALM}${name}`).catch(() => null);
    if (!alm) return; // ALM is not on this machine (CI): nothing to compare against.
    expect((await readFile(`src/styles/${name}`)).equals(alm)).toBe(true);
  });
  it('kit.css never restyles an ALM class', async () => {
    const kit = await readFile('src/styles/kit.css', 'utf8');
    const selectors = kit.replace(/\/\*[\s\S]*?\*\//g, '').match(/[^{}]+(?=\{)/g) ?? [];
    // At-rule preludes such as "@media (...)" are not selectors; the rules inside them are still checked.
    for (const s of selectors.filter(x => !x.trim().startsWith('@'))) for (const part of s.split(',')) expect(part.trim()).toMatch(/\.(kit-[\w-]+|ds-modal\.small)/);
  });
});

describe('the list wrapper and in-panel pages', () => {
  const rules = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ');
  it('kit.css gives notices in the list wrapper the margins they had as children of .ds-app', async () => {
    expect(rules(await readFile('src/styles/kit.css', 'utf8'))).toContain('.kit-app-list>.notice{margin:0 18px 10px}');
  });
  it('the Normal skin applies its .ds-app notice and filter-bar rules to the list wrapper too', async () => {
    const skin = rules(await readFile('src/styles/normal/skin.css', 'utf8'));
    expect(skin).toMatch(/\[data-app-theme='normal'\] \.kit-app-list > \.notice[,{ ]/);
    expect(skin).toMatch(/\[data-app-theme='normal'\] \.kit-app-list > \.ds-filters[,{ ]/);
  });
  it('a record or grid page shown in the panel in place of the list draws no second card border', async () => {
    const kit = rules(await readFile('src/styles/kit.css', 'utf8'));
    expect(kit).toContain('.kit-app-list~.kit-record-page,.kit-app-list~.kit-grid-page{border:0;border-radius:0}');
  });
});

describe('Normal theme stylesheets', () => {
  const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
  type Rule = { selector: string; decls: string };
  // Parses flat CSS into top-level rules; throws on unbalanced braces or text outside a rule.
  const parse = (raw: string): Rule[] => {
    const css = strip(raw);
    const rules: Rule[] = [];
    let depth = 0, start = 0, open = -1;
    for (let i = 0; i < css.length; i++) {
      const c = css[i];
      if (c === '{') { if (depth === 0) open = i; depth++; }
      else if (c === '}') {
        depth--;
        if (depth < 0) throw new Error(`stray } at ${i}`);
        if (depth === 0) { rules.push({ selector: css.slice(start, open).trim(), decls: css.slice(open + 1, i) }); start = i + 1; }
      }
    }
    if (depth !== 0) throw new Error('unbalanced braces');
    if (css.slice(start).trim()) throw new Error('text outside a rule');
    return rules;
  };
  const declared = (r: Rule | undefined, decl: string) => !!r && r.decls.split(';').some(d => d.trim() === decl);
  /** Selectors that break the Normal scope rule; @media and @supports blocks are allowed and their rules checked too. */
  const unscoped = (css: string): string[] => parse(css).flatMap(r => {
    if (/^@keyframes\s+nt-[\w-]+$/.test(r.selector)) return [];
    if (/^@(media|supports)\s/.test(r.selector)) return unscoped(r.decls);
    if (r.selector.startsWith('@')) return [r.selector];
    return r.selector.split(',').map(x => x.trim()).filter(sel => {
      const classes = sel.match(/\.[\w-]+/g) ?? [];
      const scoped = sel.includes("[data-app-theme='normal']");
      const ntOnly = classes.length > 0 && classes.every(c => /^\.nt-/.test(c));
      return !(/^[\w\s.:#>+~*[\]='"()-]+$/.test(sel) && (scoped || ntOnly));
    });
  });
  it('normal CSS only applies under data-app-theme=normal or nt- classes', async () => {
    const { readdir } = await import('node:fs/promises');
    const files = (await readdir('src/styles/normal')).filter(f => f.endsWith('.css'));
    expect(files.length).toBeGreaterThanOrEqual(4);
    for (const f of files) expect(unscoped(await readFile(`src/styles/normal/${f}`, 'utf8')), f).toEqual([]);
  });
  it('the scope guard looks inside @media and @supports, and rejects other at-rules', () => {
    expect(unscoped("@media (max-width: 750px) { .nt-sidebar { left: 0; } [data-app-theme='normal'] .x { top: 0; } }")).toEqual([]);
    expect(unscoped('@media (max-width: 750px) { .sidebar { left: 0; } }')).toEqual(['.sidebar']);
    expect(unscoped('@supports (display: grid) { .nt-a .b { top: 0; } }')).toEqual(['.nt-a .b']);
    expect(unscoped('@keyframes rise { from { opacity: 0; } }')).toEqual(['@keyframes rise']);
    expect(unscoped('@keyframes nt-rise { from { opacity: 0; } }')).toEqual([]);
  });
  it('normal tokens have light and dark palettes', async () => {
    const rules = parse(await readFile('src/styles/normal/tokens.css', 'utf8'));
    expect(rules.map(r => r.selector)).toEqual([
      "[data-app-theme='normal']",
      "[data-theme='dark'] [data-app-theme='normal'],\n[data-theme='dark'][data-app-theme='normal']",
    ]);
    const [light, dark] = rules;
    expect(declared(light, '--primary-blue: #1265c8')).toBe(true);
    expect(declared(light, '--background: #f4f7fb')).toBe(true);
    expect(declared(light, '--bg: var(--background)')).toBe(true);
    expect(declared(light, '--space-1: 4px')).toBe(true);
    expect(declared(dark, '--background: #0d1724')).toBe(true);
    expect(declared(dark, '--surface: #14212f')).toBe(true);
  });
});

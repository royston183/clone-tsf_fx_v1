// Read-only visual audit of the development catalogue: desktop/phone, light/dark.
// Run with the app's dev servers available on 3100/3200. AUDIT_IDS limits a recheck.
// Evidence stays in the ignored records/evidence folder because it may contain business data.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../FrontEnd/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const folder = fileURLToPath(new URL('../records/evidence/screen-audit/', import.meta.url));
mkdirSync(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const filteredIds = process.env.AUDIT_IDS?.split(',').filter(Boolean);
const report = filteredIds && existsSync(`${folder}/audit.json`) ? JSON.parse(readFileSync(`${folder}/audit.json`, 'utf8')) : { variants: ['desktop-light', 'desktop-dark', 'mobile-light', 'mobile-dark'], screens: [], blockedWrites: 0 };
let errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/*', route => {
  const request = route.request();
  const isListRead = request.method() === 'POST' && /\/api\/modules\/[^/]+\/[^/]+\/query$/.test(new URL(request.url()).pathname);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && !isListRead) {
    report.blockedWrites++;
    return route.abort('blockedbyclient');
  }
  return route.continue();
});
const save = () => writeFileSync(`${folder}/audit.json`, JSON.stringify(report, null, 2));
async function measure() {
  return page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    const scrollWidth = Math.max(document.body.scrollWidth, document.documentElement.scrollWidth);
    const visible = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const insideScroll = el => {
      for (let parent = el.parentElement; parent && !parent.classList.contains('content'); parent = parent.parentElement) {
        const s = getComputedStyle(parent);
        if (/auto|scroll/.test(s.overflowX) && parent.scrollWidth > parent.clientWidth + 1) return true;
      }
      return false;
    };
    const clippedControls = [...document.querySelectorAll('.content button,.content input,.content select,.content textarea')].filter(visible).filter(el => {
      const r = el.getBoundingClientRect();
      return (r.left < -1 || r.right > viewport + 1) && !insideScroll(el);
    }).slice(0, 12).map(el => ({ tag: el.tagName, label: (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().slice(0, 90) }));
    const unavailable = [...document.querySelectorAll('h1,h2,[role=alert]')].filter(visible).map(el => el.textContent.trim()).filter(text => /Page not found|could not be opened|not available yet|Cannot read properties|Something went wrong/i.test(text));
    const brokenImages = [...document.querySelectorAll('.content img')].filter(visible).filter(el => el.complete && !el.naturalWidth).map(el => el.getAttribute('src'));
    const clippedHeadings = [...document.querySelectorAll('.content h1,.content h2,.slc-ref .page-title,.slc-ref .title')].filter(visible).filter(el => {
      if (insideScroll(el)) return false;
      const range = document.createRange();
      range.selectNodeContents(el);
      return [...range.getClientRects()].some(rect => rect.left < -1 || rect.right > viewport + 1);
    }).map(el => el.textContent.trim());
    return { viewport, scrollWidth, clippedControls, clippedHeadings, brokenImages, unavailable };
  });
}
try {
  await page.goto('http://127.0.0.1:3100/login', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Username').fill('demo');
  await page.getByPlaceholder('Enter your password').fill('demo');
  const captcha = await page.getByRole('img', { name: /Captcha characters/ }).getAttribute('aria-label');
  await page.getByRole('textbox', { name: 'Captcha code' }).fill(captcha.replace('Captcha characters: ', '').replaceAll(' ', ''));
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('http://127.0.0.1:3100/');
  const allEntries = await page.evaluate(async () => {
    const { pages } = await import('/src/config/catalog.ts');
    const walk = (nodes, parents = []) => nodes.flatMap(node => {
      const ids = [...parents, node.id];
      return [{ id: node.id, title: node.title, path: node.type === 'overview' ? '/' : '/' + ids.join('/'), type: node.type }, ...walk(node.children ?? [], ids)];
    });
    return [...walk(pages), { id: 'gallery', title: 'UI Gallery', path: '/gallery', type: 'gallery' }];
  });
  const entries = filteredIds ? allEntries.filter(entry => filteredIds.includes(entry.id)) : allEntries;
  console.log(`Auditing ${entries.length} screens in four display variants.`);
  for (const [index, entry] of entries.entries()) {
    errors = [];
    const screen = { ...entry, errors, variants: {} };
    try {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(`http://127.0.0.1:3100${entry.path}`, { waitUntil: 'domcontentloaded' });
      await page.locator('.content').waitFor({ state: 'visible', timeout: 30000 });
      if (['application', 'overview'].includes(entry.type)) await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      if (entry.type === 'overview') {
        await page.locator('.kit-ov-controls').waitFor({ timeout: 30000 });
        // A live source can fail while the page remains usable. Audit the completed
        // error state as well as successful figures, and record its source notices.
        await page.waitForFunction(() => [...document.querySelectorAll('.kit-ov-controls button')].some(button => button.textContent.trim() === 'Refresh' && !button.disabled), undefined, { timeout: 60000 });
        screen.sourceNotices = await page.locator('[role=alert]').allTextContents();
      }
      screen.notices = [];
      for (let attempt = 0; attempt < 5; attempt++) {
        const notice = page.locator('.std-result-overlay,.std-pop-overlay').filter({ visible: true }).first();
        if (!await notice.count()) break;
        screen.notices.push((await notice.innerText()).slice(0, 1500));
        const close = notice.getByRole('button', { name: /^(OK|Close|Got it)$/i }).first();
        if (!await close.count()) break;
        await close.click();
      }
      for (const [variant, width, theme] of [['desktop-light', 1440, 'light'], ['desktop-dark', 1440, 'dark'], ['mobile-light', 390, 'light'], ['mobile-dark', 390, 'dark']]) {
        await page.setViewportSize({ width, height: 1000 });
        const next = theme === 'dark' ? 'Night' : 'Day';
        const toggle = page.locator('.topbar').getByRole('button', { name: next, exact: true });
        if (await toggle.count()) await toggle.click();
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        screen.variants[variant] = await measure();
        await page.screenshot({ path: `${folder}/${entry.id}-${variant}.png`, fullPage: entry.id !== 'gallery', animations: 'disabled' });
      }
    } catch (error) {
      screen.failure = error.message;
      screen.failureNotices = await page.locator('[role=alert]').allTextContents().catch(() => []);
      await page.screenshot({ path: `${folder}/${entry.id}-audit-failure.png`, fullPage: true, animations: 'disabled' }).catch(() => undefined);
    }
    const existing = report.screens.findIndex(item => item.id === screen.id);
    if (existing >= 0) report.screens[existing] = screen; else report.screens.push(screen);
    save();
    const issues = Object.values(screen.variants).filter(v => v.scrollWidth > v.viewport + 1 || v.clippedControls.length || v.clippedHeadings.length || v.brokenImages.length || v.unavailable.length).length;
    console.log(`${index + 1}/${entries.length} ${entry.id}: ${screen.failure ? 'FAILED' : issues ? `${issues} layout findings` : 'OK'}`);
  }
  // Contact sheets keep the review manageable; full-resolution images are retained beside them.
  for (const variant of report.variants) {
    for (let start = 0; start < report.screens.length; start += 12) {
      const batch = report.screens.slice(start, start + 12).filter(s => s.variants[variant]);
      const cards = batch.map(s => `<section><h2>${s.id}</h2><div><img src="data:image/png;base64,${readFileSync(`${folder}/${s.id}-${variant}.png`).toString('base64')}"></div></section>`).join('');
      await page.setViewportSize({ width: 1536, height: 1000 });
      await page.setContent(`<html><head><style>*{box-sizing:border-box}body{margin:0;padding:16px;background:#e6ebf2;font:14px Arial}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}section{background:white;border:1px solid #bac8d8;border-radius:8px;overflow:hidden}h2{font-size:14px;margin:0;padding:10px}section div{height:360px;overflow:hidden;border-top:1px solid #dbe2ec}img{width:100%;display:block}</style></head><body><div class="grid">${cards}</div></body></html>`);
      await page.screenshot({ path: `${folder}/sheet-${variant}-${1 + start / 12}.png`, fullPage: true });
    }
  }
  save();
  console.log(JSON.stringify({ screens: report.screens.length, blockedWrites: report.blockedWrites, errors: report.screens.filter(s => s.errors.length || s.failure).map(s => s.id) }));
} finally { await browser.close(); }

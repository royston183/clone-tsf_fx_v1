// tests/e2e/tables.spec.ts
// Table headings line up with their cells: the heading's text starts where the column's text starts (left columns) or
// ends where it ends (amounts and numbers), within 2px, in the large list, table maintenance and an ALV report.
import { expect, test, type Locator } from '@playwright/test';
import { signIn } from './support';

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
});

interface Offset { column: string; side: 'left' | 'right'; gap: number }

/** Per column with text in its heading and its first detail cell: the side the cell's text sits on and the heading's distance from it. */
function offsets(table: Locator): Promise<Offset[]> {
  return table.evaluate(t => {
    const textBox = (el: Element): DOMRect | null => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: n => (n.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) });
      const node = walker.nextNode();
      if (!node) return null;
      const range = document.createRange();
      range.selectNodeContents(node);
      return range.getBoundingClientRect();
    };
    const heads = [...t.querySelectorAll('thead tr:first-child th')];
    const cells = [...(t.querySelector('tbody tr:not(.trm-sub)')?.querySelectorAll('td') ?? [])];
    return heads.flatMap((th, i) => {
      const td = cells[i];
      // A status tag pads its own text; a check box column has no text.
      if (!td || td.querySelector('.kit-status')) return [];
      const head = textBox(th), cell = textBox(td);
      if (!head || !cell) return [];
      const side = getComputedStyle(td).textAlign === 'right' ? 'right' as const : 'left' as const;
      return [{ column: th.textContent?.trim() ?? '', side, gap: Math.round(Math.abs(side === 'right' ? head.right - cell.right : head.left - cell.left)) }];
    });
  });
}
async function expectAligned(table: Locator, sides: ('left' | 'right')[]) {
  await expect(table.locator('tbody tr').first()).toBeVisible();
  const found = await offsets(table);
  for (const side of sides) expect(found.some(o => o.side === side), `a ${side} column in ${JSON.stringify(found)}`).toBe(true);
  for (const o of found) expect(o.gap, `${o.column} (${o.side})`).toBeLessThanOrEqual(2);
}

test('large list: headings line up with text and amount columns', async ({ page }) => {
  await page.goto('/samples/deals');
  await expectAligned(page.locator('section.ds-app .kit-list table.ds-table'), ['left', 'right']);
});

test('table maintenance: headings line up, numbers on the right', async ({ page }) => {
  await page.goto('/samples/time-buckets');
  await expectAligned(page.locator('section.ds-app table.ds-table').first(), ['left', 'right']);
});

test('ALV report: headings line up with text and amount columns', async ({ page }) => {
  await page.goto('/samples/cash-flow-lines?s.month=01&s.year=2026');
  await expectAligned(page.getByRole('table', { name: 'Cash Flow Lines' }), ['left', 'right']);
});

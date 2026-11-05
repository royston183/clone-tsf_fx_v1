// tests/unit/app-theme.test.ts
// The unit project runs in Node, so the root element is a stand-in with a dataset.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyAppTheme } from '@/lib/client/app-theme';

describe('applyAppTheme', () => {
  it('sets data-app-theme for normal and removes it for tiles', () => {
    const el = { dataset: {} } as unknown as HTMLElement;
    applyAppTheme('normal', el);
    expect(el.dataset.appTheme).toBe('normal');
    applyAppTheme('tiles', el);
    expect(el.dataset.appTheme).toBeUndefined();
  });

  it('keeps APP_THEME on one literal line the script and FS Sprint replace', () => {
    // Any app sets it to 'tiles' or 'normal', so this checks the line's shape, not the template default.
    expect(readFileSync('src/runtime.ts', 'utf8')).toMatch(/^export const APP_THEME = '(tiles|normal)' as 'tiles' \| 'normal';\r?$/m);
  });
});

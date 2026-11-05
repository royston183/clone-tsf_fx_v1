import { describe, expect, it } from 'vitest';
import { confirmsOnEnter } from '@/lib/client/keys';

// A stand-in for an element: only `closest` matters to the helper.
const target = (insideControl: boolean) => ({ closest: (selector: string) => (insideControl && selector.includes('button') ? {} : null) });

describe('confirmsOnEnter', () => {
  it('confirms on Enter when focus is not on a control', () => {
    expect(confirmsOnEnter({ key: 'Enter', target: target(false) })).toBe(true);
    expect(confirmsOnEnter({ key: 'Enter', target: null })).toBe(true);
  });
  it('leaves Enter on a focused button (Cancel, Back) to that button', () => {
    expect(confirmsOnEnter({ key: 'Enter', target: target(true) })).toBe(false);
  });
  it('ignores other keys', () => {
    expect(confirmsOnEnter({ key: 'Escape', target: target(false) })).toBe(false);
  });
});

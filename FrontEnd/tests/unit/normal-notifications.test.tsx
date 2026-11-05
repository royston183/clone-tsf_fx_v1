// tests/unit/normal-notifications.test.tsx
// The Normal navbar's bell and the shell's notification store behind it.
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationBell } from '@/components/normal/NotificationBell';
import { clearNotifications, dismissNotification, pushNotification } from '@/lib/client/notifications';
import { NavProvider } from '@/lib/client/nav';
import { miniDom, type MiniDom } from '../support/mini-dom';

let dom: MiniDom;
const mount = () => { dom = miniDom('/'); dom.render(<NavProvider><NotificationBell /></NavProvider>); };
const open = () => dom.click(dom.find('button.nt-notify'));
const change = (fn: () => void) => act(fn);
const note = (id: string, extra = {}) => ({ id, tone: 'pending' as const, title: `Note ${id}`, at: '2026-10-30', ...extra });

beforeEach(() => clearNotifications());
afterEach(() => { dom?.unmount(); vi.unstubAllGlobals(); });

describe('NotificationBell', () => {
  it('shows No notifications and no count when empty', () => {
    mount();
    expect(dom.findAll('.nt-nb-count')).toHaveLength(0);
    open();
    expect(dom.find('p.nt-nb-empty').textContent).toBe('No notifications');
  });
  it('counts what was pushed', () => {
    pushNotification(note('a')); pushNotification(note('b'));
    mount();
    expect(dom.find('.nt-nb-count').textContent).toBe('2');
  });
  it('replaces an entry with the same id', () => {
    pushNotification(note('a')); pushNotification(note('a', { title: 'Again' }));
    mount();
    expect(dom.find('.nt-nb-count').textContent).toBe('1');
    open();
    expect(dom.find('.nt-nb-body').textContent).toContain('Again');
  });
  it('an item with href navigates there and closes the panel', () => {
    pushNotification(note('a', { href: '/settings/appearance', detail: 'More' }));
    mount();
    open();
    expect(dom.findAll('.nt-nb-panel')).toHaveLength(1);
    dom.click(dom.find('button.nt-nb-item'));
    expect(location.pathname).toBe('/settings/appearance');
    expect(dom.findAll('.nt-nb-panel')).toHaveLength(0);
  });
  it('clearNotifications and dismissNotification update the count', () => {
    pushNotification(note('a')); pushNotification(note('b'));
    mount();
    change(() => dismissNotification('a'));
    expect(dom.find('.nt-nb-count').textContent).toBe('1');
    change(() => clearNotifications());
    expect(dom.findAll('.nt-nb-count')).toHaveLength(0);
  });
});

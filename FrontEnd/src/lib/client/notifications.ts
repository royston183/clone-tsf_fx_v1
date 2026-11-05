// The shell's notifications (the Normal navbar's bell): what the app wants the user to see. Kept in memory only, so a
// reload starts empty; any screen may push one.
import { useSyncExternalStore } from 'react';

export interface ShellNotification {
  id: string;
  tone: 'pending' | 'back' | 'rejected' | 'approved';
  title: string;
  detail?: string;
  at: string;
  href?: string;
}

let items: ShellNotification[] = [];
const listeners = new Set<() => void>();
const set = (next: ShellNotification[]) => { items = next; listeners.forEach(l => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** Adds a notification; one with the same id is replaced in place. */
export function pushNotification(n: ShellNotification): void {
  set(items.some(i => i.id === n.id) ? items.map(i => (i.id === n.id ? n : i)) : [...items, n]);
}
export function dismissNotification(id: string): void { set(items.filter(i => i.id !== id)); }
export function clearNotifications(): void { set([]); }
export function useNotifications(): ShellNotification[] { return useSyncExternalStore(subscribe, () => items, () => items); }

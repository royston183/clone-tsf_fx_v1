import { useState } from 'react';
import type { Unit } from '@/lib/report/types';
import { unitById } from '@/lib/report/units';

export interface UnitChoice {
  unit: Unit;
  /** The URL's `u` named a unit this page does not have: it was dropped (the page says so with the drill notice). */
  dropped: boolean;
  choose: (id: string) => void;
}
/** The unit last set (at open or by the user) and the URL's `u` at that moment. */
export interface UnitPick { id: string | null; seen: string | null }

/**
 * The unit a page shows: the URL's `u` when it is one of the page's units and differs from the `u` the last pick saw (a
 * new drill or way back names it), else the last pick. `dropped`: the URL's `u` is not one of the page's units. Pure.
 */
export function shownUnit(units: Unit[], url: string | null, pick: UnitPick): { unit: Unit; dropped: boolean } {
  const u = url || null;
  const valid = u !== null && units.some(x => x.id === u);
  return { unit: unitById(units, valid && u !== pick.seen ? u : pick.id), dropped: u !== null && !valid };
}

/**
 * The display unit of a report or dashboard. `?u=<unit id>` (a dashboard's unit carried on a drill and on the way back)
 * starts the page in that unit when it is one of the page's own units; anything else is dropped. A unit the user picks
 * wins until the URL names another one; without `u` the page starts in `initial` (remembered, or its first unit).
 * Derived during render, no effect: the URL's unit applies as soon as it changes.
 */
export function useUnit(units: Unit[], url: string | null, initial: () => string): UnitChoice {
  const [pick, setPick] = useState<UnitPick>(() => {
    const u = url || null;
    return { id: u !== null && units.some(x => x.id === u) ? u : initial(), seen: u };
  });
  const { unit, dropped } = shownUnit(units, url, pick);
  return { unit, dropped, choose: id => setPick({ id, seen: url || null }) };
}

// A page's own controls in the top bar (As of date, units, a page action), next to the global ones: the page renders
// <TopbarActions> anywhere in its tree and the controls appear in the top bar while the page is open.
import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const SlotContext = createContext<HTMLElement | null>(null);
export const TopbarSlotProvider = SlotContext.Provider;

export function TopbarActions({ children }: { children: ReactNode }) {
  const slot = useContext(SlotContext);
  return slot ? createPortal(children, slot) : null;
}

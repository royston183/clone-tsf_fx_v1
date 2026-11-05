import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { modalStack } from './Modal';
import { Maximize2, Minimize2, X } from 'lucide-react';

const readWide = (key?: string) => { try { return Boolean(key && localStorage.getItem(key) === '1'); } catch { return false; } };

/**
 * Right-hand side panel (ALM .ov-drawer) over a scrim; Esc closes; the widened state is remembered per storageKey.
 * Its action buttons go in `footer`, which stays at the bottom of the panel while the content scrolls.
 */
export function Drawer({ open, title, onClose, children, footer, storageKey }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; storageKey?: string }) {
  const [wide, setWide] = useState(() => readWide(storageKey));
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented && modalStack.size() === 0) onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open, onClose]);
  const toggleWide = () => setWide(w => { try { if (storageKey) localStorage.setItem(storageKey, w ? '0' : '1'); } catch { /* not remembered */ } return !w; });
  return createPortal(
    <>
      {open && <div className="ov-drawer-scrim" onClick={onClose} />}
      <aside className={`ov-drawer ${open ? 'open' : ''} ${wide ? 'wide' : ''}`} inert={!open} aria-label={title} aria-hidden={!open}>
        <div className="ov-drawer-head"><h2>{title}</h2><div className="ov-drawer-tools">
          <button className="icon-button" aria-label={wide ? 'Narrow' : 'Widen'} onClick={toggleWide}>{wide ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
          <button className="icon-button" aria-label="Close" onClick={onClose}><X size={17} /></button>
        </div></div>
        {children}
        {footer && <div className="kit-drawer-foot">{footer}</div>}
      </aside>
    </>,
    document.body
  );
}

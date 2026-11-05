// The Normal navbar's bell (LAS layout/NotificationBell.jsx): a count on the icon and a panel of what the shell holds
// (lib/client/notifications). An item with an href opens it. Closed by a click elsewhere or Escape.
import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCircle2, Clock, Undo2, XCircle } from 'lucide-react';
import { useRouter } from '@/lib/client/nav';
import { useNotifications, type ShellNotification } from '@/lib/client/notifications';

const ICONS = { pending: Clock, back: Undo2, rejected: XCircle, approved: CheckCircle2 };

/** `items` and `defaultOpen` let the UI Gallery draw it without touching the live store. */
export function NotificationBell({ items, defaultOpen = false }: { items?: ShellNotification[]; defaultOpen?: boolean } = {}) {
  const stored = useNotifications();
  const list = items ?? stored;
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const follow = (n: ShellNotification) => {
    setOpen(false);
    if (n.href) router.push(n.href);
  };
  const count = list.length;
  return (
    <div className="nt-nb" ref={box}>
      <button className="nt-icon-button nt-notify" aria-label={count ? `Notifications: ${count}` : 'Notifications'} aria-expanded={open} title="Notifications" onClick={() => setOpen(!open)}>
        <Bell size={17} />
        {count > 0 && <b className="nt-nb-count">{count > 99 ? '99+' : count}</b>}
      </button>
      {open && (
        <div className="nt-nb-panel" role="dialog" aria-label="Notifications">
          <header><h3>Notifications</h3></header>
          <div className="nt-nb-body">
            {count ? (
              <section>
                <h4>Latest <span>{count}</span></h4>
                <ul>
                  {list.map(n => {
                    const Icon = ICONS[n.tone];
                    return (
                      <li key={n.id}>
                        <button type="button" className="nt-nb-item" onClick={() => follow(n)}>
                          <i className={`nt-nb-icon nt-tone-${n.tone}`}><Icon size={15} aria-hidden="true" /></i>
                          <span><b>{n.title}</b>{n.detail && <small>{n.detail}</small>}</span>
                          <time>{n.at}</time>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : <p className="nt-nb-empty">No notifications</p>}
          </div>
        </div>
      )}
    </div>
  );
}

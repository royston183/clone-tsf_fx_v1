import { useRef, useState } from 'react';
import { moduleChange } from '@/lib/client/data';
import type { ErrorDetail, HttpError } from '@/lib/errors';
import type { Row, TabDef } from '@/lib/grid/types';
import type { ModuleDef } from '@/modules/types';
import { DeleteDialog } from '@/components/ui/DeleteDialog';
import type { SavedView } from './GridEditor';

export function DeleteConfirm<L>({ def, tab, rows, onClose, onDeleted }: { def: ModuleDef<L>; tab: TabDef<L>; rows: Row[]; onClose: () => void; onDeleted: (result: SavedView) => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [details, setDetails] = useState<ErrorDetail[]>([]);
  const inFlight = useRef(false);
  async function go() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage('');
    try {
      onDeleted(await moduleChange(def.id, tab.id, 'delete', rows.map(r => ({ ...Object.fromEntries(tab.keys.map(k => [k, r[k]])), ...(r.__etag ? { __etag: r.__etag } : {}) }))));
    } catch (error) {
      const err = error as HttpError;
      setMessage(err.message);
      setDetails(err.details ?? []);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return <DeleteDialog title={`Delete ${rows.length > 1 ? tab.noun[1] : tab.noun[0]}`} rows={rows} columns={tab.columns} fields={tab.grid} keys={tab.keys}
    busy={busy} message={message} details={details} onConfirm={() => void go()} onClose={onClose} />;
}

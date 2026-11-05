import { DataTable, columnsFor } from '@/components/table/DataTable';
import { StatusValue } from '@/components/ui/StatusValue';
import { AlertCircle, Trash2 } from 'lucide-react';
import { useSort } from '@/lib/client/use-sort';
import { alignClass, alignOf, type AnyField } from '@/lib/fields';
import type { Column, Row } from '@/lib/grid/types';
import { Modal } from './Modal';
import { Notice } from './Notice';
import { SortTh } from './SortTh';

const entries = (n: number) => `${n} ${n === 1 ? 'Entry' : 'Entries'}`;

/** Lists the rows to delete; "Yes, Delete N Entries". Enter confirms unless a button or field has focus. */
export function DeleteDialog({ title, rows, columns, fields = [], keys, busy = false, message, details = [], onConfirm, onClose }: {
  /** `fields`: the columns' field definitions, which put amounts and numbers on the right. */
  title: string; rows: Row[]; columns: Column[]; fields?: AnyField[]; keys: string[]; busy?: boolean; message?: string; details?: { message: string }[]; onConfirm: () => void; onClose: () => void;
}) {
  const cols = columns.filter(c => !c.field.startsWith('_'));
  const side = (c: Column) => alignClass(alignOf(c.field, fields, c.align));
  const list = useSort(rows, (r, f) => { const c = cols.find(x => x.field === f); return c ? (c.sort ? c.sort(r) : c.text(r)) : ''; });
  return (
    <Modal wide title={title} subtitle="These entries will be permanently removed." onClose={onClose} busy={busy} onEnter={onConfirm} initialFocus="dialog"
      footer={<>
        <button className="button secondary" disabled={busy} onClick={onClose}>Cancel</button>
        <button className="button danger" disabled={busy} onClick={onConfirm}><Trash2 size={15} />{busy ? 'Deleting…' : `Yes, Delete ${entries(rows.length)}`}</button>
      </>}>
      {message && <Notice error><AlertCircle size={16} />{message}{details.length > 0 && <ul>{details.map((d, i) => <li key={i}>{d.message}</li>)}</ul>}</Notice>}
      <div className="ds-grid-wrap"><DataTable columns={columnsFor(cols, fields)} className="ds-table">
        <thead><tr>{cols.map(c => <SortTh key={c.field} col={c.field} sort={list.sort} onSort={list.toggle} className={side(c)}>{c.label}</SortTh>)}</tr></thead>
        <tbody>{list.rows.map(r => <tr key={keys.map(k => r[k]).join('~')}>{cols.map(c => <td key={c.field} className={`${c.code ? 'ds-code' : ''} ${side(c)}`}><StatusValue definition={c} row={r}>{c.text(r)}</StatusValue></td>)}</tr>)}</tbody>
      </DataTable></div>
    </Modal>
  );
}

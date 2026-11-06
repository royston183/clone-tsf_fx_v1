import { X } from 'lucide-react';

/** Calendar filter of the filter bar ("Effective Date"): value is YYYY-MM-DD, empty means no filter. */
export function DateFilter({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="ds-combo ds-date-filter">
      <input type="date" aria-label={label} title={label} value={value} onChange={e => onChange(e.target.value)} />
      {value && <button type="button" aria-label={`Clear ${label}`} onClick={() => onChange('')}><X size={14} /></button>}
    </label>
  );
}

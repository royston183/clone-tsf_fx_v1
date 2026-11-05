import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';

/** Report inputs have their own card. Hiding it preserves drafts, validation and the last run. */
export function SelectionPanel({ summary, children }: { summary: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  const id = useId();
  return <section className="panel kit-selection" aria-label="Report selections">
    <div className="kit-selection-head">
      <div><h2><SlidersHorizontal size={16} />Report selections</h2><p>{summary || 'Choose the inputs for your report.'}</p></div>
      <button type="button" className="button secondary small" aria-expanded={open} aria-controls={id} onClick={() => setOpen(v => !v)}>
        {open ? 'Hide selection' : 'Change selection'}<ChevronDown size={14} className={open ? 'kit-chevron-open' : ''} />
      </button>
    </div>
    <div id={id} className="kit-selection-body" hidden={!open}>{children}</div>
  </section>;
}

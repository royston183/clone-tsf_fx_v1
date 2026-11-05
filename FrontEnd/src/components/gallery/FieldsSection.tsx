// src/components/gallery/FieldsSection.tsx
import { useState } from 'react';
import type { Row } from '@/lib/grid/types';
import { FieldControl } from '@/components/fields/FieldControl';
import { ValueHelpDialog } from '@/components/ui/ValueHelpDialog';
import { CURRENCIES, FIELD_SAMPLES, type FieldSample } from './samples';
import { galleryItem } from './ids';

function Sample({ s }: { s: FieldSample }) {
  const [row, setRow] = useState<Row>(s.filled);
  const [f4, setF4] = useState(false);
  const set = (field: string, value: string) => setRow(r => ({ ...r, [field]: value }));
  return (
    <article className="panel kit-gallery-item" data-gallery-id={s.id}>
      <h3><span className="kit-id">{s.id}</span>{galleryItem(s.id).title}</h3>
      <p className="muted">{s.note}</p>
      <div className="kit-states">
        <FieldControl def={s.def} variant="form" row={row} lk={{}} onChange={set} onValueHelp={() => setF4(true)} />
        {s.error && <FieldControl def={{ ...s.def, label: `${s.def.label} (error)` }} variant="form" row={s.invalid} lk={{}} onChange={() => {}} error={s.error} />}
        <FieldControl def={{ ...s.def, label: `${s.def.label} (disabled)` }} variant="form" row={s.filled} lk={{}} onChange={() => {}} disabled />
        <div className="ds-table ds-grid"><div className="ds-inline">
          <FieldControl def={s.def} variant="cell" row={row} lk={{}} onChange={set} onValueHelp={() => setF4(true)} />
        </div></div>
      </div>
      {f4 && <ValueHelpDialog title={`Select ${s.def.label}`} items={CURRENCIES} onClose={() => setF4(false)} onPick={code => { set(s.def.field, code); setF4(false); }} />}
    </article>
  );
}

export function FieldsSection() {
  return <section className="kit-gallery" aria-labelledby="g-fields"><h2 id="g-fields">Fields</h2><div className="kit-gallery-grid">{FIELD_SAMPLES.map(s => <Sample key={s.id} s={s} />)}</div></section>;
}

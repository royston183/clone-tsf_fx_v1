// The loading screen of the Trade Flows pages: no technical words, only the client's product lines, one after another,
// each with its own little illustration, and a thin bar that fills as the data arrives.
import { useEffect, useState } from 'react';
import './bean-loader.css';

const LINES: { name: string; text: string; art: 'cocoa' | 'coffee' | 'nuts' | 'spices' | 'dairy' }[] = [
  { name: 'Cocoa', text: 'Sourced globally and processed into products like deZaan powders, butters and liquors.', art: 'cocoa' },
  { name: 'Coffee', text: 'Green coffee beans and custom soluble and instant coffee solutions.', art: 'coffee' },
  { name: 'Nuts', text: 'Almonds, cashews, hazelnuts, pistachios and peanuts.', art: 'nuts' },
  { name: 'Spices', text: 'Bulk natural spices, herbs and dehydrated vegetables.', art: 'spices' },
  { name: 'Dairy', text: 'Sourced and processed dairy ingredients.', art: 'dairy' }
];

function Art({ kind }: { kind: (typeof LINES)[number]['art'] }) {
  return (
    <svg className={`bean-loader__art bean-loader__art--${kind}`} viewBox="0 0 160 140" aria-hidden="true">
      {kind === 'cocoa' && <>
        <g className="bl-sway">
          <path className="bl-pod" d="M80 18 C112 26 120 74 104 104 C96 120 64 120 56 104 C40 74 48 26 80 18 Z" />
          <path className="bl-ridge" d="M80 22 C76 50 76 86 80 116 M66 30 C58 56 58 90 66 112 M94 30 C102 56 102 90 94 112" />
        </g>
        <ellipse className="bl-bean bl-drop" cx="38" cy="96" rx="8" ry="11" />
        <ellipse className="bl-bean bl-drop bl-d2" cx="124" cy="92" rx="7" ry="10" />
      </>}
      {kind === 'coffee' && <>
        <g className="bl-steam"><path d="M66 40 q-6 -8 0 -16 q6 -8 0 -16" /><path d="M80 40 q-6 -8 0 -16 q6 -8 0 -16" /><path d="M94 40 q-6 -8 0 -16 q6 -8 0 -16" /></g>
        <path className="bl-cup" d="M52 48 h56 v22 a28 28 0 0 1 -28 28 a28 28 0 0 1 -28 -28 z" />
        <path className="bl-handle" d="M108 54 h6 a9 9 0 0 1 0 18 h-7" />
        <ellipse className="bl-cream" cx="80" cy="50" rx="26" ry="4" />
        <ellipse className="bl-saucer" cx="80" cy="104" rx="40" ry="6" />
        <g className="bl-orbit"><ellipse className="bl-coffee" cx="80" cy="12" rx="6" ry="8.5" /><ellipse className="bl-coffee" cx="132" cy="84" rx="5.5" ry="8" /><ellipse className="bl-coffee" cx="28" cy="84" rx="5.5" ry="8" /></g>
      </>}
      {kind === 'nuts' && <>
        <g className="bl-hop"><path className="bl-almond" d="M50 96 C34 70 46 36 62 30 C78 36 84 70 70 96 C64 104 56 104 50 96 Z" /></g>
        <g className="bl-hop bl-h2"><path className="bl-cashew" d="M104 40 C126 44 130 76 112 92 C104 98 92 94 96 86 C108 76 106 58 96 54 C88 50 92 38 104 40 Z" /></g>
        <g className="bl-hop bl-h3"><circle className="bl-hazel" cx="84" cy="104" r="14" /><path className="bl-hazel-cap" d="M70 100 q14 -18 28 0 q-14 -6 -28 0 Z" /></g>
      </>}
      {kind === 'spices' && <>
        <g className="bl-sway"><path className="bl-chili" d="M46 46 C66 54 96 82 112 112 C92 104 60 80 46 46 Z" /><path className="bl-stem" d="M46 46 q-6 -10 2 -18" /></g>
        <g className="bl-sway bl-s2"><path className="bl-leaf" d="M104 24 C128 30 132 58 112 70 C96 62 92 38 104 24 Z" /><path className="bl-vein" d="M106 28 C110 42 112 54 112 68" /></g>
        <circle className="bl-seed bl-drop" cx="40" cy="100" r="4" /><circle className="bl-seed bl-drop bl-d2" cx="54" cy="112" r="3" /><circle className="bl-seed bl-drop" cx="128" cy="104" r="3.5" />
      </>}
      {kind === 'dairy' && <>
        <path className="bl-bottle" d="M68 22 h24 v12 l10 16 v58 a8 8 0 0 1 -8 8 h-28 a8 8 0 0 1 -8 -8 v-58 l10 -16 z" />
        <rect className="bl-milk" x="59" y="64" width="42" height="50" rx="6" />
        <path className="bl-cap" d="M66 16 h28 v8 h-28 z" />
        <path className="bl-splash bl-drop" d="M120 70 c8 12 8 22 0 26 c-8 -4 -8 -14 0 -26 z" />
        <path className="bl-splash bl-drop bl-d2" d="M36 82 c6 9 6 16 0 19 c-6 -3 -6 -10 0 -19 z" />
      </>}
    </svg>
  );
}

export function BeanLoader({ steps }: { steps: { done: boolean }[] }) {
  const [at, setAt] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setAt(n => (n + 1) % LINES.length), 2600);
    return () => clearInterval(t);
  }, []);
  const share = Math.round((steps.filter(s => s.done).length / Math.max(1, steps.length)) * 100);
  const line = LINES[at];
  return (
    <div className="bean-loader panel" role="status" aria-live="polite" aria-label="Getting everything ready">
      <div className="bean-loader__slide" key={line.name}>
        <Art kind={line.art} />
        <div className="bean-loader__text">
          <h3>{line.name}</h3>
          <p>{line.text}</p>
        </div>
      </div>
      <div className="bean-loader__foot">
        <div className="bean-loader__dots" aria-hidden="true">{LINES.map((l, i) => <span key={l.name} className={i === at ? 'on' : ''} />)}</div>
        <div className="bean-loader__bar" aria-hidden="true"><span style={{ width: `${Math.max(8, share)}%` }} /></div>
      </div>
    </div>
  );
}

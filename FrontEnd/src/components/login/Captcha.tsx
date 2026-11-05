import { RefreshCw } from 'lucide-react';

const INK = ['#1d3f66', '#0a6ed1', '#2a5d8f', '#164a7d', '#3a6ea5'];

export function Captcha({ code, refresh }: { code: string; refresh: () => void }) {
  const jitter = (i: number, seed: number) => ((code.charCodeAt(i) * seed) % 100) / 100;
  return (
    <div className="captcha">
      <svg className="captcha-art" viewBox="0 0 150 42" role="img" aria-label={`Captcha characters: ${code.split('').join(' ')}`}>
        {[0, 1, 2].map(i => <line key={i} x1="0" y1={7 + jitter(i, 37) * 27} x2="150" y2={6 + jitter(i, 71) * 28} stroke="#a9c0d6" strokeWidth="1" />)}
        {code.split('').map((ch, i) => (
          <text key={i} x={15 + i * 27} y={29 + jitter(i, 53) * 6} fontSize={20 + jitter(i, 29) * 5} fontWeight="700" fill={INK[i % INK.length]}
            transform={`rotate(${(jitter(i, 61) * 28 - 14).toFixed(1)} ${15 + i * 27} 24)`}>{ch}</text>
        ))}
      </svg>
      <button type="button" className="captcha-refresh" onClick={refresh} aria-label="Get a new captcha code" title="New code"><RefreshCw size={15} /></button>
    </div>
  );
}

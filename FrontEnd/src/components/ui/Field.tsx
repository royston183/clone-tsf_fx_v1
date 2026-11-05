import type { InputHTMLAttributes } from 'react';

export function Field({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return <label className="field"><span>{label}</span><input {...props} /></label>;
}

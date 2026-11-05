export type StatusTone = 'open' | 'pending' | 'done' | 'neutral'

/**
 * Tone is derived from the status text because SAP hands back a description, not a tone.
 * Exported so a caller with a real status code can pass the tone directly instead.
 */
export function statusTone(text: string): StatusTone {
  if (/open/i.test(text)) return 'open'
  if (/pend/i.test(text)) return 'pending'
  if (/assign|complete|clos/i.test(text)) return 'done'
  return 'neutral'
}

export function StatusPill({ status, tone }: { status: string | undefined; tone?: StatusTone }) {
  const text = status?.trim() || 'Draft'
  return <span className={`slc-pill slc-pill--${tone ?? statusTone(text)}`}>{text}</span>
}

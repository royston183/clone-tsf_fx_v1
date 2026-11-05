export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span className="slc-spinner" role="status" aria-live="polite">
      <span className="slc-spinner__ring" aria-hidden="true" />
      <span className="slc-visually-hidden">{label}</span>
    </span>
  )
}

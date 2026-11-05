import { useId } from 'react'
import type { ReactNode } from 'react'

export type FieldProps = {
  label: string
  /** Receives the id to put on the control, so the label actually points at it. */
  children: (id: string) => ReactNode
  hint?: ReactNode
  error?: string | undefined
  required?: boolean
}

/**
 * Label + control + message, wired together. The callback hands the control its id so the
 * <label for> association is impossible to forget — the legacy pages placed labels next to
 * inputs without one, so clicking a label did nothing and screen readers announced no name.
 */
export function Field({ label, children, hint, error, required }: FieldProps) {
  const id = useId()
  const messageId = `${id}-message`
  return (
    <div className={`slc-field${error ? ' slc-field--error' : ''}`}>
      <label className="slc-field__label" htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {children(id)}
      {error ? (
        <p className="slc-field__message" id={messageId} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="slc-field__hint" id={messageId}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}

import { useState } from 'react'
import type { InputHTMLAttributes } from 'react'
import { formatAmount, formatAmountWhileTyping, parseAmount } from '@/ref/api-client'

export type AmountInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type'
> & {
  value: string
  onValueChange: (value: string) => void
  /** Called on blur with the parsed number, or null when the text cannot be parsed. */
  onCommit?: (amount: number | null) => void
  invalid?: boolean
}

/**
 * A numeric field that accepts magnitude suffixes — "2.5M" becomes 2,500,000 on blur — and
 * groups digits as the user types.
 *
 * Normalisation happens on blur rather than on every keystroke so that a half-typed value
 * ("1.", "2.5M") is never rewritten underneath the caret.
 */
export function AmountInput({
  value,
  onValueChange,
  onCommit,
  invalid = false,
  className = '',
  ...rest
}: AmountInputProps) {
  const [touched, setTouched] = useState(false)

  const commit = () => {
    setTouched(true)
    if (!value.trim()) {
      onCommit?.(null)
      return
    }
    const parsed = parseAmount(value)
    if (parsed !== null) onValueChange(formatAmount(parsed))
    onCommit?.(parsed)
  }

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      className={`slc-amount ${invalid && touched ? 'slc-amount--invalid' : ''} ${className}`.trim()}
      aria-invalid={invalid && touched ? true : undefined}
      value={value}
      onChange={(event) => onValueChange(formatAmountWhileTyping(event.target.value))}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.blur()
        }
      }}
    />
  )
}

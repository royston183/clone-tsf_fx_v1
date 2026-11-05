import { toNum } from '@/ref/api-client'
import type { ChargeRow, FeeTypeRow } from './charge-types.ts'

/**
 * Shared by the OTTK and DTTK consoles: both originals carry the same fee grid, the same
 * category/collection-code rules and the same days/360 calculation, so the logic lives once.
 * DTTK simply keeps two independent sets of rows (confirmation fees and other charges).
 */

/** Two decimals with grouping, matching the legacy fmt2(). */
export function fmt2(value: number): string {
  return Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export const FEE_CATEGORY_OPTIONS = [
  { value: '01', label: '01 %' },
  { value: '02', label: '02 Flat Amount' },
]

export const FEE_CODE_OPTIONS = [
  { value: '01', label: '01 Standard' },
  { value: '02', label: '02 Greater of Two' },
  { value: '03', label: '03 Least of Two' },
]

/**
 * The fee calculation, unchanged from the legacy console.
 *
 * Fee Category '02' (Flat Amount) takes the manually entered Amount as-is. Otherwise the
 * row is percentage-based — Base × Rate% × Period/360, a days/360 convention — and Code for
 * Collection decides whether that percentage stands alone ('01' Standard) or is compared
 * against the manually entered Amount ('02' Greater of Two, '03' Least of Two).
 *
 * Returns the final amount as a formatted string, rounded to 2dp before formatting so the
 * displayed figure and the persisted figure cannot disagree.
 */
export function recalcRow(row: ChargeRow): string {
  const base = toNum(row.ZbAmt)
  const rate = toNum(row.Zrate)
  const period = toNum(row.Zday)
  const amount = toNum(row.Zamt)
  const pct = base * (rate / 100) * (period / 360)

  let final: number
  if (row.Zcat === '02') final = amount
  else if (row.Zcode === '02') final = Math.max(pct, amount)
  else if (row.Zcode === '03') final = Math.min(pct, amount)
  else final = pct

  return fmt2(Math.round(final * 100) / 100)
}

/** Re-bases every row on the current trade value and recalculates each final amount. */
export function recalcAllRows(rows: ChargeRow[], tradeValue: number): ChargeRow[] {
  const baseDisplay = fmt2(tradeValue)
  return rows.map((row) => {
    const next = { ...row, ZbAmt: baseDisplay }
    return { ...next, ZfAmt: recalcRow(next) }
  })
}

export function chargesTotal(rows: readonly ChargeRow[]): number {
  return rows.reduce((sum, row) => sum + toNum(row.ZfAmt), 0)
}

/**
 * One row per active fee type — the grid has no add or remove. A fee type the user never
 * touches is simply not persisted; see isChargeRowTouched.
 */
export function buildChargeRows(
  feeTypes: readonly FeeTypeRow[],
  existingByType: Record<string, Record<string, unknown>>,
): ChargeRow[] {
  return feeTypes.map((feeType) => {
    const existing = existingByType[feeType.ZfeeType ?? '']
    const str = (key: string): string => {
      const value = existing?.[key]
      return value === undefined || value === null || value === '' ? '' : String(value)
    }
    return {
      ZfeeType: feeType.ZfeeType ?? '',
      ZfeeDesc: feeType.ZfeeDesc ?? '',
      Zcat: str('Zcat'),
      Zcode: str('Zcode'),
      Zrate: str('Zrate'),
      Zday: str('Zday').trim(),
      Zamt: existing?.['Zamt'] ? fmt2(toNum(existing['Zamt'])) : '',
      ZbAmt: '',
      ZfAmt: '0.00',
    }
  })
}

/** A row nobody filled in is not sent to the service. */
export function isChargeRowTouched(row: ChargeRow): boolean {
  return Boolean(row.Zcat || row.Zcode || toNum(row.Zrate) || row.Zday || toNum(row.Zamt))
}

/**
 * Applies one edit, mirroring the legacy onChargeFieldChange.
 *
 * '01 %' is percentage-only, so Amount plays no part and any stale typed value is cleared
 * rather than left behind unused and misleading. '02 Flat Amount' is the mirror case: Int
 * Rate and Period play no part, so they are cleared instead.
 */
export function applyChargeEdit(row: ChargeRow, field: keyof ChargeRow, value: string): ChargeRow {
  const next: ChargeRow = { ...row, [field]: value }
  if (field === 'Zcat' && value === '01') next.Zamt = ''
  if (field === 'Zcat' && value === '02') {
    next.Zrate = ''
    next.Zday = ''
  }
  next.ZfAmt = recalcRow(next)
  return next
}

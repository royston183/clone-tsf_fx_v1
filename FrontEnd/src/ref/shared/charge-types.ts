/** Shapes the shared charges logic works with; each console re-exports them. */

/** One line of a fee breakdown, as edited in a Charges popup. */
export type ChargeRow = {
  ZfeeType: string
  ZfeeDesc: string
  /** Fee Category: '01' %, '02' Flat Amount. */
  Zcat: string
  /** Code for Collection: '01' Standard, '02' Greater of Two, '03' Least of Two. */
  Zcode: string
  Zrate: string
  Zday: string
  Zamt: string
  ZbAmt: string
  ZfAmt: string
}

export type FeeTypeRow = { ZfeeType?: string; ZfeeDesc?: string }

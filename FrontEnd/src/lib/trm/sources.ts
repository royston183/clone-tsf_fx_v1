// Where the TRM pop-up reads a transaction: the first registered source that has it (src/config/transactions.ts).
// The template ships the NIIF Transaction set (lib/trm/niif.ts); an application adds its own sources in front of it, for
// example loans from its drawdown and allocation services, mapped to the same record (lib/trm/types.ts TrmDeal).
import { HttpError } from '@/lib/errors';
import type { ClassTarget, DealTarget, FtrModel, SecurityClassView, TransactionTarget } from './types';

export interface TransactionSource {
  /** Names the source in messages and tests. */
  id: string;
  /** Whether this source may display the target (company code and number), decided without reading. */
  matches(target: TransactionTarget): boolean;
  /**
   * The transaction as the FTR_DISPLAY screen reads it: SAP's Transaction properties and its `_Flow`. null when this
   * source does not have it: the next matching source is asked (the NIIF source, last, says what it could not find).
   */
  read(target: DealTarget): Promise<FtrModel | null>;
  /** A security class and its transactions (null: not here); without it the source never opens a class link. */
  readClass?(target: ClassTarget): Promise<SecurityClassView | null>;
}

/** The sources that may display the target, in order (for a class, those that read classes). */
export const sourcesFor = (target: TransactionTarget, sources: TransactionSource[]): TransactionSource[] =>
  sources.filter(s => (target.kind === 'deal' || s.readClass) && s.matches(target));
const notFound = (target: TransactionTarget) => new HttpError(404, target.kind === 'deal'
  ? `No transaction source displays transaction ${target.deal} of company code ${target.bukrs}.`
  : `No transaction source displays security class ${target.securityClass} of company code ${target.bukrs}.`);

/** The transaction from the first matching source that has it. */
export async function readDeal(target: DealTarget, sources: TransactionSource[]): Promise<FtrModel> {
  for (const source of sourcesFor(target, sources)) { const deal = await source.read(target); if (deal) return deal; }
  throw notFound(target);
}
/** The security class and its transactions from the first matching source that has it. */
export async function readClass(target: ClassTarget, sources: TransactionSource[]): Promise<SecurityClassView> {
  for (const source of sourcesFor(target, sources)) { const view = await source.readClass!(target); if (view) return view; }
  throw notFound(target);
}

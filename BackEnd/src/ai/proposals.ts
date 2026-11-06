// POST /api/ai/proposals (Propose Tradeflows, design 2026-11-05-manage-propose-tradeflows): Claude ranks the BL
// combinations the app found for a Deal ID, explains each in a sentence, and turns the person's preferences into rules
// the app applies. Claude never computes amounts: it only orders what it is given.
// Only the fields the design lists leave the BackEnd (no party names, references or goods). The key is
// ANTHROPIC_API_KEY in the BackEnd environment; without it the route answers 503 and the page ranks by closeness.
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { AppConfig } from '@core/server/config';
import { assertTrustedWrite, handle, json, readJson } from '@core/server/http';
import { HttpError } from '@/lib/errors';

export const AI_PATH = '/api/ai/proposals';
export const AI_MODEL = 'claude-opus-5-5';
const RULE_KINDS = ['maxBls', 'minBls', 'includeTf', 'excludeTf', 'includeBl', 'excludeBl', 'preferOlder', 'preferNewer', 'preferFewerTfs', 'tolerancePct'] as const;

const money = z.string().regex(/^-?\d+(\.\d+)?$/);
/** What the page may send. Unknown fields are dropped here, so they can never reach Anthropic. */
const Input = z.object({
  deal: z.object({ dealId: z.string().max(20), tsfCommodity: z.string().max(10), dealUsd: money, remainingUsd: money }),
  candidates: z.array(z.object({ bls: z.array(z.string().max(10)).min(1).max(8), totalUsd: money, diffPct: z.number(), tfs: z.number().int() })).max(20),
  bls: z.array(z.object({ blNo: z.string().max(10), tfNo: z.string().max(10), tfDate: z.string().max(10), quantity: z.string().max(20), usdValue: z.string().max(20) })).max(160),
  preferences: z.string().max(500)
});
/** What Claude must answer (structured output). Rule kinds stay free text, so unknown ones can be reported. */
const Output = z.object({
  ranked: z.array(z.object({ index: z.number().int(), reason: z.string() })),
  rules: z.array(z.object({ kind: z.string(), values: z.array(z.string()), number: z.number().nullable() })),
  /** Filters on the data (deal level or BL level); the app normalises and applies them, Claude only reads the request. */
  criteria: z.array(z.object({ scope: z.string(), field: z.string(), op: z.string(), value: z.string() })),
  /** True only when the person explicitly asks to search across deals instead of the chosen one. */
  acrossDeals: z.boolean(),
  notUnderstood: z.array(z.string())
});
/** Older answers (and test doubles) may lack the two new fields. */
const Answer = Output.extend({ criteria: Output.shape.criteria.optional(), acrossDeals: z.boolean().optional() });
type Output = z.infer<typeof Output>;

export type Scope = 'deal' | 'bl';
export type Op = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'ne';
/** A filter the app applies to the real data: always deterministic, never a value the AI computed. */
export interface Criterion { scope: Scope; field: string; op: Op; value: string }
const NUMERIC = { deal: ['amount', 'remaining'], bl: ['amount', 'quantity'] } as const;
const DATES = { deal: [] as string[], bl: ['tfDate', 'blDate'] };
const TEXT = { deal: ['commodity', 'dealId'], bl: ['commodity', 'tfNo', 'blNo'] };
const OPS: Op[] = ['gt', 'gte', 'lt', 'lte', 'eq', 'ne'];

/** "50K" → 50000, "1.5M" → 1500000, "50,000" → 50000; a trailing "+" means "or more" (>=). Null when it is not a number. */
export function parseAmount(raw: string): { value: string; plus: boolean } | null {
  const m = /^\s*(\d{1,3}(?:,\d{3})+|\d*\.?\d+)\s*([kKmMbB]?)\s*(\+?)\s*$/.exec(raw);
  if (!m) return null;
  const mult = { '': 1, k: 1e3, m: 1e6, b: 1e9 }[m[2].toLowerCase() as '' | 'k' | 'm' | 'b'];
  // Decimal-exact: scale the digits instead of multiplying floats.
  const n = Math.round(Number(m[1].replace(/,/g, '')) * mult * 100) / 100;
  return Number.isFinite(n) && n >= 0 ? { value: n.toFixed(2), plus: m[3] === '+' } : null;
}

/** The criteria Claude returned, kept only when valid for their scope; the rest is reported back. */
export function toCriteria(raw: { scope: string; field: string; op: string; value: string }[]): { criteria: Criterion[]; rejected: string[] } {
  const criteria: Criterion[] = [], rejected: string[] = [];
  for (const c of raw.slice(0, 10)) {
    const label = `${c.scope} ${c.field} ${c.op} ${c.value}`.slice(0, 100);
    const scope = c.scope as Scope, op = c.op as Op;
    if ((scope !== 'deal' && scope !== 'bl') || !OPS.includes(op)) { rejected.push(label); continue; }
    if ((NUMERIC[scope] as readonly string[]).includes(c.field)) {
      const n = parseAmount(c.value);
      if (!n) { rejected.push(label); continue; }
      criteria.push({ scope, field: c.field, op: n.plus && (op === 'gt' || op === 'eq') ? 'gte' : op, value: n.value });
    } else if (DATES[scope].includes(c.field)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(c.value.trim()) || Number.isNaN(Date.parse(c.value.trim()))) { rejected.push(label); continue; }
      criteria.push({ scope, field: c.field, op, value: c.value.trim() });
    } else if (TEXT[scope].includes(c.field)) {
      const value = c.value.trim();
      if (!/^[A-Za-z0-9 .&-]{1,30}$/.test(value) || (op !== 'eq' && op !== 'ne')) { rejected.push(label); continue; }
      criteria.push({ scope, field: c.field, op, value });
    } else rejected.push(label);
  }
  return { criteria, rejected };
}

export interface Rules { [kind: string]: number | boolean | string[] | undefined }
/** The part of the Anthropic client this route uses (a stand-in in tests). */
export interface AiClient { messages: { parse: (params: Record<string, unknown>) => Promise<{ parsed_output: unknown; stop_reason?: string | null }> } }
export interface AiDeps { client: AiClient | null }

/** The client for the key in the environment, or null when there is none. */
export function defaultAiDeps(env: Record<string, string | undefined> = process.env): AiDeps {
  const key = (env.ANTHROPIC_API_KEY ?? '').trim();
  return { client: key ? (new Anthropic({ apiKey: key }) as unknown as AiClient) : null };
}

const SYSTEM = [
  'You help a commodity trade-finance team match bills of lading (BLs) to a Deal ID.',
  'The application has already calculated every candidate combination; their totals are exact and within the allowed tolerance.',
  'Your job: (1) rank the combinations from best to worst for the person, (2) give each ranked combination one short, concrete reason',
  '(for example how close it is, how many BLs or trade flows it uses, how old the trade flows are), and (3) translate the person\'s',
  `preferences into rules of these kinds only: ${RULE_KINDS.join(', ')}.`,
  'maxBls/minBls/tolerancePct use "number"; includeTf/excludeTf/includeBl/excludeBl use "values" (TF or BL numbers);',
  'preferOlder/preferNewer/preferFewerTfs need neither. Put anything you cannot express as such a rule in notUnderstood, in the person\'s words.',
  'Also read any conditions on the data into "criteria": {scope, field, op, value} with scope "deal" or "bl", op one of gt, gte, lt, lte, eq, ne.',
  'Deal fields: amount (the deal amount in USD), remaining (USD still open), commodity, dealId. BL fields: amount (the BL USD value), quantity, commodity,',
  'tfDate and blDate (value YYYY-MM-DD), tfNo, blNo. Never turn a deal condition into a BL condition or the reverse: "deals with an amount greater than 50K"',
  'is scope deal; "BLs worth more than 50K" is scope bl. Copy numbers as the person wrote them ("50K", "50K+"); the app converts them. "greater than" is gt, "at least" or "50K+" is gte.',
  'Every BL shown is already unassigned and active, so never emit an availability criterion. Set acrossDeals true only when the person explicitly asks to search across',
  'all deals; otherwise the chosen deal stays the context. Today is given in the request for relative dates.',
  'Never invent amounts, BLs or trade flows; refer to combinations only by their index. Rank at most 5.'
].join(' ');

/** The rules Claude returned, kept only when they are well formed; everything else is reported back. */
function toRules(raw: Output['rules']): { rules: Rules; rejected: string[] } {
  const rules: Rules = {}, rejected: string[] = [];
  for (const r of raw) {
    const kind = r.kind as (typeof RULE_KINDS)[number];
    if (!RULE_KINDS.includes(kind)) { rejected.push(r.kind); continue; }
    if (kind === 'maxBls' || kind === 'minBls') {
      if (r.number !== null && Number.isInteger(r.number) && r.number >= 1 && r.number <= 8) rules[kind] = r.number; else rejected.push(`${kind} ${String(r.number)}`);
    } else if (kind === 'tolerancePct') {
      if (r.number !== null && r.number > 0 && r.number <= 1) rules[kind] = r.number; else rejected.push(`a tolerance wider than 1% (${String(r.number)}%)`);
    } else if (kind === 'preferOlder' || kind === 'preferNewer' || kind === 'preferFewerTfs') {
      rules[kind] = true;
    } else {
      const values = r.values.map(v => v.trim()).filter(v => /^[A-Za-z0-9]{1,10}$/.test(v));
      if (values.length) rules[kind] = values; else rejected.push(kind);
    }
  }
  return { rules, rejected };
}

/** Handles POST /api/ai/proposals. */
export function aiProposals(req: Request, cfg: AppConfig, deps: AiDeps): Promise<Response> {
  return handle(async () => {
    assertTrustedWrite(req, cfg);
    const parsed = Input.safeParse(await readJson(req, 512 * 1024));
    if (!parsed.success) throw new HttpError(400, 'The proposal request is not valid.', parsed.error.issues.slice(0, 5).map(i => ({ message: `${i.path.join('.')}: ${i.message}` })));
    if (!deps.client) throw new HttpError(503, 'AI is not configured.');
    const input = parsed.data;
    const response = await deps.client.messages.parse({
      model: AI_MODEL,
      max_tokens: 16000,
      output_config: { effort: 'medium', format: zodOutputFormat(Output) },
      system: SYSTEM,
      messages: [{ role: 'user', content: JSON.stringify({
        deal: input.deal,
        combinations: input.candidates.map((c, index) => ({ index, ...c })),
        bls: input.bls,
        today: new Date().toISOString().slice(0, 10),
        preferences: input.preferences
      }) }]
    });
    const out = Answer.safeParse(response.parsed_output);
    if (response.stop_reason === 'refusal' || !out.success) throw new HttpError(502, 'The AI gave no usable answer; the proposals are ranked by closeness instead.');
    const seen = new Set<number>();
    const ranked = out.data.ranked
      .filter(r => Number.isInteger(r.index) && r.index >= 0 && r.index < input.candidates.length && !seen.has(r.index) && seen.add(r.index))
      .slice(0, 5)
      .map(r => ({ index: r.index, reason: r.reason.trim().slice(0, 300) }));
    const { rules, rejected } = toRules(out.data.rules);
    const parsedCriteria = toCriteria(out.data.criteria ?? []);
    return json({
      ranked, rules, criteria: parsedCriteria.criteria, acrossDeals: out.data.acrossDeals === true,
      notUnderstood: [...out.data.notUnderstood.map(n => n.slice(0, 200)), ...rejected, ...parsedCriteria.rejected], model: AI_MODEL
    });
  });
}

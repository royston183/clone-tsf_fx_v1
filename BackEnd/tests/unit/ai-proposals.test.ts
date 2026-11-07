// POST /api/ai/proposals: Claude ranks the app's own BL combinations and turns preferences into rules. Only the fields
// the design lists may leave the BackEnd; whatever the AI answers is checked before the page sees it.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { aiAsk, aiInterpret, aiProposals, AI_MODEL, type AiClient } from '../../src/ai/proposals';
import { buildServer } from '../../src/server';
import { freshStore, testConfig } from '../support/config';

const FRONTEND = 'http://localhost:3100';
const cfg = () => testConfig({ APP_ORIGINS: FRONTEND });
const body = {
  deal: { dealId: 'DL26000142', tsfCommodity: 'C130', dealUsd: '283800.00', remainingUsd: '283800.00', dealDesc: 'secret desc', counterparty: 'Olam' },
  candidates: [
    { bls: ['4000000005', '4000000006', '4000000007'], totalUsd: '283800.00', diffPct: 0, tfs: 3 },
    { bls: ['4000000005', '4000000006', '4000000001'], totalUsd: '281600.00', diffPct: -0.78, tfs: 3 }
  ],
  bls: ['4000000005', '4000000006', '4000000007', '4000000001'].map((blNo, i) => ({
    blNo, tfNo: `TF0000000${i + 1}`, tfDate: '2026-11-01', quantity: '44000.000', usdValue: '94600.00',
    notifyParty: 'Olam Viet Nam Ltd', goods: 'ALMOND STD5', contractRef: '1490004320', invoiceRef: '9230140002'
  })),
  preferences: 'prefer older BLs, at most 3 BLs'
};
const request = (payload: unknown, headers: Record<string, string> = {}) => new Request('http://127.0.0.1:3200/api/ai/proposals', {
  method: 'POST', headers: { origin: FRONTEND, 'x-app-request': '1', 'content-type': 'application/json', ...headers }, body: JSON.stringify(payload)
});
/** A stand-in for the Anthropic client: records the request and answers with `output`. */
function fake(output: unknown, stop = 'end_turn') {
  const sent: Record<string, unknown>[] = [];
  const client: AiClient = { messages: { parse: async (params: Record<string, unknown>) => { sent.push(params); return { parsed_output: output, stop_reason: stop }; } } };
  return { client, sent };
}

describe('POST /api/ai/proposals', () => {
  it('answers 503 when no API key is configured', async () => {
    const res = await aiProposals(request(body), cfg(), { client: null });
    expect(res.status).toBe(503);
    expect((await res.json()).error.message).toBe('AI is not configured.');
  });

  it('refuses a write without the app header', async () => {
    const { client } = fake({ ranked: [], rules: [], notUnderstood: [] });
    expect((await aiProposals(request(body, { 'x-app-request': '' }), cfg(), { client })).status).toBe(403);
  });

  it('sends Claude Opus 5.5 only the deal figures, the combinations and BL numbers, dates, quantities and USD values', async () => {
    const { client, sent } = fake({ ranked: [{ index: 0, reason: 'Exact match.' }], rules: [], notUnderstood: [] });
    const res = await aiProposals(request(body), cfg(), { client });
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0].model).toBe(AI_MODEL);
    expect(AI_MODEL).toBe('claude-opus-5-5');
    const text = JSON.stringify(sent[0].messages) + JSON.stringify(sent[0].system ?? '');
    for (const leak of ['Olam', 'ALMOND STD5', '1490004320', '9230140002', 'secret desc']) expect(text).not.toContain(leak);
    for (const kept of ['DL26000142', 'C130', '283800.00', '4000000005', 'TF00000001', '94600.00', 'prefer older BLs']) expect(text).toContain(kept);
  });

  it('keeps only valid rankings and rules, and reports the rest as not understood', async () => {
    const { client } = fake({
      ranked: [{ index: 1, reason: 'Older BLs.' }, { index: 7, reason: 'Made up.' }, { index: 1, reason: 'Duplicate.' }, { index: 0, reason: 'Exact.' }],
      rules: [
        { kind: 'maxBls', values: [], number: 3 }, { kind: 'preferOlder', values: [], number: null },
        { kind: 'tolerancePct', values: [], number: 5 }, { kind: 'cheapestFirst', values: [], number: null },
        { kind: 'excludeTf', values: ['TF00000002'], number: null }
      ],
      notUnderstood: ['the bit about weather']
    });
    const answer = await (await aiProposals(request(body), cfg(), { client })).json();
    expect(answer.ranked).toEqual([{ index: 1, reason: 'Older BLs.' }, { index: 0, reason: 'Exact.' }]);
    expect(answer.rules).toEqual({ maxBls: 3, preferOlder: true, excludeTf: ['TF00000002'] });
    expect(answer.notUnderstood).toEqual(['the bit about weather', 'a tolerance wider than 1% (5%)', 'cheapestFirst']);
    expect(answer.model).toBe('claude-opus-5-5');
  });

  it('answers 502 when Claude declines or gives no usable answer', async () => {
    const { client } = fake(null, 'refusal');
    expect((await aiProposals(request(body), cfg(), { client })).status).toBe(502);
  });

  it('refuses more than 20 combinations', async () => {
    const { client } = fake({ ranked: [], rules: [], notUnderstood: [] });
    const many = { ...body, candidates: Array.from({ length: 21 }, () => body.candidates[0]) };
    expect((await aiProposals(request(many), cfg(), { client })).status).toBe(400);
  });
});

describe('the BackEnd routes /api/ai/proposals', () => {
  let app: FastifyInstance;
  beforeAll(async () => { freshStore(); app = buildServer(testConfig({ APP_ORIGINS: FRONTEND }), {}, { client: null }); await app.ready(); });
  afterAll(async () => { await app.close(); });
  it('reaches the AI route (503 without a key)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/ai/proposals', headers: { origin: FRONTEND, 'x-app-request': '1', 'content-type': 'application/json' }, payload: JSON.stringify(body) });
    expect(res.statusCode).toBe(503);
  });
});

describe('POST /api/ai/ask', () => {
  const rest = { deal: body.deal, candidates: body.candidates, bls: body.bls };
  const ask = { ...rest, question: 'Why is BL 4000000007 in Proposal 1? Keep trade flow TF00000002 out.', history: [{ question: 'Which is oldest?', answer: 'Proposal 1.' }] };
  const askRequest = (payload: unknown) => new Request('http://127.0.0.1:3200/api/ai/ask', {
    method: 'POST', headers: { origin: FRONTEND, 'x-app-request': '1', 'content-type': 'application/json' }, body: JSON.stringify(payload)
  });

  it('answers 503 when no API key is configured', async () => {
    expect((await aiAsk(askRequest(ask), cfg(), { client: null })).status).toBe(503);
  });
  it('refuses an empty question', async () => {
    expect((await aiAsk(askRequest({ ...ask, question: '  ' }), cfg(), { client: null })).status).toBe(400);
  });
  it('sends only the listed fields and returns the answer with the rules it understood', async () => {
    const { client, sent } = fake({ answer: ' BL 4000000007 brings the total to the amount. ', rules: [{ kind: 'excludeTf', values: ['TF00000002'], number: null }, { kind: 'colour', values: [], number: null }], notUnderstood: [] });
    const res = await aiAsk(askRequest(ask), cfg(), { client });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ answer: 'BL 4000000007 brings the total to the amount.', rules: { excludeTf: ['TF00000002'] }, notUnderstood: ['colour'], model: AI_MODEL });
    expect(sent[0]).toMatchObject({ model: 'claude-opus-5-5' });
    const content = JSON.stringify(sent[0].messages);
    expect(content).toContain('Keep trade flow TF00000002 out');
    for (const secret of ['secret desc', 'Olam', 'ALMOND STD5', '1490004320', '9230140002']) expect(content).not.toContain(secret);
  });
  it('answers 502 when Claude declines', async () => {
    const { client } = fake({ answer: '', rules: [], notUnderstood: [] }, 'refusal');
    expect((await aiAsk(askRequest(ask), cfg(), { client })).status).toBe(502);
  });
});

describe('the BackEnd route /api/ai/ask', () => {
  let app: FastifyInstance;
  beforeAll(async () => { freshStore(); app = buildServer(testConfig({ APP_ORIGINS: FRONTEND }), {}, { client: null }); await app.ready(); });
  afterAll(async () => { await app.close(); });
  it('reaches the route (503 without a key)', async () => {
    const rest = { deal: body.deal, candidates: body.candidates, bls: body.bls };
    const res = await app.inject({ method: 'POST', url: '/api/ai/ask', headers: { origin: FRONTEND, 'x-app-request': '1', 'content-type': 'application/json' }, payload: JSON.stringify({ ...rest, question: 'why?', history: [] }) });
    expect(res.statusCode).toBe(503);
  });
});

describe('POST /api/ai/interpret', () => {
  const input = {
    text: 'BLs from vessels arriving next week, exclude 4000000024',
    deal: { dealId: '7000000081', tsfCommodity: 'C112' },
    commodities: [{ commodity: 'C112', description: 'SOYOIL', tsfCommodity: 'C112' }],
    today: '2026-11-06'
  };
  const interpretRequest = (payload: unknown) => new Request('http://127.0.0.1:3200/api/ai/interpret', {
    method: 'POST', headers: { origin: FRONTEND, 'x-app-request': '1', 'content-type': 'application/json' }, body: JSON.stringify(payload)
  });
  const reading = {
    scope: 'selected', dealAmount: null, dealRemaining: null, dealIds: [],
    blAmount: { op: '>', value: 50000, to: null }, blQuantity: null, tfDate: { from: '2026-11-09', to: '2026-11-15', fromStrict: false, toStrict: false },
    onlyBls: [], includeBls: ['12345'], excludeBls: ['4000000024'], onlyTfs: [], excludeTfs: [],
    commodities: ['C112', 'GOLD'], maxBls: 700, minBls: null, olderFirst: true, newerFirst: false, fewerTradeFlows: false,
    notUnderstood: ['vessels']
  };

  it('answers 503 when no API key is configured', async () => {
    expect((await aiInterpret(interpretRequest(input), cfg(), { client: null })).status).toBe(503);
  });
  it('sends only the text, the deal, the commodity master and the date, and keeps only well-formed criteria', async () => {
    const { client, sent } = fake(reading);
    const res = await aiInterpret(interpretRequest({ ...input, secretNotes: 'Olam' }), cfg(), { client });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.criteria).toEqual({
      scope: 'selected', deal: {},
      bl: { amount: { op: '>', value: 50000 }, tfDate: { from: '2026-11-09', fromStrict: false, to: '2026-11-15', toStrict: false }, exclude: ['4000000024'] },
      commodity: ['C112'], order: { older: true }
    });
    expect([...body.notUnderstood].sort()).toEqual(['BL 12345 (not valid)', 'a number of BLs (not valid)', 'commodity GOLD (not valid)', 'vessels']);
    expect(body.model).toBe(AI_MODEL);
    expect(JSON.stringify(sent[0].messages)).not.toContain('Olam');
  });
  it('refuses an empty text', async () => {
    expect((await aiInterpret(interpretRequest({ ...input, text: ' ' }), cfg(), { client: null })).status).toBe(400);
  });
});

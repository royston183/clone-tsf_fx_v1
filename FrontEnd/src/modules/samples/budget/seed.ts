// Sample budget lines: GL accounts 400100 and 500100, cost centers CC10 and CC20, periods 04-06 2026.
import type { Row } from '@/lib/grid/types';
import type { ModuleSeed } from '../../types';

export function budgetSeed(): ModuleSeed {
  const lines: Row[] = [];
  for (const gl of ['400100', '500100']) for (const costCenter of ['CC10', 'CC20']) for (const month of ['04', '05', '06']) {
    lines.push({ gl, costCenter, month, year: '2026', amount: `${Number(gl[0]) * 10000 + Number(month) * 1000}.00`, currency: 'INR' });
  }
  return { tables: { budget: lines } };
}

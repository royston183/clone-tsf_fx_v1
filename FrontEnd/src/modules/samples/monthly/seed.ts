// Sample amounts: company codes 1000 and 2000, periods 01–03 2026, five GL accounts each (Rent in USD).
import type { Row } from '@/lib/grid/types';
import type { ModuleSeed } from '../../types';
import { GL_ACCOUNTS } from '../lookups';

export function monthlySeed(): ModuleSeed {
  const amounts: Row[] = [];
  for (const company of ['1000', '2000']) for (const month of ['01', '02', '03']) {
    GL_ACCOUNTS.slice(0, 5).forEach((g, i) => {
      amounts.push({ company, month, year: '2026', gl: g.CODE, amount: `${(i + 1) * 12500 + Number(month) * 100}.50`, currency: g.CODE === '500300' ? 'USD' : 'INR', remarks: '' });
    });
  }
  return { tables: { amounts } };
}

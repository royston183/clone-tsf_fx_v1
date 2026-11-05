import { describe, expect, it } from 'vitest';
import { valueCodec } from '@core/server/odata-backend';
import type { AnyModule } from '@/modules/registry';
import type { ODataContract } from '@/modules/types';

const def = {
  fields: { deals: ['id', 'amount', 'valueDate', 'active', 'count'] },
  tabs: [{ id: 'deals', grid: [
    { field: 'id', label: 'ID', key: true },
    { field: 'amount', label: 'Amount', type: 'amount' },
    { field: 'valueDate', label: 'Value Date', type: 'date' },
    { field: 'active', label: 'Active', flag: true },
    { field: 'count', label: 'Count', type: 'integer' }
  ] }]
} as unknown as AnyModule;
const contract: ODataContract = { service: 'S', naming: 'pascal', flagType: 'boolean', tables: { deals: { entitySet: 'Deal' } } };

describe('valueCodec', () => {
  const codec = valueCodec(def, contract);
  it('reads SAP values into canonical strings', () => {
    expect(codec.toApp('deals', { Id: 'D1', Amount: 1234.5, ValueDate: '2026-04-01', Active: true, Count: '00005', '@odata.etag': 'W/"1"' }))
      .toEqual({ id: 'D1', amount: '1234.50', valueDate: '2026-04-01', active: 'X', count: '00005', __etag: 'W/"1"' });
  });
  it('sends decimals as numbers, blank dates as null, flags per contract, integers as strings', () => {
    expect(codec.valueOut('deals', 'amount', '1234.50')).toBe(1234.5);
    expect(codec.valueOut('deals', 'valueDate', '')).toBeNull();
    expect(codec.valueOut('deals', 'active', 'X')).toBe(true);
    expect(codec.valueOut('deals', 'count', '00005')).toBe('00005');
  });
  it('sends numeric-contract integers as numbers and an empty one as null', () => {
    const numeric = valueCodec(def, { ...contract, numbers: ['count'] });
    expect(numeric.valueOut('deals', 'count', '5')).toBe(5);
    expect(numeric.valueOut('deals', 'count', '')).toBeNull();
  });
});

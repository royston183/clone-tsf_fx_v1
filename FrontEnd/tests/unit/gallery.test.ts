// tests/unit/gallery.test.ts
import { describe, expect, it } from 'vitest';
import { galleryEnabled } from '@/lib/gallery';
import { FIELD_SAMPLES } from '@/components/gallery/samples';
import type { FieldType } from '@/lib/fields';

describe('galleryEnabled', () => {
  it('is on in development and in mock mode, off in production with SAP', () => {
    expect(galleryEnabled('development', true)).toBe(true);
    expect(galleryEnabled('production', false)).toBe(true);
    expect(galleryEnabled('production', true)).toBe(false);
    expect(galleryEnabled(undefined, true)).toBe(true);
  });
});

describe('gallery samples', () => {
  it('show every field type once', () => {
    const all: FieldType[] = ['text', 'code', 'integer', 'amount', 'decimal', 'date', 'dateRange', 'period', 'select', 'suggest', 'multiSelect', 'flag', 'toggle', 'segmented', 'textarea', 'file', 'display'];
    expect(FIELD_SAMPLES.map(s => s.def.type).sort()).toEqual([...all].sort());
  });
});

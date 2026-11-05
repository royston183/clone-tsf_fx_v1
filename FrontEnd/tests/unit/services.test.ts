import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SERVICES } from '@/config/services';

// The ref/ services (company code, partner, G/L) are OData V2 (/sap/opu/odata/...). FS Sprint reads this JSON file (never the TypeScript): it maps each service to a URL on the active SAP system.
const list = JSON.parse(readFileSync('src/config/services.json', 'utf8')) as Record<string, unknown>[];

describe('services.json', () => {
  it('lists each service with a key, title, binding and service root path', () => {
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);
    for (const s of list) {
      expect(Object.keys(s).sort()).toEqual(['binding', 'key', 'path', 'title']);
      expect(s.key).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(typeof s.title === 'string' && s.title.trim() !== '').toBe(true);
      expect(s.binding).toMatch(/^[A-Z][A-Z0-9_]*$/);
      expect(s.path).toMatch(/^\/sap\/opu\/odata4?\/[A-Za-z0-9_/]+\/$/);
    }
    expect(new Set(list.map(s => s.key)).size).toBe(list.length);
  });
  it('is the list the server reads', () => {
    expect(SERVICES).toEqual(list);
  });
});

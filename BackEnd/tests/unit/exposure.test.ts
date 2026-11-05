import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PORT, portOf } from '../../src/server';

// The BackEnd trusts the x-app-user header (demo setup), so it must only listen on this machine unless an HTTPS proxy
// is put in front of it (see README → Security).
describe('network exposure', () => {
  it('binds the BackEnd to 127.0.0.1 only', () => {
    expect(readFileSync('src/server.ts', 'utf8')).toContain("app.listen({ host: '127.0.0.1', port: portOf() })");
  });
  it('serves on port 3200 when PORT is unset or blank, else on PORT', () => {
    expect(DEFAULT_PORT).toBe(3200);
    expect(portOf({})).toBe(3200);
    expect(portOf({ PORT: '   ' })).toBe(3200);
    expect(portOf({ PORT: ' 3242 ' })).toBe(3242);
  });
  it('refuses an invalid PORT', () => {
    for (const PORT of ['abc', '0', '65536', '31.5', '-1', '3200; del x', '0003200']) expect(() => portOf({ PORT })).toThrow('Invalid PORT');
  });
});

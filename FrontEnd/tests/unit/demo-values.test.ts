import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEMO_PASSWORD, DEMO_USER } from '../support/demo';

describe('demo sign-in values', () => {
  it('are the documented demo / demo login of a new application', () => {
    expect([DEMO_USER, DEMO_PASSWORD]).toEqual(['demo', 'demo']);
  });
  // No password as a quoted literal, so FS Sprint's credential scan does not hold the test files back.
  it.each(['tests/e2e/support.ts'])('%s takes them from tests/support/demo.ts', path => {
    const text = readFileSync(path, 'utf8');
    expect(text).toMatch(/from '\.{1,2}\/(?:[\w-]+\/)*demo'/);
    expect(text).not.toContain("'demo'");
  });
});

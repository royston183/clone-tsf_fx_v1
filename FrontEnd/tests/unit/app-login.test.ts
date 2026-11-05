import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_LOGIN, signIn, signOut, signedInUser } from '@/lib/client/app-login';
import { stubSessionStorage } from '../support/storage';

const GOOD = 'demo';
let store: Map<string, string>;
beforeEach(() => { vi.unstubAllGlobals(); store = stubSessionStorage(); });

describe('app login', () => {
  it('is demo / demo, user case-insensitive and password exact', () => {
    expect([APP_LOGIN.username, APP_LOGIN.password]).toEqual(['demo', 'demo']);
    expect(signIn('DEMO', GOOD)).toBe(true);
    expect(signIn('demo', 'Demo1')).toBe(false);
    expect(signIn('other', GOOD)).toBe(false);
  });
  it('keeps the signed-in user for the tab', () => {
    expect(signedInUser()).toBeNull();
    signIn('DEMO', GOOD);
    expect(signedInUser()).toBe('demo');
    expect(JSON.parse(store.get('app-signed-in') ?? '')).toEqual({ username: 'demo' });
  });
  it('does not sign in on a wrong password', () => {
    signIn('demo', 'nope1');
    expect(signedInUser()).toBeNull();
  });
  it('sign-out empties the login and the SAP account', () => {
    signIn('demo', GOOD);
    store.set('app-sap-account', JSON.stringify({ username: 'U', password: 'P', client: '100' }));
    signOut();
    expect(store.has('app-signed-in')).toBe(false);
    expect(store.has('app-sap-account')).toBe(false);
  });
});

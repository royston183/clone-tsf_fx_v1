import { describe, expect, it } from 'vitest';
import { connectionAlert, connectionSummary } from '@/lib/workspace-status';
import type { WorkspaceInfo } from '@/lib/workspace-types';

const ws = (session: Partial<NonNullable<WorkspaceInfo['session']>> | null, usesSap = true): WorkspaceInfo => ({
  session: session && { username: 'demo', sapUsername: 'KARTHIK', actingUser: 'KARTHIK', sapStatus: 'connected', sapError: '', checkedAt: null, ...session },
  systemId: 'DS4_100_TFSIN', client: '100', relayUrl: 'http://localhost:3001', usesSap, services: [], gallery: !usesSap
});

describe('connectionAlert', () => {
  it('explains an unavailable SAP account in the shell', () => {
    expect(connectionAlert(ws({ sapStatus: 'unavailable', sapError: 'SAP rejected the user name or password.' })))
      .toBe('SAP is unavailable: SAP rejected the user name or password.');
  });
  it('stays quiet while connected, checking, not tested, or without SAP', () => {
    expect(connectionAlert(ws({}))).toBeNull();
    expect(connectionAlert(ws({ sapStatus: 'checking' }))).toBeNull();
    expect(connectionAlert(ws({ sapStatus: 'none' }))).toBeNull();
    expect(connectionAlert(ws({ sapStatus: 'none' }, false))).toBeNull();
  });
});

describe('connectionSummary', () => {
  it('names the SAP user once the account is tested', () => {
    expect(connectionSummary(ws({}))).toEqual({ title: 'Connected to SAP through OData V4', text: 'Applications read and write DS4_100_TFSIN client 100 through their RAP services as the SAP user KARTHIK.' });
  });
  it('names the relay before the account is tested', () => {
    expect(connectionSummary(ws({ sapStatus: 'none' }))).toEqual({ title: 'SAP through the local relay', text: 'Applications read and write DS4_100_TFSIN client 100 through the SAP relay at http://localhost:3001 as the SAP user KARTHIK.' });
  });
  it('asks for a SAP account when the tab has none', () => {
    expect(connectionSummary(ws({ sapStatus: 'none', sapUsername: '' })).title).toBe('No SAP account');
  });
  it('does not claim a connection while SAP is unavailable, and names the relay', () => {
    const s = connectionSummary(ws({ sapStatus: 'unavailable', sapError: 'x' }));
    expect(s.title).toBe('SAP is not reachable');
    expect(s.text).toContain('sap-relay (http://localhost:3001)');
  });
  it('does not claim a connection without a session', () => {
    expect(connectionSummary(ws(null)).title).toBe('SAP is not reachable');
    expect(connectionAlert(ws(null))).toBeNull();
  });
  it('says when no application reads SAP', () => {
    expect(connectionSummary(ws({ sapStatus: 'none' }, false)).title).toBe('No SAP data yet');
  });
});

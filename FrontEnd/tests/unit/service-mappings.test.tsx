import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServiceMappings } from '@/components/settings/ServiceMappings';
import { WorkspaceProvider } from '@/components/shell/WorkspaceProvider';
import { sourceStatus } from '@/lib/client/data';
import { NavProvider } from '@/lib/client/nav';
import type { WorkspaceInfo } from '@/lib/workspace-types';
import { SERVER_MODULES, type ModuleData } from '@/modules/server-registry';
import { FIXTURE_SERVICE, FIXTURES, registerFixtureModules } from '../support/fixtures';

// Settings → Service mappings: the status follows the module's source, not whether config/services.json has its path.
// It runs on the test-* fixtures (one catalogue application each), whatever applications the template or an app has.
registerFixtureModules();
const SAP = FIXTURES.sap, APP = FIXTURES.app, SAMPLE = FIXTURES.sample;
const workspace: WorkspaceInfo = {
  session: null, systemId: 'TEST', client: '100', relayUrl: 'http://localhost:3001', usesSap: true, gallery: false,
  services: [{ key: FIXTURE_SERVICE.key, binding: FIXTURE_SERVICE.binding, path: FIXTURE_SERVICE.path }]
} as WorkspaceInfo;
const html = () => renderToStaticMarkup(<NavProvider><WorkspaceProvider initial={workspace}><ServiceMappings /></WorkspaceProvider></NavProvider>);
const row = (markup: string, app: string) => new RegExp(`<tr[^>]*><td[^>]*>${app}</td>.*?</tr>`).exec(markup)?.[0] ?? '';

let original: ModuleData;
beforeEach(() => { original = SERVER_MODULES[SAP.id]; vi.stubGlobal('location', { pathname: '/settings/service-mappings', search: '' }); });
afterEach(() => { SERVER_MODULES[SAP.id] = original; vi.unstubAllGlobals(); });

describe('service mappings', () => {
  it('derives the status from the source: sap, app or none', () => {
    expect(sourceStatus(SAP.id)).toEqual({ label: 'SAP OData through the relay', sap: true });
    expect(sourceStatus(APP.id)).toEqual({ label: "The application's own data", sap: false });
    expect(sourceStatus(SAMPLE.id)).toEqual({ label: 'Sample data', sap: false });
    expect(sourceStatus(undefined)).toEqual({ label: 'Sample data', sap: false });
  });

  it('a sap module with a mapped path shows SAP OData through the relay', () => {
    const tr = row(html(), SAP.title);
    expect(tr).toContain(FIXTURE_SERVICE.binding);
    expect(tr).toContain('class="kit-status green"');
    expect(tr).toContain('SAP OData through the relay</span>');
  });

  it('a mapped path alone is not SAP: the same module on sample data or as app data says so', () => {
    SERVER_MODULES[SAP.id] = { ...original, source: undefined };
    expect(row(html(), SAP.title)).toContain('class="kit-status amber"');
    expect(row(html(), SAP.title)).toContain('Sample data</span>');
    SERVER_MODULES[SAP.id] = { ...original, source: 'app' };
    expect(row(html(), SAP.title)).toContain('class="kit-status green"');
    expect(row(html(), SAP.title)).toContain('The application&#x27;s own data</span>');
  });

  it('lists every catalogue application', () => {
    const markup = html();
    for (const f of [SAP, APP, SAMPLE]) expect(row(markup, f.title), f.id).not.toBe('');
  });
});

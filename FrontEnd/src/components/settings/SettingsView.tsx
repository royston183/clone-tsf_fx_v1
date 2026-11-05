import type { CatalogNode } from '@/config/catalog';
import { Appearance } from './Appearance';
import { SapConnection } from './SapConnection';
import { ServiceMappings } from './ServiceMappings';

export function SettingsView({ node }: { node: CatalogNode }) {
  if (node.settings === 'appearance') return <Appearance />;
  if (node.settings === 'service-mappings') return <ServiceMappings />;
  return <SapConnection />;
}

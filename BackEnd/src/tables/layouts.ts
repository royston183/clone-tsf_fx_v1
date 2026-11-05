// The saved ALV layouts of each module (table layouts), written once over the Driver for both engines.
import type { LayoutStore, StoredLayout } from '@core/platform';
import type { Driver } from './driver';

const INSERT = `INSERT INTO layouts (module_id, scope, owner, name, description, is_default, layout, changed_by, changed_on, position)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

/** Per module: its layouts, replaced as a whole in one driver transaction on save. */
export function driverLayouts(driver: Driver): (moduleId: string) => LayoutStore {
  return moduleId => ({
    async load(): Promise<StoredLayout[]> {
      const rows = await driver.all('SELECT * FROM layouts WHERE module_id = ? ORDER BY position', [moduleId]);
      return rows.map(r => ({
        name: String(r.name), description: String(r.description), scope: r.scope as StoredLayout['scope'],
        isDefault: Number(r.is_default) === 1, layout: JSON.parse(String(r.layout)) as StoredLayout['layout'],
        changedBy: String(r.changed_by), changedOn: String(r.changed_on), owner: String(r.owner)
      }));
    },
    async save(layouts: StoredLayout[]): Promise<void> {
      await driver.transaction(async tx => {
        await tx.run('DELETE FROM layouts WHERE module_id = ?', [moduleId]);
        for (const [position, l] of layouts.entries()) {
          await tx.run(INSERT, [moduleId, l.scope, l.owner, l.name, l.description, l.isDefault ? 1 : 0,
            JSON.stringify(l.layout), l.changedBy, l.changedOn, position]);
        }
      });
    }
  });
}

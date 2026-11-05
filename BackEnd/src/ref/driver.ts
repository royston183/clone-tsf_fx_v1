// The database driver of the /api/ref/localdb routes that keep their own rows (not the middleware's): the platform
// registers the driver it runs on (SQLite locally, MySQL when deployed), so the routes need no second connection.
import type { Driver } from '../tables/driver';

let current: Driver | undefined;
export function setRefDriver(driver: Driver): void { current = driver; }
export function refDriver(): Driver {
  if (!current) throw new Error('No database driver is set for the reference routes.');
  return current;
}

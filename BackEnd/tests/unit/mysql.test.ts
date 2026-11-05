import { afterEach, describe, expect, it, vi } from 'vitest';
import mysql, { type Pool } from 'mysql2/promise';
import { mysqlDriver, mysqlPool } from '../../src/mysql';
import { driverLayouts } from '../../src/tables/layouts';

describe('MySQL deployment store', () => {
  afterEach(() => vi.restoreAllMocks());

  it('requires every provisioner setting and validates the port before connecting', () => {
    expect(() => mysqlPool({})).toThrow('MYSQL_HOST');
    expect(() => mysqlPool({ MYSQL_PORT: '70000' })).toThrow('MYSQL_PORT');
    const pool = mysqlPool({ MYSQL_HOST: 'db.example', MYSQL_DATABASE: 'app', MYSQL_USER: 'app', MYSQL_PASSWORD: 'placeholder', MYSQL_PORT: '3306' });
    expect(pool).toBeTruthy();
    void pool.end();
  });

  it('creates the pool with string dates, big numbers as strings and a small statement cache', () => {
    const spy = vi.spyOn(mysql, 'createPool');
    const pool = mysqlPool({ MYSQL_HOST: 'h', MYSQL_DATABASE: 'd', MYSQL_USER: 'u', MYSQL_PASSWORD: 'p' });
    expect(spy.mock.calls[0][0]).toMatchObject({ dateStrings: true, supportBigNumbers: true, bigNumberStrings: true, maxPreparedStatements: 100 });
    void pool.end();
    spy.mockRestore();
  });

  it('mysqlDriver.transaction commits and releases, or rolls back on a throw', async () => {
    const connection = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn().mockResolvedValue([[{ a: 1 }], []]) };
    const driver = mysqlDriver({ getConnection: vi.fn().mockResolvedValue(connection) } as unknown as Pool);
    await expect(driver.transaction(tx => tx.all('SELECT 1 AS a', []))).resolves.toEqual([{ a: 1 }]);
    expect(connection.beginTransaction).toHaveBeenCalled();
    expect(connection.commit).toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
    await expect(driver.transaction(async () => { throw new Error('bad'); })).rejects.toThrow('bad');
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(2);
  });
  it('saves layouts in one transaction on one connection, with ? parameters only', async () => {
    const execute = vi.fn().mockResolvedValue([{}, []]);
    const connection = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute };
    const poolExecute = vi.fn().mockResolvedValue([[{ scope: 'shared', owner: '', name: 'Wide', description: '', is_default: '1', layout: '{"columns":["a"]}', changed_by: 'DEMO', changed_on: '2026-10-27' }], []]);
    const layouts = driverLayouts(mysqlDriver({ getConnection: vi.fn().mockResolvedValue(connection), execute: poolExecute } as unknown as Pool))('demo');
    await layouts.save([{ name: 'Wide', description: '', scope: 'shared', isDefault: true, layout: { columns: ['a'] } as never, changedBy: 'DEMO', changedOn: '2026-10-27', owner: '' }]);
    expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls.map(c => [String(c[0]).split(/\s+/).slice(0, 3).join(' '), c[1]])).toEqual([
      ['DELETE FROM layouts', ['demo']],
      ['INSERT INTO layouts', ['demo', 'shared', '', 'Wide', '', 1, '{"columns":["a"]}', 'DEMO', '2026-10-27', 0]]
    ]);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(poolExecute).not.toHaveBeenCalled();
    await expect(layouts.load()).resolves.toEqual([{ name: 'Wide', description: '', scope: 'shared', isDefault: true, layout: { columns: ['a'] }, changedBy: 'DEMO', changedOn: '2026-10-27', owner: '' }]);
    expect(poolExecute.mock.calls[0]).toEqual(['SELECT * FROM layouts WHERE module_id = ? ORDER BY position', ['demo']]);
  });
  it('a failed rollback keeps the original error and destroys the connection', async () => {
    const connection = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn().mockRejectedValue(new Error('lost')), release: vi.fn(), destroy: vi.fn() };
    const driver = mysqlDriver({ getConnection: vi.fn().mockResolvedValue(connection) } as unknown as Pool);
    await expect(driver.transaction(async () => { throw new Error('original'); })).rejects.toThrow('original');
    expect(connection.destroy).toHaveBeenCalledTimes(1);
    expect(connection.release).not.toHaveBeenCalled();
  });
});

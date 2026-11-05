import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { sqliteDriver } from '../../src/db';

const setup = async () => {
  const driver = sqliteDriver(new DatabaseSync(':memory:'));
  await driver.run('CREATE TABLE t (id INTEGER PRIMARY KEY, tag TEXT)');
  return driver;
};

describe('sqliteDriver', () => {
  it('runs and reads with parameters', async () => {
    const d = await setup();
    await d.run('INSERT INTO t (tag) VALUES (?)', ['a']);
    expect((await d.all('SELECT tag FROM t WHERE tag = ?', ['a'])).map(r => r.tag)).toEqual(['a']);
    expect(d.engine).toBe('sqlite');
  });

  it('keeps concurrent transactions apart: one rolled back, the other whole', async () => {
    const d = await setup();
    const tick = () => new Promise(r => setTimeout(r, 0));
    const first = d.transaction(async tx => {
      await tx.run('INSERT INTO t (tag) VALUES (?)', ['first-1']); await tick();
      await tx.run('INSERT INTO t (tag) VALUES (?)', ['first-2']);
    });
    const second = d.transaction(async tx => {
      await tx.run('INSERT INTO t (tag) VALUES (?)', ['second-1']); await tick();
      throw new Error('boom');
    });
    const results = await Promise.allSettled([first, second]);
    expect(results[0].status).toBe('fulfilled');
    expect(results[1]).toMatchObject({ status: 'rejected', reason: { message: 'boom' } });
    expect((await d.all('SELECT tag FROM t ORDER BY id')).map(r => r.tag)).toEqual(['first-1', 'first-2']);
  });

  it('a rollback leaves no row, and a plain statement waits for a running transaction', async () => {
    const d = await setup();
    await expect(d.transaction(async tx => { await tx.run('INSERT INTO t (tag) VALUES (?)', ['x']); throw new Error('no'); })).rejects.toThrow('no');
    expect(await d.all('SELECT * FROM t')).toEqual([]);
    const tx = d.transaction(async t => { await t.run('INSERT INTO t (tag) VALUES (?)', ['y']); await new Promise(r => setTimeout(r, 5)); });
    const seen = d.all('SELECT * FROM t');
    await tx;
    expect((await seen).length).toBe(1);
  });
  it('keeps the real error when SQLite rolls back by itself, and the next transaction works', async () => {
    const d = await setup();
    await d.run('CREATE UNIQUE INDEX t_tag ON t (tag)');
    await d.run('INSERT INTO t (tag) VALUES (?)', ['dup']);
    await expect(d.transaction(async tx => { await tx.run('INSERT OR ROLLBACK INTO t (tag) VALUES (?)', ['dup']); }))
      .rejects.toThrow(/UNIQUE constraint failed/);
    await d.transaction(async tx => { await tx.run('INSERT INTO t (tag) VALUES (?)', ['ok']); });
    expect((await d.all('SELECT tag FROM t ORDER BY id')).map(r => r.tag)).toEqual(['dup', 'ok']);
  });

  it('refuses the outer driver from inside a transaction body instead of deadlocking', async () => {
    const d = await setup();
    await expect(d.transaction(async () => { await d.run('INSERT INTO t (tag) VALUES (?)', ['x']); }))
      .rejects.toThrow('Inside a transaction, use the tx driver it hands you.');
    await expect(d.transaction(async () => { await d.all('SELECT 1'); })).rejects.toThrow('use the tx driver');
    await expect(d.transaction(async () => { await d.transaction(async () => undefined); })).rejects.toThrow('use the tx driver');
    expect(await d.all('SELECT * FROM t')).toEqual([]);
  });
});

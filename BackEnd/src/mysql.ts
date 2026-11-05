// The MySQL pool and Driver used when the Azure provisioner injects DB_ENGINE=mysql and MYSQL_* settings.
import mysql, { type Pool, type PoolConnection, type RowDataPacket } from 'mysql2/promise';
import type { Driver, SqlValue } from './tables/driver';

function required(env: Record<string, string | undefined>, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`DB_ENGINE=mysql needs ${name}.`);
  return value;
}

export function mysqlPool(env: Record<string, string | undefined> = process.env): Pool {
  const portText = env.MYSQL_PORT?.trim() || '3306';
  if (!/^\d+$/.test(portText) || Number(portText) < 1 || Number(portText) > 65535) throw new Error('Invalid MYSQL_PORT.');
  return mysql.createPool({
    host: required(env, 'MYSQL_HOST'),
    port: Number(portText),
    database: required(env, 'MYSQL_DATABASE'),
    user: required(env, 'MYSQL_USER'),
    password: required(env, 'MYSQL_PASSWORD'),
    ssl: { rejectUnauthorized: true },
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 20,
    // The server's max_prepared_stmt_count (16382) is shared by every app on it; mysql2 would cache 16000 per connection.
    maxPreparedStatements: 100,
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true
  });
}

/** The Driver over a MySQL pool; a transaction holds one pool connection from begin to commit or rollback. */
export function mysqlDriver(pool: Pool): Driver {
  const over = (runner: Pick<Pool, 'execute'>, inTx: boolean): Driver => ({
    engine: 'mysql',
    async all(sql: string, params: SqlValue[] = []) {
      const [rows] = await runner.execute<RowDataPacket[]>(sql, params);
      return rows as Record<string, unknown>[];
    },
    async run(sql: string, params: SqlValue[] = []) { await runner.execute(sql, params); },
    transaction: <T>(work: (tx: Driver) => Promise<T>): Promise<T> =>
      inTx ? work(over(runner, true)) : transaction(pool, connection => work(over(connection, true)))
  });
  return over(pool, false);
}

async function transaction<T>(pool: Pool, work: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await pool.getConnection();
  let broken = false;
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    // A failed rollback keeps the original error and drops the connection instead of returning it to the pool.
    try { await connection.rollback(); } catch { broken = true; }
    throw error;
  } finally { if (broken) connection.destroy(); else connection.release(); }
}

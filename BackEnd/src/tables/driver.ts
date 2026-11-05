// The two-engine seam of the data tables: one small interface over node:sqlite and mysql2.
export type SqlValue = string | number | null;

export interface Driver {
  engine: 'sqlite' | 'mysql';
  /** For statements that return rows. */
  all(sql: string, params?: SqlValue[]): Promise<Record<string, unknown>[]>;
  run(sql: string, params?: SqlValue[]): Promise<void>;
  /**
   * Every statement inside `work` goes through `tx`; nothing else runs on the connection meanwhile (SQLite).
   * A nested `tx.transaction` joins the outer transaction (no savepoint).
   */
  transaction<T>(work: (tx: Driver) => Promise<T>): Promise<T>;
}

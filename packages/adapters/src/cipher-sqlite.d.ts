declare module "better-sqlite3-multiple-ciphers" {
  namespace Database {
    interface Statement {
      get(...params: unknown[]): unknown;
      run(...params: unknown[]): { changes: number };
      all(...params: unknown[]): unknown[];
    }

    interface Database {
      prepare(source: string): Statement;
      exec(source: string): this;
      pragma(source: string): unknown;
      transaction<T extends () => unknown>(fn: T): T;
      close(): void;
      key(key: Buffer): number;
      rekey(key: Buffer): number;
    }
  }

  interface DatabaseConstructor {
    new (filename?: string): Database.Database;
    prototype: Database.Database;
  }

  const Database: DatabaseConstructor;
  export = Database;
}

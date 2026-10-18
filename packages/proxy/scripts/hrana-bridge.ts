import { createServer, type Server } from 'node:http';
import { createClient } from '@libsql/client';

type HranaValue = {
  type?: string;
  value?: string | number;
  base64?: string;
};

type SqlResult = {
  columns: string[];
  columnTypes: string[];
  rows: Array<Record<string, unknown>>;
  rowsAffected: number;
  lastInsertRowid?: bigint | number | null;
};

type SqlClient = {
  execute(stmt: { sql: string; args: unknown[] | Record<string, unknown> }): Promise<SqlResult>;
  executeMultiple(sql: string): Promise<void>;
  close(): void;
};

type StreamState = {
  id: string;
  sql: Map<number, string>;
};

function hranaValueToJs(value: HranaValue | null | undefined): unknown {
  if (value == null || value.type === 'null' || value.type === undefined) return null;
  if (value.type === 'integer') return BigInt(String(value.value));
  if (value.type === 'float') return value.value;
  if (value.type === 'text') return value.value;
  if (value.type === 'blob') return Buffer.from(value.base64 ?? '', 'base64');
  throw new Error(`unsupported hrana value ${JSON.stringify(value)}`);
}

function jsToHranaValue(value: unknown, decltype = ''): HranaValue {
  if (value === null || value === undefined) return { type: 'null' };
  if (typeof value === 'bigint') return { type: 'integer', value: value.toString() };
  if (typeof value === 'string') return { type: 'text', value };
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return { type: 'blob', base64: Buffer.from(value).toString('base64') };
  }
  if (typeof value === 'number') {
    const type = decltype.toUpperCase();
    if (type.includes('INT') || (type === '' && Number.isSafeInteger(value))) {
      return { type: 'integer', value: String(Math.trunc(value)) };
    }
    return { type: 'float', value };
  }
  return { type: 'text', value: String(value) };
}

function stmtResult(result: SqlResult) {
  const cols = (result.columns ?? []).map((name, index) => ({
    name: name ?? '',
    decltype: result.columnTypes?.[index] || null,
  }));
  const rows = (result.rows ?? []).map((row) =>
    cols.map((col) => jsToHranaValue(row[col.name], col.decltype ?? '')),
  );
  const body: {
    cols: Array<{ name: string; decltype: string | null }>;
    rows: HranaValue[][];
    affected_row_count: number;
    last_insert_rowid?: string;
  } = {
    cols,
    rows,
    affected_row_count: Number(result.rowsAffected ?? 0),
  };
  if (result.lastInsertRowid !== undefined && result.lastInsertRowid !== null) {
    body.last_insert_rowid = result.lastInsertRowid.toString();
  }
  return body;
}

type BatchCond = {
  type: string;
  step?: number;
  cond?: BatchCond;
  conds?: BatchCond[];
};

function evalCond(cond: BatchCond | undefined, outcomes: string[]): boolean {
  if (!cond) return true;
  if (cond.type === 'ok') return outcomes[cond.step ?? -1] === 'ok';
  if (cond.type === 'error') return outcomes[cond.step ?? -1] === 'error';
  if (cond.type === 'not') return !evalCond(cond.cond, outcomes);
  if (cond.type === 'and') return (cond.conds ?? []).every((item) => evalCond(item, outcomes));
  if (cond.type === 'or') return (cond.conds ?? []).some((item) => evalCond(item, outcomes));
  if (cond.type === 'is_autocommit') return true;
  throw new Error(`unsupported batch condition ${cond.type}`);
}

export type HranaBridge = {
  url: string;
  authorizations: Array<string | undefined>;
  close(): Promise<void>;
};

/**
 * Loopback Hrana HTTP server backed by a local SQLite file.
 * Speaks enough of the Hrana HTTP protocol for the native libSQL client to
 * reach a local SQLite file when a test sets DATABASE_URL to an http URL.
 */
export async function startHranaBridge(fileUrl: string): Promise<HranaBridge> {
  const db = createClient({ url: fileUrl }) as unknown as SqlClient;
  const streams = new Map<string, StreamState>();
  let nextBaton = 1;
  let chain = Promise.resolve();
  const authorizations: Array<string | undefined> = [];

  function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = chain.then(fn, fn);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  function streamFor(baton: string | undefined): StreamState {
    if (baton && streams.has(baton)) return streams.get(baton)!;
    const id = String(nextBaton++);
    const state = { id, sql: new Map<number, string>() };
    streams.set(id, state);
    return state;
  }

  async function executeSql(state: StreamState, stmt: {
    sql?: string;
    sql_id?: number;
    args?: HranaValue[];
    named_args?: Array<{ name: string; value: HranaValue }>;
  }): Promise<SqlResult> {
    const sql = stmt.sql ?? state.sql.get(stmt.sql_id ?? -1);
    if (typeof sql !== 'string') throw new Error('missing SQL for statement');
    const positional = (stmt.args ?? []).map((value) => hranaValueToJs(value));
    const named: Record<string, unknown> = {};
    for (const arg of stmt.named_args ?? []) named[arg.name] = hranaValueToJs(arg.value);
    const args = positional.length > 0 ? positional : named;
    return db.execute({ sql, args });
  }

  async function handleRequest(state: StreamState, request: {
    type: string;
    sql?: string;
    sql_id?: number;
    stmt?: {
      sql?: string;
      sql_id?: number;
      args?: HranaValue[];
      named_args?: Array<{ name: string; value: HranaValue }>;
    };
    batch?: { steps: Array<{ condition?: BatchCond; stmt: NonNullable<typeof request.stmt> }> };
  }) {
    if (request.type === 'close') return { type: 'close' };
    if (request.type === 'store_sql') {
      state.sql.set(request.sql_id ?? -1, request.sql ?? '');
      return { type: 'store_sql' };
    }
    if (request.type === 'close_sql') {
      state.sql.delete(request.sql_id ?? -1);
      return { type: 'close_sql' };
    }
    if (request.type === 'execute') {
      const result = await executeSql(state, request.stmt ?? {});
      return { type: 'execute', result: stmtResult(result) };
    }
    if (request.type === 'sequence') {
      const sql = request.sql ?? state.sql.get(request.sql_id ?? -1);
      if (typeof sql !== 'string') throw new Error('missing SQL for sequence');
      await db.executeMultiple(sql);
      return { type: 'sequence' };
    }
    if (request.type === 'batch') {
      const outcomes: string[] = [];
      const stepResults: Array<ReturnType<typeof stmtResult> | null> = [];
      const stepErrors: Array<{ message: string; code: string } | null> = [];
      for (const step of request.batch?.steps ?? []) {
        if (!evalCond(step.condition, outcomes)) {
          outcomes.push('skipped');
          stepResults.push(null);
          stepErrors.push(null);
          continue;
        }
        try {
          const result = await executeSql(state, step.stmt);
          outcomes.push('ok');
          stepResults.push(stmtResult(result));
          stepErrors.push(null);
        } catch (error) {
          const err = error as { message?: string; code?: string };
          outcomes.push('error');
          stepResults.push(null);
          stepErrors.push({ message: err.message ?? 'SQL error', code: err.code ?? 'SQLITE_ERROR' });
        }
      }
      return { type: 'batch', result: { step_results: stepResults, step_errors: stepErrors } };
    }
    throw new Error(`unsupported hrana request ${request.type}`);
  }

  const server: Server = createServer((req, res) => {
    authorizations.push(req.headers.authorization);
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      enqueue(async () => {
        if (req.method !== 'POST' || !req.url?.endsWith('/v2/pipeline')) {
          res.writeHead(404, { 'content-type': 'text/plain' });
          res.end('not found');
          return;
        }
        let body: { baton?: string; requests?: Array<{ type: string }> };
        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as typeof body;
        } catch {
          res.writeHead(400, { 'content-type': 'text/plain' });
          res.end('invalid json');
          return;
        }
        const state = streamFor(body.baton);
        const requests = body.requests ?? [];
        const results: unknown[] = [];
        let closed = false;
        for (let index = 0; index < requests.length; index++) {
          const request = requests[index]!;
          try {
            const response = await handleRequest(state, request as never);
            results.push({ type: 'ok', response });
            if (request.type === 'close') closed = true;
          } catch (error) {
            const err = error as { message?: string; code?: string };
            results.push({
              type: 'error',
              error: { message: err.message ?? 'SQL error', code: err.code ?? 'SQLITE_ERROR' },
            });
            for (let rest = index + 1; rest < requests.length; rest++) {
              results.push({
                type: 'error',
                error: { message: 'stream closed', code: 'HRANA_CLOSED_ERROR' },
              });
            }
            closed = true;
            break;
          }
        }
        if (closed) streams.delete(state.id);
        const payload: { results: unknown[]; baton?: string } = { results };
        if (!closed) payload.baton = state.id;
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(payload));
      }).catch((error: Error) => {
        if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain' });
        res.end(error.stack ?? error.message);
      });
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('hrana bridge failed to bind');
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    authorizations,
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      db.close();
    },
  };
}

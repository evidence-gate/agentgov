import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { budgetLedger, holds, auditLog } from './schema';

describe('Drizzle schema exports', () => {
  it('exports budgetLedger table', () => {
    expect(budgetLedger).toBeDefined();
    expect(budgetLedger).not.toBeUndefined();
  });

  it('exports holds table', () => {
    expect(holds).toBeDefined();
    expect(holds).not.toBeUndefined();
  });

  it('exports auditLog table', () => {
    expect(auditLog).toBeDefined();
    expect(auditLog).not.toBeUndefined();
  });

  it('auditLog table name is "audit_log"', () => {
    // Drizzle table symbol stores the table name
    // @ts-ignore — accessing internal symbol
    const tableName = auditLog[Symbol.for('drizzle:Name')] as string | undefined;
    expect(tableName).toBe('audit_log');
  });
});

describe('Migration file', () => {
  const migrationPath = path.resolve(__dirname, '../../migrations/0000_initial.sql');

  it('migration file exists at migrations/0000_initial.sql', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
  });

  it('migration contains CREATE TRIGGER audit_log_no_mutate', () => {
    const content = fs.readFileSync(migrationPath, 'utf-8');
    expect(content).toContain('CREATE TRIGGER audit_log_no_mutate');
  });

  it('migration contains CREATE TRIGGER audit_log_no_delete', () => {
    const content = fs.readFileSync(migrationPath, 'utf-8');
    expect(content).toContain('CREATE TRIGGER audit_log_no_delete');
  });
});

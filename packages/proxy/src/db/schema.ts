import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * budget_ledger — tracks per-agent budget limits and current spend.
 * Primary key is agent_id (one row per agent scope).
 */
export const budgetLedger = sqliteTable('budget_ledger', {
  agentId: text('agent_id').primaryKey(),
  limitUsd: real('limit_usd').notNull(),
  spentUsd: real('spent_usd').notNull().default(0),
  reservedUsd: real('reserved_usd').notNull().default(0),
  updatedAt: integer('updated_at').notNull(),
});

/**
 * holds — pessimistic budget reservations (Hold/Settle pattern).
 * Each LLM request creates a hold before dispatch; settled to actual cost after response.
 */
export const holds = sqliteTable('holds', {
  id: text('id').primaryKey(), // UUID
  agentId: text('agent_id').notNull(),
  model: text('model').notNull(),
  estimatedCost: real('estimated_cost').notNull(),
  status: text('status').default('active'), // 'active' | 'settled' | 'expired'
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
});

/**
 * audit_log — append-only tamper-evident event log.
 * CRITICAL: Never UPDATE or DELETE rows in this table.
 * A DB-level trigger enforces this constraint at the database level.
 * Each row includes a SHA-256 hash chain for tamper evidence (EU AI Act Article 12/14).
 */
export const auditLog = sqliteTable('audit_log', {
  seq: integer('seq').primaryKey({ autoIncrement: true }),
  eventType: text('event_type').notNull(),
  agentId: text('agent_id').notNull(),
  model: text('model').notNull(),
  costDelta: real('cost_delta').notNull(),
  runningBalance: real('running_balance').notNull(),
  payload: text('payload'), // JSON metadata
  prevHash: text('prev_hash'), // nullable for genesis row
  hash: text('hash').notNull(),
  ts: integer('ts').notNull(),
});

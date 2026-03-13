CREATE TABLE `audit_log` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_type` text NOT NULL,
	`agent_id` text NOT NULL,
	`model` text NOT NULL,
	`cost_delta` real NOT NULL,
	`running_balance` real NOT NULL,
	`payload` text,
	`prev_hash` text,
	`hash` text NOT NULL,
	`ts` integer NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER audit_log_no_mutate
BEFORE UPDATE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only: UPDATE is not permitted');
END;
--> statement-breakpoint
CREATE TRIGGER audit_log_no_delete
BEFORE DELETE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only: DELETE is not permitted');
END;
--> statement-breakpoint
CREATE TABLE `budget_ledger` (
	`agent_id` text PRIMARY KEY NOT NULL,
	`limit_usd` real NOT NULL,
	`spent_usd` real DEFAULT 0 NOT NULL,
	`reserved_usd` real DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `holds` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`model` text NOT NULL,
	`estimated_cost` real NOT NULL,
	`status` text DEFAULT 'active',
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);

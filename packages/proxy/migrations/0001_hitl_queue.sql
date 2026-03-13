-- HITL queue table for Human-in-the-Loop approval tickets.
-- Each row represents one suspended agent action awaiting human approval decision.
-- id column doubles as the Cloudflare Workflows instance ID (UUID).
-- request_payload stores the full request body (not in Workflow state, per 1MiB limit).
CREATE TABLE `hitl_queue` (
  `id` text PRIMARY KEY NOT NULL,
  `agent_id` text NOT NULL,
  `status` text NOT NULL DEFAULT 'pending',
  `risk_tier` text NOT NULL,
  `action_name` text NOT NULL,
  `request_payload` text,
  `approver` text,
  `approver_reason` text,
  `hold_id` text,
  `created_at` integer NOT NULL,
  `expires_at` integer NOT NULL,
  `decided_at` integer
);
--> statement-breakpoint
CREATE INDEX `hitl_queue_status_idx` ON `hitl_queue` (`status`);
--> statement-breakpoint
CREATE INDEX `hitl_queue_agent_idx` ON `hitl_queue` (`agent_id`);

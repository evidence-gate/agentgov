export type AgentId = string;
export type HoldId = string;

export interface ChatCompletionRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  stream?: boolean;
  max_tokens?: number;
}

export interface BudgetHold {
  holdId: HoldId;
  agentId: AgentId;
  estimatedCost: number;
  model: string;
  createdAt: number;
  expiresAt: number;
}

export type AuditEventType =
  | 'budget_hold'
  | 'budget_settle'
  | 'budget_blocked'
  | 'request_forwarded'
  | 'alert_fired'
  | 'hitl_suspended'
  | 'hitl_approved'
  | 'hitl_denied'
  | 'hitl_expired';

export interface AuditEvent {
  eventType: AuditEventType;
  agentId: AgentId;
  model: string;
  costDelta: number;
  runningBalance: number;
  meta?: Record<string, unknown>;
}

export interface GateResult {
  action: 'pass' | 'block';
  holdId?: HoldId;
  reason?: string;
}

export interface BudgetExceededErrorBody {
  error: {
    code: 'BUDGET_EXCEEDED';
    message: string;
    budgetId: string;
    spent: number;
    limit: number;
  };
}

export interface BudgetExceededBody {
  error: { code: 'BUDGET_EXCEEDED'; message: string; budgetId: string; spent: number; limit: number };
}
export class BudgetExceeded extends Error {
  readonly code = 'BUDGET_EXCEEDED' as const;
  readonly spent: number;
  readonly limit: number;
  readonly budgetId: string;
  constructor(message: string, body: BudgetExceededBody) {
    super(message);
    this.name = 'BudgetExceeded';
    this.spent = body.error.spent;
    this.limit = body.error.limit;
    this.budgetId = body.error.budgetId;
  }
}

export interface HitlPendingBody {
  error: {
    code: 'HITL_PENDING';
    message: string;
    approvalId: string;
    agentId: string;
    expiresAt: number; // Unix ms
  };
}
export class HitlPending extends Error {
  readonly code = 'HITL_PENDING' as const;
  readonly approvalId: string;
  readonly agentId: string;
  readonly expiresAt: number;
  constructor(message: string, body: HitlPendingBody) {
    super(message);
    this.name = 'HitlPending';
    this.approvalId = body.error.approvalId;
    this.agentId = body.error.agentId;
    this.expiresAt = body.error.expiresAt;
  }
}

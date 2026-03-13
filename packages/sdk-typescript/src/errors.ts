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

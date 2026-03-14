"""
agentgov governance exception classes.

These match the TypeScript SDK field contracts exactly, with Python snake_case
naming for camelCase TypeScript fields:
  - budgetId       -> budget_id
  - approvalId     -> approval_id
  - agentId        -> agent_id
  - expiresAt      -> expires_at
  - suggestedRemediation -> suggested_remediation

Each constructor accepts the inner ``error`` dict from the JSON response body
(i.e. the value of response_body["error"]).
"""
from __future__ import annotations
from typing import Any, Dict, Optional


class BudgetExceeded(Exception):
    """
    Raised when the proxy returns HTTP 429 with error code ``BUDGET_EXCEEDED``.

    Corresponds to TypeScript ``BudgetExceeded`` with the same field semantics.
    """

    code: str = "BUDGET_EXCEEDED"

    def __init__(self, error: Dict[str, Any]) -> None:
        self.code = "BUDGET_EXCEEDED"
        self.spent: float = error["spent"]
        self.limit: float = error["limit"]
        self.budget_id: str = error["budgetId"]
        super().__init__(error.get("message", "Budget exceeded"))


class HitlPending(Exception):
    """
    Raised when the proxy returns HTTP 202 with error code ``HITL_PENDING``.

    Corresponds to TypeScript ``HitlPending`` with the same field semantics.
    """

    code: str = "HITL_PENDING"

    def __init__(self, error: Dict[str, Any]) -> None:
        self.code = "HITL_PENDING"
        self.approval_id: str = error["approvalId"]
        self.agent_id: str = error["agentId"]
        self.expires_at: int = error["expiresAt"]
        super().__init__(error.get("message", "HITL approval pending"))


class AgentError(Exception):
    """
    Raised when the proxy returns HTTP 502 with error code ``AGENT_ERROR``.

    Corresponds to TypeScript ``AgentError`` with the same field semantics.

    type is one of: 'retry_exhausted' | 'permanent_error' | 'stuck_detected'
    """

    code: str = "AGENT_ERROR"

    def __init__(self, error: Dict[str, Any]) -> None:
        self.code = "AGENT_ERROR"
        self.type: str = error["type"]
        self.agent_id: str = error["agentId"]
        self.timestamp: int = error["timestamp"]
        self.suggested_remediation: str = error["suggestedRemediation"]
        self.context: Optional[Dict[str, Any]] = error.get("context")
        super().__init__(error.get("message", "Agent error"))

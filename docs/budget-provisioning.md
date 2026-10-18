# Budget provisioning after the adversarial audit

Chat requests no longer create a default $10 budget for a supplied agent ID. An operator must provision the agent's budget row before that agent can call the chat endpoint. The internal `ensureAgent` helper remains available for trusted administration and tests; it is not invoked by the request path. This change does not provision or migrate any live agent budgets.

Requests for an unregistered ID fail closed with an audited `unknown_agent` decision. Changing the request ID cannot create new spending authority. Existing registered agents retain their existing limit, spend, and reservations.

Budget limit updates apply the new limit and its `budget_limit_changed` event in one database write transaction. Failure to persist the audit leaves the prior limit unchanged. The update operation only changes existing agents and does not grant budgets to unknown IDs.

The deployment operator must separately confirm caller authentication and which registered agent IDs each caller is authorized to use. A budget row alone is not an authentication credential.

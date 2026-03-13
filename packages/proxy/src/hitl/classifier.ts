/**
 * Action classifier — pure function, no DB dependency.
 *
 * Maps action names to risk tiers via a static lookup table.
 * This is the ONLY place risk tier policy lives — all HITL decisions
 * are deterministic based on the action name, not LLM judgment.
 *
 * Unknown actions default to { required: false } — open by default
 * for unclassified/reversible actions.
 */

export type RiskTier = 'reversible' | 'semi-reversible' | 'irreversible' | 'external';
export type HitlRequired = { required: true; tier: RiskTier } | { required: false };

/**
 * Static risk tier table.
 * Add entries here to classify new action types.
 * Key format: 'tool_call:<function_name>'
 */
const RISK_TABLE: Record<string, RiskTier> = {
  // External I/O — always requires approval (side effects outside system boundary)
  'tool_call:send_email': 'external',
  'tool_call:post_slack_message': 'external',
  'tool_call:http_post': 'external',

  // Irreversible mutations — cannot be undone
  'tool_call:delete_file': 'irreversible',
  'tool_call:drop_table': 'irreversible',

  // Semi-reversible — can be undone with effort
  'tool_call:update_record': 'semi-reversible',

  // Reversible reads — never require approval
  'tool_call:read_file': 'reversible',
  'tool_call:list_files': 'reversible',
};

/**
 * Risk tiers that require HITL approval.
 * Reversible actions are excluded — they never require approval.
 */
const REQUIRES_HITL: Set<RiskTier> = new Set(['external', 'irreversible', 'semi-reversible']);

/**
 * Classify an action name and determine if HITL approval is required.
 *
 * @param actionName - Action name to classify (e.g., 'tool_call:send_email')
 * @returns HitlRequired — { required: true, tier } for HITL-required actions,
 *          { required: false } for reversible or unknown actions
 */
export function classifyAction(actionName: string): HitlRequired {
  const tier = RISK_TABLE[actionName];
  if (!tier) {
    // Unknown action — allow through (open by default for non-classified actions)
    return { required: false };
  }
  if (REQUIRES_HITL.has(tier)) {
    return { required: true, tier };
  }
  return { required: false };
}

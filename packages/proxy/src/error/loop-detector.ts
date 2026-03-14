/**
 * Stuck/loop detector for the agentgov proxy.
 *
 * Detects agents repeating identical tool_calls within a single request (2-failure-stop rule).
 * Uses per-request in-memory state — no DB required.
 *
 * Algorithm:
 * - Each tool_call is fingerprinted with SHA-256(action + sorted args).
 * - On second identical fingerprint within the same request, the agent is considered stuck.
 * - Returns a structured StuckResult with remediation guidance.
 */

export interface ActionRecord {
  fingerprint: string;
  timestamps: number[];
  count: number;
}

export interface LoopDetectorState {
  history: Map<string, ActionRecord>;
}

export type StuckResult =
  | { stuck: false }
  | {
      stuck: true;
      repeatedFingerprint: string;
      actionName: string;
      timestamps: number[];
      suggestedRemediation: string;
    };

/**
 * Create a fresh per-request loop detector state.
 */
export function createLoopDetector(): LoopDetectorState {
  return { history: new Map() };
}

/**
 * JSON replacer that sorts object keys for deterministic serialization.
 * Arrays are passed through unchanged (sorting array elements would change semantics).
 */
function sortKeysReplacer(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const sorted = Object.fromEntries(
      Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
    );
    return sorted;
  }
  return value;
}

/**
 * Compute a deterministic SHA-256 fingerprint for a tool_call.
 *
 * Key-order normalization: args JSON is parsed and re-serialized with sorted keys,
 * so { b: 1, a: 2 } and { a: 2, b: 1 } produce identical fingerprints.
 *
 * @param actionName - The function name (e.g. 'read_file')
 * @param argsJson - The raw arguments JSON string from the tool_call
 * @returns Lowercase 64-char hex SHA-256 hash
 */
export async function fingerprintAction(actionName: string, argsJson: string): Promise<string> {
  let parsedArgs: unknown;
  try {
    parsedArgs = JSON.parse(argsJson);
  } catch {
    // Non-JSON arguments — use raw string for consistent fingerprinting
    parsedArgs = argsJson;
  }

  const canonical = JSON.stringify({ action: actionName, args: parsedArgs }, sortKeysReplacer);
  const encoded = new TextEncoder().encode(canonical);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Record a tool_call fingerprint and detect stuck loops.
 *
 * 2-failure-stop rule: the second identical fingerprint within the same request
 * triggers stuck detection and returns a structured result.
 *
 * @param state - Per-request loop detector state (mutated in place)
 * @param fingerprint - 64-char hex fingerprint from fingerprintAction
 * @param actionName - Human-readable action name for error messages
 * @param now - Current timestamp in milliseconds (Date.now())
 * @returns StuckResult — { stuck: false } or stuck details with remediation
 */
export function recordAction(
  state: LoopDetectorState,
  fingerprint: string,
  actionName: string,
  now: number,
): StuckResult {
  const existing = state.history.get(fingerprint);

  if (!existing) {
    // First occurrence — record it
    state.history.set(fingerprint, {
      fingerprint,
      timestamps: [now],
      count: 1,
    });
    return { stuck: false };
  }

  // Repeated fingerprint — increment count and push timestamp
  existing.count += 1;
  existing.timestamps.push(now);

  if (existing.count >= 2) {
    const suggestedRemediation =
      `Agent repeated action '${actionName}' ${existing.count} times with identical inputs. ` +
      `Check for missing state updates or broken feedback loops in agent logic.`;

    return {
      stuck: true,
      repeatedFingerprint: fingerprint,
      actionName,
      timestamps: [...existing.timestamps],
      suggestedRemediation,
    };
  }

  return { stuck: false };
}

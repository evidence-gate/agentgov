/** Server-owned credentials bind an authenticated subject to explicit agent IDs.
 * Configuration contains SHA-256 digests, never provider API keys. No wildcard grants.
 */
export interface AgentIdentity { subject: string; agentIds: string[] }
interface Credential extends AgentIdentity { tokenSha256: string }
export type AuthResult = { ok: true; identity: AgentIdentity } | { ok: false; status: 401 | 503; code: string };
/** Agent and subject labels. No wildcards. Shared by chat auth and budget provisioning. */
export function isAgentId(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,127}$/.test(v);
}
function credentials(raw: string | undefined): Credential[] {
  if (!raw || raw.length > 262144) throw new Error('invalid auth config');
  const rows: unknown = JSON.parse(raw);
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 128) throw new Error('invalid auth config');
  const hashes = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row) ||
      Object.keys(row).some(k => !['subject', 'tokenSha256', 'agentIds'].includes(k)) ||
      !isAgentId(row.subject) || typeof row.tokenSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(row.tokenSha256) ||
      hashes.has(row.tokenSha256) || !Array.isArray(row.agentIds) || row.agentIds.length === 0 || row.agentIds.length > 128 ||
      !row.agentIds.every(isAgentId) || new Set(row.agentIds).size !== row.agentIds.length) throw new Error('invalid auth config');
    hashes.add(row.tokenSha256);
  }
  return rows as Credential[];
}
export async function authenticateAgent(raw: string | undefined, token: string | undefined): Promise<AuthResult> {
  try {
    const rows = credentials(raw); // Validate the entire configuration before accepting any credential.
    if (!token || !/^[A-Za-z0-9_-]{32,256}$/.test(token)) return { ok: false, status: 401, code: 'AGENT_UNAUTHENTICATED' };
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    const actual = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
    let identity: AgentIdentity | undefined;
    for (const row of rows) {
      let difference = 0;
      for (let i = 0; i < 64; i++) difference |= actual.charCodeAt(i) ^ row.tokenSha256.charCodeAt(i);
      if (difference === 0) identity = { subject: row.subject, agentIds: [...row.agentIds] };
    }
    return identity ? { ok: true, identity } : { ok: false, status: 401, code: 'AGENT_UNAUTHENTICATED' };
  } catch {
    return { ok: false, status: 503, code: 'AGENT_AUTH_UNAVAILABLE' };
  }
}

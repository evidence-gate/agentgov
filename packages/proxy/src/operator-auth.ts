/** Operator bearer for budget administration. Distinct from agent chat tokens. */
export type OperatorAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; code: 'UNAUTHORIZED' | 'ADMIN_AUTH_UNAVAILABLE' };

/**
 * Compare the Authorization header with `Bearer ${secret}` using SHA-256.
 * An unset secret fails closed. Callers never receive a budget grant from this check.
 */
export async function authenticateOperator(
  secret: string | undefined,
  authorization: string | undefined,
): Promise<OperatorAuthResult> {
  if (!secret) return { ok: false, status: 503, code: 'ADMIN_AUTH_UNAVAILABLE' };
  const digest = async (value: string) => new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
  );
  const [actual, expected] = await Promise.all([
    digest(authorization ?? ''),
    digest(`Bearer ${secret}`),
  ]);
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= actual[i]! ^ expected[i]!;
  if (difference !== 0) return { ok: false, status: 401, code: 'UNAUTHORIZED' };
  return { ok: true };
}

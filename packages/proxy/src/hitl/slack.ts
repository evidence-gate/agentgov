/**
 * Slack signature verification — Web Crypto API (HMAC-SHA256).
 *
 * Verifies that incoming requests from Slack are genuine using the signing secret.
 * Uses constant-time comparison to prevent timing attacks.
 * Rejects requests with timestamps older than 5 minutes (replay attack prevention).
 *
 * Reference: https://api.slack.com/authentication/verifying-requests-from-slack
 *
 * IMPORTANT: Uses crypto.subtle (Web Crypto API) — compatible with Cloudflare Workers.
 * Same API surface as the sha256Hex used in audit/writer.ts.
 */

/**
 * Verify a Slack request signature.
 *
 * @param request - Incoming Request object (for headers)
 * @param rawBody - Raw request body string (must be read before calling this)
 * @param signingSecret - Slack app's signing secret from env.SLACK_SIGNING_SECRET
 * @returns true if signature is valid and timestamp is fresh, false otherwise
 */
export async function verifySlackSignature(
  request: Request,
  rawBody: string,
  signingSecret: string,
): Promise<boolean> {
  try {
    const timestamp = request.headers.get('X-Slack-Request-Timestamp');
    const slackSignature = request.headers.get('X-Slack-Signature');

    if (!timestamp || !slackSignature) {
      return false;
    }

    // Replay attack prevention: reject requests with timestamp older than 5 minutes
    const tsNum = parseInt(timestamp, 10);
    if (isNaN(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > 300) {
      return false;
    }

    // Base string format: v0:<timestamp>:<rawBody>
    const baseString = `v0:${timestamp}:${rawBody}`;
    const encoder = new TextEncoder();

    // Import the signing secret as an HMAC-SHA256 key
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(signingSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );

    // Compute HMAC-SHA256 over the base string
    const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(baseString));
    const signatureHex = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const expectedSignature = `v0=${signatureHex}`;

    // Constant-time comparison — prevents timing attacks
    if (expectedSignature.length !== slackSignature.length) {
      return false;
    }

    let diff = 0;
    for (let i = 0; i < expectedSignature.length; i++) {
      diff |= expectedSignature.charCodeAt(i) ^ slackSignature.charCodeAt(i);
    }
    return diff === 0;
  } catch {
    // Never throw — return false on any error
    return false;
  }
}

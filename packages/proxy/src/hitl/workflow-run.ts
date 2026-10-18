import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import type { DbClient } from '../db/client';
import { persistWorkflowTicket, finalizeWorkflowTicket } from './queue';
import { notifyChannels } from './notify';

export interface HitlParams {
  ticketId?: string;   // Optional pre-assigned ticketId; if not provided, createTicket generates one
  agentId: string;
  actionName: string;
  riskTier: 'reversible' | 'semi-reversible' | 'irreversible' | 'external';
  requestPayload: string; // JSON string — full request body stored in Turso, not Workflow state
  ttlSeconds: number;
  holdId: string | null;
  callbackBaseUrl: string;
  webhookUrl?: string;
  slackBotToken?: string;
  slackChannelId?: string;
}

interface ApprovalEvent {
  decision: 'approved' | 'denied';
  actor: string;
  reason?: string;
}


/** Shared lifecycle; only the Cloudflare entrypoint owns the platform runtime import. */
export async function runHitlWorkflow(
  event: WorkflowEvent<HitlParams>, step: WorkflowStep, dbFactory: () => DbClient,
  notify: typeof notifyChannels = notifyChannels,
): Promise<void> {
  const p = event.payload;
  const id = event.instanceId;
  if (p.ticketId && p.ticketId !== id) throw new Error('HITL workflow identity mismatch');
  const ticket = await step.do('persist-ticket', () => persistWorkflowTicket(dbFactory(), id, p));
  if (ticket.status !== 'pending') return;
  try {
    await step.do('notify-channels', async () => {
    if (Date.now() >= ticket.expiresAt) return;
    await notify({ ...p, ticketId: id, expiresAt: ticket.expiresAt, callbackUrl: `${p.callbackBaseUrl}/v1/hitl/${id}` });
    });
  } catch {
    await step.do('record-notification-failure', () => finalizeWorkflowTicket(dbFactory(), id, { decision: 'denied', actor: 'system', reason: 'Notification failed' }));
    return;
  }
  let decision: { decision: 'approved' | 'denied' | 'expired'; actor: string; reason?: string };
  const remaining = ticket.expiresAt - Date.now();
  if (remaining <= 0) {
    decision = { decision: 'expired', actor: 'system', reason: 'TTL expired' };
  } else {
    try {
      const result = await step.waitForEvent<ApprovalEvent>('wait-for-approval', {
        type: 'hitl-decision', timeout: `${Math.max(1, Math.ceil(remaining / 1000))} seconds`,
      });
      const payload = result.payload;
      decision = payload && (payload.decision === 'approved' || payload.decision === 'denied') && typeof payload.actor === 'string'
        ? payload : { decision: 'denied', actor: 'system', reason: 'Invalid decision event' };
    } catch {
      decision = { decision: 'expired', actor: 'system', reason: 'Approval wait ended' };
    }
  }
  await step.do('record-decision', () => finalizeWorkflowTicket(dbFactory(), id, decision));
}

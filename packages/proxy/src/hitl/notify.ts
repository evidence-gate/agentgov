/**
 * HITL notification channels — webhook POST + Slack Block Kit message.
 *
 * Mirrors the fetch+POST pattern established by checkAndFireAlerts in budget/alerts.ts.
 * CRITICAL: persist-before-notify — always write hitl_queue row BEFORE calling notifyChannels.
 * Configured-channel failures propagate so the workflow can deny and release its hold.
 */

import type { RiskTier } from './classifier';

export interface NotifyChannelsParams {
  webhookUrl?: string;
  ticketId: string;
  agentId: string;
  actionName: string;
  riskTier: RiskTier;
  expiresAt: number; // Unix ms
  callbackUrl: string;
  slackBotToken?: string;
  slackChannelId?: string;
}

interface WebhookPayload {
  event: 'hitl_approval_required';
  ticketId: string;
  agentId: string;
  actionName: string;
  riskTier: RiskTier;
  expiresAt: number;
  callbackUrl: string;
}

/**
 * Post approval notifications to configured channels.
 *
 * - Webhook: POST JSON payload with ticket details and callback URL
 * - Slack: POST Block Kit message with Approve/Deny buttons (if token+channel configured)
 *
 * Transport failures, HTTP errors and Slack API errors throw sanitized errors.
 * Missing webhookUrl or Slack credentials silently skip that channel.
 */
export async function notifyChannels(params: NotifyChannelsParams): Promise<void> {
  const { webhookUrl, ticketId, agentId, actionName, riskTier, expiresAt, callbackUrl, slackBotToken, slackChannelId } = params;

  // Webhook channel
  if (webhookUrl) {
    const payload: WebhookPayload = {
      event: 'hitl_approval_required',
      ticketId,
      agentId,
      actionName,
      riskTier,
      expiresAt,
      callbackUrl,
    };

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('Webhook HTTP failure');
      await response.body?.cancel();
    } catch {
      throw new Error('HITL webhook notification failed');
    }
  }

  // Slack Block Kit channel
  if (slackBotToken && slackChannelId) {
    const slackMessage = {
      channel: slackChannelId,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Approval Required*\nAgent: \`${agentId}\`\nAction: \`${actionName}\`\nRisk Tier: \`${riskTier}\`\nExpires: <!date^${Math.floor(expiresAt / 1000)}^{date_short_pretty} {time}|${new Date(expiresAt).toISOString()}>`,
          },
        },
        {
          type: 'actions',
          block_id: `hitl-${ticketId}`,
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Approve' },
              action_id: 'approve',
              style: 'primary',
              value: ticketId,
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Deny' },
              action_id: 'deny',
              style: 'danger',
              value: ticketId,
            },
          ],
        },
      ],
    };

    try {
      const response = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${slackBotToken}`,
        },
        body: JSON.stringify(slackMessage),
      });
      if (!response.ok) throw new Error('Slack HTTP failure');
      const result = await response.json() as { ok?: boolean };
      if (result.ok !== true) throw new Error('Slack API failure');
    } catch {
      throw new Error('HITL Slack notification failed');
    }
  }
}

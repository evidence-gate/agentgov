/**
 * HITL notification channels — webhook POST + Slack Block Kit message.
 *
 * Mirrors the fetch+POST pattern established by checkAndFireAlerts in budget/alerts.ts.
 * CRITICAL: persist-before-notify — always write hitl_queue row BEFORE calling notifyChannels.
 * This function never throws — catches and console.error's any failure.
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
 * Neither channel throws on failure — errors are logged to console.error.
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
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error(`notifyChannels: webhook POST failed for ticket ${ticketId}:`, err);
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
      await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${slackBotToken}`,
        },
        body: JSON.stringify(slackMessage),
      });
    } catch (err) {
      console.error(`notifyChannels: Slack POST failed for ticket ${ticketId}:`, err);
    }
  }
}

/**
 * Signal Push Module - Webhook Utilities
 *
 * Telegram Bot API and Lark (飞书) Webhook integration
 */

import type { PushChannel, PushMessage, FormattedPushMessage, PushResult } from './types';

/**
 * Format message for Telegram (HTML mode)
 */
function formatTelegramMessage(message: PushMessage): FormattedPushMessage {
  const scoreIcon = message.signal_score >= 9 ? '🔴' :
                    message.signal_score >= 8 ? '🟠' :
                    message.signal_score >= 7 ? '🟡' : '⚪';

  const text = `<b>${scoreIcon} ${escapeHtml(message.category)}</b>
${escapeHtml(message.title)}

${escapeHtml(message.bottom_line)}

Signal: <b>${message.signal_score}/10</b> | ${message.source || 'Unknown'}
<a href="${message.url}">Read</a>`;

  return { text, parse_mode: 'HTML' };
}

/**
 * Format message for Lark (Card mode)
 */
function formatLarkMessage(message: PushMessage): FormattedPushMessage {
  const scoreColor = message.signal_score >= 9 ? 'red' :
                     message.signal_score >= 8 ? 'orange' :
                     message.signal_score >= 7 ? 'yellow' : 'grey';

  const card = {
    msg_type: 'interactive',
    card: {
      header: {
        title: {
          tag: 'plain_text',
          content: message.category,
        },
        template: scoreColor,
      },
      elements: [
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**${escapeMarkdown(message.title)}**\n\n${escapeMarkdown(message.bottom_line)}\n\nSignal: **${message.signal_score}/10** | ${message.source || 'Unknown'}`,
          },
        },
        {
          tag: 'action',
          actions: [
            {
              tag: 'button',
              text: {
                tag: 'plain_text',
                content: 'Read',
              },
              type: 'default',
              url: message.url,
            },
          ],
        },
      ],
    },
  };

  return { text: JSON.stringify(card) };
}

/**
 * Send message via Telegram Bot API
 */
export async function sendTelegram(
  message: PushMessage,
  botToken: string,
  chatId: string
): Promise<PushResult> {
  try {
    const formatted = formatTelegramMessage(message);
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: formatted.text,
        parse_mode: formatted.parse_mode,
        disable_web_page_preview: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return {
        success: false,
        channel: 'telegram',
        error: `Telegram API error: ${response.status} ${error}`,
      };
    }

    const data = await response.json();
    return {
      success: true,
      channel: 'telegram',
      messageId: data.result?.message_id?.toString(),
    };
  } catch (error) {
    return {
      success: false,
      channel: 'telegram',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Send message via Lark Webhook
 */
export async function sendLark(
  message: PushMessage,
  webhookUrl: string
): Promise<PushResult> {
  try {
    const formatted = formatLarkMessage(message);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: formatted.text,
    });

    if (!response.ok) {
      const error = await response.text();
      return {
        success: false,
        channel: 'lark',
        error: `Lark webhook error: ${response.status} ${error}`,
      };
    }

    const data = await response.json();
    if (data.code !== 0) {
      return {
        success: false,
        channel: 'lark',
        error: `Lark API error: ${data.msg || 'Unknown error'}`,
      };
    }

    return {
      success: true,
      channel: 'lark',
    };
  } catch (error) {
    return {
      success: false,
      channel: 'lark',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Send message to configured channel(s)
 */
export async function sendPush(
  message: PushMessage,
  channel: PushChannel,
  config: {
    telegramBotToken?: string;
    telegramChatId?: string;
    larkWebhookUrl?: string;
  }
): Promise<PushResult> {
  switch (channel) {
    case 'telegram':
      if (!config.telegramBotToken || !config.telegramChatId) {
        return {
          success: false,
          channel: 'telegram',
          error: 'Telegram credentials not configured',
        };
      }
      return sendTelegram(message, config.telegramBotToken, config.telegramChatId);

    case 'lark':
      if (!config.larkWebhookUrl) {
        return {
          success: false,
          channel: 'lark',
          error: 'Lark webhook URL not configured',
        };
      }
      return sendLark(message, config.larkWebhookUrl);

    default:
      return {
        success: false,
        channel,
        error: `Unknown channel: ${channel}`,
      };
  }
}

/**
 * Send to both channels (if configured)
 */
export async function sendPushAll(
  message: PushMessage,
  config: {
    telegramBotToken?: string;
    telegramChatId?: string;
    larkWebhookUrl?: string;
  }
): Promise<PushResult[]> {
  const results: PushResult[] = [];

  if (config.telegramBotToken && config.telegramChatId) {
    results.push(await sendTelegram(message, config.telegramBotToken, config.telegramChatId));
  }

  if (config.larkWebhookUrl) {
    results.push(await sendLark(message, config.larkWebhookUrl));
  }

  return results;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (c) => map[c]);
}

/**
 * Escape Markdown special characters for Lark
 */
function escapeMarkdown(text: string): string {
  // Lark uses a subset of CommonMark
  return text.replace(/[*_`\[\]]/g, '\\$&');
}

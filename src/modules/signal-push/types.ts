/**
 * Signal Push Module - Types
 *
 * Active alerting system for high-signal news push notifications
 */

/**
 * Supported push channels
 */
export type PushChannel = 'telegram' | 'lark';

/**
 * Push message format
 */
export interface PushMessage {
  category: string;           // Article category
  title: string;              // Article title
  bottom_line: string;        // AI summary
  signal_score: number;       // Signal score (0-10)
  url: string;                // Direct link
  source?: string;            // Source name
}

/**
 * Formatted push message ready for delivery
 */
export interface FormattedPushMessage {
  text: string;
  html?: string;              // For Telegram HTML mode
  parse_mode?: 'HTML' | 'Markdown';
}

/**
 * Push result
 */
export interface PushResult {
  success: boolean;
  channel: PushChannel;
  messageId?: string;
  error?: string;
}

/**
 * Push statistics
 */
export interface PushStats {
  total_pushed: number;
  telegram_sent: number;
  lark_sent: number;
  failed: number;
  last_push_at: number;
}

/**
 * Deduplication state
 */
export interface DeduplicationState {
  pushed_ids: Set<string>;
  last_cleanup: number;
}

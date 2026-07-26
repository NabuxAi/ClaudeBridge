// ============================================================
// Telegram notifier — sends security/status messages to a chat.
// Configured via TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID (see config.js).
// No-ops quietly when unconfigured, so the server runs fine without it.
// ============================================================
import { config } from './config.js'

/** Send an HTML message to the configured Telegram chat. Returns {ok|skipped}. */
export async function sendTelegram(text) {
  const { token, chatId } = config.telegram
  if (!token || !chatId) return { skipped: true }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, 4000),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return { ok: false, status: res.status }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

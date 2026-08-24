export interface TelegramConfig {
  botToken: string;
  chatId: string;
  enabled?: boolean;
  scheduledTime?: string; // e.g. "08:00"
}

export const DEFAULT_TELEGRAM_BOT_TOKEN = "8968515154:AAGP9rbB1Gjj7Psg1Dt4n5OmkEw2cN3ofwg";
export const DEFAULT_TELEGRAM_CHAT_ID = "7835561039";

/**
 * Send a message via Telegram Bot API with automatic chunking for long messages
 */
export async function sendTelegramMessage(
  token: string,
  chatId: string | number,
  text: string,
  parseMode: "Markdown" | "HTML" = "Markdown"
): Promise<{ success: boolean; messageIds?: number[]; error?: string }> {
  try {
    if (!token || !chatId || !text) {
      return { success: false, error: "Token, Chat ID, and message text are required." };
    }

    const cleanToken = token.trim();
    const cleanChatId = String(chatId).trim();

    // Telegram maximum message length is 4096 characters
    const MAX_LENGTH = 3900;
    const chunks: string[] = [];

    if (text.length <= MAX_LENGTH) {
      chunks.push(text);
    } else {
      let remaining = text;
      while (remaining.length > 0) {
        if (remaining.length <= MAX_LENGTH) {
          chunks.push(remaining);
          break;
        }
        // Try finding a line break near MAX_LENGTH
        let splitIdx = remaining.lastIndexOf("\n\n", MAX_LENGTH);
        if (splitIdx === -1 || splitIdx < MAX_LENGTH / 2) {
          splitIdx = remaining.lastIndexOf("\n", MAX_LENGTH);
        }
        if (splitIdx === -1 || splitIdx < MAX_LENGTH / 2) {
          splitIdx = MAX_LENGTH;
        }

        chunks.push(remaining.substring(0, splitIdx));
        remaining = remaining.substring(splitIdx).trimStart();
      }
    }

    const messageIds: number[] = [];

    for (const chunk of chunks) {
      const res = await fetch(`https://api.telegram.org/bot${cleanToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: cleanChatId,
          text: chunk,
          parse_mode: parseMode,
          disable_web_page_preview: true,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        // If markdown parsing failed, retry with plain text
        if (data.description?.includes("can't parse entities")) {
          const retryRes = await fetch(`https://api.telegram.org/bot${cleanToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: cleanChatId,
              text: chunk.replace(/[*_`[\]()]/g, ""), // strip markdown characters
              disable_web_page_preview: true,
            }),
          });
          const retryData = await retryRes.json();
          if (retryRes.ok && retryData.ok) {
            messageIds.push(retryData.result?.message_id);
            continue;
          }
        }
        return { success: false, error: data.description || `HTTP ${res.status}` };
      }

      messageIds.push(data.result?.message_id);
    }

    return { success: true, messageIds };
  } catch (err: any) {
    console.error("[Telegram Error]:", err);
    return { success: false, error: err.message || "Failed to connect to Telegram API" };
  }
}

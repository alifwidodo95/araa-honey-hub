import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const sendTelegramAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ message: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const authorizedUserId = process.env.TELEGRAM_AUTHORIZED_USER_ID;

    if (!botToken || !authorizedUserId) {
      console.error("[Telegram Alert] Environment variables missing");
      return { ok: false, error: "Configuration missing" };
    }

    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: Number(authorizedUserId),
          text: data.message,
          parse_mode: "Markdown"
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("[Telegram Alert] Telegram response error:", errText);
        return { ok: false, error: errText };
      }

      return { ok: true };
    } catch (e: any) {
      console.error("[Telegram Alert] Fetch error:", e);
      return { ok: false, error: e.message };
    }
  });

import { createServerFn } from "@tanstack/react-start";
import pg from "pg";
import { sendWhatsAppMessage } from "./whatsapp-service";

const DB_URL =
  process.env.DATABASE_URL ||
  "postgres://postgres.saefgyiloalpiqfrglqo:Handayani01@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres";

export interface MetaTemplateComponent {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: string;
  text?: string;
  buttons?: Array<{
    type: string;
    text: string;
    url?: string;
    phone_number?: string;
  }>;
}

export interface MetaTemplateItem {
  id: string;
  name: string;
  status: string; // APPROVED, PENDING, REJECTED, PAUSED
  category: string; // UTILITY, MARKETING, AUTHENTICATION
  language: string;
  components: MetaTemplateComponent[];
  parameter_format?: string;
}

async function getWabaCredentials(pool: pg.Pool) {
  const wabaRes = await pool.query("SELECT value FROM app_settings WHERE key = 'waba_config'");
  const wabaCfg = wabaRes.rows[0]?.value || {};

  const wabaId =
    wabaCfg.waba_id ||
    wabaCfg.wabaId ||
    process.env.WABA_ID ||
    "1355091936699699";

  const phoneNumberId =
    wabaCfg.phone_number_id ||
    wabaCfg.phoneNumberId ||
    process.env.WHATSAPP_PHONE_NUMBER_ID ||
    "1289613457572802";

  const fallbackToken =
    "EAAPbL3R0Y60BSWTiTBjrFuy9WJQEdZAc8HqCZCgdik8cq9ZB0wJ06glKZCEgy3fCUZBYZCwhW58V9rMzmXAFkqatSZA0pHPQ3tl3ZBQKQUMzOzUhvcx8ig7CpNZB4Kj0MWJJxZBH7BZCLyd8ZAWU2Lbol44ZAZAqi9XDniZAgQzmiEVIwmslqHBGcFjKwZCKX4zitM9VyPBuFQZDZD";

  const permanentToken =
    wabaCfg.permanent_token ||
    wabaCfg.permanentToken ||
    process.env.WHATSAPP_PERMANENT_TOKEN ||
    fallbackToken;

  return { wabaId, phoneNumberId, permanentToken };
}

// 1. Fetch live templates from Meta Cloud API
export const getMetaMessageTemplates = createServerFn({ method: "GET" }).handler(async () => {
  let pool: pg.Pool | null = null;
  try {
    pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
    const { wabaId, permanentToken } = await getWabaCredentials(pool);

    const url = `https://graph.facebook.com/v20.0/${wabaId}/message_templates?limit=100`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${permanentToken}`,
      },
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      console.error("[getMetaMessageTemplates Error]:", errJson);
      throw new Error(errJson.error?.message || `Meta API error (${res.status})`);
    }

    const json = await res.json();
    const templates: MetaTemplateItem[] = json.data || [];

    // Cache in app_settings for fast access & offline resilience
    try {
      await pool.query(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES ('waba_cached_templates', $1, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [JSON.stringify(templates)]
      );
    } catch (e) {
      console.warn("Could not cache waba templates:", e);
    }

    await pool.end();
    return {
      templates,
      total: templates.length,
      syncedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    if (pool) try { await pool.end(); } catch (e) {}
    console.error("[getMetaMessageTemplates Error]:", err);

    // Fallback to cached templates if network fails
    try {
      pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
      const cached = await pool.query("SELECT value FROM app_settings WHERE key = 'waba_cached_templates'");
      await pool.end();
      if (cached.rows[0]?.value) {
        return {
          templates: cached.rows[0].value as MetaTemplateItem[],
          total: (cached.rows[0].value as any[]).length,
          syncedAt: "cached",
          warning: err.message,
        };
      }
    } catch (cacheErr) {}

    throw new Error(err.message || "Gagal mengambil daftar template dari Meta");
  }
});

// 2. Dispatch official Meta Template Message (HSM)
export const sendMetaTemplateMessage = createServerFn({ method: "POST" })
  .validator((data: {
    to: string;
    templateName: string;
    languageCode?: string;
    bodyParameters?: string[];
    headerImageUrl?: string;
    headerVideoUrl?: string;
  }) => data)
  .handler(async ({ data }) => {
    let pool: pg.Pool | null = null;
    try {
      pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
      const { phoneNumberId, permanentToken } = await getWabaCredentials(pool);

      const res = await sendWhatsAppMessage({
        to: data.to,
        message: `[Template: ${data.templateName}]`,
        channel: "waba",
        template: {
          name: data.templateName,
          language: data.languageCode || "id",
          bodyParameters: data.bodyParameters,
          headerImageUrl: data.headerImageUrl,
          headerVideoUrl: data.headerVideoUrl,
        },
        wabaConfig: {
          phoneNumberId,
          permanentToken,
        },
      });

      if (!res.success) {
        throw new Error(res.error || "Gagal mengirim template Meta");
      }

      // Record to whatsapp_chat_logs
      try {
        let clean = data.to.replace(/[^0-9]/g, "");
        if (clean.startsWith("0")) clean = "62" + clean.slice(1);
        else if (clean.startsWith("8")) clean = "62" + clean;
        const chatId = `${clean}@c.us`;

        await pool.query(
          `INSERT INTO whatsapp_chat_logs (chat_id, customer_phone, customer_name, message, direction, channel, created_at)
           VALUES ($1, $2, $3, $4, 'outgoing', 'waba', now())`,
          [
            chatId,
            clean,
            "Pelanggan",
            `[Template Resmi Meta: ${data.templateName}]`,
          ]
        );
      } catch (e) {
        console.warn("Could not insert chat log for template:", e);
      }

      await pool.end();
      return { ok: true, messageId: res.messageId };
    } catch (err: any) {
      if (pool) try { await pool.end(); } catch (e) {}
      console.error("[sendMetaTemplateMessage Error]:", err);
      throw new Error(err.message || "Gagal mengirim pesan template Meta");
    }
  });

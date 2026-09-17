// Unified WhatsApp Dispatch Service
// Supports:
// 1. WABA: Official Meta Cloud API (+62 856-4540-6949)
// 2. WAHA Slot 1: CS Utama (session: default)
// 3. WAHA Slot 2: Kampanye / Blast (session: campaign)

export type WhatsAppChannel = 'waba' | 'waha_main' | 'waha_campaign';

export interface WhatsAppButton {
  id: string;
  title: string;
}

export interface SendWhatsAppOptions {
  to: string;
  message: string;
  imageUrl?: string;
  mediaUrl?: string; // Direct URL for image or video
  mediaType?: 'image' | 'video'; // Auto-detected if omitted
  channel?: WhatsAppChannel;
  buttons?: WhatsAppButton[]; // Quick reply buttons (up to 3 for WABA)
  footerText?: string;
  template?: {
    name: string;
    language?: string;
    bodyParameters?: string[];
    namedParameters?: Record<string, string>;
    headerImageUrl?: string;
    headerVideoUrl?: string;
  };
  wahaConfig?: {
    wahaUrl?: string;
    sessionName?: string;
    campaignSessionName?: string;
    apiKey?: string;
  };
  wabaConfig?: {
    phoneNumberId?: string;
    permanentToken?: string;
  };
}

export interface SendWhatsAppResult {
  success: boolean;
  channel: WhatsAppChannel;
  messageId?: string;
  error?: string;
  details?: any;
}

export function formatPhoneNumber(phone: string): { clean: string; wahaChatId: string } {
  let clean = phone.replace(/[^0-9]/g, '');
  if (clean.startsWith('0')) {
    clean = '62' + clean.slice(1);
  } else if (clean.startsWith('8')) {
    clean = '62' + clean;
  }
  return {
    clean,
    wahaChatId: `${clean}@c.us`
  };
}

/**
 * Send WhatsApp message directly from server or API route
 */
export async function sendWhatsAppMessage(opts: SendWhatsAppOptions): Promise<SendWhatsAppResult> {
  const channel = opts.channel || 'waba';
  const { clean: cleanPhone, wahaChatId } = formatPhoneNumber(opts.to);
  const mediaUrl = (opts.mediaUrl || opts.imageUrl || '').trim();
  const hasMedia = !!mediaUrl && mediaUrl.startsWith('http');
  const isVideo = opts.mediaType === 'video' || /\.(mp4|mov|webm|avi|m4v)(\?.*)?$/i.test(mediaUrl);

  // 1. CHANNEL: WABA (Meta Cloud API)
  if (channel === 'waba') {
    const phoneNumberId = 
      opts.wabaConfig?.phoneNumberId || 
      process.env.WHATSAPP_PHONE_NUMBER_ID || 
      '1289613457572802';

    const fallbackToken = "EAAPbL3R0Y60BSWTiTBjrFuy9WJQEdZAc8HqCZCgdik8cq9ZB0wJ06glKZCEgy3fCUZBYZCwhW58V9rMzmXAFkqatSZA0pHPQ3tl3ZBQKQUMzOzUhvcx8ig7CpNZB4Kj0MWJJxZBH7BZCLyd8ZAWU2Lbol44ZAZAqi9XDniZAgQzmiEVIwmslqHBGcFjKwZCKX4zitM9VyPBuFQZDZD";
    const token = 
      opts.wabaConfig?.permanentToken || 
      process.env.WHATSAPP_PERMANENT_TOKEN || 
      fallbackToken;

    if (!token) {
      return {
        success: false,
        channel: 'waba',
        error: 'Meta Permanent Token (WHATSAPP_PERMANENT_TOKEN) is not configured.'
      };
    }

    try {
      const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
      
      let payload: any;
      if (opts.template) {
        const components: any[] = [];
        if (opts.template.headerImageUrl) {
          components.push({
            type: 'header',
            parameters: [{ type: 'image', image: { link: opts.template.headerImageUrl.trim() } }]
          });
        } else if (opts.template.headerVideoUrl) {
          components.push({
            type: 'header',
            parameters: [{ type: 'video', video: { link: opts.template.headerVideoUrl.trim() } }]
          });
        }

        if (opts.template.namedParameters && Object.keys(opts.template.namedParameters).length > 0) {
          components.push({
            type: 'body',
            parameters: Object.entries(opts.template.namedParameters).map(([paramName, val]) => ({
              type: 'text',
              parameter_name: paramName,
              text: String(val)
            }))
          });
        } else if (opts.template.bodyParameters && opts.template.bodyParameters.length > 0) {
          components.push({
            type: 'body',
            parameters: opts.template.bodyParameters.map(val => ({ type: 'text', text: String(val) }))
          });
        }

        payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanPhone,
          type: 'template',
          template: {
            name: opts.template.name,
            language: {
              code: opts.template.language || 'id'
            },
            ...(components.length > 0 ? { components } : {})
          }
        };
      } else if (opts.buttons && opts.buttons.length > 0) {
        // Meta Cloud API supports up to 3 interactive reply buttons (max 20 chars per title)
        const actionButtons = opts.buttons.slice(0, 3).map((b, idx) => ({
          type: 'reply',
          reply: {
            id: b.id || `btn_${idx + 1}`,
            title: b.title.slice(0, 20)
          }
        }));

        const interactiveObj: any = {
          type: 'button',
          body: {
            text: opts.message
          },
          action: {
            buttons: actionButtons
          }
        };

        if (hasMedia) {
          interactiveObj.header = {
            type: isVideo ? 'video' : 'image',
            [isVideo ? 'video' : 'image']: {
              link: mediaUrl
            }
          };
        }

        if (opts.footerText) {
          interactiveObj.footer = {
            text: opts.footerText.slice(0, 60)
          };
        }

        payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanPhone,
          type: 'interactive',
          interactive: interactiveObj
        };
      } else if (hasMedia) {
        payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanPhone,
          type: isVideo ? 'video' : 'image',
          [isVideo ? 'video' : 'image']: {
            link: mediaUrl,
            caption: opts.message
          }
        };
      } else {
        payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanPhone,
          type: 'text',
          text: {
            preview_url: false,
            body: opts.message
          }
        };
      }

      console.log(`[WA Dispatch] Sending via Meta Cloud API to ${cleanPhone}...`);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json() as any;

      if (!res.ok) {
        const errMsg = data.error?.message || `Meta API error (${res.status})`;
        console.error('[WA Dispatch] Meta Cloud API Error:', data);
        return {
          success: false,
          channel: 'waba',
          error: errMsg,
          details: data
        };
      }

      const msgId = data.messages?.[0]?.id;
      console.log(`[WA Dispatch] Meta Cloud API success, messageId: ${msgId}`);
      return {
        success: true,
        channel: 'waba',
        messageId: msgId,
        details: data
      };
    } catch (err: any) {
      console.error('[WA Dispatch] Meta Cloud API Exception:', err);
      return {
        success: false,
        channel: 'waba',
        error: err.message || 'Network exception while contacting Meta Cloud API'
      };
    }
  }

  // 2. CHANNEL: WAHA (Slot 1 or Slot 2)
  const isCampaign = channel === 'waha_campaign';
  const session = isCampaign 
    ? (opts.wahaConfig?.campaignSessionName || 'campaign')
    : (opts.wahaConfig?.sessionName || 'default');

  const wahaUrl = opts.wahaConfig?.wahaUrl || process.env.WAHA_URL || 'https://waha.araahoney.my.id';
  const apiKey = opts.wahaConfig?.apiKey || process.env.WAHA_API_KEY || 'araahoney123';

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['X-Api-Key'] = apiKey;
  }

  // Format button choices nicely for text-based WAHA
  let wahaMessage = opts.message;
  if (opts.buttons && opts.buttons.length > 0) {
    const btnLines = opts.buttons.slice(0, 3).map((b, i) => `${i + 1}️⃣ ${b.title}`).join('\n');
    wahaMessage += `\n\n📌 *Pilihan Balasan Cepat:*\n${btnLines}`;
  }

  try {
    if (hasMedia) {
      const mediaPayload = {
        session,
        chatId: wahaChatId,
        file: {
          url: mediaUrl,
          mimetype: isVideo ? 'video/mp4' : 'image/jpeg',
          filename: isVideo ? 'video-araa.mp4' : 'promo-araa.jpg'
        },
        caption: wahaMessage
      };

      console.log(`[WA Dispatch] Sending ${isVideo ? 'Video' : 'Image'} via WAHA (${session}) to ${wahaChatId}...`);
      let mediaRes = await fetch(`${wahaUrl}/api/sendFile`, {
        method: 'POST',
        headers,
        body: JSON.stringify(mediaPayload)
      });

      if (!mediaRes.ok && !isVideo) {
        mediaRes = await fetch(`${wahaUrl}/api/sendImage`, {
          method: 'POST',
          headers,
          body: JSON.stringify(mediaPayload)
        });
      }

      if (mediaRes.ok) {
        const mediaData = await mediaRes.json().catch(() => ({}));
        return {
          success: true,
          channel,
          messageId: mediaData.id || mediaData.messageId,
          details: mediaData
        };
      }
    }

    // Send Text via WAHA
    console.log(`[WA Dispatch] Sending Text via WAHA (${session}) to ${wahaChatId}...`);
    let textRes = await fetch(`${wahaUrl}/api/sendText`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        session,
        chatId: wahaChatId,
        text: wahaMessage
      })
    });

    if (!textRes.ok) {
      // Fallback endpoint
      textRes = await fetch(`${wahaUrl}/api/messages/sendText`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          session,
          chatId: wahaChatId,
          text: wahaMessage
        })
      });
    }

    if (!textRes.ok) {
      const errText = await textRes.text();
      return {
        success: false,
        channel,
        error: `WAHA Error (${textRes.status}): ${errText}`
      };
    }

    const textData = await textRes.json().catch(() => ({}));
    return {
      success: true,
      channel,
      messageId: textData.id || textData.messageId,
      details: textData
    };

  } catch (err: any) {
    console.error(`[WA Dispatch] WAHA Exception (${session}):`, err);
    return {
      success: false,
      channel,
      error: err.message || 'Network exception while contacting WAHA server'
    };
  }
}

import { createFileRoute } from '@tanstack/react-router';
import { generateAIAdsAnalysis } from '@/lib/ai-ads-analyzer';
import { sendTelegramMessage, DEFAULT_TELEGRAM_BOT_TOKEN, DEFAULT_TELEGRAM_CHAT_ID } from '@/lib/telegram';

export const Route = createFileRoute('/api/ai/analyze-ads')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json().catch(() => ({})) as any;
          const { 
            campaigns = [], 
            adsets = [], 
            ads = [], 
            sales = { totalRevenue: 0, totalOrders: 0, totalCogs: 0, totalNetProfit: 0, realRoas: 0 },
            periodName = "7 Hari Terakhir",
            sendToTelegram = false,
            telegramToken,
            telegramChatId
          } = body;

          const analysis = generateAIAdsAnalysis(campaigns, adsets, ads, sales, periodName);

          let telegramResult = null;
          if (sendToTelegram) {
            const token = telegramToken || DEFAULT_TELEGRAM_BOT_TOKEN;
            const chatId = telegramChatId || DEFAULT_TELEGRAM_CHAT_ID;

            telegramResult = await sendTelegramMessage(
              token,
              chatId,
              analysis.telegramFormattedText,
              "Markdown"
            );
          }

          return new Response(JSON.stringify({
            success: true,
            analysis,
            telegram: telegramResult
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (error: any) {
          console.error('[AI Analyze Ads Error]:', error);
          return new Response(JSON.stringify({
            success: false,
            error: error.message || 'Internal Server Error'
          }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
    }
  }
});

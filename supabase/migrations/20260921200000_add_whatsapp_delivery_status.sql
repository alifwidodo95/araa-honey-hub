-- Add delivery_status and wamid to whatsapp_chat_logs for read receipts & double checks
ALTER TABLE public.whatsapp_chat_logs 
ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'sent';

ALTER TABLE public.whatsapp_chat_logs 
ADD COLUMN IF NOT EXISTS wamid TEXT;

CREATE INDEX IF NOT EXISTS idx_whatsapp_chat_logs_wamid 
ON public.whatsapp_chat_logs(wamid);

CREATE INDEX IF NOT EXISTS idx_whatsapp_chat_logs_delivery_status 
ON public.whatsapp_chat_logs(delivery_status);

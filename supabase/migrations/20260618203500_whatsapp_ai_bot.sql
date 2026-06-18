-- Create table for WhatsApp AI Settings (Multi-Tenant)
CREATE TABLE IF NOT EXISTS public.whatsapp_ai_settings (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    deepseek_api_key TEXT,
    system_prompt TEXT,
    is_active BOOLEAN DEFAULT false NOT NULL,
    waha_url TEXT,
    waha_session TEXT DEFAULT 'default' NOT NULL,
    waha_api_key TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS for settings
ALTER TABLE public.whatsapp_ai_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can manage their own AI settings" ON public.whatsapp_ai_settings;

-- Create policies for settings
CREATE POLICY "Users can manage their own AI settings" 
ON public.whatsapp_ai_settings
FOR ALL 
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create table for WhatsApp Chat Logs (Multi-Tenant)
CREATE TABLE IF NOT EXISTS public.whatsapp_chat_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    chat_id TEXT NOT NULL, -- e.g. "628xxx@c.us"
    customer_phone TEXT NOT NULL, -- clean phone number
    customer_name TEXT,
    message TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
    replied_by TEXT, -- 'ai' or 'manual' or null
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS for chat logs
ALTER TABLE public.whatsapp_chat_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can manage their own chat logs" ON public.whatsapp_chat_logs;

-- Create policies for chat logs
CREATE POLICY "Users can manage their own chat logs" 
ON public.whatsapp_chat_logs
FOR ALL 
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create indexes for logs
CREATE INDEX IF NOT EXISTS idx_whatsapp_chat_logs_user_chat ON public.whatsapp_chat_logs(user_id, chat_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_chat_logs_created ON public.whatsapp_chat_logs(created_at DESC);

-- Seed Owner's settings with the DeepSeek API Key
INSERT INTO public.whatsapp_ai_settings (user_id, deepseek_api_key, system_prompt, is_active, waha_url, waha_session)
VALUES (
    'b2ef75dc-8ebc-43e5-84fb-ca8998b9f96f', 
    'sk-a8e43388b5884245ad8be0b1b09726c2', 
    'Kamu adalah Asisten Customer Service AI ramah bernama Jarvis untuk toko Madu Araa (Araa Honey). Tugasmu adalah menjawab chat pelanggan di WhatsApp dengan santun, singkat (maksimal 2 kalimat), dan solutif. Arahkan mereka untuk memesan lewat WhatsApp ini.',
    false,
    'https://waha.araahoney.my.id',
    'default'
)
ON CONFLICT (user_id) DO UPDATE
SET deepseek_api_key = EXCLUDED.deepseek_api_key,
    waha_url = COALESCE(whatsapp_ai_settings.waha_url, EXCLUDED.waha_url),
    waha_session = COALESCE(whatsapp_ai_settings.waha_session, EXCLUDED.waha_session);

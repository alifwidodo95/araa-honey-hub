-- Create meta_comments table
CREATE TABLE IF NOT EXISTS public.meta_comments (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    parent_id TEXT,
    username TEXT,
    message TEXT,
    reply_message TEXT,
    replied BOOLEAN DEFAULT false,
    replied_at TIMESTAMPTZ,
    replied_by TEXT, -- 'ai', 'manual'
    channel TEXT NOT NULL, -- 'facebook', 'instagram'
    created_at TIMESTAMPTZ NOT NULL
);

-- Create meta_posts table
CREATE TABLE IF NOT EXISTS public.meta_posts (
    id TEXT PRIMARY KEY,
    permalink TEXT,
    is_ad BOOLEAN DEFAULT false,
    auto_reply_active BOOLEAN DEFAULT true,
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.meta_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_posts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Allow select for authenticated" ON public.meta_comments;
DROP POLICY IF EXISTS "Allow insert for authenticated" ON public.meta_comments;
DROP POLICY IF EXISTS "Allow update for authenticated" ON public.meta_comments;
DROP POLICY IF EXISTS "Allow delete for authenticated" ON public.meta_comments;

DROP POLICY IF EXISTS "Allow select for authenticated" ON public.meta_posts;
DROP POLICY IF EXISTS "Allow insert for authenticated" ON public.meta_posts;
DROP POLICY IF EXISTS "Allow update for authenticated" ON public.meta_posts;
DROP POLICY IF EXISTS "Allow delete for authenticated" ON public.meta_posts;

-- Create policies for authenticated users (dashboard admins)
CREATE POLICY "Allow select for authenticated" ON public.meta_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow insert for authenticated" ON public.meta_comments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow update for authenticated" ON public.meta_comments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete for authenticated" ON public.meta_comments FOR DELETE TO authenticated USING (true);

CREATE POLICY "Allow select for authenticated" ON public.meta_posts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow insert for authenticated" ON public.meta_posts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow update for authenticated" ON public.meta_posts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete for authenticated" ON public.meta_posts FOR DELETE TO authenticated USING (true);

-- Initialize default Meta AI settings if not present
INSERT INTO public.app_settings (key, value)
VALUES (
  'meta_ai_settings', 
  '{"auto_reply_enabled": true, "cs_whatsapp_number": "0878-3703-5470", "system_instruction": "Jawab dengan sangat ramah, singkat (maksimal 2-3 kalimat), informasikan bahwa madu Araa 100% murni bergaransi uang kembali, dan arahkan pemesanan ke nomor WhatsApp CS."}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- Update role_permissions in app_settings to include meta-comments page access for owner
UPDATE public.app_settings
SET value = jsonb_set(
  jsonb_set(value, '{owner,meta-comments}', 'true'::jsonb),
  '{staff,meta-comments}', 'false'::jsonb
)
WHERE key = 'role_permissions';

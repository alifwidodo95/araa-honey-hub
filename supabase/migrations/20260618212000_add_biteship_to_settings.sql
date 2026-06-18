-- Add Biteship configuration columns to whatsapp_ai_settings
ALTER TABLE public.whatsapp_ai_settings ADD COLUMN IF NOT EXISTS biteship_origin_area_id TEXT;
ALTER TABLE public.whatsapp_ai_settings ADD COLUMN IF NOT EXISTS biteship_origin_name TEXT;

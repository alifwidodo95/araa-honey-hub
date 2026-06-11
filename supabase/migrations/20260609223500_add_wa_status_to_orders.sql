-- Add WhatsApp receipt tracking columns to orders table
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS resi_shared_via_wa BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS wa_share_error TEXT NULL;

-- Ensure authenticated users can select and update these fields (already covered by "auth read orders" and "auth insert orders" but good to be explicit if they modify)
GRANT UPDATE(resi_shared_via_wa, wa_share_error) ON public.orders TO authenticated;

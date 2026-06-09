ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS resi_shared_via_wa BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS wa_share_error TEXT NULL;

GRANT UPDATE(resi_shared_via_wa, wa_share_error) ON public.orders TO authenticated;
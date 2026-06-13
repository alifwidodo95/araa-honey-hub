-- Drop dependent functions
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role) CASCADE;
DROP FUNCTION IF EXISTS public.has_role(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.current_role_label() CASCADE;

-- Drop unique constraint of user_roles table first
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;

-- Alter column type to TEXT
ALTER TABLE public.user_roles ALTER COLUMN role TYPE TEXT;

-- Recreate unique constraint
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);

-- Drop the old enum type if it exists
DROP TYPE IF EXISTS public.app_role;

-- Re-create has_role function with TEXT argument
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role);
$$;

GRANT EXECUTE ON FUNCTION public.has_role(UUID, TEXT) TO authenticated;

-- Re-create current_role_label function
CREATE OR REPLACE FUNCTION public.current_role_label()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT role FROM public.user_roles WHERE user_id=auth.uid() ORDER BY (role='owner') DESC, created_at LIMIT 1),
    'none'
  );
$$;

GRANT EXECUTE ON FUNCTION public.current_role_label() TO authenticated;

-- Initialize default role permissions in app_settings if not already present
INSERT INTO public.app_settings(key, value)
VALUES ('role_permissions', jsonb_build_object(
  'owner', jsonb_build_object(
    'dashboard', true,
    'penjualan', true,
    'retur', true,
    'stok', true,
    'pengeluaran', true,
    'keuangan', true,
    'pengeluaran_pribadi', true,
    'meta_ads', true,
    'import_riwayat', true,
    'pengaturan_harga', true,
    'pengaturan_lumpsum', true,
    'pengaturan_whatsapp', true,
    'pengaturan_staf', true
  ),
  'staff', jsonb_build_object(
    'dashboard', true,
    'penjualan', true,
    'retur', true,
    'stok', true,
    'pengeluaran', true,
    'keuangan', false,
    'pengeluaran_pribadi', false,
    'meta_ads', false,
    'import_riwayat', false,
    'pengaturan_harga', false,
    'pengaturan_lumpsum', false,
    'pengaturan_whatsapp', false,
    'pengaturan_staf', false
  )
))
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

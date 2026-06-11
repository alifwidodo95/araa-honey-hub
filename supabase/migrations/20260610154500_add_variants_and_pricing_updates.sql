-- 1. Membuat tabel varian madu jika belum ada
CREATE TABLE IF NOT EXISTS public.honey_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Memasukkan varian madu bawaan
INSERT INTO public.honey_variants (name)
VALUES ('Akasia'), ('Randu'), ('Karet'), ('Lainnya')
ON CONFLICT (name) DO NOTHING;

-- 3. Membuat atau memperbarui fungsi trigger untuk sinkronisasi otomatis varian baru
CREATE OR REPLACE FUNCTION public.sync_new_honey_variant()
RETURNS TRIGGER AS $$
DECLARE
  size_rec RECORD;
  tier_rec RECORD;
BEGIN
  -- Sinkronisasi stok filling di dandang
  INSERT INTO public.dandang_balance (honey_type, kg_remaining, avg_cost_per_kg)
  VALUES (NEW.name, 0, 0)
  ON CONFLICT (honey_type) DO NOTHING;

  -- Inisialisasi harga retail default (Rp 0) untuk varian baru
  FOR size_rec IN SELECT id FROM public.product_sizes LOOP
    INSERT INTO public.retail_prices (size_id, honey_type, price)
    VALUES (size_rec.id, NEW.name, 0)
    ON CONFLICT (size_id, honey_type) DO NOTHING;
  END LOOP;

  -- Inisialisasi harga reseller default (Rp 0) untuk varian baru
  FOR size_rec IN SELECT id FROM public.product_sizes LOOP
    FOR tier_rec IN SELECT id FROM public.reseller_tiers LOOP
      INSERT INTO public.reseller_prices (tier_id, size_id, honey_type, price)
      VALUES (tier_rec.id, size_rec.id, NEW.name, 0)
      ON CONFLICT (tier_id, size_id, honey_type) DO NOTHING;
    END LOOP;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Pastikan trigger terpasang
DROP TRIGGER IF EXISTS sync_new_honey_variant_trig ON public.honey_variants;
CREATE TRIGGER sync_new_honey_variant_trig
AFTER INSERT ON public.honey_variants
FOR EACH ROW EXECUTE FUNCTION public.sync_new_honey_variant();

-- 4. Mengubah skema retail_prices
ALTER TABLE public.retail_prices DROP CONSTRAINT IF EXISTS retail_prices_pkey;
ALTER TABLE public.retail_prices ADD COLUMN IF NOT EXISTS honey_type TEXT;
UPDATE public.retail_prices SET honey_type = 'Lainnya' WHERE honey_type IS NULL;

-- Salin harga retail yang ada ke semua varian terdaftar
CREATE TEMP TABLE temp_retail_prices AS SELECT * FROM public.retail_prices;
TRUNCATE public.retail_prices;
INSERT INTO public.retail_prices (size_id, honey_type, price, updated_at)
SELECT t.size_id, v.name, t.price, t.updated_at
FROM temp_retail_prices t
CROSS JOIN public.honey_variants v;

ALTER TABLE public.retail_prices ALTER COLUMN honey_type SET NOT NULL;
ALTER TABLE public.retail_prices ADD PRIMARY KEY (size_id, honey_type);

-- 5. Mengubah skema reseller_prices
ALTER TABLE public.reseller_prices DROP CONSTRAINT IF EXISTS reseller_prices_pkey;
ALTER TABLE public.reseller_prices ADD COLUMN IF NOT EXISTS honey_type TEXT;
UPDATE public.reseller_prices SET honey_type = 'Lainnya' WHERE honey_type IS NULL;

-- Salin harga reseller yang ada ke semua varian terdaftar
CREATE TEMP TABLE temp_reseller_prices AS SELECT * FROM public.reseller_prices;
TRUNCATE public.reseller_prices;
INSERT INTO public.reseller_prices (tier_id, size_id, honey_type, price)
SELECT t.tier_id, t.size_id, v.name, t.price
FROM temp_reseller_prices t
CROSS JOIN public.honey_variants v;

ALTER TABLE public.reseller_prices ALTER COLUMN honey_type SET NOT NULL;
ALTER TABLE public.reseller_prices ADD PRIMARY KEY (tier_id, size_id, honey_type);

-- 6. Kebijakan Keamanan (RLS)
ALTER TABLE public.honey_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth read variants" ON public.honey_variants;
CREATE POLICY "auth read variants" ON public.honey_variants FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "owner manage variants" ON public.honey_variants;
CREATE POLICY "owner manage variants" ON public.honey_variants FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'owner')) WITH CHECK (public.has_role(auth.uid(), 'owner'));

GRANT ALL ON public.honey_variants TO authenticated;

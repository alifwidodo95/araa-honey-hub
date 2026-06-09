
-- ENUMS
CREATE TYPE public.app_role AS ENUM ('owner','staff');
CREATE TYPE public.sales_channel AS ENUM ('shopee','tiktok','whatsapp','reseller','offline');
CREATE TYPE public.packaging_type AS ENUM ('botol','stiker','segel','bubblewrap','lakban','kardus');
CREATE TYPE public.expense_category_biz AS ENUM ('meta_ads','gaji','lumpsum','packaging_purchase','other');

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- TABLES (no policies yet) =====================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
CREATE TABLE public.owner_2fa (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  otp_hash TEXT,
  otp_expires_at TIMESTAMPTZ,
  last_verified_at TIMESTAMPTZ,
  enabled BOOLEAN NOT NULL DEFAULT true
);
CREATE TABLE public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.product_sizes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  weight_grams INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true
);
CREATE TABLE public.retail_prices (
  size_id UUID PRIMARY KEY REFERENCES public.product_sizes(id) ON DELETE CASCADE,
  price NUMERIC(14,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.reseller_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.reseller_prices (
  tier_id UUID NOT NULL REFERENCES public.reseller_tiers(id) ON DELETE CASCADE,
  size_id UUID NOT NULL REFERENCES public.product_sizes(id) ON DELETE CASCADE,
  price NUMERIC(14,2) NOT NULL DEFAULT 0,
  PRIMARY KEY(tier_id,size_id)
);
CREATE TABLE public.marketplace_fees (
  channel public.sales_channel PRIMARY KEY,
  fee_percent NUMERIC(6,3) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.raw_material_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at DATE NOT NULL DEFAULT CURRENT_DATE,
  supplier TEXT,
  jerigen_qty INTEGER NOT NULL CHECK (jerigen_qty>0),
  kg_per_jerigen NUMERIC(8,2) NOT NULL DEFAULT 50,
  price_total NUMERIC(14,2) NOT NULL CHECK (price_total>=0),
  jerigen_remaining INTEGER NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.dandang_balance (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id=1),
  kg_remaining NUMERIC(12,3) NOT NULL DEFAULT 0,
  avg_cost_per_kg NUMERIC(14,4) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.dandang_balance(id,kg_remaining,avg_cost_per_kg) VALUES (1,0,0);
CREATE TABLE public.dandang_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID NOT NULL REFERENCES public.raw_material_lots(id),
  jerigen_opened INTEGER NOT NULL CHECK (jerigen_opened>0),
  kg_added NUMERIC(12,3) NOT NULL,
  cost_per_kg NUMERIC(14,4) NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.packaging_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type public.packaging_type NOT NULL,
  size_id UUID REFERENCES public.product_sizes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'pcs',
  current_stock NUMERIC(14,3) NOT NULL DEFAULT 0,
  avg_cost NUMERIC(14,4) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(type, size_id)
);
CREATE TABLE public.packaging_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.packaging_items(id) ON DELETE CASCADE,
  qty NUMERIC(14,3) NOT NULL CHECK (qty>0),
  total_price NUMERIC(14,2) NOT NULL CHECK (total_price>=0),
  unit_cost NUMERIC(14,4) GENERATED ALWAYS AS (total_price/NULLIF(qty,0)) STORED,
  purchased_at DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel public.sales_channel NOT NULL,
  reseller_tier_id UUID REFERENCES public.reseller_tiers(id),
  customer_note TEXT,
  subtotal_gross NUMERIC(14,2) NOT NULL DEFAULT 0,
  marketplace_fee NUMERIC(14,2) NOT NULL DEFAULT 0,
  shipping_fee NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_revenue NUMERIC(14,2) NOT NULL DEFAULT 0,
  cogs_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  honey_kg_used NUMERIC(12,3) NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_orders_created_at ON public.orders(created_at);
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  size_id UUID NOT NULL REFERENCES public.product_sizes(id),
  qty INTEGER NOT NULL CHECK (qty>0),
  unit_price NUMERIC(14,2) NOT NULL,
  line_total NUMERIC(14,2) NOT NULL,
  honey_kg_used NUMERIC(12,3) NOT NULL,
  cogs_line NUMERIC(14,2) NOT NULL DEFAULT 0
);
CREATE TABLE public.expenses_business (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category public.expense_category_biz NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount>=0),
  note TEXT,
  occurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_expenses_biz_date ON public.expenses_business(occurred_on);
CREATE TABLE public.expenses_personal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount>=0),
  note TEXT,
  occurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
  owner_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.lumpsum_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  monthly_amount NUMERIC(14,2) NOT NULL CHECK (monthly_amount>=0),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.lumpsum_postings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES public.lumpsum_rules(id) ON DELETE CASCADE,
  period_month DATE NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(rule_id, period_month)
);

-- GRANTS =====================================
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT SELECT, UPDATE ON public.owner_2fa TO authenticated;
GRANT SELECT ON public.app_settings TO authenticated;
GRANT SELECT ON public.product_sizes TO authenticated;
GRANT SELECT ON public.retail_prices TO authenticated;
GRANT SELECT ON public.reseller_tiers TO authenticated;
GRANT SELECT ON public.reseller_prices TO authenticated;
GRANT SELECT ON public.marketplace_fees TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.raw_material_lots TO authenticated;
GRANT SELECT ON public.dandang_balance TO authenticated;
GRANT SELECT, INSERT ON public.dandang_transfers TO authenticated;
GRANT SELECT ON public.packaging_items TO authenticated;
GRANT SELECT, INSERT ON public.packaging_purchases TO authenticated;
GRANT SELECT, INSERT ON public.orders TO authenticated;
GRANT SELECT, INSERT ON public.order_items TO authenticated;
GRANT SELECT, INSERT ON public.expenses_business TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses_personal TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lumpsum_rules TO authenticated;
GRANT SELECT ON public.lumpsum_postings TO authenticated;
GRANT ALL ON public.profiles, public.user_roles, public.owner_2fa, public.app_settings,
  public.product_sizes, public.retail_prices, public.reseller_tiers, public.reseller_prices,
  public.marketplace_fees, public.raw_material_lots, public.dandang_balance, public.dandang_transfers,
  public.packaging_items, public.packaging_purchases, public.orders, public.order_items,
  public.expenses_business, public.expenses_personal, public.lumpsum_rules, public.lumpsum_postings
  TO service_role;

-- HELPER FUNCTIONS =====================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role);
$$;

CREATE OR REPLACE FUNCTION public.current_role_label()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='owner') THEN 'owner'
    WHEN EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='staff') THEN 'staff'
    ELSE 'none'
  END;
$$;

-- RLS =====================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own or owner" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.has_role(auth.uid(),'owner'));
CREATE POLICY "update own" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "insert own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'owner'));
CREATE POLICY "owner manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'owner')) WITH CHECK (public.has_role(auth.uid(),'owner'));

ALTER TABLE public.owner_2fa ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own 2fa read" ON public.owner_2fa FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own 2fa update" ON public.owner_2fa FOR UPDATE TO authenticated USING (user_id = auth.uid());

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read settings" ON public.app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "owner manage settings" ON public.app_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(),'owner')) WITH CHECK (public.has_role(auth.uid(),'owner'));

ALTER TABLE public.product_sizes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read sizes" ON public.product_sizes FOR SELECT TO authenticated USING (true);
CREATE POLICY "owner manage sizes" ON public.product_sizes FOR ALL TO authenticated USING (public.has_role(auth.uid(),'owner')) WITH CHECK (public.has_role(auth.uid(),'owner'));

ALTER TABLE public.retail_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read retail" ON public.retail_prices FOR SELECT TO authenticated USING (true);
CREATE POLICY "owner manage retail" ON public.retail_prices FOR ALL TO authenticated USING (public.has_role(auth.uid(),'owner')) WITH CHECK (public.has_role(auth.uid(),'owner'));

ALTER TABLE public.reseller_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read tiers" ON public.reseller_tiers FOR SELECT TO authenticated USING (true);
CREATE POLICY "owner manage tiers" ON public.reseller_tiers FOR ALL TO authenticated USING (public.has_role(auth.uid(),'owner')) WITH CHECK (public.has_role(auth.uid(),'owner'));

ALTER TABLE public.reseller_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read reseller prices" ON public.reseller_prices FOR SELECT TO authenticated USING (true);
CREATE POLICY "owner manage reseller prices" ON public.reseller_prices FOR ALL TO authenticated USING (public.has_role(auth.uid(),'owner')) WITH CHECK (public.has_role(auth.uid(),'owner'));

ALTER TABLE public.marketplace_fees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read fees" ON public.marketplace_fees FOR SELECT TO authenticated USING (true);
CREATE POLICY "owner manage fees" ON public.marketplace_fees FOR ALL TO authenticated USING (public.has_role(auth.uid(),'owner')) WITH CHECK (public.has_role(auth.uid(),'owner'));

ALTER TABLE public.raw_material_lots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read lots" ON public.raw_material_lots FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert lots" ON public.raw_material_lots FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "owner update lots" ON public.raw_material_lots FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'owner'));

ALTER TABLE public.dandang_balance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read dandang" ON public.dandang_balance FOR SELECT TO authenticated USING (true);

ALTER TABLE public.dandang_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read transfers" ON public.dandang_transfers FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert transfers" ON public.dandang_transfers FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

ALTER TABLE public.packaging_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read pkg" ON public.packaging_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "owner manage pkg" ON public.packaging_items FOR ALL TO authenticated USING (public.has_role(auth.uid(),'owner')) WITH CHECK (public.has_role(auth.uid(),'owner'));

ALTER TABLE public.packaging_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read pkg purchases" ON public.packaging_purchases FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert pkg purchases" ON public.packaging_purchases FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read orders" ON public.orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert orders" ON public.orders FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read items" ON public.order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert items" ON public.order_items FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

ALTER TABLE public.expenses_business ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read biz" ON public.expenses_business FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert biz" ON public.expenses_business FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

ALTER TABLE public.expenses_personal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner only personal" ON public.expenses_personal FOR ALL TO authenticated USING (public.has_role(auth.uid(),'owner')) WITH CHECK (public.has_role(auth.uid(),'owner'));

ALTER TABLE public.lumpsum_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manage lumpsum" ON public.lumpsum_rules FOR ALL TO authenticated USING (public.has_role(auth.uid(),'owner')) WITH CHECK (public.has_role(auth.uid(),'owner'));

ALTER TABLE public.lumpsum_postings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner read postings" ON public.lumpsum_postings FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'owner'));

-- Trigger autoprofile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles(id,email,full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name',''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- SEED =====================================
INSERT INTO public.product_sizes(name,weight_grams,sort_order) VALUES
 ('1 kg',1000,1),('500 gr',500,2),('250 gr',250,3),('130 gr',130,4),('100 gr',100,5);
INSERT INTO public.retail_prices(size_id,price) SELECT id, 0 FROM public.product_sizes;
INSERT INTO public.reseller_tiers(name,sort_order) VALUES ('Silver',1),('Gold',2),('Platinum',3);
INSERT INTO public.reseller_prices(tier_id,size_id,price)
 SELECT t.id, s.id, 0 FROM public.reseller_tiers t CROSS JOIN public.product_sizes s;
INSERT INTO public.marketplace_fees(channel,fee_percent) VALUES
 ('shopee',6.0),('tiktok',4.0),('whatsapp',0),('reseller',0),('offline',0);
INSERT INTO public.packaging_items(type,size_id,name,unit)
 SELECT 'botol', id, 'Botol '||name, 'pcs' FROM public.product_sizes;
INSERT INTO public.packaging_items(type,size_id,name,unit)
 SELECT 'stiker', id, 'Stiker '||name, 'pcs' FROM public.product_sizes;
INSERT INTO public.packaging_items(type,size_id,name,unit) VALUES
 ('segel',NULL,'Segel Tutup Botol','pcs'),
 ('bubblewrap',NULL,'Bubble Wrap','meter'),
 ('lakban',NULL,'Lakban','roll'),
 ('kardus',NULL,'Kardus','pcs');
INSERT INTO public.app_settings(key,value) VALUES
 ('packaging_allocation', jsonb_build_object(
    '1 kg',    jsonb_build_object('bubblewrap_m',0.6,'kardus_pcs',1,'lakban_roll',0.02),
    '500 gr',  jsonb_build_object('bubblewrap_m',0.4,'kardus_pcs',0.5,'lakban_roll',0.01),
    '250 gr',  jsonb_build_object('bubblewrap_m',0.3,'kardus_pcs',0.3,'lakban_roll',0.008),
    '130 gr',  jsonb_build_object('bubblewrap_m',0.2,'kardus_pcs',0.2,'lakban_roll',0.005),
    '100 gr',  jsonb_build_object('bubblewrap_m',0.2,'kardus_pcs',0.15,'lakban_roll',0.004)
 ));

-- CORE BUSINESS FUNCTIONS =====================================
CREATE OR REPLACE FUNCTION public.open_jerigen(_lot_id UUID, _jerigen INTEGER)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  lot RECORD; kg_added NUMERIC; cost_per_kg NUMERIC; db RECORD;
  new_total NUMERIC; new_avg NUMERIC;
BEGIN
  IF _jerigen<=0 THEN RAISE EXCEPTION 'Jumlah jerigen harus > 0'; END IF;
  SELECT * INTO lot FROM public.raw_material_lots WHERE id=_lot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lot tidak ditemukan'; END IF;
  IF lot.jerigen_remaining < _jerigen THEN
    RAISE EXCEPTION 'Stok jerigen lot tidak cukup (sisa %)', lot.jerigen_remaining; END IF;
  kg_added := lot.kg_per_jerigen * _jerigen;
  cost_per_kg := lot.price_total / (lot.kg_per_jerigen * lot.jerigen_qty);
  UPDATE public.raw_material_lots SET jerigen_remaining = jerigen_remaining - _jerigen WHERE id=_lot_id;
  SELECT * INTO db FROM public.dandang_balance WHERE id=1 FOR UPDATE;
  new_total := db.kg_remaining + kg_added;
  new_avg := CASE WHEN new_total>0 THEN ((db.kg_remaining*db.avg_cost_per_kg)+(kg_added*cost_per_kg))/new_total ELSE 0 END;
  UPDATE public.dandang_balance SET kg_remaining=new_total, avg_cost_per_kg=new_avg, updated_at=now() WHERE id=1;
  INSERT INTO public.dandang_transfers(lot_id,jerigen_opened,kg_added,cost_per_kg,created_by)
   VALUES (_lot_id,_jerigen,kg_added,cost_per_kg,auth.uid());
END; $$;

CREATE OR REPLACE FUNCTION public.record_packaging_purchase(_item_id UUID, _qty NUMERIC, _total NUMERIC, _date DATE, _note TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE it RECORD; new_stock NUMERIC; new_avg NUMERIC; pid UUID;
BEGIN
  IF _qty<=0 OR _total<0 THEN RAISE EXCEPTION 'Input tidak valid'; END IF;
  SELECT * INTO it FROM public.packaging_items WHERE id=_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item tidak ditemukan'; END IF;
  new_stock := it.current_stock + _qty;
  new_avg := CASE WHEN new_stock>0 THEN ((it.current_stock*it.avg_cost)+_total)/new_stock ELSE 0 END;
  UPDATE public.packaging_items SET current_stock=new_stock, avg_cost=new_avg WHERE id=_item_id;
  INSERT INTO public.packaging_purchases(item_id,qty,total_price,purchased_at,notes,created_by)
   VALUES (_item_id,_qty,_total,COALESCE(_date,CURRENT_DATE),_note,auth.uid()) RETURNING id INTO pid;
  INSERT INTO public.expenses_business(category,amount,note,occurred_on,created_by)
   VALUES ('packaging_purchase',_total, COALESCE(_note,'Pembelian '||it.name), COALESCE(_date,CURRENT_DATE), auth.uid());
  RETURN pid;
END; $$;

CREATE OR REPLACE FUNCTION public.create_order(
  _channel public.sales_channel, _tier_id UUID, _items JSONB,
  _shipping_fee NUMERIC, _customer_note TEXT
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  new_order_id UUID; it JSONB; size_rec RECORD; qty INTEGER;
  unit_price NUMERIC; line_total NUMERIC; honey_kg NUMERIC;
  total_honey NUMERIC := 0; subtotal NUMERIC := 0; fee_pct NUMERIC; mp_fee NUMERIC;
  db RECORD; alloc JSONB; size_alloc JSONB;
  bw_item UUID; kd_item UUID; lk_item UUID; sg_item UUID;
  bw_qty NUMERIC := 0; kd_qty NUMERIC := 0; lk_qty NUMERIC := 0;
  cogs_line NUMERIC; cogs_total NUMERIC := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF jsonb_array_length(_items)=0 THEN RAISE EXCEPTION 'Item kosong'; END IF;
  SELECT value INTO alloc FROM public.app_settings WHERE key='packaging_allocation';
  SELECT * INTO db FROM public.dandang_balance WHERE id=1 FOR UPDATE;
  SELECT id INTO bw_item FROM public.packaging_items WHERE type='bubblewrap' LIMIT 1;
  SELECT id INTO kd_item FROM public.packaging_items WHERE type='kardus' LIMIT 1;
  SELECT id INTO lk_item FROM public.packaging_items WHERE type='lakban' LIMIT 1;
  SELECT id INTO sg_item FROM public.packaging_items WHERE type='segel' LIMIT 1;

  INSERT INTO public.orders(channel,reseller_tier_id,customer_note,shipping_fee,created_by)
   VALUES (_channel,_tier_id,_customer_note,COALESCE(_shipping_fee,0),auth.uid()) RETURNING id INTO new_order_id;

  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    qty := (it->>'qty')::INTEGER;
    unit_price := (it->>'unit_price')::NUMERIC;
    SELECT * INTO size_rec FROM public.product_sizes WHERE id=(it->>'size_id')::UUID;
    IF NOT FOUND THEN RAISE EXCEPTION 'Ukuran tidak ditemukan'; END IF;
    honey_kg := (size_rec.weight_grams * qty)::NUMERIC / 1000;
    total_honey := total_honey + honey_kg;
    line_total := unit_price * qty;
    subtotal := subtotal + line_total;
    cogs_line := honey_kg * db.avg_cost_per_kg
      + qty * COALESCE((SELECT avg_cost FROM public.packaging_items WHERE type='botol' AND size_id=size_rec.id),0)
      + qty * COALESCE((SELECT avg_cost FROM public.packaging_items WHERE type='stiker' AND size_id=size_rec.id),0)
      + qty * COALESCE((SELECT avg_cost FROM public.packaging_items WHERE id=sg_item),0);
    cogs_total := cogs_total + cogs_line;
    UPDATE public.packaging_items SET current_stock = current_stock - qty WHERE type='botol' AND size_id=size_rec.id;
    UPDATE public.packaging_items SET current_stock = current_stock - qty WHERE type='stiker' AND size_id=size_rec.id;
    UPDATE public.packaging_items SET current_stock = current_stock - qty WHERE id=sg_item;
    size_alloc := alloc->size_rec.name;
    IF size_alloc IS NOT NULL THEN
      bw_qty := bw_qty + qty * COALESCE((size_alloc->>'bubblewrap_m')::NUMERIC,0);
      kd_qty := kd_qty + qty * COALESCE((size_alloc->>'kardus_pcs')::NUMERIC,0);
      lk_qty := lk_qty + qty * COALESCE((size_alloc->>'lakban_roll')::NUMERIC,0);
    END IF;
    INSERT INTO public.order_items(order_id,size_id,qty,unit_price,line_total,honey_kg_used,cogs_line)
     VALUES (new_order_id,size_rec.id,qty,unit_price,line_total,honey_kg,cogs_line);
  END LOOP;

  IF total_honey > db.kg_remaining THEN
    RAISE EXCEPTION 'Stok madu di dandang tidak cukup (sisa % kg, butuh % kg)', db.kg_remaining, total_honey;
  END IF;
  UPDATE public.dandang_balance SET kg_remaining = kg_remaining - total_honey, updated_at=now() WHERE id=1;

  IF bw_item IS NOT NULL AND bw_qty>0 THEN UPDATE public.packaging_items SET current_stock = current_stock - bw_qty WHERE id=bw_item; END IF;
  IF kd_item IS NOT NULL AND kd_qty>0 THEN UPDATE public.packaging_items SET current_stock = current_stock - kd_qty WHERE id=kd_item; END IF;
  IF lk_item IS NOT NULL AND lk_qty>0 THEN UPDATE public.packaging_items SET current_stock = current_stock - lk_qty WHERE id=lk_item; END IF;

  SELECT fee_percent INTO fee_pct FROM public.marketplace_fees WHERE channel=_channel;
  mp_fee := ROUND(subtotal * COALESCE(fee_pct,0) / 100, 2);

  UPDATE public.orders SET
    subtotal_gross = subtotal,
    marketplace_fee = mp_fee,
    net_revenue = subtotal - mp_fee - COALESCE(_shipping_fee,0),
    cogs_total = cogs_total,
    honey_kg_used = total_honey
   WHERE id = new_order_id;

  RETURN new_order_id;
END; $$;

CREATE OR REPLACE FUNCTION public.run_monthly_lumpsum()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r RECORD; posted INTEGER := 0; period DATE := date_trunc('month', now())::date; owner_id UUID;
BEGIN
  SELECT user_id INTO owner_id FROM public.user_roles WHERE role='owner' ORDER BY created_at LIMIT 1;
  FOR r IN SELECT * FROM public.lumpsum_rules WHERE active LOOP
    BEGIN
      INSERT INTO public.lumpsum_postings(rule_id,period_month,amount) VALUES (r.id,period,r.monthly_amount);
      INSERT INTO public.expenses_business(category,amount,note,occurred_on)
       VALUES ('lumpsum', r.monthly_amount, 'Lumpsum '||r.label||' '||to_char(period,'YYYY-MM'), period);
      INSERT INTO public.expenses_personal(category,amount,note,occurred_on,owner_id)
       VALUES ('Lumpsum '||r.label, r.monthly_amount, 'Transfer dari kas Araa Honey', period, owner_id);
      posted := posted + 1;
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
  END LOOP;
  RETURN posted;
END; $$;

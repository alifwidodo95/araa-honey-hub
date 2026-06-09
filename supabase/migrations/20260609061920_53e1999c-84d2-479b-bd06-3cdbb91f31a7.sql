
ALTER TABLE public.dandang_balance DROP CONSTRAINT IF EXISTS dandang_balance_id_check;
ALTER TABLE public.dandang_balance ADD COLUMN IF NOT EXISTS honey_type TEXT;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS honey_type TEXT;
UPDATE public.dandang_balance SET honey_type='Lainnya' WHERE honey_type IS NULL;
ALTER TABLE public.dandang_balance ALTER COLUMN honey_type SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS dandang_balance_honey_type_uq ON public.dandang_balance(honey_type);

CREATE SEQUENCE IF NOT EXISTS public.dandang_balance_id_seq OWNED BY public.dandang_balance.id;
SELECT setval('public.dandang_balance_id_seq', GREATEST((SELECT COALESCE(MAX(id),0) FROM public.dandang_balance), 1));
ALTER TABLE public.dandang_balance ALTER COLUMN id SET DEFAULT nextval('public.dandang_balance_id_seq');

INSERT INTO public.dandang_balance (honey_type, kg_remaining, avg_cost_per_kg)
SELECT t, 0, 0 FROM (VALUES ('Akasia'),('Randu'),('Karet'),('Lainnya')) v(t)
WHERE NOT EXISTS (SELECT 1 FROM public.dandang_balance d WHERE d.honey_type=v.t);

CREATE OR REPLACE FUNCTION public.open_jerigen(_lot_id uuid, _jerigen integer)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE lot RECORD; kg_added NUMERIC; cost_per_kg NUMERIC; db RECORD;
  new_total NUMERIC; new_avg NUMERIC; kg_per NUMERIC; htype TEXT;
BEGIN
  IF _jerigen<=0 THEN RAISE EXCEPTION 'Jumlah jerigen harus > 0'; END IF;
  SELECT * INTO lot FROM public.raw_material_lots WHERE id=_lot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lot tidak ditemukan'; END IF;
  IF lot.jerigen_remaining < _jerigen THEN RAISE EXCEPTION 'Stok jerigen lot tidak cukup (sisa %)', lot.jerigen_remaining; END IF;
  htype := COALESCE(lot.honey_type, 'Lainnya');
  kg_per := COALESCE(lot.grams_per_jerigen / 1000.0, lot.kg_per_jerigen);
  kg_added := kg_per * _jerigen;
  cost_per_kg := lot.price_total / (kg_per * lot.jerigen_qty);
  UPDATE public.raw_material_lots SET jerigen_remaining = jerigen_remaining - _jerigen WHERE id=_lot_id;
  INSERT INTO public.dandang_balance (honey_type, kg_remaining, avg_cost_per_kg) VALUES (htype, 0, 0) ON CONFLICT (honey_type) DO NOTHING;
  SELECT * INTO db FROM public.dandang_balance WHERE honey_type=htype FOR UPDATE;
  new_total := db.kg_remaining + kg_added;
  new_avg := CASE WHEN new_total>0 THEN ((db.kg_remaining*db.avg_cost_per_kg)+(kg_added*cost_per_kg))/new_total ELSE 0 END;
  UPDATE public.dandang_balance SET kg_remaining=new_total, avg_cost_per_kg=new_avg, updated_at=now() WHERE honey_type=htype;
  INSERT INTO public.dandang_transfers(lot_id,jerigen_opened,kg_added,cost_per_kg,created_by) VALUES (_lot_id,_jerigen,kg_added,cost_per_kg,auth.uid());
END; $function$;

CREATE OR REPLACE FUNCTION public.delete_dandang_transfer(_transfer_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE t public.dandang_transfers%ROWTYPE; lot public.raw_material_lots%ROWTYPE; d public.dandang_balance%ROWTYPE;
  new_kg numeric; old_total_cost numeric; removed_cost numeric; new_total_cost numeric; htype text;
BEGIN
  SELECT * INTO t FROM public.dandang_transfers WHERE id = _transfer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer tidak ditemukan'; END IF;
  SELECT * INTO lot FROM public.raw_material_lots WHERE id = t.lot_id;
  htype := COALESCE(lot.honey_type, 'Lainnya');
  SELECT * INTO d FROM public.dandang_balance WHERE honey_type=htype FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Saldo dandang untuk % tidak ditemukan', htype; END IF;
  IF d.kg_remaining < t.kg_added THEN RAISE EXCEPTION 'Saldo dandang % (% kg) lebih kecil dari kg yang akan dihapus (% kg). Madu sudah terpakai.', htype, d.kg_remaining, t.kg_added; END IF;
  old_total_cost := COALESCE(d.kg_remaining,0) * COALESCE(d.avg_cost_per_kg,0);
  removed_cost := t.kg_added * t.cost_per_kg;
  new_kg := d.kg_remaining - t.kg_added;
  new_total_cost := GREATEST(old_total_cost - removed_cost, 0);
  UPDATE public.dandang_balance SET kg_remaining=new_kg, avg_cost_per_kg=CASE WHEN new_kg>0 THEN new_total_cost/new_kg ELSE 0 END, updated_at=now() WHERE honey_type=htype;
  UPDATE public.raw_material_lots SET jerigen_remaining = jerigen_remaining + t.jerigen_opened WHERE id = t.lot_id;
  DELETE FROM public.dandang_transfers WHERE id = _transfer_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.create_order(_channel sales_channel, _tier_id uuid, _items jsonb, _shipping_fee numeric, _customer_note text, _customer_name text DEFAULT NULL::text, _customer_phone text DEFAULT NULL::text, _tracking_number text DEFAULT NULL::text, _amount_received numeric DEFAULT NULL::numeric)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE new_order_id UUID; it JSONB; size_rec RECORD; qty INTEGER;
  unit_price NUMERIC; line_total NUMERIC; honey_kg NUMERIC;
  v_total_honey NUMERIC := 0; v_subtotal NUMERIC := 0; fee_pct NUMERIC; mp_fee NUMERIC;
  db RECORD; alloc JSONB; size_alloc JSONB;
  bw_item UUID; kd_item UUID; lk_item UUID; sg_item UUID;
  bw_qty NUMERIC := 0; kd_qty NUMERIC := 0; lk_qty NUMERIC := 0;
  v_cogs_line NUMERIC; v_cogs_total NUMERIC := 0; htype TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF jsonb_array_length(_items)=0 THEN RAISE EXCEPTION 'Item kosong'; END IF;
  SELECT value INTO alloc FROM public.app_settings WHERE key='packaging_allocation';
  SELECT id INTO bw_item FROM public.packaging_items WHERE type='bubblewrap' LIMIT 1;
  SELECT id INTO kd_item FROM public.packaging_items WHERE type='kardus' LIMIT 1;
  SELECT id INTO lk_item FROM public.packaging_items WHERE type='lakban' LIMIT 1;
  SELECT id INTO sg_item FROM public.packaging_items WHERE type='segel' LIMIT 1;

  INSERT INTO public.orders(channel,reseller_tier_id,customer_note,shipping_fee,created_by, customer_name, customer_phone, tracking_number, amount_received)
   VALUES (_channel,_tier_id,_customer_note,COALESCE(_shipping_fee,0),auth.uid(), _customer_name, _customer_phone, _tracking_number, _amount_received)
   RETURNING id INTO new_order_id;

  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    qty := (it->>'qty')::INTEGER;
    unit_price := (it->>'unit_price')::NUMERIC;
    htype := COALESCE(NULLIF(it->>'honey_type',''), 'Lainnya');
    SELECT * INTO size_rec FROM public.product_sizes WHERE id=(it->>'size_id')::UUID;
    IF NOT FOUND THEN RAISE EXCEPTION 'Ukuran tidak ditemukan'; END IF;
    honey_kg := (size_rec.weight_grams * qty)::NUMERIC / 1000;
    v_total_honey := v_total_honey + honey_kg;
    line_total := unit_price * qty;
    v_subtotal := v_subtotal + line_total;

    SELECT * INTO db FROM public.dandang_balance WHERE honey_type=htype FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Saldo dandang untuk % belum ada', htype; END IF;
    IF honey_kg > db.kg_remaining THEN RAISE EXCEPTION 'Stok madu % di dandang tidak cukup (sisa % kg, butuh % kg)', htype, db.kg_remaining, honey_kg; END IF;
    UPDATE public.dandang_balance SET kg_remaining = kg_remaining - honey_kg, updated_at=now() WHERE honey_type=htype;

    v_cogs_line := honey_kg * db.avg_cost_per_kg
      + qty * COALESCE((SELECT avg_cost FROM public.packaging_items WHERE type='botol' AND size_id=size_rec.id),0)
      + qty * COALESCE((SELECT avg_cost FROM public.packaging_items WHERE type='stiker' AND size_id=size_rec.id),0)
      + qty * COALESCE((SELECT avg_cost FROM public.packaging_items WHERE id=sg_item),0);
    v_cogs_total := v_cogs_total + v_cogs_line;

    UPDATE public.packaging_items SET current_stock = current_stock - qty WHERE type='botol' AND size_id=size_rec.id;
    UPDATE public.packaging_items SET current_stock = current_stock - qty WHERE type='stiker' AND size_id=size_rec.id;
    UPDATE public.packaging_items SET current_stock = current_stock - qty WHERE id=sg_item;
    size_alloc := alloc->size_rec.name;
    IF size_alloc IS NOT NULL THEN
      bw_qty := bw_qty + qty * COALESCE((size_alloc->>'bubblewrap_m')::NUMERIC,0);
      kd_qty := kd_qty + qty * COALESCE((size_alloc->>'kardus_pcs')::NUMERIC,0);
      lk_qty := lk_qty + qty * COALESCE((size_alloc->>'lakban_roll')::NUMERIC,0);
    END IF;
    INSERT INTO public.order_items(order_id,size_id,qty,unit_price,line_total,honey_kg_used,cogs_line,honey_type)
     VALUES (new_order_id,size_rec.id,qty,unit_price,line_total,honey_kg,v_cogs_line,htype);
  END LOOP;

  IF bw_item IS NOT NULL AND bw_qty>0 THEN UPDATE public.packaging_items SET current_stock = current_stock - bw_qty WHERE id=bw_item; END IF;
  IF kd_item IS NOT NULL AND kd_qty>0 THEN UPDATE public.packaging_items SET current_stock = current_stock - kd_qty WHERE id=kd_item; END IF;
  IF lk_item IS NOT NULL AND lk_qty>0 THEN UPDATE public.packaging_items SET current_stock = current_stock - lk_qty WHERE id=lk_item; END IF;

  SELECT fee_percent INTO fee_pct FROM public.marketplace_fees WHERE channel=_channel;
  mp_fee := ROUND(v_subtotal * COALESCE(fee_pct,0) / 100, 2);

  UPDATE public.orders SET subtotal_gross = v_subtotal, marketplace_fee = mp_fee,
    net_revenue = COALESCE(_amount_received, v_subtotal - mp_fee) - COALESCE(_shipping_fee,0),
    cogs_total = v_cogs_total, honey_kg_used = v_total_honey
   WHERE id = new_order_id;

  RETURN new_order_id;
END; $function$;

-- Add honey_type column to packaging_items
ALTER TABLE public.packaging_items ADD COLUMN honey_type TEXT;

-- Drop old unique constraint
ALTER TABLE public.packaging_items DROP CONSTRAINT IF EXISTS packaging_items_type_size_id_key;

-- Add new unique constraint (using NULLS NOT DISTINCT so nulls are matched as duplicates)
ALTER TABLE public.packaging_items ADD CONSTRAINT packaging_items_type_size_id_honey_type_key UNIQUE NULLS NOT DISTINCT (type, size_id, honey_type);

-- Update create_order function to be variant-aware for packaging stock and COGS
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
      + qty * COALESCE((SELECT avg_cost FROM public.packaging_items WHERE type='botol' AND size_id=size_rec.id AND (honey_type = htype OR honey_type IS NULL) ORDER BY honey_type NULLS LAST LIMIT 1),0)
      + qty * COALESCE((SELECT avg_cost FROM public.packaging_items WHERE type='stiker' AND size_id=size_rec.id AND (honey_type = htype OR honey_type IS NULL) ORDER BY honey_type NULLS LAST LIMIT 1),0)
      + qty * COALESCE((SELECT avg_cost FROM public.packaging_items WHERE id=sg_item),0);
    v_cogs_total := v_cogs_total + v_cogs_line;

    UPDATE public.packaging_items SET current_stock = current_stock - qty 
    WHERE id = (
      SELECT id FROM public.packaging_items 
      WHERE type='botol' AND size_id=size_rec.id AND (honey_type = htype OR honey_type IS NULL) 
      ORDER BY honey_type NULLS LAST LIMIT 1
    );
    
    UPDATE public.packaging_items SET current_stock = current_stock - qty 
    WHERE id = (
      SELECT id FROM public.packaging_items 
      WHERE type='stiker' AND size_id=size_rec.id AND (honey_type = htype OR honey_type IS NULL) 
      ORDER BY honey_type NULLS LAST LIMIT 1
    );
    
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

-- Update import_historical_order function to be variant-aware for packaging and honey type
CREATE OR REPLACE FUNCTION public.import_historical_order(
  _channel public.sales_channel,
  _tier_id UUID,
  _items JSONB,
  _shipping_fee NUMERIC,
  _customer_note TEXT,
  _customer_name TEXT,
  _customer_phone TEXT,
  _tracking_number TEXT,
  _amount_received NUMERIC,
  _created_at TIMESTAMPTZ,
  _expedition TEXT,
  _payment_method TEXT,
  _transfer_bank TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_order_id UUID; it JSONB; size_rec RECORD; qty INTEGER;
  unit_price NUMERIC; line_total NUMERIC; honey_kg NUMERIC;
  total_honey NUMERIC := 0; subtotal NUMERIC := 0; fee_pct NUMERIC; mp_fee NUMERIC;
  alloc JSONB; size_alloc JSONB;
  cogs_line NUMERIC; cogs_total NUMERIC := 0;
  sg_item UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF jsonb_array_length(_items)=0 THEN RAISE EXCEPTION 'Item kosong'; END IF;
  
  -- Load average packaging costs for HPP calculation
  SELECT value INTO alloc FROM public.app_settings WHERE key='packaging_allocation';
  SELECT id INTO sg_item FROM public.packaging_items WHERE type='segel' LIMIT 1;

  -- Create order with custom created_at date
  INSERT INTO public.orders(
    channel, reseller_tier_id, customer_note, shipping_fee, created_by,
    customer_name, customer_phone, tracking_number, amount_received, created_at,
    expedition, payment_method, transfer_bank
  )
  VALUES (
    _channel, _tier_id, _customer_note, COALESCE(_shipping_fee, 0), auth.uid(),
    _customer_name, _customer_phone, _tracking_number, _amount_received, _created_at,
    _expedition, _payment_method, _transfer_bank
  )
  RETURNING id INTO new_order_id;

  -- Calculate COGS/HPP for each line item (NO stock deduction)
  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    qty := (it->>'qty')::INTEGER;
    unit_price := (it->>'unit_price')::NUMERIC;
    
    SELECT * INTO size_rec FROM public.product_sizes WHERE id=(it->>'size_id')::UUID;
    IF NOT FOUND THEN RAISE EXCEPTION 'Ukuran tidak ditemukan'; END IF;
    
    honey_kg := (size_rec.weight_grams * qty)::NUMERIC / 1000;
    total_honey := total_honey + honey_kg;
    line_total := unit_price * qty;
    subtotal := subtotal + line_total;
    
    -- Estimate COGS based on current packaging/honey costs (but DO NOT subtract stock)
    cogs_line := honey_kg * COALESCE((SELECT avg_cost_per_kg FROM public.dandang_balance WHERE honey_type = it->>'honey_type'), 0)
      + qty * COALESCE((SELECT avg_cost FROM public.packaging_items WHERE type='botol' AND size_id=size_rec.id AND (honey_type = it->>'honey_type' OR honey_type IS NULL) ORDER BY honey_type NULLS LAST LIMIT 1),0)
      + qty * COALESCE((SELECT avg_cost FROM public.packaging_items WHERE type='stiker' AND size_id=size_rec.id AND (honey_type = it->>'honey_type' OR honey_type IS NULL) ORDER BY honey_type NULLS LAST LIMIT 1),0)
      + qty * COALESCE((SELECT avg_cost FROM public.packaging_items WHERE id=sg_item),0);
    cogs_total := cogs_total + cogs_line;
    
    -- Insert order items with honey_type
    INSERT INTO public.order_items(order_id, size_id, qty, unit_price, line_total, honey_kg_used, cogs_line, honey_type)
    VALUES (new_order_id, size_rec.id, qty, unit_price, line_total, honey_kg, cogs_line, it->>'honey_type');
  END LOOP;

  -- Calculate marketplace/platform fee
  SELECT fee_percent INTO fee_pct FROM public.marketplace_fees WHERE channel=_channel;
  mp_fee := ROUND(subtotal * COALESCE(fee_pct,0) / 100, 2);

  -- Update order calculations
  UPDATE public.orders SET
    subtotal_gross = subtotal,
    marketplace_fee = mp_fee,
    net_revenue = COALESCE(_amount_received, subtotal) - mp_fee - COALESCE(_shipping_fee,0),
    cogs_total = cogs_total,
    honey_kg_used = total_honey
  WHERE id = new_order_id;

  RETURN new_order_id;
END;
$function$;

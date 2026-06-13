-- Drop overloaded create_order functions to prevent ambiguity and ensure we use the latest variant-aware 12-argument version
DROP FUNCTION IF EXISTS public.create_order(public.sales_channel, uuid, jsonb, numeric, text) CASCADE;
DROP FUNCTION IF EXISTS public.create_order(public.sales_channel, uuid, jsonb, numeric, text, text, text, text, numeric) CASCADE;
DROP FUNCTION IF EXISTS public.create_order(public.sales_channel, uuid, jsonb, numeric, text, text, text, text, numeric, text, text, text) CASCADE;

-- Recreate the correct 12-argument create_order function with variant-aware lookups and LIMIT 1
CREATE OR REPLACE FUNCTION public.create_order(
  _channel public.sales_channel,
  _tier_id uuid,
  _items jsonb,
  _shipping_fee numeric,
  _customer_note text,
  _customer_name text DEFAULT NULL::text,
  _customer_phone text DEFAULT NULL::text,
  _tracking_number text DEFAULT NULL::text,
  _amount_received numeric DEFAULT NULL::numeric,
  _expedition text DEFAULT NULL::text,
  _payment_method text DEFAULT NULL::text,
  _transfer_bank text DEFAULT NULL::text
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE 
  new_order_id UUID; 
  it JSONB; 
  size_rec RECORD; 
  qty INTEGER;
  unit_price NUMERIC; 
  line_total NUMERIC; 
  honey_kg NUMERIC;
  v_total_honey NUMERIC := 0; 
  v_subtotal NUMERIC := 0; 
  fee_pct NUMERIC; 
  mp_fee NUMERIC;
  db RECORD; 
  alloc JSONB; 
  size_alloc JSONB;
  bw_item UUID; 
  kd_item UUID; 
  lk_item UUID; 
  v_segel_item_id UUID;
  bw_qty NUMERIC := 0; 
  kd_qty NUMERIC := 0; 
  lk_qty NUMERIC := 0;
  v_cogs_line NUMERIC; 
  v_cogs_total NUMERIC := 0; 
  htype TEXT;
  v_bottle_size_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF jsonb_array_length(_items)=0 THEN RAISE EXCEPTION 'Item kosong'; END IF;
  SELECT value INTO alloc FROM public.app_settings WHERE key='packaging_allocation';
  SELECT id INTO bw_item FROM public.packaging_items WHERE type='bubblewrap' LIMIT 1;
  SELECT id INTO kd_item FROM public.packaging_items WHERE type='kardus' LIMIT 1;
  SELECT id INTO lk_item FROM public.packaging_items WHERE type='lakban' LIMIT 1;

  INSERT INTO public.orders(
    channel, reseller_tier_id, customer_note, shipping_fee, created_by, 
    customer_name, customer_phone, tracking_number, amount_received,
    expedition, payment_method, transfer_bank
  )
  VALUES (
    _channel, _tier_id, _customer_note, COALESCE(_shipping_fee,0), auth.uid(), 
    _customer_name, _customer_phone, _tracking_number, _amount_received,
    _expedition, _payment_method, _transfer_bank
  )
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

    -- Resolve bottle size: map 130 gr to 100 gr
    v_bottle_size_id := size_rec.id;
    IF size_rec.name = '130 gr' THEN
      SELECT id INTO v_bottle_size_id FROM public.product_sizes WHERE name = '100 gr';
    END IF;

    SELECT * INTO db FROM public.dandang_balance WHERE honey_type=htype FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Saldo dandang untuk % belum ada', htype; END IF;
    IF honey_kg > db.kg_remaining THEN RAISE EXCEPTION 'Stok madu % di dandang tidak cukup (sisa % kg, butuh % kg)', htype, db.kg_remaining, honey_kg; END IF;
    UPDATE public.dandang_balance SET kg_remaining = kg_remaining - honey_kg, updated_at=now() WHERE honey_type=htype;

    -- Resolve segel item ID for this specific honey type
    SELECT id INTO v_segel_item_id FROM public.packaging_items 
    WHERE type='segel' AND (honey_type = htype OR honey_type IS NULL) 
    ORDER BY honey_type NULLS LAST LIMIT 1;

    v_cogs_line := honey_kg * db.avg_cost_per_kg
      + qty * COALESCE((SELECT avg_cost FROM public.packaging_items WHERE type='botol' AND size_id=v_bottle_size_id AND (honey_type = htype OR honey_type IS NULL) ORDER BY honey_type NULLS LAST LIMIT 1),0)
      + qty * COALESCE((SELECT avg_cost FROM public.packaging_items WHERE type='stiker' AND size_id=size_rec.id AND (honey_type = htype OR honey_type IS NULL) ORDER BY honey_type NULLS LAST LIMIT 1),0);
      
    IF size_rec.weight_grams NOT IN (100, 130) THEN
      v_cogs_line := v_cogs_line + qty * COALESCE((SELECT avg_cost FROM public.packaging_items WHERE id=v_segel_item_id),0);
    END IF;
    
    v_cogs_total := v_cogs_total + v_cogs_line;

    UPDATE public.packaging_items SET current_stock = current_stock - qty 
    WHERE id = (
      SELECT id FROM public.packaging_items 
      WHERE type='botol' AND size_id=v_bottle_size_id AND (honey_type = htype OR honey_type IS NULL) 
      ORDER BY honey_type NULLS LAST LIMIT 1
    );
    
    UPDATE public.packaging_items SET current_stock = current_stock - qty 
    WHERE id = (
      SELECT id FROM public.packaging_items 
      WHERE type='stiker' AND size_id=size_rec.id AND (honey_type = htype OR honey_type IS NULL) 
      ORDER BY honey_type NULLS LAST LIMIT 1
    );
    
    IF size_rec.weight_grams NOT IN (100, 130) AND v_segel_item_id IS NOT NULL THEN
      UPDATE public.packaging_items SET current_stock = current_stock - qty WHERE id=v_segel_item_id;
    END IF;
    
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
END;
$function$;

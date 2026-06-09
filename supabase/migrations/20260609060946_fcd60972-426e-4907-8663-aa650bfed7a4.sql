
CREATE OR REPLACE FUNCTION public.create_order(_channel sales_channel, _tier_id uuid, _items jsonb, _shipping_fee numeric, _customer_note text, _customer_name text DEFAULT NULL::text, _customer_phone text DEFAULT NULL::text, _tracking_number text DEFAULT NULL::text, _amount_received numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  INSERT INTO public.orders(channel,reseller_tier_id,customer_note,shipping_fee,created_by,
    customer_name, customer_phone, tracking_number, amount_received)
   VALUES (_channel,_tier_id,_customer_note,COALESCE(_shipping_fee,0),auth.uid(),
    _customer_name, _customer_phone, _tracking_number, _amount_received)
   RETURNING id INTO new_order_id;

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
    net_revenue = COALESCE(_amount_received, subtotal - mp_fee) - COALESCE(_shipping_fee,0),
    cogs_total = cogs_total,
    honey_kg_used = total_honey
   WHERE id = new_order_id;

  RETURN new_order_id;
END; $function$;

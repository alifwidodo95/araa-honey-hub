-- Update create_order function to resolve segel per item based on honey_type
CREATE OR REPLACE FUNCTION public.create_order(_channel sales_channel, _tier_id uuid, _items jsonb, _shipping_fee numeric, _customer_note text, _customer_name text DEFAULT NULL::text, _customer_phone text DEFAULT NULL::text, _tracking_number text DEFAULT NULL::text, _amount_received numeric DEFAULT NULL::numeric)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE new_order_id UUID; it JSONB; size_rec RECORD; qty INTEGER;
  unit_price NUMERIC; line_total NUMERIC; honey_kg NUMERIC;
  v_total_honey NUMERIC := 0; v_subtotal NUMERIC := 0; fee_pct NUMERIC; mp_fee NUMERIC;
  db RECORD; alloc JSONB; size_alloc JSONB;
  bw_item UUID; kd_item UUID; lk_item UUID;
  v_segel_item_id UUID;
  bw_qty NUMERIC := 0; kd_qty NUMERIC := 0; lk_qty NUMERIC := 0;
  v_cogs_line NUMERIC; v_cogs_total NUMERIC := 0; htype TEXT;
  v_bottle_size_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF jsonb_array_length(_items)=0 THEN RAISE EXCEPTION 'Item kosong'; END IF;
  SELECT value INTO alloc FROM public.app_settings WHERE key='packaging_allocation';
  SELECT id INTO bw_item FROM public.packaging_items WHERE type='bubblewrap' LIMIT 1;
  SELECT id INTO kd_item FROM public.packaging_items WHERE type='kardus' LIMIT 1;
  SELECT id INTO lk_item FROM public.packaging_items WHERE type='lakban' LIMIT 1;

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
      + qty * COALESCE((SELECT avg_cost FROM public.packaging_items WHERE type='stiker' AND size_id=size_rec.id AND (honey_type = htype OR honey_type IS NULL) ORDER BY honey_type NULLS LAST LIMIT 1),0)
      + qty * COALESCE((SELECT avg_cost FROM public.packaging_items WHERE id=v_segel_item_id),0);
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
    
    IF v_segel_item_id IS NOT NULL THEN
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
END; $function$;

-- Update import_historical_order function to resolve segel per item based on honey_type
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
  v_total_honey NUMERIC := 0; v_subtotal NUMERIC := 0; fee_pct NUMERIC; mp_fee NUMERIC;
  alloc JSONB; size_alloc JSONB;
  v_cogs_line NUMERIC; v_cogs_total NUMERIC := 0;
  v_segel_item_id UUID;
  v_bottle_size_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF jsonb_array_length(_items)=0 THEN RAISE EXCEPTION 'Item kosong'; END IF;
  
  -- Load average packaging costs for HPP calculation
  SELECT value INTO alloc FROM public.app_settings WHERE key='packaging_allocation';

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
    v_total_honey := v_total_honey + honey_kg;
    line_total := unit_price * qty;
    v_subtotal := v_subtotal + line_total;
    
    -- Resolve bottle size: map 130 gr to 100 gr
    v_bottle_size_id := size_rec.id;
    IF size_rec.name = '130 gr' THEN
      SELECT id INTO v_bottle_size_id FROM public.product_sizes WHERE name = '100 gr';
    END IF;

    -- Resolve segel item ID for this honey type
    SELECT id INTO v_segel_item_id FROM public.packaging_items 
    WHERE type='segel' AND (honey_type = it->>'honey_type' OR honey_type IS NULL) 
    ORDER BY honey_type NULLS LAST LIMIT 1;

    -- Estimate COGS based on current packaging/honey costs (but DO NOT subtract stock)
    v_cogs_line := honey_kg * COALESCE((SELECT avg_cost_per_kg FROM public.dandang_balance WHERE honey_type = it->>'honey_type'), 0)
      + qty * COALESCE((SELECT avg_cost FROM public.packaging_items WHERE type='botol' AND size_id=v_bottle_size_id AND (honey_type = it->>'honey_type' OR honey_type IS NULL) ORDER BY honey_type NULLS LAST LIMIT 1),0)
      + qty * COALESCE((SELECT avg_cost FROM public.packaging_items WHERE type='stiker' AND size_id=size_rec.id AND (honey_type = it->>'honey_type' OR honey_type IS NULL) ORDER BY honey_type NULLS LAST LIMIT 1),0)
      + qty * COALESCE((SELECT avg_cost FROM public.packaging_items WHERE id=v_segel_item_id),0);
    v_cogs_total := v_cogs_total + v_cogs_line;
    
    -- Insert order items with honey_type
    INSERT INTO public.order_items(order_id, size_id, qty, unit_price, line_total, honey_kg_used, cogs_line, honey_type)
    VALUES (new_order_id, size_rec.id, qty, unit_price, line_total, honey_kg, v_cogs_line, it->>'honey_type');
  END LOOP;

  -- Calculate marketplace/platform fee
  SELECT fee_percent INTO fee_pct FROM public.marketplace_fees WHERE channel=_channel;
  mp_fee := ROUND(v_subtotal * COALESCE(fee_pct,0) / 100, 2);

  -- Update order calculations
  UPDATE public.orders SET
    subtotal_gross = v_subtotal,
    marketplace_fee = mp_fee,
    net_revenue = COALESCE(_amount_received, v_subtotal - mp_fee) - COALESCE(_shipping_fee, 0),
    cogs_total = v_cogs_total,
    honey_kg_used = v_total_honey
  WHERE id = new_order_id;

  RETURN new_order_id;
END;
$function$;

-- Update process_order_return function to resolve segel per item and restore variant-specific stocks correctly
CREATE OR REPLACE FUNCTION public.process_order_return(_order_id uuid, _return_shipping_fee numeric, _notes text, _items_condition jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  item RECORD;
  size_rec RECORD;
  alloc JSONB;
  size_alloc JSONB;
  bw_item UUID;
  kd_item UUID;
  lk_item UUID;
  v_segel_item_id UUID;
  bw_qty NUMERIC := 0;
  kd_qty NUMERIC := 0;
  lk_qty NUMERIC := 0;
  v_pkg_loss NUMERIC := 0;
  item_cond TEXT;
  cond_el JSONB;
  tracking_num TEXT;
  created_by_user UUID;
  new_expense_id UUID := NULL;
  v_bottle_size_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  -- Verify order exists
  SELECT tracking_number, created_by INTO tracking_num, created_by_user 
  FROM public.orders 
  WHERE id = _order_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pesanan tidak ditemukan';
  END IF;

  -- Get app allocations and packaging item IDs
  SELECT value INTO alloc FROM public.app_settings WHERE key='packaging_allocation';
  SELECT id INTO bw_item FROM public.packaging_items WHERE type='bubblewrap' LIMIT 1;
  SELECT id INTO kd_item FROM public.packaging_items WHERE type='kardus' LIMIT 1;
  SELECT id INTO lk_item FROM public.packaging_items WHERE type='lakban' LIMIT 1;

  -- Mark order as returned
  UPDATE public.orders SET returned = true WHERE id = _order_id;

  -- Loop through order items and restore honey to dandang
  FOR item IN SELECT * FROM public.order_items WHERE order_id = _order_id LOOP
    SELECT * INTO size_rec FROM public.product_sizes WHERE id = item.size_id;
    
    -- Honey is ALWAYS returned to dandang in both cases
    UPDATE public.dandang_balance 
       SET kg_remaining = kg_remaining + item.honey_kg_used, 
           updated_at = now() 
     WHERE honey_type = COALESCE(item.honey_type, 'Lainnya');

    -- Resolve bottle size: map 130 gr to 100 gr
    v_bottle_size_id := size_rec.id;
    IF size_rec.name = '130 gr' THEN
      SELECT id INTO v_bottle_size_id FROM public.product_sizes WHERE name = '100 gr';
    END IF;

    -- Find user input condition for this size_id and honey_type
    item_cond := 'aman'; -- default
    FOR cond_el IN SELECT * FROM jsonb_array_elements(_items_condition) LOOP
      IF (cond_el->>'size_id')::UUID = item.size_id AND COALESCE(cond_el->>'honey_type', 'Lainnya') = COALESCE(item.honey_type, 'Lainnya') THEN
        item_cond := cond_el->>'condition';
      END IF;
    END LOOP;

    -- Find the segel item for this honey_type
    SELECT id INTO v_segel_item_id FROM public.packaging_items 
    WHERE type='segel' AND (honey_type = item.honey_type OR honey_type IS NULL) 
    ORDER BY honey_type NULLS LAST LIMIT 1;

    -- If condition is 'aman', return bottle, sticker, segel to stock
    IF item_cond = 'aman' THEN
      UPDATE public.packaging_items SET current_stock = current_stock + item.qty 
      WHERE id = (
        SELECT id FROM public.packaging_items 
        WHERE type='botol' AND size_id = v_bottle_size_id AND (honey_type = item.honey_type OR honey_type IS NULL)
        ORDER BY honey_type NULLS LAST LIMIT 1
      );
      
      UPDATE public.packaging_items SET current_stock = current_stock + item.qty 
      WHERE id = (
        SELECT id FROM public.packaging_items 
        WHERE type='stiker' AND size_id = item.size_id AND (honey_type = item.honey_type OR honey_type IS NULL)
        ORDER BY honey_type NULLS LAST LIMIT 1
      );
      
      IF v_segel_item_id IS NOT NULL AND size_rec.weight_grams NOT IN (100, 130) THEN
        UPDATE public.packaging_items SET current_stock = current_stock + item.qty WHERE id = v_segel_item_id;
      END IF;
    ELSE
      -- If condition is 'rusak', record cost as packaging loss
      v_pkg_loss := v_pkg_loss 
        + item.qty * COALESCE((SELECT avg_cost FROM public.packaging_items WHERE type='botol' AND size_id = v_bottle_size_id AND (honey_type = item.honey_type OR honey_type IS NULL) ORDER BY honey_type NULLS LAST LIMIT 1), 0)
        + item.qty * COALESCE((SELECT avg_cost FROM public.packaging_items WHERE type='stiker' AND size_id = item.size_id AND (honey_type = item.honey_type OR honey_type IS NULL) ORDER BY honey_type NULLS LAST LIMIT 1), 0);
      
      IF v_segel_item_id IS NOT NULL AND size_rec.weight_grams NOT IN (100, 130) THEN
        v_pkg_loss := v_pkg_loss + item.qty * COALESCE((SELECT avg_cost FROM public.packaging_items WHERE id = v_segel_item_id), 0);
      END IF;
    END IF;

    -- Outer packaging (bubble, kardus, lakban) is ALWAYS ruined (never returned)
    -- Calculate outer packaging quantities to count as loss
    IF size_rec.name IS NOT NULL AND alloc IS NOT NULL THEN
      size_alloc := alloc->size_rec.name;
      IF size_alloc IS NOT NULL THEN
        bw_qty := bw_qty + item.qty * COALESCE((size_alloc->>'bubblewrap_m')::NUMERIC,0);
        kd_qty := kd_qty + item.qty * COALESCE((size_alloc->>'kardus_pcs')::NUMERIC,0);
        lk_qty := lk_qty + item.qty * COALESCE((size_alloc->>'lakban_roll')::NUMERIC,0);
      END IF;
    END IF;
  END LOOP;

  -- Calculate cost of ruined outer packaging
  IF bw_item IS NOT NULL AND bw_qty > 0 THEN
    v_pkg_loss := v_pkg_loss + bw_qty * COALESCE((SELECT avg_cost FROM public.packaging_items WHERE id = bw_item), 0);
  END IF;
  IF kd_item IS NOT NULL AND kd_qty > 0 THEN
    v_pkg_loss := v_pkg_loss + kd_qty * COALESCE((SELECT avg_cost FROM public.packaging_items WHERE id = kd_item), 0);
  END IF;
  IF lk_item IS NOT NULL AND lk_qty > 0 THEN
    v_pkg_loss := v_pkg_loss + lk_qty * COALESCE((SELECT avg_cost FROM public.packaging_items WHERE id = lk_item), 0);
  END IF;

  -- Log business expense if there is a financial loss
  IF _return_shipping_fee > 0 OR v_pkg_loss > 0 THEN
    INSERT INTO public.expenses_business (category, amount, note, occurred_on, created_by)
    VALUES (
      'other', 
      COALESCE(_return_shipping_fee, 0) + v_pkg_loss,
      '[Retur] Resi: ' || COALESCE(tracking_num, '—') || 
      ' (Kerugian Kemasan: Rp ' || to_char(v_pkg_loss, 'FM999,999,999') || 
      ', Ongkir Retur: Rp ' || to_char(COALESCE(_return_shipping_fee, 0), 'FM999,999,999') || 
      '). Catatan: ' || COALESCE(_notes, '—'),
      CURRENT_DATE,
      created_by_user
    ) RETURNING id INTO new_expense_id;
  END IF;

  -- Log return record in order_returns
  INSERT INTO public.order_returns (order_id, tracking_number, return_shipping_fee, packaging_loss, total_loss, items_condition, notes, expense_id)
  VALUES (
    _order_id, 
    tracking_num, 
    COALESCE(_return_shipping_fee, 0), 
    v_pkg_loss, 
    COALESCE(_return_shipping_fee, 0) + v_pkg_loss, 
    _items_condition, 
    _notes,
    new_expense_id
  );

END;
$function$;

-- Update delete_order_return function to resolve segel per item and reduce variant-specific stocks correctly
CREATE OR REPLACE FUNCTION public.delete_order_return(_return_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  return_rec RECORD;
  item RECORD;
  size_rec RECORD;
  v_segel_item_id UUID;
  item_cond TEXT;
  cond_el JSONB;
  v_bottle_size_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  -- 1. Fetch return record
  SELECT * INTO return_rec FROM public.order_returns WHERE id = _return_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Catatan retur tidak ditemukan';
  END IF;

  -- 2. Loop through order items and REVERT stock additions
  FOR item IN SELECT * FROM public.order_items WHERE order_id = return_rec.order_id LOOP
    SELECT * INTO size_rec FROM public.product_sizes WHERE id = item.size_id;
    
    -- Honey stock was added back, so now we SUBTRACT it back
    UPDATE public.dandang_balance 
       SET kg_remaining = kg_remaining - item.honey_kg_used, 
           updated_at = now() 
     WHERE honey_type = COALESCE(item.honey_type, 'Lainnya');

    -- Resolve bottle size: map 130 gr to 100 gr
    v_bottle_size_id := size_rec.id;
    IF size_rec.name = '130 gr' THEN
      SELECT id INTO v_bottle_size_id FROM public.product_sizes WHERE name = '100 gr';
    END IF;

    -- Find original return condition for this item
    item_cond := 'aman'; -- default fallback
    IF return_rec.items_condition IS NOT NULL THEN
      FOR cond_el IN SELECT * FROM jsonb_array_elements(return_rec.items_condition) LOOP
        IF (cond_el->>'size_id')::UUID = item.size_id AND COALESCE(cond_el->>'honey_type', 'Lainnya') = COALESCE(item.honey_type, 'Lainnya') THEN
          item_cond := cond_el->>'condition';
        END IF;
      END LOOP;
    END IF;

    -- Find the segel item for this honey_type
    SELECT id INTO v_segel_item_id FROM public.packaging_items 
    WHERE type='segel' AND (honey_type = item.honey_type OR honey_type IS NULL) 
    ORDER BY honey_type NULLS LAST LIMIT 1;

    -- If condition was 'aman' (meaning packaging was returned to stock), we now SUBTRACT it back
    IF item_cond = 'aman' THEN
      UPDATE public.packaging_items SET current_stock = current_stock - item.qty 
      WHERE id = (
        SELECT id FROM public.packaging_items 
        WHERE type='botol' AND size_id = v_bottle_size_id AND (honey_type = item.honey_type OR honey_type IS NULL)
        ORDER BY honey_type NULLS LAST LIMIT 1
      );
      
      UPDATE public.packaging_items SET current_stock = current_stock - item.qty 
      WHERE id = (
        SELECT id FROM public.packaging_items 
        WHERE type='stiker' AND size_id = item.size_id AND (honey_type = item.honey_type OR honey_type IS NULL)
        ORDER BY honey_type NULLS LAST LIMIT 1
      );
      
      IF v_segel_item_id IS NOT NULL AND size_rec.weight_grams NOT IN (100, 130) THEN
        UPDATE public.packaging_items SET current_stock = current_stock - item.qty WHERE id = v_segel_item_id;
      END IF;
    END IF;
  END LOOP;

  -- 3. Revert order status back to active (returned = false)
  UPDATE public.orders SET returned = false WHERE id = return_rec.order_id;

  -- 4. Delete the logged business expense if any
  IF return_rec.expense_id IS NOT NULL THEN
    DELETE FROM public.expenses_business WHERE id = return_rec.expense_id;
  END IF;

  -- 5. Delete the return record
  DELETE FROM public.order_returns WHERE id = _return_id;

END;
$function$;

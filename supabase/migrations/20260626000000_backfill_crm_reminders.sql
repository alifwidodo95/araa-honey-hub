-- Create or replace function to backfill crm reminders for historical orders
CREATE OR REPLACE FUNCTION public.backfill_crm_reminders(p_start_date DATE DEFAULT '2026-01-01')
RETURNS TABLE (inserted_count INT, cancelled_count INT) AS $$
DECLARE
  v_crm_config JSONB;
  v_enabled BOOLEAN := FALSE;
  v_delay_days INT := 45;
  v_order RECORD;
  v_honey_types TEXT;
  v_ins_count INT := 0;
  v_can_count INT := 0;
  v_temp_can INT := 0;
BEGIN
  -- 1. Read configuration
  SELECT value INTO v_crm_config FROM public.app_settings WHERE key = 'crm_config';
  IF v_crm_config IS NOT NULL THEN
    v_enabled := COALESCE((v_crm_config->>'enabled')::BOOLEAN, FALSE);
    v_delay_days := COALESCE((v_crm_config->>'delayDays')::INT, 45);
  END IF;

  IF NOT v_enabled THEN
    RAISE EXCEPTION 'CRM Auto-Reminder is currently disabled in settings.';
  END IF;

  -- 2. Identify the LATEST order for each unique phone number since p_start_date
  -- that is from channel='whatsapp', returned=FALSE, subtotal_gross is not null
  -- and whose phone number is valid
  FOR v_order IN 
    WITH latest_orders AS (
      SELECT DISTINCT ON (customer_phone) 
        id,
        customer_name,
        customer_phone,
        created_at
      FROM public.orders
      WHERE created_at >= p_start_date::timestamptz
        AND channel = 'whatsapp'
        AND returned = FALSE
        AND customer_phone IS NOT NULL 
        AND customer_phone <> ''
        AND subtotal_gross IS NOT NULL
      ORDER BY customer_phone, created_at DESC
    )
    SELECT * FROM latest_orders
  LOOP
    -- A. Check if this order already has a reminder
    IF EXISTS (
      SELECT 1 FROM public.crm_reminders WHERE order_id = v_order.id
    ) THEN
      CONTINUE; -- Skip if already exists
    END IF;

    -- B. Fetch honey types for this order
    SELECT string_agg(DISTINCT COALESCE(honey_type, 'Lainnya'), ', ') INTO v_honey_types
    FROM public.order_items
    WHERE order_id = v_order.id;

    -- C. Cancel any older pending reminders for this phone number
    UPDATE public.crm_reminders
    SET status = 'cancelled', updated_at = now()
    WHERE customer_phone = v_order.customer_phone 
      AND status = 'pending'
      AND order_id <> v_order.id;
      
    GET DIAGNOSTICS v_temp_can = ROW_COUNT;
    v_can_count := v_can_count + v_temp_can;

    -- D. Insert the new pending reminder
    INSERT INTO public.crm_reminders (
      order_id,
      customer_name,
      customer_phone,
      honey_type,
      scheduled_for,
      status,
      created_at,
      updated_at
    ) VALUES (
      v_order.id,
      v_order.customer_name,
      v_order.customer_phone,
      COALESCE(v_honey_types, 'Madu Araa'),
      (v_order.created_at::date + v_delay_days),
      'pending',
      now(),
      now()
    );
    
    v_ins_count := v_ins_count + 1;
  END LOOP;

  inserted_count := v_ins_count;
  cancelled_count := v_can_count;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

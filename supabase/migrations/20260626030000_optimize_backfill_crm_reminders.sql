-- Optimize backfill_crm_reminders function to use set-based SQL operations (no loops) to prevent statement timeout
CREATE OR REPLACE FUNCTION public.backfill_crm_reminders(p_start_date DATE DEFAULT NULL)
RETURNS TABLE (inserted_count INT, cancelled_count INT) AS $$
DECLARE
  v_crm_config JSONB;
  v_enabled BOOLEAN := FALSE;
  v_delay_days INT := 45;
  v_ins_count INT := 0;
  v_can_count INT := 0;
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

  -- 2. Auto-detect the earliest order date in the database if p_start_date is NULL
  IF p_start_date IS NULL THEN
    SELECT COALESCE(MIN(created_at)::date, '2026-01-01'::date) INTO p_start_date FROM public.orders;
  END IF;

  -- 3. Drop temp table if exists (safety)
  DROP TABLE IF EXISTS temp_eligible_orders;

  -- 4. Create a temporary table of eligible latest orders that do not have a reminder yet
  CREATE TEMP TABLE temp_eligible_orders AS
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
  SELECT lo.id, lo.customer_name, lo.customer_phone, lo.created_at
  FROM latest_orders lo
  LEFT JOIN public.crm_reminders cr ON cr.order_id = lo.id
  WHERE cr.id IS NULL;

  -- 5. Cancel any older pending reminders for these phone numbers
  UPDATE public.crm_reminders cr
  SET status = 'cancelled', updated_at = now()
  FROM temp_eligible_orders teo
  WHERE cr.customer_phone = teo.customer_phone
    AND cr.status = 'pending'
    AND cr.order_id <> teo.id;
    
  GET DIAGNOSTICS v_can_count = ROW_COUNT;

  -- 6. Insert new pending reminders
  WITH order_honeys AS (
    SELECT order_id, string_agg(DISTINCT COALESCE(honey_type, 'Lainnya'), ', ') AS honey_types
    FROM public.order_items
    WHERE order_id IN (SELECT id FROM temp_eligible_orders)
    GROUP BY order_id
  )
  INSERT INTO public.crm_reminders (
    order_id,
    customer_name,
    customer_phone,
    honey_type,
    scheduled_for,
    status,
    created_at,
    updated_at
  )
  SELECT 
    teo.id,
    teo.customer_name,
    teo.customer_phone,
    COALESCE(oh.honey_types, 'Madu Araa'),
    (teo.created_at::date + v_delay_days),
    'pending',
    now(),
    now()
  FROM temp_eligible_orders teo
  LEFT JOIN order_honeys oh ON oh.order_id = teo.id;

  GET DIAGNOSTICS v_ins_count = ROW_COUNT;

  -- Cleanup
  DROP TABLE IF EXISTS temp_eligible_orders;

  inserted_count := v_ins_count;
  cancelled_count := v_can_count;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

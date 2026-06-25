-- 1. Create table crm_reminders
CREATE TABLE IF NOT EXISTS public.crm_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    honey_type TEXT NOT NULL,
    scheduled_for DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, sent, failed, cancelled
    sent_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Insert default crm_config if not exists
INSERT INTO public.app_settings (key, value)
VALUES (
  'crm_config',
  '{
    "enabled": true,
    "delayDays": 45,
    "template": "Halo Kak {customer_name},\n\nSemoga sehat selalu ya Kak. 🍯😊\n\nSekadar mengingatkan, Kakak terakhir kali memesan {honey_type} pada sekitar 45 hari yang lalu.\n\nJika persediaan madu Araa Honey di rumah sudah mulai menipis, Kakak bisa langsung membalas chat ini untuk memesan kembali ya. Terima kasih banyak Kak!"
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- 3. Create or replace function for trigger
CREATE OR REPLACE FUNCTION public.sync_crm_reminder_on_order_change()
RETURNS TRIGGER AS $$
DECLARE
  v_crm_config JSONB;
  v_enabled BOOLEAN := FALSE;
  v_delay_days INT := 45;
  v_honey_types TEXT;
  v_should_process BOOLEAN := FALSE;
  v_old_phone TEXT := NULL;
  v_old_returned BOOLEAN := FALSE;
  v_old_gross NUMERIC := NULL;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_old_phone := OLD.customer_phone;
    v_old_returned := OLD.returned;
    v_old_gross := OLD.subtotal_gross;
  END IF;

  -- Check if we should process CRM scheduling
  IF NEW.channel = 'whatsapp' AND NEW.returned = FALSE AND NEW.customer_phone IS NOT NULL AND NEW.customer_phone <> '' AND NEW.subtotal_gross IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      v_should_process := TRUE;
    ELSIF TG_OP = 'UPDATE' THEN
      -- Process if subtotal_gross just got populated, or if phone/returned/etc changed
      IF v_old_gross IS NULL OR v_old_phone IS DISTINCT FROM NEW.customer_phone OR v_old_returned IS DISTINCT FROM NEW.returned THEN
        v_should_process := TRUE;
      END IF;
    END IF;
  END IF;

  IF v_should_process = TRUE THEN
    -- Read crm_config
    SELECT value INTO v_crm_config FROM public.app_settings WHERE key = 'crm_config';
    IF v_crm_config IS NOT NULL THEN
      v_enabled := COALESCE((v_crm_config->>'enabled')::BOOLEAN, FALSE);
      v_delay_days := COALESCE((v_crm_config->>'delayDays')::INT, 45);
    END IF;
    
    IF v_enabled = TRUE THEN
      -- Get list of unique honey types from the order items
      SELECT string_agg(DISTINCT COALESCE(honey_type, 'Lainnya'), ', ') INTO v_honey_types
      FROM public.order_items
      WHERE order_id = NEW.id;
      
      -- Delete any existing pending reminder for this specific order
      DELETE FROM public.crm_reminders 
      WHERE order_id = NEW.id AND status = 'pending';
      
      -- Cancel other pending reminders for this phone number from previous orders
      UPDATE public.crm_reminders
      SET status = 'cancelled', updated_at = now()
      WHERE customer_phone = NEW.customer_phone AND order_id <> NEW.id AND status = 'pending';
      
      -- Insert new pending reminder
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
        NEW.id,
        NEW.customer_name,
        NEW.customer_phone,
        COALESCE(v_honey_types, 'Madu Araa'),
        (NEW.created_at::date + v_delay_days),
        'pending',
        now(),
        now()
      );
    END IF;
  
  -- If order status is changed to returned, cancel the pending reminder
  ELSIF TG_OP = 'UPDATE' AND NEW.returned = TRUE AND v_old_returned = FALSE THEN
    UPDATE public.crm_reminders
    SET status = 'cancelled', updated_at = now()
    WHERE order_id = NEW.id AND status = 'pending';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Create trigger
DROP TRIGGER IF EXISTS trigger_crm_reminder_on_order_change ON public.orders;
CREATE TRIGGER trigger_crm_reminder_on_order_change
AFTER INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_crm_reminder_on_order_change();

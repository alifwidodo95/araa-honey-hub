
ALTER TABLE public.raw_material_lots
  ADD COLUMN IF NOT EXISTS honey_type TEXT,
  ADD COLUMN IF NOT EXISTS grams_per_jerigen NUMERIC;

UPDATE public.raw_material_lots
  SET grams_per_jerigen = COALESCE(grams_per_jerigen, kg_per_jerigen * 1000);

CREATE OR REPLACE FUNCTION public.open_jerigen(_lot_id uuid, _jerigen integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  lot RECORD; kg_added NUMERIC; cost_per_kg NUMERIC; db RECORD;
  new_total NUMERIC; new_avg NUMERIC; kg_per NUMERIC;
BEGIN
  IF _jerigen<=0 THEN RAISE EXCEPTION 'Jumlah jerigen harus > 0'; END IF;
  SELECT * INTO lot FROM public.raw_material_lots WHERE id=_lot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lot tidak ditemukan'; END IF;
  IF lot.jerigen_remaining < _jerigen THEN
    RAISE EXCEPTION 'Stok jerigen lot tidak cukup (sisa %)', lot.jerigen_remaining; END IF;
  kg_per := COALESCE(lot.grams_per_jerigen / 1000.0, lot.kg_per_jerigen);
  kg_added := kg_per * _jerigen;
  cost_per_kg := lot.price_total / (kg_per * lot.jerigen_qty);
  UPDATE public.raw_material_lots SET jerigen_remaining = jerigen_remaining - _jerigen WHERE id=_lot_id;
  SELECT * INTO db FROM public.dandang_balance WHERE id=1 FOR UPDATE;
  new_total := db.kg_remaining + kg_added;
  new_avg := CASE WHEN new_total>0 THEN ((db.kg_remaining*db.avg_cost_per_kg)+(kg_added*cost_per_kg))/new_total ELSE 0 END;
  UPDATE public.dandang_balance SET kg_remaining=new_total, avg_cost_per_kg=new_avg, updated_at=now() WHERE id=1;
  INSERT INTO public.dandang_transfers(lot_id,jerigen_opened,kg_added,cost_per_kg,created_by)
   VALUES (_lot_id,_jerigen,kg_added,cost_per_kg,auth.uid());
END; $function$;

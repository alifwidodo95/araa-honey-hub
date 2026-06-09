
CREATE OR REPLACE FUNCTION public.delete_dandang_transfer(_transfer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.dandang_transfers%ROWTYPE;
  d public.dandang_balance%ROWTYPE;
  new_kg numeric;
  new_total_cost numeric;
  old_total_cost numeric;
  removed_cost numeric;
BEGIN
  SELECT * INTO t FROM public.dandang_transfers WHERE id = _transfer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer tidak ditemukan'; END IF;

  SELECT * INTO d FROM public.dandang_balance WHERE id = 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Saldo dandang tidak ditemukan'; END IF;

  IF d.kg_remaining < t.kg_added THEN
    RAISE EXCEPTION 'Saldo dandang (% kg) lebih kecil dari kg yang akan dihapus (% kg). Madu sudah terpakai.', d.kg_remaining, t.kg_added;
  END IF;

  old_total_cost := COALESCE(d.kg_remaining,0) * COALESCE(d.avg_cost_per_kg,0);
  removed_cost := t.kg_added * t.cost_per_kg;
  new_kg := d.kg_remaining - t.kg_added;
  new_total_cost := GREATEST(old_total_cost - removed_cost, 0);

  UPDATE public.dandang_balance
     SET kg_remaining = new_kg,
         avg_cost_per_kg = CASE WHEN new_kg > 0 THEN new_total_cost / new_kg ELSE 0 END,
         updated_at = now()
   WHERE id = 1;

  UPDATE public.raw_material_lots
     SET jerigen_remaining = jerigen_remaining + t.jerigen_opened
   WHERE id = t.lot_id;

  DELETE FROM public.dandang_transfers WHERE id = _transfer_id;
END;
$$;

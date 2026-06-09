
DROP POLICY IF EXISTS "owner update lots" ON public.raw_material_lots;
CREATE POLICY "auth update lots" ON public.raw_material_lots FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth delete lots" ON public.raw_material_lots FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

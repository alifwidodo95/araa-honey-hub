-- Recreate policies dropped by CASCADE when has_role function was replaced

-- user_roles
DROP POLICY IF EXISTS "read roles" ON public.user_roles;
CREATE POLICY "read roles" ON public.user_roles 
  FOR SELECT TO authenticated 
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'owner'));

DROP POLICY IF EXISTS "owner manage roles" ON public.user_roles;
CREATE POLICY "owner manage roles" ON public.user_roles 
  FOR ALL TO authenticated 
  USING (public.has_role(auth.uid(), 'owner')) 
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

-- profiles
DROP POLICY IF EXISTS "read own or owner" ON public.profiles;
CREATE POLICY "read own or owner" ON public.profiles 
  FOR SELECT TO authenticated 
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'owner'));

-- app_settings
DROP POLICY IF EXISTS "owner manage settings" ON public.app_settings;
CREATE POLICY "owner manage settings" ON public.app_settings 
  FOR ALL TO authenticated 
  USING (public.has_role(auth.uid(), 'owner')) 
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

-- product_sizes
DROP POLICY IF EXISTS "owner manage sizes" ON public.product_sizes;
CREATE POLICY "owner manage sizes" ON public.product_sizes 
  FOR ALL TO authenticated 
  USING (public.has_role(auth.uid(), 'owner')) 
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

-- retail_prices
DROP POLICY IF EXISTS "owner manage retail" ON public.retail_prices;
CREATE POLICY "owner manage retail" ON public.retail_prices 
  FOR ALL TO authenticated 
  USING (public.has_role(auth.uid(), 'owner')) 
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

-- reseller_tiers
DROP POLICY IF EXISTS "owner manage tiers" ON public.reseller_tiers;
CREATE POLICY "owner manage tiers" ON public.reseller_tiers 
  FOR ALL TO authenticated 
  USING (public.has_role(auth.uid(), 'owner')) 
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

-- reseller_prices
DROP POLICY IF EXISTS "owner manage reseller prices" ON public.reseller_prices;
CREATE POLICY "owner manage reseller prices" ON public.reseller_prices 
  FOR ALL TO authenticated 
  USING (public.has_role(auth.uid(), 'owner')) 
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

-- marketplace_fees
DROP POLICY IF EXISTS "owner manage fees" ON public.marketplace_fees;
CREATE POLICY "owner manage fees" ON public.marketplace_fees 
  FOR ALL TO authenticated 
  USING (public.has_role(auth.uid(), 'owner')) 
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

-- raw_material_lots
DROP POLICY IF EXISTS "owner update lots" ON public.raw_material_lots;
CREATE POLICY "owner update lots" ON public.raw_material_lots 
  FOR UPDATE TO authenticated 
  USING (public.has_role(auth.uid(), 'owner'));

-- packaging_items
DROP POLICY IF EXISTS "owner manage pkg" ON public.packaging_items;
CREATE POLICY "owner manage pkg" ON public.packaging_items 
  FOR ALL TO authenticated 
  USING (public.has_role(auth.uid(), 'owner')) 
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

-- expenses_personal
DROP POLICY IF EXISTS "owner only personal" ON public.expenses_personal;
CREATE POLICY "owner only personal" ON public.expenses_personal 
  FOR ALL TO authenticated 
  USING (public.has_role(auth.uid(), 'owner')) 
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

-- lumpsum_rules
DROP POLICY IF EXISTS "owner manage lumpsum" ON public.lumpsum_rules;
CREATE POLICY "owner manage lumpsum" ON public.lumpsum_rules 
  FOR ALL TO authenticated 
  USING (public.has_role(auth.uid(), 'owner')) 
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

-- lumpsum_postings
DROP POLICY IF EXISTS "owner read postings" ON public.lumpsum_postings;
CREATE POLICY "owner read postings" ON public.lumpsum_postings 
  FOR SELECT TO authenticated 
  USING (public.has_role(auth.uid(), 'owner'));

-- honey_variants
DROP POLICY IF EXISTS "owner manage variants" ON public.honey_variants;
CREATE POLICY "owner manage variants" ON public.honey_variants 
  FOR ALL TO authenticated 
  USING (public.has_role(auth.uid(), 'owner')) 
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

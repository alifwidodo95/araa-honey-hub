-- Create policy to allow authenticated users to update orders
CREATE POLICY "auth update orders" ON public.orders
FOR UPDATE TO authenticated
USING (true)
WITH CHECK (true);

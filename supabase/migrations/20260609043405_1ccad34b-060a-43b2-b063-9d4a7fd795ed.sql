
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_role_label() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.open_jerigen(UUID,INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_packaging_purchase(UUID,NUMERIC,NUMERIC,DATE,TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_order(public.sales_channel,UUID,JSONB,NUMERIC,TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.run_monthly_lumpsum() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_role_label() TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_jerigen(UUID,INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_packaging_purchase(UUID,NUMERIC,NUMERIC,DATE,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_order(public.sales_channel,UUID,JSONB,NUMERIC,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_monthly_lumpsum() TO service_role;

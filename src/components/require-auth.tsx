import { useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { AppLayout } from "./app-layout";
import { LoadingScreen } from "./loading-screen";

export function RequireAuth({ 
  children, 
  ownerOnly = false, 
  requiredPermission 
}: { 
  children: ReactNode; 
  ownerOnly?: boolean; 
  requiredPermission?: string;
}) {
  const { session, loading, role, hasPermission } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate({ to: "/auth", replace: true });
      return;
    }
    if (ownerOnly && role !== "owner") {
      navigate({ to: "/dashboard", replace: true });
      return;
    }
    if (requiredPermission && !hasPermission(requiredPermission)) {
      navigate({ to: "/dashboard", replace: true });
      return;
    }
  }, [loading, session, role, ownerOnly, requiredPermission, hasPermission, navigate]);

  if (loading || !session) {
    return <LoadingScreen />;
  }
  if (ownerOnly && role !== "owner") {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Mengarahkan…</div>;
  }
  if (requiredPermission && !hasPermission(requiredPermission)) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Mengarahkan…</div>;
  }
  return <AppLayout>{children}</AppLayout>;
}

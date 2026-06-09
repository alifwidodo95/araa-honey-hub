import { useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { AppLayout } from "./app-layout";

export function RequireAuth({ children, ownerOnly = false }: { children: ReactNode; ownerOnly?: boolean }) {
  const { session, loading, role } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!session) navigate({ to: "/auth", replace: true });
    else if (ownerOnly && role !== "owner") navigate({ to: "/dashboard", replace: true });
  }, [loading, session, role, ownerOnly, navigate]);

  if (loading || !session) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Memuat…</div>;
  }
  if (ownerOnly && role !== "owner") {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Mengarahkan…</div>;
  }
  return <AppLayout>{children}</AppLayout>;
}

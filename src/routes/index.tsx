import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { LoadingScreen } from "@/components/loading-screen";

export const Route = createFileRoute("/")({ component: Index });

function Index() {
  const { loading, session } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (loading) return;
    navigate({ to: session ? "/dashboard" : "/auth", replace: true });
  }, [loading, session, navigate]);
  return <LoadingScreen />;
}

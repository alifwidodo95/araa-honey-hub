import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

type Role = string | null;

interface AuthCtx {
  user: User | null;
  session: Session | null;
  role: Role;
  loading: boolean;
  hasPermission: (permission: string) => boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null,
  session: null,
  role: null,
  loading: true,
  hasPermission: () => false,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // Hard fallback timeout: max 2.5s to prevent perpetual spinning
    const safetyTimer = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 2500);

    const fetchRole = async (uid: string) => {
      try {
        const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", uid);
        let userRole: string | null = null;
        if (roleData && roleData.length > 0) {
          if (roleData.some((r) => r.role === "owner")) userRole = "owner";
          else userRole = roleData[0].role;
        }
        if (mounted) setRole(userRole);

        if (userRole) {
          const { data: settingsData } = await supabase
            .from("app_settings")
            .select("value")
            .eq("key", "role_permissions")
            .maybeSingle();
          if (settingsData && settingsData.value && mounted) {
            const perms = (settingsData.value as any)[userRole] || {};
            setPermissions(perms);
          } else if (mounted) {
            // Fallback defaults
            if (userRole === "owner") {
              setPermissions({
                dashboard: true,
                penjualan: true,
                retur: true,
                stok: true,
                pengeluaran: true,
                keuangan: true,
                laporan: true,
                media: true,
                meta_ads: true,
                import_riwayat: true,
                pengaturan_harga: true,
                pengaturan_lumpsum: true,
                pengaturan_whatsapp: true,
                pengaturan_staf: true,
              });
            } else {
              setPermissions({
                dashboard: true,
                penjualan: true,
                retur: true,
                stok: true,
                pengeluaran: true,
              });
            }
          }
        } else if (mounted) {
          setPermissions({});
        }
      } catch (err) {
        console.error("[fetchRole Error]:", err);
      }
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!mounted) return;
      setSession(s);
      if (s?.user) {
        fetchRole(s.user.id).finally(() => {
          if (mounted) setLoading(false);
        });
      } else {
        setRole(null);
        setLoading(false);
      }
    });

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data.session);
        if (data.session?.user) {
          fetchRole(data.session.user.id).finally(() => {
            if (mounted) setLoading(false);
          });
        } else {
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("[getSession Error]:", err);
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const hasPermission = (permission: string) => {
    if (role === "owner") return true;
    return !!permissions[permission];
  };

  return (
    <Ctx.Provider value={{ user: session?.user ?? null, session, role, loading, hasPermission, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);

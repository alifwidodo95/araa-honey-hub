import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useDarkMode } from "@/lib/theme";
import { useQuery } from "@tanstack/react-query";
import { BeeCursor } from "./bee-cursor";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard, ShoppingCart, Package, ArrowLeftRight, Boxes, Wallet,
  Lock, Settings, LogOut, Moon, Sun, TrendingUp, Receipt, Megaphone, MessageSquare,
  Menu, X, User as UserIcon, AlertTriangle, RotateCcw, Database
} from "lucide-react";
import { Button } from "./ui/button";

const navStaff = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/penjualan", label: "Penjualan", icon: ShoppingCart },
  { to: "/retur", label: "Retur Pesanan", icon: RotateCcw },
  { to: "/stok/bahan-baku", label: "Bahan Baku", icon: Package },
  { to: "/stok/pindah-wadah", label: "Pindah Wadah", icon: ArrowLeftRight },
  { to: "/stok/kemasan", label: "Kemasan & Packing", icon: Boxes },
  { to: "/pengeluaran", label: "Biaya Operasional", icon: Receipt },
];

const navOwnerOnly = [
  { to: "/keuangan", label: "Keuangan", icon: TrendingUp },
  { to: "/pengeluaran-pribadi", label: "Pengeluaran Pribadi", icon: Wallet },
  { to: "/meta-ads", label: "Meta Ads Manager", icon: Megaphone }, // Added Meta Ads Manager
  { to: "/meta-comments", label: "Komentar Iklan", icon: MessageSquare },
  { to: "/import-riwayat", label: "Impor Riwayat", icon: Database },
  { to: "/pengaturan/whatsapp", label: "Integrasi WhatsApp", icon: MessageSquare },
  { to: "/pengaturan/harga", label: "Pengaturan Harga", icon: Settings },
  { to: "/pengaturan/lumpsum", label: "Lumpsum Bulanan", icon: Settings },
  { to: "/pengaturan/staf", label: "Akun Staf", icon: Lock },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const { role, user, hasPermission, signOut } = useAuth();
  const navigate = useNavigate();
  const { dark, toggle } = useDarkMode();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Fetch profiles table
  const { data: profile } = useQuery({
    queryKey: ["user-profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch unresolved stock alerts
  const { data: alerts } = useQuery({
    queryKey: ["unresolved-alerts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_alerts")
        .select("*")
        .eq("resolved", false);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 15000, // Refetch every 15s to keep it real-time
    enabled: !!user?.id,
  });

  const dandangAlerts = alerts?.filter((a: any) => a.item_type === "dandang").length || 0;
  const packagingAlerts = alerts?.filter((a: any) => a.item_type === "packaging").length || 0;

  // Telegram Alert Trigger Hook
  useEffect(() => {
    if (!alerts || alerts.length === 0) return;

    const notifiedAlerts = JSON.parse(localStorage.getItem("notified_stock_alerts") || "[]");
    const unnotified = alerts.filter((a: any) => !notifiedAlerts.includes(a.id));

    if (unnotified.length > 0) {
      const sendAlerts = async () => {
        const { sendTelegramAlert } = await import("@/lib/alerts");
        const nextNotified = [...notifiedAlerts];

        for (const alert of unnotified) {
          const message = `⚠️ *PERINGATAN STOK MENIPIS* ⚠️\n\n` +
            `*Item:* ${alert.item_name}\n` +
            `*Kategori:* ${alert.item_type === "dandang" ? "Madu di Dandang" : "Kemasan & Material Packing"}\n` +
            `*Stok Saat Ini:* ${Number(alert.current_stock).toFixed(2)}\n` +
            `*Batas Minimal:* ${Number(alert.min_stock).toFixed(2)}\n\n` +
            `*Tindakan:* Harap segera jadwalkan pengadaan stok ulang!`;
          
          try {
            const res = await sendTelegramAlert({ message });
            if (res && 'ok' in res && res.ok) {
              nextNotified.push(alert.id);
            }
          } catch (err) {
            console.error("Failed to send Telegram alert for ID:", alert.id, err);
          }
        }
        localStorage.setItem("notified_stock_alerts", JSON.stringify(nextNotified));
      };

      sendAlerts();
    }
  }, [alerts]);

  const displayName = profile?.full_name || user?.email?.split("@")[0] || "Araa Honey";
  const avatarLetter = displayName.charAt(0).toUpperCase();
  const avatarUrl = profile?.avatar_url;

  const getPermissionKey = (to: string) => {
    if (to === "/dashboard") return "dashboard";
    if (to.startsWith("/stok/")) return "stok";
    return to.replace(/^\//, "").replace(/\//g, "_");
  };

  const allItems = [...navStaff, ...navOwnerOnly];
  const items = allItems.filter((item) => hasPermission(getPermissionKey(item.to)));

  const handleLogout = async () => {
    await signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen flex w-full bg-background overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 bg-sidebar text-sidebar-foreground flex-col border-r border-sidebar-border">
        <div className="p-5 border-b border-sidebar-border flex items-center gap-3">
          {avatarUrl ? (
            <img src={avatarUrl} alt="Avatar" className="h-10 w-10 rounded-xl object-cover border border-sidebar-border" />
          ) : (
            <div className="h-10 w-10 rounded-xl bg-sidebar-accent flex items-center justify-center font-bold text-sidebar-accent-foreground">{avatarLetter}</div>
          )}
          <div>
            <div className="font-semibold truncate max-w-[140px]" title={displayName}>{displayName}</div>
            <div className="text-xs opacity-70 capitalize">{role ?? "—"}</div>
            <Link to="/pengaturan/profil" className="text-[10px] text-honey hover:underline font-semibold mt-1.5 block">
              Edit Profil
            </Link>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {items.map((it) => {
            const Icon = it.icon;
            const active = pathname === it.to || pathname.startsWith(it.to + "/");
            let badgeCount = 0;
            if (it.to === "/stok/bahan-baku") badgeCount = dandangAlerts;
            if (it.to === "/stok/kemasan") badgeCount = packagingAlerts;
            return (
              <Link
                key={it.to}
                to={it.to}
                className={`flex items-center gap-3 px-3 py-2 text-sm liquid-honey-item ${
                  active
                    ? "liquid-honey-active"
                    : "text-sidebar-foreground/85"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1">{it.label}</span>
                {badgeCount > 0 && (
                  <span className="bg-destructive text-destructive-foreground text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse">
                    {badgeCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border space-y-2">
          <div className="text-xs opacity-70 px-2 truncate">{user?.email}</div>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-border/40 hover:text-sidebar-foreground">
            <LogOut className="h-4 w-4 mr-2" /> Logout
          </Button>
        </div>
      </aside>

      {/* Mobile Sidebar Drawer (Portal) */}
      <div 
        className={`fixed inset-0 z-50 lg:hidden transition-all duration-300 ${
          sidebarOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      >
        {/* Backdrop */}
        <div 
          className="absolute inset-0 bg-black/60 backdrop-blur-xs" 
          onClick={() => setSidebarOpen(false)} 
        />
        
        {/* Drawer Panel */}
        <aside 
          className={`absolute inset-y-0 left-0 w-64 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border transition-transform duration-300 ease-in-out ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="p-5 border-b border-sidebar-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="h-10 w-10 rounded-xl object-cover border border-sidebar-border" />
              ) : (
                <div className="h-10 w-10 rounded-xl bg-sidebar-accent flex items-center justify-center font-bold text-sidebar-accent-foreground">{avatarLetter}</div>
              )}
              <div>
                <div className="font-semibold truncate max-w-[120px]" title={displayName}>{displayName}</div>
                <div className="text-xs opacity-70 capitalize">{role ?? "—"}</div>
                <Link to="/pengaturan/profil" onClick={() => setSidebarOpen(false)} className="text-[10px] text-honey hover:underline font-semibold mt-1.5 block">
                  Edit Profil
                </Link>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)} className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-border/40">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
            {items.map((it) => {
              const Icon = it.icon;
              const active = pathname === it.to || pathname.startsWith(it.to + "/");
              let badgeCount = 0;
              if (it.to === "/stok/bahan-baku") badgeCount = dandangAlerts;
              if (it.to === "/stok/kemasan") badgeCount = packagingAlerts;
              return (
                <Link
                  key={it.to}
                  to={it.to}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 text-sm liquid-honey-item ${
                    active
                      ? "liquid-honey-active"
                      : "text-sidebar-foreground/85"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="flex-1">{it.label}</span>
                  {badgeCount > 0 && (
                    <span className="bg-destructive text-destructive-foreground text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse">
                      {badgeCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
          <div className="p-3 border-t border-sidebar-border space-y-2">
            <div className="text-xs opacity-70 px-2 truncate">{user?.email}</div>
            <Button variant="ghost" size="sm" onClick={() => { setSidebarOpen(false); handleLogout(); }} className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-border/40 hover:text-sidebar-foreground">
              <LogOut className="h-4 w-4 mr-2" /> Logout
            </Button>
          </div>
        </aside>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <header className="h-14 border-b bg-card flex items-center justify-between px-4 sm:px-6 shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
            <h1 className="text-sm font-medium text-muted-foreground hidden sm:block">Sistem Operasional Internal</h1>
            <h1 className="text-sm font-semibold lg:hidden sm:hidden">Araa Honey</h1>
          </div>
          <Button variant="ghost" size="icon" onClick={toggle}>
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </header>
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto bg-background/50">{children}</div>
      </main>
      <BeeCursor />
    </div>
  );
}

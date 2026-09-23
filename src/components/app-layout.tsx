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
  Menu, X, User as UserIcon, AlertTriangle, RotateCcw, Database, Bot, HeartHandshake, Image as ImageIcon, BarChart3, ChevronDown, Sparkles, Zap
} from "lucide-react";
import { Button } from "./ui/button";
import { getScalevMetrics } from "@/lib/scalev.functions";

function getTodayWibString() {
  const d = new Date();
  const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
  const jkt = new Date(utc + (3600000 * 7));
  const year = jkt.getFullYear();
  const month = String(jkt.getMonth() + 1).padStart(2, "0");
  const day = String(jkt.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

type NavItem = {
  to: string;
  label: string;
  icon: any;
};

type NavGroup = {
  id: string;
  label: string;
  icon: any;
  items: NavItem[];
};

type NavEntry =
  | { type: "item"; item: NavItem }
  | { type: "group"; group: NavGroup };

const navStructure: NavEntry[] = [
  // Standalone Items (Sering dibuka)
  {
    type: "item",
    item: { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  },
  {
    type: "item",
    item: { to: "/penjualan", label: "Penjualan", icon: ShoppingCart },
  },
  // 1. Pelanggan & Pesanan
  {
    type: "group",
    group: {
      id: "pelanggan",
      label: "Pelanggan & Pesanan",
      icon: HeartHandshake,
      items: [
        { to: "/loyalitas", label: "Loyalitas & Repeat", icon: HeartHandshake },
        { to: "/reaktivasi-2025", label: "Reaktivasi 2025", icon: Sparkles },
        { to: "/retur", label: "Retur Pesanan", icon: RotateCcw },
      ],
    },
  },
  // 2. Stok & Gudang
  {
    type: "group",
    group: {
      id: "stok",
      label: "Stok & Gudang",
      icon: Package,
      items: [
        { to: "/stok/bahan-baku", label: "Bahan Baku (Dandang)", icon: Package },
        { to: "/stok/pindah-wadah", label: "Pindah Wadah", icon: ArrowLeftRight },
        { to: "/stok/kemasan", label: "Kemasan & Packing", icon: Boxes },
      ],
    },
  },
  // 3. Finansial & Laporan
  {
    type: "group",
    group: {
      id: "finansial",
      label: "Finansial & Laporan",
      icon: TrendingUp,
      items: [
        { to: "/laporan", label: "Laporan Konsumsi", icon: BarChart3 },
        { to: "/keuangan", label: "Keuangan & Laba", icon: TrendingUp },
        { to: "/pengeluaran", label: "Biaya Operasional", icon: Receipt },
      ],
    },
  },
  // 4. Pemasaran & AI
  {
    type: "group",
    group: {
      id: "pemasaran",
      label: "Pemasaran & AI",
      icon: Megaphone,
      items: [
        { to: "/media", label: "Media & Testimoni", icon: ImageIcon },
        { to: "/meta-ads", label: "Meta Ads Manager", icon: Megaphone },
        { to: "/meta-comments", label: "Komentar Iklan", icon: MessageSquare },
      ],
    },
  },
  // 5. Pengaturan & Sistem
  {
    type: "group",
    group: {
      id: "pengaturan",
      label: "Pengaturan & Sistem",
      icon: Settings,
      items: [
        { to: "/pengaturan/whatsapp", label: "Integrasi WhatsApp", icon: MessageSquare },
        { to: "/pengaturan/harga", label: "Pengaturan Harga", icon: Settings },
        { to: "/pengaturan/lumpsum", label: "Lumpsum Bulanan", icon: Settings },
        { to: "/pengaturan/staf", label: "Akun Staf", icon: Lock },
        { to: "/import-riwayat", label: "Impor Riwayat", icon: Database },
      ],
    },
  },
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

  // Fetch unreplied customer responses for WhatsApp Monitor notification badge (Option B)
  const { data: unrepliedChatCount = 0, refetch: refetchUnrepliedChats } = useQuery({
    queryKey: ["unreplied-whatsapp-chats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_chat_logs")
        .select("customer_phone, chat_id, direction, channel, is_read, created_at")
        .eq("channel", "waba")
        .order("created_at", { ascending: false })
        .limit(2000);

      if (error || !data) return 0;

      const seen = new Set<string>();
      let unread = 0;
      for (const log of data) {
        if (log.channel !== "waba") continue;
        const phone = (log.customer_phone || log.chat_id || "").replace(/[^0-9]/g, "");
        if (!phone || seen.has(phone)) continue;
        seen.add(phone);
        // An unread incoming chat is when the latest message is incoming AND not yet marked as read!
        if (log.direction === "incoming" && !log.is_read) {
          unread++;
        }
      }
      return unread;
    },
    refetchInterval: 10000,
    enabled: !!user?.id,
  });

  // Supabase Realtime subscription for instant badge updates
  useEffect(() => {
    const channel = supabase
      .channel("realtime-app-whatsapp-badge")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_chat_logs" },
        () => {
          refetchUnrepliedChats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetchUnrepliedChats]);

  // Fetch unclosed Scalev leads for today (Leads Ads badge)
  const { data: scalevTodayMetrics } = useQuery({
    queryKey: ["scalev-today-metrics-badge"],
    queryFn: async () => {
      try {
        const todayStr = getTodayWibString();
        const res = await getScalevMetrics({ data: { startDate: todayStr, endDate: todayStr } });
        return res;
      } catch {
        return null;
      }
    },
    refetchInterval: 25000,
    enabled: !!user?.id,
  });

  const todayUnclosedLeads = scalevTodayMetrics?.unclosedCount || 0;

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

  const filteredNav = navStructure
    .map((entry) => {
      if (entry.type === "item") {
        return hasPermission(getPermissionKey(entry.item.to)) ? entry : null;
      }
      const allowedItems = entry.group.items.filter((it) =>
        hasPermission(getPermissionKey(it.to))
      );
      if (allowedItems.length === 0) return null;
      return {
        type: "group" as const,
        group: {
          ...entry.group,
          items: allowedItems,
        },
      };
    })
    .filter(Boolean) as NavEntry[];

  // Auto-expand active group on initial load & route change
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const entry of navStructure) {
      if (entry.type === "group") {
        const hasActive = entry.group.items.some(
          (it) => pathname === it.to || pathname.startsWith(it.to + "/")
        );
        if (hasActive) initial[entry.group.id] = true;
      }
    }
    return initial;
  });

  useEffect(() => {
    for (const entry of navStructure) {
      if (entry.type === "group") {
        const hasActive = entry.group.items.some(
          (it) => pathname === it.to || pathname.startsWith(it.to + "/")
        );
        if (hasActive) {
          setOpenGroups((prev) => (prev[entry.group.id] ? prev : { ...prev, [entry.group.id]: true }));
        }
      }
    }
  }, [pathname]);

  const toggleGroup = (groupId: string) => {
    setOpenGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  const getItemBadge = (to: string) => {
    if (to === "/whatsapp-ai") return unrepliedChatCount;
    if (to === "/stok/bahan-baku") return dandangAlerts;
    if (to === "/stok/kemasan") return packagingAlerts;
    return 0;
  };

  const getGroupBadge = (group: NavGroup) => {
    return group.items.reduce((acc, it) => acc + getItemBadge(it.to), 0);
  };

  const handleLogout = async () => {
    await signOut();
    navigate({ to: "/auth", replace: true });
  };

  const renderNav = (onNavigate?: () => void) => {
    const canAccessWhatsApp = hasPermission("whatsapp_ai") || hasPermission("whatsapp-ai");
    const canAccessScalev = hasPermission("scalev_leads");
    const hasDailyOps = canAccessWhatsApp || canAccessScalev;

    const isWhatsAppActive = pathname === "/whatsapp-ai" || pathname.startsWith("/whatsapp-ai/");
    const isScalevActive = pathname === "/scalev/leads" || pathname.startsWith("/scalev/leads/");

    return (
      <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
        {/* 🎯 DAILY OPS HUB (Pusat Operasional Utama) */}
        {hasDailyOps && (
          <div className="mb-3.5 p-2 rounded-xl bg-gradient-to-b from-white/[0.08] to-white/[0.02] dark:from-white/[0.06] dark:to-transparent border border-white/10 shadow-xs space-y-1.5">
            <div className="flex items-center justify-between px-2 pt-0.5 pb-1">
              <span className="text-[10px] font-bold tracking-wider uppercase text-amber-400 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                Daily Ops Hub
              </span>
              <span className="text-[9px] font-semibold text-sidebar-foreground/50 uppercase tracking-widest">
                Utama
              </span>
            </div>

            {/* 1. WhatsApp Monitor */}
            {canAccessWhatsApp && (
              <Link
                to="/whatsapp-ai"
                onClick={onNavigate}
                className={`group relative flex items-center gap-2.5 px-2.5 py-2 text-sm rounded-lg font-semibold transition-all ${
                  isWhatsAppActive
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-950/40 border border-emerald-400/60"
                    : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 hover:text-emerald-100 border border-emerald-500/25 hover:border-emerald-500/40"
                }`}
              >
                <div className={`p-1.5 rounded-md transition-colors ${
                  isWhatsAppActive 
                    ? "bg-white/20 text-white" 
                    : "bg-emerald-500/20 text-emerald-400 group-hover:bg-emerald-500/30"
                }`}>
                  <MessageSquare className="h-4 w-4 shrink-0" />
                </div>
                <span className="flex-1 truncate">WhatsApp Monitor</span>
                {unrepliedChatCount > 0 ? (
                  <div 
                    className="relative flex items-center shrink-0" 
                    title={`${unrepliedChatCount} Pesan respon baru belum dibaca`}
                  >
                    <span className="animate-ping absolute -inset-0.5 rounded-full bg-emerald-400 opacity-60"></span>
                    <span className="relative bg-emerald-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full shadow-xs flex items-center gap-1 border border-white/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse shrink-0" />
                      <span>{unrepliedChatCount}</span>
                    </span>
                  </div>
                ) : (
                  <span className="w-2 h-2 rounded-full bg-emerald-500/60 shrink-0 group-hover:bg-emerald-400 transition-colors" title="Monitor Aktif" />
                )}
              </Link>
            )}

            {/* 2. Leads Ads & Closing Hub */}
            {canAccessScalev && (
              <Link
                to="/scalev/leads"
                onClick={onNavigate}
                className={`group relative flex items-center gap-2.5 px-2.5 py-2 text-sm rounded-lg font-semibold transition-all ${
                  isScalevActive
                    ? "liquid-honey-active shadow-md border border-amber-400/60 font-bold"
                    : "bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 hover:text-amber-100 border border-amber-500/25 hover:border-amber-500/40"
                }`}
              >
                <div className={`p-1.5 rounded-md transition-colors ${
                  isScalevActive 
                    ? "bg-amber-950/20 text-amber-950" 
                    : "bg-amber-500/20 text-amber-400 group-hover:bg-amber-500/30"
                }`}>
                  <Zap className="h-4 w-4 shrink-0" />
                </div>
                <span className="flex-1 truncate">Leads Ads & Closing Hub</span>
                {todayUnclosedLeads > 0 ? (
                  <span 
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0 transition-colors ${
                      isScalevActive 
                        ? "bg-amber-950/20 text-amber-950 border border-amber-950/30" 
                        : "bg-amber-500/25 text-amber-300 border border-amber-400/30 group-hover:bg-amber-400/30"
                    }`}
                    title={`${todayUnclosedLeads} Lead hari ini belum closing`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                    <span>{todayUnclosedLeads} Lead</span>
                  </span>
                ) : (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider shrink-0 transition-colors ${
                    isScalevActive 
                      ? "bg-amber-950/20 text-amber-950" 
                      : "bg-amber-400/20 text-amber-300 group-hover:bg-amber-400/30"
                  }`}>
                    ⚡ Hub
                  </span>
                )}
              </Link>
            )}
          </div>
        )}
      {filteredNav.map((entry) => {
        if (entry.type === "item") {
          const it = entry.item;
          const Icon = it.icon;
          const active = pathname === it.to || pathname.startsWith(it.to + "/");
          const badgeCount = getItemBadge(it.to);
          const isWhatsApp = it.to === "/whatsapp-ai";
          return (
            <Link
              key={it.to}
              to={it.to}
              onClick={onNavigate}
              className={`flex items-center gap-3 px-3 py-2 text-sm rounded-lg font-medium transition-all ${
                active
                  ? "liquid-honey-active shadow-sm"
                  : "text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
              }`}
            >
              <Icon className={`h-4 w-4 shrink-0 transition-colors ${isWhatsApp && badgeCount > 0 ? "text-emerald-400" : ""}`} />
              <span className="flex-1 truncate">{it.label}</span>
              {badgeCount > 0 && (
                isWhatsApp ? (
                  <div 
                    className="relative flex items-center shrink-0" 
                    title={`${badgeCount} Pesan respon baru belum dibaca`}
                  >
                    <span className="animate-ping absolute -inset-0.5 rounded-full bg-emerald-400 opacity-60"></span>
                    <span className="relative bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full shadow-xs flex items-center gap-1 border border-emerald-400/40 transition-transform active:scale-95">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse shrink-0" />
                      <span>{badgeCount}</span>
                    </span>
                  </div>
                ) : (
                  <span className="bg-destructive text-destructive-foreground text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse">
                    {badgeCount}
                  </span>
                )
              )}
            </Link>
          );
        }

        const group = entry.group;
        const GroupIcon = group.icon;
        const isOpen = !!openGroups[group.id];
        const isGroupActive = group.items.some(
          (it) => pathname === it.to || pathname.startsWith(it.to + "/")
        );
        const groupBadge = getGroupBadge(group);

        return (
          <div key={group.id} className="space-y-1">
            <button
              type="button"
              onClick={() => toggleGroup(group.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-all text-left group cursor-pointer ${
                isGroupActive
                  ? "text-amber-500 font-semibold bg-amber-500/10"
                  : "text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
              }`}
            >
              <GroupIcon className={`h-4 w-4 shrink-0 transition-colors ${isGroupActive ? "text-amber-500" : "text-sidebar-foreground/70 group-hover:text-sidebar-foreground"}`} />
              <span className="flex-1 truncate">{group.label}</span>
              {groupBadge > 0 && (
                <span className="bg-destructive text-destructive-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-pulse mr-1">
                  {groupBadge}
                </span>
              )}
              <ChevronDown
                className={`h-4 w-4 shrink-0 transition-transform duration-200 opacity-60 ${
                  isOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {isOpen && (
              <div className="pl-4 ml-3 space-y-1 border-l-2 border-amber-500/20 py-0.5">
                {group.items.map((it) => {
                  const SubIcon = it.icon;
                  const active = pathname === it.to || pathname.startsWith(it.to + "/");
                  const badgeCount = getItemBadge(it.to);
                  return (
                    <Link
                      key={it.to}
                      to={it.to}
                      onClick={onNavigate}
                      className={`flex items-center gap-2.5 px-3 py-1.5 text-xs rounded-md font-medium transition-all ${
                        active
                          ? "bg-amber-500/15 text-amber-500 font-semibold shadow-xs"
                          : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/40"
                      }`}
                    >
                      <SubIcon className={`h-3.5 w-3.5 shrink-0 ${active ? "text-amber-500" : "opacity-70"}`} />
                      <span className="flex-1 truncate">{it.label}</span>
                      {badgeCount > 0 && (
                        <span className="bg-destructive text-destructive-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-pulse">
                          {badgeCount}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
    );
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
        {renderNav()}
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
          {renderNav(() => setSidebarOpen(false))}
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

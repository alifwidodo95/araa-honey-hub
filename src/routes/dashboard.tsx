import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { RequireAuth } from "@/components/require-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";
import { formatIDR } from "@/lib/theme";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/dashboard")({ component: () => <RequireAuth><DashboardPage /></RequireAuth> });

function DashboardPage() {
  const { role } = useAuth();
  const today = new Date().toISOString().slice(0, 10);

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
    refetchInterval: 15000,
  });

  const { data: dandang } = useQuery({
    queryKey: ["dandang-summary"],
    queryFn: async () => {
      const rows = (await supabase.from("dandang_balance").select("*")).data ?? [];
      const total = rows.reduce((s: number, r: any) => s + Number(r.kg_remaining ?? 0), 0);
      return { kg_remaining: total, rows };
    },
  });

  const { data: ordersToday } = useQuery({
    queryKey: ["orders-today"],
    queryFn: async () =>
      (await supabase.from("orders").select("subtotal_gross,net_revenue,created_at").eq("returned", false).gte("created_at", `${today}T00:00:00Z`)).data ?? [],
  });

  const { data: salesTrend } = useQuery({
    queryKey: ["sales-trend"],
    queryFn: async () => {
      const since = new Date(Date.now() - 14 * 86400000).toISOString();
      const { data } = await supabase.from("orders").select("created_at,net_revenue,cogs_total").eq("returned", false).gte("created_at", since);
      const map: Record<string, { date: string; omzet: number; laba: number }> = {};
      (data ?? []).forEach((o: any) => {
        const d = o.created_at.slice(0, 10);
        if (!map[d]) map[d] = { date: d, omzet: 0, laba: 0 };
        map[d].omzet += Number(o.net_revenue);
        map[d].laba += Number(o.net_revenue) - Number(o.cogs_total);
      });
      return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
    },
  });

  const omzetToday = (ordersToday ?? []).reduce((s, o: any) => s + Number(o.subtotal_gross), 0);
  const netToday = (ordersToday ?? []).reduce((s, o: any) => s + Number(o.net_revenue), 0);

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h2 className="text-2xl font-semibold">Selamat datang 👋</h2>
        <p className="text-sm text-muted-foreground">Ringkasan operasional Araa Honey hari ini</p>
      </div>

      {alerts && alerts.length > 0 && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-red-500/15 via-orange-500/10 to-red-500/5 border border-red-500/20 text-foreground shadow-xs">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-semibold mb-2">
            <AlertTriangle className="h-5 w-5 animate-pulse" />
            <span>Peringatan: Stok Menipis!</span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Beberapa item berada di bawah batas minimal. Harap segera lakukan restok/pembelian.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {alerts.map((alert: any) => (
              <div key={alert.id} className="text-xs flex items-center justify-between p-2 rounded-lg bg-card border border-destructive/20 shadow-xs">
                <span className="font-medium truncate max-w-[150px]" title={alert.item_name}>
                  {alert.item_name}
                </span>
                <span className="text-destructive font-bold ml-2">
                  {Number(alert.current_stock).toFixed(1)} / {Number(alert.min_stock).toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Saldo Madu Dandang" value={`${Number(dandang?.kg_remaining ?? 0).toFixed(2)} kg`} />
        <MetricCard label="Order Hari Ini" value={String(ordersToday?.length ?? 0)} />
        {role === "owner" ? (
          <>
            <MetricCard label="Omzet Hari Ini" value={formatIDR(omzetToday)} />
            <MetricCard label="Pendapatan Bersih" value={formatIDR(netToday)} accent />
          </>
        ) : (
          <>
            <MetricCard label="Total Item Terjual" value={String(ordersToday?.length ?? 0)} />
            <MetricCard label="Status" value="Operasional" accent />
          </>
        )}
      </div>

      {role === "owner" && (
        <Card>
          <CardHeader><CardTitle>Tren Pendapatan & Laba (14 hari)</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesTrend ?? []}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="oklch(0.78 0.16 75)" stopOpacity={0.6}/><stop offset="100%" stopColor="oklch(0.78 0.16 75)" stopOpacity={0}/></linearGradient>
                  <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="oklch(0.55 0.18 250)" stopOpacity={0.5}/><stop offset="100%" stopColor="oklch(0.55 0.18 250)" stopOpacity={0}/></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="date" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: any) => formatIDR(v)} />
                <Area dataKey="omzet" stroke="oklch(0.78 0.16 75)" fill="url(#g1)" strokeWidth={2} />
                <Area dataKey="laba" stroke="oklch(0.55 0.18 250)" fill="url(#g2)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card className={accent ? "border-honey/40 bg-honey/5" : ""}>
      <CardContent className="p-5">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold mt-2">{value}</div>
      </CardContent>
    </Card>
  );
}

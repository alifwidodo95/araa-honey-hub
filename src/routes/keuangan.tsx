import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { RequireAuth } from "@/components/require-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatIDR } from "@/lib/theme";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const Route = createFileRoute("/keuangan")({ component: () => <RequireAuth ownerOnly><Page /></RequireAuth> });

function Page() {
  const { data: orders } = useQuery({
    queryKey: ["fin-orders"],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      return (await supabase.from("orders").select("*").gte("created_at", since)).data ?? [];
    },
  });
  const { data: biz } = useQuery({
    queryKey: ["fin-biz"],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      return (await supabase.from("expenses_business").select("*").gte("occurred_on", since)).data ?? [];
    },
  });

  const gross = (orders ?? []).reduce((s, o: any) => s + Number(o.subtotal_gross), 0);
  const platformFee = (orders ?? []).reduce((s, o: any) => s + Number(o.marketplace_fee) + Number(o.shipping_fee), 0);
  const cogs = (orders ?? []).reduce((s, o: any) => s + Number(o.cogs_total), 0);
  const opex = (biz ?? []).reduce((s, e: any) => s + Number(e.amount), 0);
  const netProfit = gross - platformFee - cogs - opex;

  const dailyMap: Record<string, { date: string; omzet: number; laba: number; ads: number }> = {};
  (orders ?? []).forEach((o: any) => {
    const d = o.created_at.slice(0, 10);
    if (!dailyMap[d]) dailyMap[d] = { date: d, omzet: 0, laba: 0, ads: 0 };
    dailyMap[d].omzet += Number(o.net_revenue);
    dailyMap[d].laba += Number(o.net_revenue) - Number(o.cogs_total);
  });
  (biz ?? []).forEach((e: any) => {
    if (e.category === "meta_ads") {
      const d = e.occurred_on;
      if (!dailyMap[d]) dailyMap[d] = { date: d, omzet: 0, laba: 0, ads: 0 };
      dailyMap[d].ads += Number(e.amount);
    }
  });
  const daily = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
  const roas = daily.map((d) => ({ date: d.date, roas: d.ads > 0 ? +(d.omzet / d.ads).toFixed(2) : 0 }));

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h2 className="text-2xl font-semibold">Finance Hub (Owner)</h2>
        <p className="text-sm text-muted-foreground">Laba bersih = Omzet − Potongan Platform − HPP − Operasional (30 hari terakhir)</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Metric label="Omzet Kotor" value={formatIDR(gross)} />
        <Metric label="Potongan Platform" value={formatIDR(platformFee)} />
        <Metric label="HPP" value={formatIDR(cogs)} />
        <Metric label="Operasional" value={formatIDR(opex)} />
        <Metric label="Laba Bersih" value={formatIDR(netProfit)} accent />
      </div>

      <Card>
        <CardHeader><CardTitle>Tren Laba Harian</CardTitle></CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={daily}>
              <defs><linearGradient id="lp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="oklch(0.78 0.16 75)" stopOpacity={0.7}/><stop offset="100%" stopColor="oklch(0.78 0.16 75)" stopOpacity={0}/></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="date" fontSize={11} />
              <YAxis fontSize={11} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: any) => formatIDR(v)} />
              <Area dataKey="laba" stroke="oklch(0.78 0.16 75)" fill="url(#lp)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>ROAS Harian (Omzet WA / Meta Ads)</CardTitle></CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={roas}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="date" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Line type="monotone" dataKey="roas" stroke="oklch(0.55 0.18 250)" strokeWidth={2} dot />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card className={accent ? "border-honey/40 bg-honey/5" : ""}>
      <CardContent className="p-5">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-xl font-bold mt-2">{value}</div>
      </CardContent>
    </Card>
  );
}

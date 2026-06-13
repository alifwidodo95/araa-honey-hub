import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RequireAuth } from "@/components/require-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatIDR } from "@/lib/theme";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  TrendingUp,
  Coins,
  Percent,
  Receipt,
  Wallet,
  ArrowUpRight,
  Sparkles,
  CalendarDays,
  Target,
  Truck,
  CreditCard,
  Banknote
} from "lucide-react";

export const Route = createFileRoute("/keuangan")({ component: () => <RequireAuth requiredPermission="keuangan"><Page /></RequireAuth> });

const toLocalISOString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

function formatDateIndo(dateStr: string) {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const year = parts[0];
  const monthIdx = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  return `${day} ${months[monthIdx]} ${year}`;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const value = payload[0].value;
    const isPositive = value >= 0;
    return (
      <div className="bg-background/90 backdrop-blur-md border border-border/80 p-3.5 rounded-xl shadow-xl space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <CalendarDays className="w-3.5 h-3.5 text-muted-foreground/80" />
          {formatDateIndo(label)}
        </p>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isPositive ? 'bg-amber-500' : 'bg-red-500'}`} />
          <p className={`text-sm font-extrabold tracking-tight ${isPositive ? 'text-foreground' : 'text-red-500'}`}>
            {formatIDR(value)}
          </p>
        </div>
      </div>
    );
  }
  return null;
};

const CustomRoasTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const value = Number(payload[0].value);
    return (
      <div className="bg-background/90 backdrop-blur-md border border-border/80 p-3.5 rounded-xl shadow-xl space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <CalendarDays className="w-3.5 h-3.5 text-muted-foreground/80" />
          {formatDateIndo(label)}
        </p>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <p className="text-sm font-extrabold tracking-tight text-foreground">
            ROAS: {value.toFixed(2)}x
          </p>
        </div>
      </div>
    );
  }
  return null;
};

function Page() {
  const [rangeOption, setRangeOption] = useState<"today" | "7days" | "30days" | "90days" | "custom">("30days");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toLocalISOString(d);
  });
  const [endDate, setEndDate] = useState(() => toLocalISOString(new Date()));

  // Sync dates when range option changes
  useEffect(() => {
    if (rangeOption === "custom") return;
    const end = new Date();
    const start = new Date();
    
    if (rangeOption === "today") {
      // keep start as today
    } else if (rangeOption === "7days") {
      start.setDate(end.getDate() - 7);
    } else if (rangeOption === "30days") {
      start.setDate(end.getDate() - 30);
    } else if (rangeOption === "90days") {
      start.setDate(end.getDate() - 90);
    }
    
    setStartDate(toLocalISOString(start));
    setEndDate(toLocalISOString(end));
  }, [rangeOption]);

  const { data: orders } = useQuery({
    queryKey: ["fin-orders", startDate, endDate],
    queryFn: async () => {
      const startIso = `${startDate}T00:00:00Z`;
      const endIso = `${endDate}T23:59:59Z`;
      return (await supabase
        .from("orders")
        .select("*")
        .eq("returned", false)
        .gte("created_at", startIso)
        .lte("created_at", endIso)
      ).data ?? [];
    },
  });

  const { data: biz } = useQuery({
    queryKey: ["fin-biz", startDate, endDate],
    queryFn: async () => {
      return (await supabase
        .from("expenses_business")
        .select("*")
        .gte("occurred_on", startDate)
        .lte("occurred_on", endDate)
      ).data ?? [];
    },
  });

  const gross = (orders ?? []).reduce((s, o: any) => s + Number(o.amount_received !== null ? o.amount_received : o.subtotal_gross), 0);
  const platformFee = (orders ?? []).reduce((s, o: any) => s + Number(o.marketplace_fee) + Number(o.shipping_fee), 0);
  const cogs = (orders ?? []).reduce((s, o: any) => s + Number(o.cogs_total), 0);
  const opex = (biz ?? [])
    .filter((e: any) => e.category !== "packaging_purchase")
    .reduce((s, e: any) => s + Number(e.amount), 0);
  const netProfit = (orders ?? []).reduce((s, o: any) => s + Number(o.net_revenue), 0) - cogs - opex;

  let codTotal = 0;
  let codCount = 0;
  let transferTotal = 0;
  let transferCount = 0;
  let cashTotal = 0;
  let cashCount = 0;

  (orders ?? []).forEach((o: any) => {
    const amount = Number(o.amount_received !== null ? o.amount_received : o.subtotal_gross);
    if (o.payment_method === "COD") {
      codTotal += amount;
      codCount++;
    } else if (o.payment_method === "TRANSFER") {
      transferTotal += amount;
      transferCount++;
    } else if (o.payment_method === "CASH") {
      cashTotal += amount;
      cashCount++;
    }
  });

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
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-gradient-to-r from-muted/30 via-muted/10 to-transparent p-5 md:p-6 rounded-2xl border border-muted/30">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-extrabold tracking-tight text-foreground">Finance Hub</h2>
            <span className="bg-honey/10 text-honey text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-honey/20 uppercase tracking-wider">
              Owner Mode
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1.5">
            Laba bersih = Omzet − Potongan Platform − HPP − Operasional
          </p>
          <div className="flex items-center gap-1.5 text-xs text-honey font-semibold mt-1">
            <CalendarDays className="w-3.5 h-3.5" />
            Periode: {formatDateIndo(startDate)} s/d {formatDateIndo(endDate)}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-muted p-1 rounded-lg border gap-1">
            <Button
              variant={rangeOption === "today" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setRangeOption("today")}
              className={`text-xs h-8 px-3 ${rangeOption === "today" ? "bg-background shadow-sm font-semibold" : ""}`}
            >
              Hari Ini
            </Button>
            <Button
              variant={rangeOption === "7days" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setRangeOption("7days")}
              className={`text-xs h-8 px-3 ${rangeOption === "7days" ? "bg-background shadow-sm font-semibold" : ""}`}
            >
              1 Minggu
            </Button>
            <Button
              variant={rangeOption === "30days" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setRangeOption("30days")}
              className={`text-xs h-8 px-3 ${rangeOption === "30days" ? "bg-background shadow-sm font-semibold" : ""}`}
            >
              1 Bulan
            </Button>
            <Button
              variant={rangeOption === "90days" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setRangeOption("90days")}
              className={`text-xs h-8 px-3 ${rangeOption === "90days" ? "bg-background shadow-sm font-semibold" : ""}`}
            >
              3 Bulan
            </Button>
            <Button
              variant={rangeOption === "custom" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setRangeOption("custom")}
              className={`text-xs h-8 px-3 ${rangeOption === "custom" ? "bg-background shadow-sm font-semibold" : ""}`}
            >
              Kustom
            </Button>
          </div>

          {rangeOption === "custom" && (
            <div className="flex items-center gap-2 bg-muted/40 p-1 rounded-lg border">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-8 w-36 bg-background text-xs border-none shadow-none focus-visible:ring-1"
              />
              <span className="text-xs font-medium text-muted-foreground px-0.5">s/d</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-8 w-36 bg-background text-xs border-none shadow-none focus-visible:ring-1"
              />
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Metric 
          label="Omzet Kotor" 
          value={formatIDR(gross)} 
          icon={Coins} 
          iconColor="text-amber-500" 
          bgColor="bg-amber-500/10" 
        />
        <Metric 
          label="Potongan Platform" 
          value={formatIDR(platformFee)} 
          icon={Percent} 
          iconColor="text-orange-500" 
          bgColor="bg-orange-500/10" 
        />
        <Metric 
          label="HPP" 
          value={formatIDR(cogs)} 
          icon={Receipt} 
          iconColor="text-blue-500" 
          bgColor="bg-blue-500/10" 
        />
        <Metric 
          label="Operasional" 
          value={formatIDR(opex)} 
          icon={Wallet} 
          iconColor="text-red-500" 
          bgColor="bg-red-500/10" 
        />
        <Metric 
          label="Laba Bersih" 
          value={formatIDR(netProfit)} 
          icon={TrendingUp} 
          iconColor="text-emerald-500" 
          bgColor="bg-emerald-500/10" 
          accent 
        />
      </div>

      <Card className="rounded-2xl border-muted/50 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-muted/20">
          <div className="space-y-1">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Coins className="w-4.5 h-4.5 text-honey" />
              Akumulasi Metode Pembayaran
            </CardTitle>
            <p className="text-xs text-muted-foreground">Volume transaksi kotor berdasarkan cara pembayaran konsumen</p>
          </div>
          <div className="bg-honey/10 text-honey p-1.5 rounded-lg border border-honey/20">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* COD */}
            <div className="space-y-3 p-5 bg-amber-500/5 rounded-xl border border-amber-500/10">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-amber-600 uppercase tracking-wider flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-amber-500" />
                  COD
                </span>
                <span className="text-[10px] bg-amber-500/10 text-amber-700 px-1.5 py-0.5 rounded font-semibold">{codCount} pesanan</span>
              </div>
              <div className="text-2xl font-extrabold text-foreground mt-1">{formatIDR(codTotal)}</div>
              <div className="w-full bg-amber-500/10 h-1.5 rounded-full overflow-hidden mt-2">
                <div 
                  className="bg-amber-500 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${gross > 0 ? (codTotal / gross) * 100 : 0}%` }}
                />
              </div>
              <div className="text-[10px] text-muted-foreground mt-1 text-right">
                {gross > 0 ? ((codTotal / gross) * 100).toFixed(1) : 0}% dari total omzet kotor
              </div>
            </div>

            {/* TRANSFER */}
            <div className="space-y-3 p-5 bg-blue-500/5 rounded-xl border border-blue-500/10">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-blue-600 uppercase tracking-wider flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4 text-blue-500" />
                  Transfer
                </span>
                <span className="text-[10px] bg-blue-500/10 text-blue-700 px-1.5 py-0.5 rounded font-semibold">{transferCount} pesanan</span>
              </div>
              <div className="text-2xl font-extrabold text-foreground mt-1">{formatIDR(transferTotal)}</div>
              <div className="w-full bg-blue-500/10 h-1.5 rounded-full overflow-hidden mt-2">
                <div 
                  className="bg-blue-500 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${gross > 0 ? (transferTotal / gross) * 100 : 0}%` }}
                />
              </div>
              <div className="text-[10px] text-muted-foreground mt-1 text-right">
                {gross > 0 ? ((transferTotal / gross) * 100).toFixed(1) : 0}% dari total omzet kotor
              </div>
            </div>

            {/* CASH */}
            <div className="space-y-3 p-5 bg-emerald-500/5 rounded-xl border border-emerald-500/10">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider flex items-center gap-1.5">
                  <Banknote className="w-4 h-4 text-emerald-500" />
                  Cash
                </span>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-700 px-1.5 py-0.5 rounded font-semibold">{cashCount} pesanan</span>
              </div>
              <div className="text-2xl font-extrabold text-foreground mt-1">{formatIDR(cashTotal)}</div>
              <div className="w-full bg-emerald-500/10 h-1.5 rounded-full overflow-hidden mt-2">
                <div 
                  className="bg-emerald-500 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${gross > 0 ? (cashTotal / gross) * 100 : 0}%` }}
                />
              </div>
              <div className="text-[10px] text-muted-foreground mt-1 text-right">
                {gross > 0 ? ((cashTotal / gross) * 100).toFixed(1) : 0}% dari total omzet kotor
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="rounded-2xl border-muted/50 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-muted/20">
            <div className="space-y-1">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <TrendingUp className="w-4.5 h-4.5 text-honey" />
                Tren Laba Harian
              </CardTitle>
              <p className="text-xs text-muted-foreground">Fluktuasi laba bersih operasional harian Anda</p>
            </div>
            <div className="bg-honey/10 text-honey p-1.5 rounded-lg border border-honey/20">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
          </CardHeader>
          <CardContent className="p-6 h-80 pt-8">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="labaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="oklch(0.77 0.15 77)" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="oklch(0.77 0.15 77)" stopOpacity={0.0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted/30" />
                <XAxis 
                  dataKey="date" 
                  fontSize={11} 
                  tickLine={false} 
                  axisLine={false}
                  dy={10}
                  className="fill-muted-foreground/75 font-medium"
                  tickFormatter={(v) => {
                    const parts = v.split("-");
                    if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
                    return v;
                  }}
                />
                <YAxis 
                  fontSize={11} 
                  tickLine={false} 
                  axisLine={false}
                  dx={-10}
                  className="fill-muted-foreground/75 font-medium"
                  tickFormatter={(v) => {
                    if (v >= 1000000) return `${(v/1000000).toFixed(1)}M`;
                    if (v >= 1000) return `${(v/1000).toFixed(0)}rb`;
                    return v;
                  }}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'oklch(0.77 0.15 77)', strokeWidth: 1, strokeDasharray: '4 4' }} />
                <Area 
                  type="monotone"
                  dataKey="laba" 
                  stroke="oklch(0.77 0.15 77)" 
                  fill="url(#labaGrad)" 
                  strokeWidth={3}
                  dot={{ stroke: 'oklch(0.77 0.15 77)', strokeWidth: 2, fill: 'var(--background)', r: 4 }}
                  activeDot={{ stroke: 'oklch(0.77 0.15 77)', strokeWidth: 2, fill: 'oklch(0.77 0.15 77)', r: 6 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-muted/50 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-muted/20">
            <div className="space-y-1">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Target className="w-4.5 h-4.5 text-emerald-500" />
                ROAS Harian
              </CardTitle>
              <p className="text-xs text-muted-foreground">Performa rasio omzet WA dibandingkan Meta Ads</p>
            </div>
            <div className="bg-emerald-500/10 text-emerald-600 p-1.5 rounded-lg border border-emerald-500/20">
              <ArrowUpRight className="w-3.5 h-3.5" />
            </div>
          </CardHeader>
          <CardContent className="p-6 h-80 pt-8">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={roas} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="roasGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="oklch(0.72 0.18 140)" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="oklch(0.72 0.18 140)" stopOpacity={0.0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted/30" />
                <XAxis 
                  dataKey="date" 
                  fontSize={11} 
                  tickLine={false} 
                  axisLine={false}
                  dy={10}
                  className="fill-muted-foreground/75 font-medium"
                  tickFormatter={(v) => {
                    const parts = v.split("-");
                    if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
                    return v;
                  }}
                />
                <YAxis 
                  fontSize={11} 
                  tickLine={false} 
                  axisLine={false}
                  dx={-10}
                  className="fill-muted-foreground/75 font-medium"
                  tickFormatter={(v) => `${v}x`}
                />
                <Tooltip content={<CustomRoasTooltip />} cursor={{ stroke: 'oklch(0.72 0.18 140)', strokeWidth: 1, strokeDasharray: '4 4' }} />
                <Area 
                  type="monotone"
                  dataKey="roas" 
                  stroke="oklch(0.72 0.18 140)" 
                  fill="url(#roasGrad)" 
                  strokeWidth={3}
                  dot={{ stroke: 'oklch(0.72 0.18 140)', strokeWidth: 2, fill: 'var(--background)', r: 4 }}
                  activeDot={{ stroke: 'oklch(0.72 0.18 140)', strokeWidth: 2, fill: 'oklch(0.72 0.18 140)', r: 6 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
  iconColor,
  bgColor,
  accent,
}: {
  label: string;
  value: string;
  icon: any;
  iconColor: string;
  bgColor: string;
  accent?: boolean;
}) {
  return (
    <Card className={`overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 border-muted/50 rounded-2xl ${
      accent 
        ? "border-honey/30 bg-gradient-to-br from-honey/10 via-background to-background shadow-honey/5" 
        : "hover:border-foreground/10 bg-card"
    }`}>
      <CardContent className="p-5">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
            <div className="text-xl font-extrabold tracking-tight mt-1">{value}</div>
          </div>
          <div className={`p-2.5 rounded-xl ${bgColor} ${iconColor} shadow-sm border border-border/10`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

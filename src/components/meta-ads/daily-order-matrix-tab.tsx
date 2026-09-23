import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatIDR } from "@/lib/theme";
import { 
  Users, UserPlus, RefreshCw, ShoppingBag, ShoppingCart, 
  TrendingUp, DollarSign, Sparkles, ShieldCheck, Eye, 
  Calendar, Layers, CheckCircle2, MessageSquare, Percent,
  ArrowUpRight, PiggyBank, ArrowRight
} from "lucide-react";
import { 
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, 
  CartesianGrid, Tooltip as RechartsTooltip, Legend 
} from "recharts";
import { 
  getDailyOrderMatrix, 
  getDailyOrderMatrixDetails, 
  DailyOrderMatrixRow, 
  OrderMatrixSummary,
  OrderMatrixDetailItem
} from "@/lib/order-matrix.functions";
import { MetaDateRangePicker, MetaDateRange } from "./meta-date-range-picker";

function formatDateIndo(dateStr: string) {
  if (!dateStr) return "-";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const year = parts[0];
  const monthIdx = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  return `${day} ${months[monthIdx]} ${year}`;
}

export function DailyOrderMatrixTab() {
  const todayWib = useMemo(() => {
    const d = new Date(Date.now() + 7 * 3600000);
    return d.toISOString().slice(0, 10);
  }, []);

  const default14dStart = useMemo(() => {
    const d = new Date(Date.now() + 7 * 3600000 - 13 * 86400000);
    return d.toISOString().slice(0, 10);
  }, []);

  const [dateRange, setDateRange] = useState<MetaDateRange>({
    startDate: default14dStart,
    endDate: todayWib,
    presetKey: "last_14d",
    presetLabel: "14 hari terakhir",
  });

  const [selectedDetailDate, setSelectedDetailDate] = useState<string | null>(null);
  const [detailFilterCategory, setDetailFilterCategory] = useState<string>("all");

  // 1. Query Daily Order Matrix Data
  const { 
    data: matrixData, 
    isLoading, 
    isFetching, 
    refetch 
  } = useQuery({
    queryKey: ["daily-order-matrix", dateRange.startDate, dateRange.endDate],
    queryFn: async () => {
      return await getDailyOrderMatrix({
        data: {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          limit: 100,
        },
      });
    },
  });

  // 2. Query Detail Order Customers for Selected Date
  const { 
    data: detailList, 
    isLoading: loadingDetails 
  } = useQuery({
    queryKey: ["daily-order-matrix-details", selectedDetailDate, detailFilterCategory],
    queryFn: async () => {
      if (!selectedDetailDate) return [];
      return await getDailyOrderMatrixDetails({ 
        data: { 
          date: selectedDetailDate,
          category: detailFilterCategory 
        } 
      });
    },
    enabled: !!selectedDetailDate
  });

  const dailyRows: DailyOrderMatrixRow[] = matrixData?.daily || [];
  const summary: OrderMatrixSummary | undefined = matrixData?.summary;

  // Chart Data preparation (reversed for chronological timeline)
  const chartData = [...dailyRows].reverse().map((r) => ({
    name: formatDateIndo(r.tanggal).replace(` ${new Date().getFullYear()}`, ""),
    totalOrders: r.total_orders,
    pelangganBaru: r.baru_total_orders,
    repeatCrm: r.repeat_crm_orders,
    repeatAds: r.repeat_ads_orders,
    shopee: r.shopee_orders,
    tiktok: r.tiktok_orders,
    omzetRepeatCrm: r.repeat_crm_net_revenue,
    omzetRepeatAds: r.repeat_ads_net_revenue,
    adSavings: r.estimated_ad_savings,
  }));

  return (
    <div className="space-y-6">
      {/* Top Header & Range Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-blue-500/10 via-indigo-500/5 to-transparent border border-blue-500/20">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-blue-600 text-white shadow-sm">
              <Layers className="w-5 h-5" />
            </span>
            <h3 className="text-xl font-bold tracking-tight text-foreground">
              Matriks Harian Order & Retensi Pelanggan
            </h3>
            <Badge variant="outline" className="border-blue-500/30 text-blue-700 dark:text-blue-300 text-xs font-semibold bg-blue-50 dark:bg-blue-950/40">
              Uang Bersih Kas
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl leading-relaxed">
            Pemetaan harian pesanan riil: Pelanggan Baru vs Repeat Order (Iklan vs CRM / Tanpa Iklan) vs Marketplace (Shopee & TikTok), lengkap dengan perbandingan penghematan biaya iklan.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <MetaDateRangePicker
            value={dateRange}
            onChange={(range) => setDateRange(range)}
            onApply={() => refetch()}
            isLoading={isFetching}
          />

          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-9 px-3 gap-1.5 border-border shadow-xs"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin text-primary" : "text-muted-foreground"}`} />
            <span className="hidden sm:inline">Segarkan</span>
          </Button>
        </div>
      </div>

      {/* 5 Top Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Card 1: Pelanggan Baru */}
        <Card className="border border-border/80 shadow-xs hover:shadow-md transition-all">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <UserPlus className="w-3.5 h-3.5 text-blue-500" /> Pelanggan Baru
              </span>
              <Badge variant="secondary" className="text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold">
                {summary && summary.total_orders > 0 
                  ? `${((summary.total_baru_orders / summary.total_orders) * 100).toFixed(0)}% Order`
                  : "0%"}
              </Badge>
            </div>
            <div>
              <div className="text-2xl font-black tracking-tight text-foreground">
                {summary?.total_baru_orders.toLocaleString("id-ID") || 0}
                <span className="text-xs font-normal text-muted-foreground ml-1">order</span>
              </div>
              <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 mt-0.5">
                {formatIDR(summary?.total_baru_net_revenue || 0)}
              </div>
            </div>
            <div className="pt-1.5 border-t border-border/50 text-[11px] text-muted-foreground flex items-center justify-between">
              <span>Avg Basket:</span>
              <span className="font-semibold text-foreground">
                {summary && summary.total_baru_orders > 0 
                  ? formatIDR(summary.total_baru_net_revenue / summary.total_baru_orders)
                  : "-"}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Repeat Order CRM (Tanpa Iklan) - HIGHLIGHT */}
        <Card className="border-2 border-emerald-500/40 bg-gradient-to-b from-emerald-500/5 to-transparent shadow-xs hover:shadow-md transition-all">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" /> Repeat - CRM (Tanpa Iklan)
              </span>
              <Badge variant="outline" className="text-[10px] bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-bold">
                Rp 0 Ads
              </Badge>
            </div>
            <div>
              <div className="text-2xl font-black tracking-tight text-emerald-700 dark:text-emerald-300">
                {summary?.total_repeat_crm_orders.toLocaleString("id-ID") || 0}
                <span className="text-xs font-normal text-muted-foreground ml-1">order</span>
              </div>
              <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                {formatIDR(summary?.total_repeat_crm_net_revenue || 0)}
              </div>
            </div>
            <div className="pt-1.5 border-t border-emerald-500/20 text-[11px] text-muted-foreground flex items-center justify-between">
              <span>Share Repeat:</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                {summary?.overall_repeat_crm_share_pct || 0}%
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Repeat Order Dari Iklan */}
        <Card className="border border-border/80 shadow-xs hover:shadow-md transition-all">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Repeat - Dari Iklan
              </span>
              <Badge variant="secondary" className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold">
                Lead Scalev
              </Badge>
            </div>
            <div>
              <div className="text-2xl font-black tracking-tight text-foreground">
                {summary?.total_repeat_ads_orders.toLocaleString("id-ID") || 0}
                <span className="text-xs font-normal text-muted-foreground ml-1">order</span>
              </div>
              <div className="text-xs font-semibold text-amber-600 dark:text-amber-400 mt-0.5">
                {formatIDR(summary?.total_repeat_ads_net_revenue || 0)}
              </div>
            </div>
            <div className="pt-1.5 border-t border-border/50 text-[11px] text-muted-foreground flex items-center justify-between">
              <span>Avg Basket:</span>
              <span className="font-semibold text-foreground">
                {summary && summary.total_repeat_ads_orders > 0 
                  ? formatIDR(summary.total_repeat_ads_net_revenue / summary.total_repeat_ads_orders)
                  : "-"}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Marketplace (Shopee & TikTok) */}
        <Card className="border border-border/80 shadow-xs hover:shadow-md transition-all">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <ShoppingBag className="w-3.5 h-3.5 text-orange-500" /> Shopee & TikTok
              </span>
              <Badge variant="secondary" className="text-[10px] bg-orange-500/10 text-orange-600 dark:text-orange-400 font-bold">
                Marketplace
              </Badge>
            </div>
            <div>
              <div className="text-2xl font-black tracking-tight text-foreground">
                {((summary?.total_shopee_orders || 0) + (summary?.total_tiktok_orders || 0)).toLocaleString("id-ID")}
                <span className="text-xs font-normal text-muted-foreground ml-1">order</span>
              </div>
              <div className="text-xs font-semibold text-orange-600 dark:text-orange-400 mt-0.5">
                {formatIDR((summary?.total_shopee_net_revenue || 0) + (summary?.total_tiktok_net_revenue || 0))}
              </div>
            </div>
            <div className="pt-1.5 border-t border-border/50 text-[11px] text-muted-foreground flex items-center justify-between">
              <span className="truncate">Shopee: {summary?.total_shopee_orders || 0}</span>
              <span className="truncate">TikTok: {summary?.total_tiktok_orders || 0}</span>
            </div>
          </CardContent>
        </Card>

        {/* Card 5: Komparasi Efisiensi & Hemat Ads */}
        <Card className="border-2 border-indigo-500/40 bg-gradient-to-b from-indigo-500/5 to-transparent shadow-xs hover:shadow-md transition-all">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                <PiggyBank className="w-3.5 h-3.5" /> Hemat Biaya Iklan (CRM)
              </span>
              <Badge variant="outline" className="text-[10px] bg-indigo-500/15 border-indigo-500/30 text-indigo-700 dark:text-indigo-300 font-bold">
                Profit Value
              </Badge>
            </div>
            <div>
              <div className="text-2xl font-black tracking-tight text-indigo-700 dark:text-indigo-300">
                {formatIDR(summary?.total_ad_savings_by_crm || 0)}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Terselamatkan oleh CRM tanpa bayar ads
              </p>
            </div>
            <div className="pt-1.5 border-t border-indigo-500/20 text-[11px] text-muted-foreground flex items-center justify-between">
              <span>Rasio Retensi Bebas Ads:</span>
              <span className="font-bold text-indigo-600 dark:text-indigo-400">
                {summary?.overall_repeat_crm_share_pct || 0}%
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Visual Chart Comparison */}
      <Card className="border border-border/80 shadow-xs">
        <CardHeader className="pb-2 flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Grafik Komposisi Pesanan & Perbandingan Repeat Order Harian
            </CardTitle>
            <CardDescription className="text-xs">
              Melihat volume pesanan harian berdasarkan Pelanggan Baru, Repeat Order CRM ($0 ads), Repeat Iklan, dan Marketplace.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-blue-500 inline-block" /> Pelanggan Baru
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-emerald-500 inline-block" /> Repeat CRM ($0 Ads)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-amber-500 inline-block" /> Repeat Iklan
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-orange-500 inline-block" /> Shopee
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-pink-500 inline-block" /> TikTok
            </span>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#88888820" vertical={false} />
                <XAxis dataKey="name" stroke="#888888" fontSize={11} tickLine={false} />
                <YAxis stroke="#888888" fontSize={11} tickLine={false} />
                <RechartsTooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur-xs text-xs space-y-2 border-border min-w-[220px]">
                          <div className="font-bold text-foreground border-b pb-1">
                            {label} (Total: {data.totalOrders} order)
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between text-blue-600 dark:text-blue-400">
                              <span>Pelanggan Baru:</span>
                              <span className="font-semibold">{data.pelangganBaru} order</span>
                            </div>
                            <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                              <span>Repeat CRM ($0 Ads):</span>
                              <span className="font-semibold">{data.repeatCrm} order ({formatIDR(data.omzetRepeatCrm)})</span>
                            </div>
                            <div className="flex justify-between text-amber-600 dark:text-amber-400">
                              <span>Repeat Iklan:</span>
                              <span className="font-semibold">{data.repeatAds} order ({formatIDR(data.omzetRepeatAds)})</span>
                            </div>
                            <div className="flex justify-between text-orange-600 dark:text-orange-400">
                              <span>Shopee:</span>
                              <span className="font-semibold">{data.shopee} order</span>
                            </div>
                            <div className="flex justify-between text-pink-600 dark:text-pink-400">
                              <span>TikTok:</span>
                              <span className="font-semibold">{data.tiktok} order</span>
                            </div>
                            {data.adSavings > 0 && (
                              <div className="pt-1.5 border-t flex justify-between text-indigo-600 dark:text-indigo-400 font-bold">
                                <span>Hemat Biaya Ads:</span>
                                <span>{formatIDR(data.adSavings)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="pelangganBaru" name="Pelanggan Baru" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                <Bar dataKey="repeatCrm" name="Repeat CRM ($0 Ads)" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                <Bar dataKey="repeatAds" name="Repeat Iklan" stackId="a" fill="#f59e0b" radius={[0, 0, 0, 0]} />
                <Bar dataKey="shopee" name="Shopee" stackId="a" fill="#f97316" radius={[0, 0, 0, 0]} />
                <Bar dataKey="tiktok" name="TikTok" stackId="a" fill="#ec4899" radius={[4, 4, 0, 0]} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Daily Breakdown Table */}
      <Card className="border border-border/80 shadow-xs">
        <CardHeader className="pb-3 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              Tabel Matriks Harian Detail
            </CardTitle>
            <CardDescription className="text-xs">
              Rincian orderan dan omzet bersih riil kas per hari. Klik tombol "Detail" untuk membuka daftar nama pelanggan & invoice.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/40 text-[11px] uppercase font-bold text-muted-foreground">
                <TableRow>
                  <TableHead className="w-[120px]">Tanggal</TableHead>
                  <TableHead className="text-center">Total Order</TableHead>
                  <TableHead className="text-right">Total Uang Bersih</TableHead>
                  <TableHead className="text-center text-blue-600 dark:text-blue-400">1. Pelanggan Baru</TableHead>
                  <TableHead className="text-center text-emerald-600 dark:text-emerald-400 bg-emerald-500/5">
                    2. Repeat CRM (No Ads)
                  </TableHead>
                  <TableHead className="text-center text-amber-600 dark:text-amber-400">
                    2. Repeat (Iklan)
                  </TableHead>
                  <TableHead className="text-center text-orange-600 dark:text-orange-400">3. Shopee</TableHead>
                  <TableHead className="text-center text-pink-600 dark:text-pink-400">4. TikTok</TableHead>
                  <TableHead className="text-center text-indigo-600 dark:text-indigo-400">
                    Komparasi Repeat & Hemat Ads
                  </TableHead>
                  <TableHead className="text-center w-[90px]">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="text-xs">
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-32 text-center text-muted-foreground">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                      Memuat matriks order harian...
                    </TableCell>
                  </TableRow>
                ) : dailyRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-28 text-center text-muted-foreground">
                      Tidak ada pesanan ditemukan pada rentang tanggal ini.
                    </TableCell>
                  </TableRow>
                ) : (
                  dailyRows.map((row) => (
                    <TableRow key={row.tanggal} className="hover:bg-muted/30 transition-colors">
                      {/* Tanggal */}
                      <TableCell className="font-semibold whitespace-nowrap">
                        {formatDateIndo(row.tanggal)}
                      </TableCell>

                      {/* Total Order */}
                      <TableCell className="text-center font-bold">
                        <Badge variant="outline" className="font-bold text-foreground">
                          {row.total_orders}
                        </Badge>
                      </TableCell>

                      {/* Total Uang Bersih */}
                      <TableCell className="text-right font-black text-foreground">
                        {formatIDR(row.total_net_revenue)}
                      </TableCell>

                      {/* 1. Pelanggan Baru */}
                      <TableCell className="text-center">
                        <div className="font-semibold text-blue-600 dark:text-blue-400">
                          {row.baru_total_orders} <span className="text-[10px] text-muted-foreground">ord</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {formatIDR(row.baru_net_revenue)}
                        </div>
                      </TableCell>

                      {/* 2. Repeat CRM (Tanpa Iklan) */}
                      <TableCell className="text-center bg-emerald-500/5">
                        <div className="font-bold text-emerald-700 dark:text-emerald-300">
                          {row.repeat_crm_orders} <span className="text-[10px] text-muted-foreground">ord</span>
                        </div>
                        <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                          {formatIDR(row.repeat_crm_net_revenue)}
                        </div>
                      </TableCell>

                      {/* 2. Repeat Dari Iklan */}
                      <TableCell className="text-center">
                        <div className="font-semibold text-amber-600 dark:text-amber-400">
                          {row.repeat_ads_orders} <span className="text-[10px] text-muted-foreground">ord</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {formatIDR(row.repeat_ads_net_revenue)}
                        </div>
                      </TableCell>

                      {/* 3. Shopee */}
                      <TableCell className="text-center">
                        <div className="font-semibold text-orange-600 dark:text-orange-400">
                          {row.shopee_orders} <span className="text-[10px] text-muted-foreground">ord</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {formatIDR(row.shopee_net_revenue)}
                        </div>
                      </TableCell>

                      {/* 4. TikTok */}
                      <TableCell className="text-center">
                        <div className="font-semibold text-pink-600 dark:text-pink-400">
                          {row.tiktok_orders} <span className="text-[10px] text-muted-foreground">ord</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {formatIDR(row.tiktok_net_revenue)}
                        </div>
                      </TableCell>

                      {/* Komparasi Repeat */}
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center justify-center">
                          <span className="font-bold text-xs text-foreground">
                            {row.repeat_total_orders > 0 ? `${row.repeat_crm_share_pct}% CRM` : "-"}
                          </span>
                          {row.estimated_ad_savings > 0 ? (
                            <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium">
                              Hemat {formatIDR(row.estimated_ad_savings)}
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">-</span>
                          )}
                        </div>
                      </TableCell>

                      {/* Aksi Button */}
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedDetailDate(row.tanggal);
                            setDetailFilterCategory("all");
                          }}
                          className="h-7 px-2 text-[11px] gap-1 hover:bg-muted"
                        >
                          <Eye className="w-3.5 h-3.5 text-primary" />
                          <span>Detail</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Customer Detail Dialog */}
      <Dialog open={!!selectedDetailDate} onOpenChange={(open) => !open && setSelectedDetailDate(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Users className="w-5 h-5 text-primary" />
              Daftar Pesanan - Tanggal {formatDateIndo(selectedDetailDate || "")}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Rincian semua pesanan riil pada tanggal terpilih beserta identifikasi klasifikasi pelanggan & kanal.
            </DialogDescription>
          </DialogHeader>

          {/* Filter Categories Inside Dialog */}
          <div className="pt-2">
            <Tabs 
              value={detailFilterCategory} 
              onValueChange={setDetailFilterCategory}
              className="w-full"
            >
              <TabsList className="bg-muted/60 p-1 rounded-lg h-auto flex flex-wrap gap-1">
                <TabsTrigger value="all" className="text-xs py-1.5 px-3">
                  Semua ({detailList?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="pelanggan_baru" className="text-xs py-1.5 px-3 text-blue-600">
                  Pelanggan Baru
                </TabsTrigger>
                <TabsTrigger value="repeat_crm" className="text-xs py-1.5 px-3 text-emerald-600">
                  Repeat CRM (No Ads)
                </TabsTrigger>
                <TabsTrigger value="repeat_ads" className="text-xs py-1.5 px-3 text-amber-600">
                  Repeat Iklan
                </TabsTrigger>
                <TabsTrigger value="shopee" className="text-xs py-1.5 px-3 text-orange-600">
                  Shopee
                </TabsTrigger>
                <TabsTrigger value="tiktok" className="text-xs py-1.5 px-3 text-pink-600">
                  TikTok
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Orders Table Inside Dialog */}
          <div className="flex-1 overflow-y-auto border rounded-xl mt-3">
            <Table>
              <TableHeader className="bg-muted/40 text-[11px] uppercase font-bold sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="w-[180px]">Pelanggan</TableHead>
                  <TableHead>Kanal / Ekspedisi</TableHead>
                  <TableHead className="text-center">Urutan Beli</TableHead>
                  <TableHead className="text-center">Kategori Order</TableHead>
                  <TableHead className="text-right">Uang Bersih Kas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="text-xs">
                {loadingDetails ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
                      Memuat rincian pesanan...
                    </TableCell>
                  </TableRow>
                ) : !detailList || detailList.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      Tidak ada pesanan pada kategori ini.
                    </TableCell>
                  </TableRow>
                ) : (
                  detailList.map((item) => (
                    <TableRow key={item.id} className="hover:bg-muted/20">
                      <TableCell>
                        <div className="font-semibold text-foreground">{item.customer_name}</div>
                        <div className="text-[11px] text-muted-foreground">{item.customer_phone}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] font-medium capitalize">
                          {item.channel}
                        </Badge>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {item.expedition} • {item.payment_method}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge 
                          variant="secondary" 
                          className={`text-[10px] font-bold ${
                            item.customer_seq === 1 
                              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" 
                              : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          }`}
                        >
                          Ke-{item.customer_seq}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-semibold ${
                            item.category === "pelanggan_baru"
                              ? "border-blue-500/40 text-blue-600 dark:text-blue-400 bg-blue-500/5"
                              : item.category === "repeat_crm"
                              ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 font-bold"
                              : item.category === "repeat_ads"
                              ? "border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/5"
                              : item.category === "shopee"
                              ? "border-orange-500/40 text-orange-600 dark:text-orange-400 bg-orange-500/5"
                              : item.category === "tiktok"
                              ? "border-pink-500/40 text-pink-600 dark:text-pink-400 bg-pink-500/5"
                              : "border-border text-muted-foreground"
                          }`}
                        >
                          {item.category_label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-bold text-foreground">
                        {formatIDR(item.net_revenue)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-end pt-3">
            <Button variant="outline" size="sm" onClick={() => setSelectedDetailDate(null)}>
              Tutup
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { formatIDR } from "@/lib/theme";
import { 
  Target, TrendingUp, TrendingDown, Users, Package, RefreshCw, 
  Eye, CheckCircle2, AlertTriangle, MessageSquare, DollarSign, Calendar, Sparkles, ShieldCheck, ShoppingCart
} from "lucide-react";
import { 
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, 
  CartesianGrid, Tooltip as RechartsTooltip, Legend 
} from "recharts";
import { 
  getRealAdsCprAnalytics, 
  getRealAdsClosingDetails, 
  DailyAdsCprMetric, 
  RealAdsClosingDetail 
} from "@/lib/meta-ads.functions";

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

export function CprRealTab() {
  const [dateRange, setDateRange] = useState<"1d" | "7d" | "14d" | "30d">("7d");
  const [selectedDetailDate, setSelectedDetailDate] = useState<string | null>(null);

  // 1. Query Real Ads CPR Data
  const { 
    data: analyticsData, 
    isLoading, 
    isFetching, 
    refetch 
  } = useQuery({
    queryKey: ["real-ads-cpr-analytics", dateRange],
    queryFn: async () => {
      const today = new Date();
      let startDate = "";
      const endDate = today.toISOString().slice(0, 10);

      if (dateRange === "1d") {
        startDate = endDate;
      } else if (dateRange === "7d") {
        const d = new Date(today.getTime() - 6 * 86400000);
        startDate = d.toISOString().slice(0, 10);
      } else if (dateRange === "14d") {
        const d = new Date(today.getTime() - 13 * 86400000);
        startDate = d.toISOString().slice(0, 10);
      } else if (dateRange === "30d") {
        const d = new Date(today.getTime() - 29 * 86400000);
        startDate = d.toISOString().slice(0, 10);
      }

      const limit = dateRange === "30d" ? 30 : dateRange === "14d" ? 14 : 7;
      return await getRealAdsCprAnalytics({ data: { startDate, endDate, limit } });
    }
  });

  // 2. Query Detail Closing Customers for Selected Date
  const { 
    data: detailList, 
    isLoading: loadingDetails 
  } = useQuery({
    queryKey: ["real-ads-closing-details", selectedDetailDate],
    queryFn: async () => {
      if (!selectedDetailDate) return [];
      return await getRealAdsClosingDetails({ data: { date: selectedDetailDate } });
    },
    enabled: !!selectedDetailDate
  });

  const dailyRows: DailyAdsCprMetric[] = analyticsData?.daily || [];
  const summary = analyticsData?.summary;

  // Format chart data (reverse to chronological order for visual graph)
  const chartData = [...dailyRows].reverse().map((r) => ({
    name: formatDateIndo(r.tanggal).replace(` ${new Date().getFullYear()}`, ""),
    adSpend: r.ad_spend,
    uangBersih: r.omzet_murni,
    netProfit: r.net_profit_iklan,
    cprReal: r.cpr_real_closing,
    closingCount: r.closed_orders
  }));

  return (
    <div className="space-y-6">
      {/* Top Header & Filter Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-500/20">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-500 text-white shadow-sm">
              <Target className="w-5 h-5" />
            </span>
            <h3 className="text-xl font-bold tracking-tight text-foreground">
              CPR Real Closing & Pure Ads Economics
            </h3>
            <Badge variant="outline" className="border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40">
              Uang Bersih Kas
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl leading-relaxed">
            Metrik efektivitas murni iklan Meta Ads. Menghubungkan biaya iklan dengan uang riil kas yang diterima (<strong className="text-foreground">Bersih setelah admin & ongkir</strong>) tanpa bias repeat order ataupun duplikasi form.
          </p>
        </div>

        {/* Action & Filter */}
        <div className="flex items-center gap-2.5 self-start md:self-auto">
          <Select value={dateRange} onValueChange={(val: any) => setDateRange(val)}>
            <SelectTrigger className="w-[145px] h-9 text-xs bg-background border-emerald-500/30 font-medium">
              <Calendar className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1d">Hari Ini (Live)</SelectItem>
              <SelectItem value="7d">7 Hari Terakhir</SelectItem>
              <SelectItem value="14d">14 Hari Terakhir</SelectItem>
              <SelectItem value="30d">30 Hari Terakhir</SelectItem>
            </SelectContent>
          </Select>

          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-9 px-3 text-xs border-emerald-500/30 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: CPR Real Closing */}
        <Card className="border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500" />
          <CardContent className="p-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              <span>CPR REAL CLOSING</span>
              <Target className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-extrabold text-foreground">
              {summary ? formatIDR(summary.overall_cpr_real) : "-"}
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-emerald-500/20">
              <span>Closing: <strong>{summary?.total_closing_orders ?? 0} Pesanan</strong></span>
              <Badge variant="secondary" className="text-[10px] bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300">
                Rate: {summary?.overall_closing_rate_pct ?? 0}%
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Laba Bersih Murni Iklan */}
        <Card className="border-blue-500/30 bg-blue-50/50 dark:bg-blue-950/20 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500" />
          <CardContent className="p-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-blue-800 dark:text-blue-300">
              <span>LABA BERSIH MURNI IKLAN</span>
              <DollarSign className="w-4 h-4 text-blue-600" />
            </div>
            <div className={`text-2xl font-extrabold ${summary && summary.total_net_profit_iklan >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
              {summary ? formatIDR(summary.total_net_profit_iklan) : "-"}
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-blue-500/20">
              <span>POAS: <strong className="text-foreground">{summary?.overall_poas ?? 0}x</strong></span>
              <Badge variant="secondary" className={`text-[10px] ${summary && summary.overall_poas >= 1.2 ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300" : "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300"}`}>
                {summary && summary.overall_poas >= 1.2 ? "Profit Sehat" : "Waspada Margin"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Uang Bersih Kas (Net Revenue) */}
        <Card className="border-teal-500/30 bg-teal-50/50 dark:bg-teal-950/20 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-teal-500" />
          <CardContent className="p-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-teal-800 dark:text-teal-300">
              <span>UANG BERSIH KAS (NET)</span>
              <Package className="w-4 h-4 text-teal-600" />
            </div>
            <div className="text-2xl font-extrabold text-foreground">
              {summary ? formatIDR(summary.total_omzet_murni) : "-"}
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-teal-500/20">
              <span>Volume: <strong>{summary?.total_volume_kg ?? 0} Kg</strong></span>
              <span className="text-[10px] text-muted-foreground font-medium">
                {summary?.overall_basket_size ?? 0} Kg/cust
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Total Ad Spend & CPL */}
        <Card className="border-purple-500/30 bg-purple-50/50 dark:bg-purple-950/20 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-purple-500" />
          <CardContent className="p-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-purple-800 dark:text-purple-300">
              <span>TOTAL AD SPEND MURNI</span>
              <Users className="w-4 h-4 text-purple-600" />
            </div>
            <div className="text-2xl font-extrabold text-foreground">
              {summary ? formatIDR(summary.total_ad_spend) : "-"}
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-purple-500/20">
              <span>{summary?.total_leads ?? 0} Leads</span>
              <Badge variant="secondary" className="text-[10px] bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-300">
                CPL: {summary ? formatIDR(summary.overall_cpl_real) : "-"}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Visual Trend Chart */}
      <Card className="shadow-sm border-border/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-500" /> Tren Finansial Iklan Murni (Spend vs Uang Bersih vs Laba)
          </CardTitle>
          <CardDescription className="text-xs">
            Perbandingan harian biaya bakar iklan dengan uang riil kas yang diterima (setelah admin & ongkir) serta laba bersihnya.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          {isLoading ? (
            <div className="h-64 flex items-center justify-center text-xs text-muted-foreground">
              Memuat grafik tren...
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-xs text-muted-foreground">
              Belum ada data untuk grafik pada periode ini.
            </div>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" opacity={0.6} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(val) => `${(val / 1000000).toFixed(1)}M`} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`} />
                  <RechartsTooltip 
                    formatter={(val: any, name: string) => [
                      name === "CPR Real" ? formatIDR(val) : formatIDR(val),
                      name === "adSpend" ? "Biaya Iklan" : name === "uangBersih" ? "Uang Bersih Kas" : name === "netProfit" ? "Laba Bersih" : name === "cprReal" ? "CPR Real" : name
                    ]}
                    labelStyle={{ fontWeight: "bold" }}
                    contentStyle={{ borderRadius: "8px", fontSize: "12px" }}
                  />
                  <Legend 
                    verticalAlign="top" 
                    height={36} 
                    iconType="circle" 
                    formatter={(val) => val === "adSpend" ? "Biaya Iklan (Spend)" : val === "uangBersih" ? "Uang Bersih Kas" : val === "netProfit" ? "Laba Bersih Iklan" : val === "cprReal" ? "CPR Real (kanan)" : val}
                  />
                  <Bar yAxisId="left" dataKey="uangBersih" fill="#10B981" radius={[4, 4, 0, 0]} opacity={0.85} barSize={24} />
                  <Bar yAxisId="left" dataKey="adSpend" fill="#F59E0B" radius={[4, 4, 0, 0]} opacity={0.85} barSize={24} />
                  <Line yAxisId="left" type="monotone" dataKey="netProfit" stroke="#3B82F6" strokeWidth={2.5} dot={{ r: 3 }} />
                  <Line yAxisId="right" type="monotone" dataKey="cprReal" stroke="#EF4444" strokeWidth={2} strokeDasharray="3 3" dot={{ r: 2 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Daily Breakdown Table */}
      <Card className="shadow-sm border-border/80">
        <CardHeader className="pb-3 flex flex-row items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-500" />
              Tabel Rekap Harian CPR Real & Pendapatan Bersih
            </CardTitle>
            <CardDescription className="text-xs">
              Semua order diatribusikan ke tanggal biaya iklan dibayarkan. Nilai mengacu pada uang bersih riil yang diterima.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500" /> &lt; 45k (Sehat)
            </span>
            <span className="flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400">
              <span className="w-2 h-2 rounded-full bg-amber-500" /> 45k - 65k (Sedang)
            </span>
            <span className="flex items-center gap-1 text-[11px] text-red-700 dark:text-red-400">
              <span className="w-2 h-2 rounded-full bg-red-500" /> &gt; 65k (Tinggi)
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 text-xs">
                  <TableHead>Tanggal</TableHead>
                  <TableHead className="text-right">Biaya Iklan</TableHead>
                  <TableHead className="text-center">Lead Iklan</TableHead>
                  <TableHead className="text-center">Closing</TableHead>
                  <TableHead className="text-center">Closing Rate</TableHead>
                  <TableHead className="text-right">CPR Real</TableHead>
                  <TableHead className="text-center">Basket Size</TableHead>
                  <TableHead className="text-right">Uang Bersih Riil</TableHead>
                  <TableHead className="text-right">Total HPP</TableHead>
                  <TableHead className="text-right">Laba Bersih Iklan</TableHead>
                  <TableHead className="text-center">POAS</TableHead>
                  <TableHead className="text-center">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-10 text-xs text-muted-foreground">
                      <RefreshCw className="w-4 h-4 animate-spin inline mr-2 text-emerald-500" />
                      Memuat kalkulasi CPR real iklan...
                    </TableCell>
                  </TableRow>
                ) : dailyRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-10 text-xs text-muted-foreground">
                      Tidak ada data iklan atau lead pada periode ini.
                    </TableCell>
                  </TableRow>
                ) : (
                  dailyRows.map((row) => {
                    const isProfit = row.net_profit_iklan >= 0;
                    const cprHealthy = row.cpr_real_closing > 0 && row.cpr_real_closing <= 45000;
                    const cprWarning = row.cpr_real_closing > 45000 && row.cpr_real_closing <= 65000;

                    return (
                      <TableRow key={row.tanggal} className="hover:bg-muted/30 text-xs">
                        {/* Tanggal */}
                        <TableCell className="font-semibold whitespace-nowrap">
                          {formatDateIndo(row.tanggal)}
                          {row.is_live_today && (
                            <Badge variant="secondary" className="ml-1.5 text-[9px] bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300">
                              Live Hari Ini
                            </Badge>
                          )}
                        </TableCell>

                        {/* Biaya Iklan */}
                        <TableCell className="text-right font-mono font-medium text-amber-700 dark:text-amber-400">
                          {row.ad_spend > 0 ? formatIDR(row.ad_spend) : row.is_live_today ? "Menunggu Sync 00:00" : "Rp 0"}
                        </TableCell>

                        {/* Leads */}
                        <TableCell className="text-center font-semibold">
                          {row.total_leads}
                        </TableCell>

                        {/* Closing */}
                        <TableCell className="text-center">
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 font-bold">
                            {row.closed_orders}
                          </Badge>
                          {row.manual_shopee_orders > 0 && (
                            <span className="text-[9px] text-muted-foreground block">
                              ({row.verified_orders} order + {row.manual_shopee_orders} shopee)
                            </span>
                          )}
                        </TableCell>

                        {/* Closing Rate */}
                        <TableCell className="text-center font-medium">
                          {row.closing_rate_pct}%
                        </TableCell>

                        {/* CPR Real Closing */}
                        <TableCell className="text-right font-mono font-extrabold text-foreground">
                          {row.cpr_real_closing > 0 ? (
                            <span className={`px-2 py-0.5 rounded text-xs ${cprHealthy ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300" : cprWarning ? "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300" : "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300"}`}>
                              {formatIDR(row.cpr_real_closing)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>

                        {/* Basket Size */}
                        <TableCell className="text-center">
                          <span className="font-semibold text-foreground">{row.avg_kg_per_order} Kg</span>
                          <span className="text-[10px] text-muted-foreground block">({row.total_kg} Kg total)</span>
                        </TableCell>

                        {/* Uang Bersih Riil */}
                        <TableCell className="text-right font-mono font-bold text-emerald-700 dark:text-emerald-400">
                          <div>{formatIDR(row.omzet_murni)}</div>
                          {row.omzet_kotor > row.omzet_murni && (
                            <div className="text-[10px] text-muted-foreground font-normal">
                              Kotor: {formatIDR(row.omzet_kotor)}
                            </div>
                          )}
                        </TableCell>

                        {/* HPP Total */}
                        <TableCell className="text-right font-mono text-muted-foreground">
                          {formatIDR(row.hpp_total)}
                        </TableCell>

                        {/* Laba Bersih Iklan */}
                        <TableCell className={`text-right font-mono font-bold whitespace-nowrap ${isProfit ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                          {row.ad_spend > 0 || row.omzet_murni > 0 ? (
                            <span>{isProfit ? "+" : ""}{formatIDR(row.net_profit_iklan)}</span>
                          ) : "-"}
                        </TableCell>

                        {/* POAS */}
                        <TableCell className="text-center">
                          {row.real_poas > 0 ? (
                            <Badge variant={row.real_poas >= 1.5 ? "success" : row.real_poas >= 1.0 ? "secondary" : "destructive"} className="text-[10px] font-bold">
                              {row.real_poas}x
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>

                        {/* Action Detail */}
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedDetailDate(row.tanggal)}
                            disabled={row.closed_orders === 0}
                            className="h-7 px-2 text-[11px] gap-1 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40 cursor-pointer"
                          >
                            <Eye className="w-3 h-3" />
                            Detail
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Dialog Modal: Detail Pembeli Closing Iklan */}
      <Dialog open={!!selectedDetailDate} onOpenChange={(open) => !open && setSelectedDetailDate(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-500" /> 
              Detail Pembeli Closing Iklan Tanggal {selectedDetailDate ? formatDateIndo(selectedDetailDate) : ""}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Daftar pelanggan yang murni berasal dari form Scalev iklan dan terkonfirmasi closing pesanan.
            </DialogDescription>
          </DialogHeader>

          {loadingDetails ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              <RefreshCw className="w-5 h-5 animate-spin inline mr-2 text-emerald-500" />
              Mengambil daftar pelanggan closing...
            </div>
          ) : !detailList || detailList.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              Tidak ada data pelanggan closing untuk tanggal ini.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs bg-muted/40 p-3 rounded-lg border">
                <div>
                  <span>Total Closing: <strong>{detailList.length} Pembeli</strong></span>
                  <span className="mx-2 text-muted-foreground">•</span>
                  <span>Volume: <strong>{detailList.reduce((sum, d) => sum + d.honey_kg_used, 0).toFixed(1)} Kg</strong></span>
                </div>
                <div className="text-left sm:text-right">
                  <div className="text-[10px] text-muted-foreground">
                    Omzet Kotor: {formatIDR(detailList.reduce((sum, d) => sum + d.subtotal_gross, 0))}
                  </div>
                  <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                    Uang Bersih Kas: {formatIDR(detailList.reduce((sum, d) => sum + d.net_revenue, 0))}
                  </div>
                </div>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 text-xs">
                      <TableHead className="w-10">No</TableHead>
                      <TableHead>Nama Pelanggan</TableHead>
                      <TableHead>No. WhatsApp</TableHead>
                      <TableHead className="text-center">Status / Kurir</TableHead>
                      <TableHead className="text-center">Volume</TableHead>
                      <TableHead className="text-right">Nilai Bersih Diterima</TableHead>
                      <TableHead className="text-center">Waktu Order</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailList.map((item, idx) => (
                      <TableRow key={item.order_id || item.lead_id || idx} className="text-xs hover:bg-muted/20">
                        <TableCell className="text-muted-foreground font-mono">{idx + 1}</TableCell>
                        <TableCell className="font-semibold">{item.customer_name || item.lead_name}</TableCell>
                        <TableCell className="font-mono text-muted-foreground">
                          {item.customer_phone || item.lead_phone}
                        </TableCell>
                        <TableCell className="text-center">
                          {item.is_manual_closing ? (
                            <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200">
                              🛒 Closing Shopee / Manual
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[9px] bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200">
                              ✅ Order Valid {item.expedition ? `• ${item.expedition}` : ""}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary" className="text-[10px] font-bold">
                            {item.honey_kg_used} Kg
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-emerald-700 dark:text-emerald-400">
                          <div>{formatIDR(item.net_revenue)}</div>
                          {item.subtotal_gross !== item.net_revenue && (
                            <div className="text-[10px] text-muted-foreground font-normal line-through">
                              {formatIDR(item.subtotal_gross)}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground text-[11px]">
                          {item.order_created_at ? new Date(item.order_created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

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
  Eye, CheckCircle2, AlertTriangle, MessageSquare, DollarSign, Calendar, Sparkles, ShieldCheck
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
    omzetMurni: r.omzet_murni,
    netProfit: r.net_profit_iklan,
    cprReal: r.cpr_real_closing,
    closingCount: r.closed_orders
  }));

  return (
    <div className="space-y-6">
      {/* Top Header & Filter Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-500/20">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Target className="w-5 h-5 text-emerald-500" /> CPR Real Closing & Efektivitas Murni Iklan
            </h3>
            <Badge variant="outline" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-xs font-semibold gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Murni Lead Scalev (Tanpa Repeat/CRM)
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed">
            Menghitung efektivitas biaya iklan Meta Ads terhadap pesanan riil yang terkonfirmasi closing dari form Scalev. 
            Sudah memperhitungkan basket size (beli &gt; 1 kg), HPP produk, dan biaya admin aggregator.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <Select value={dateRange} onValueChange={(val: any) => setDateRange(val)}>
            <SelectTrigger className="w-36 h-9 text-xs font-semibold bg-background">
              <Calendar className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="Pilih Periode" />
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
            className="h-9 px-3 gap-1.5 text-xs font-semibold hover:bg-emerald-500/10 hover:text-emerald-700"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin text-emerald-600" : ""}`} />
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

        {/* Card 3: Basket Size & Volume */}
        <Card className="border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-500" />
          <CardContent className="p-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-amber-800 dark:text-amber-300">
              <span>BASKET SIZE (RATA-RATA)</span>
              <Package className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-2xl font-extrabold text-foreground">
              {summary ? `${summary.overall_basket_size} Kg / Cust` : "-"}
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-amber-500/20">
              <span>Total Volume: <strong>{summary?.total_volume_kg ?? 0} Kg</strong></span>
              <span className="text-[10px] text-amber-700 dark:text-amber-400 font-medium">Order 1 s/d 2 botol</span>
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
            <TrendingUp className="w-4 h-4 text-emerald-500" /> Tren Finansial Iklan Murni (Spend vs Omzet vs Laba Bersih)
          </CardTitle>
          <CardDescription className="text-xs">
            Perbandingan harian biaya bakar iklan dengan pendapatan kotor dan laba bersih murni setelah dipotong HPP & admin.
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
                    formatter={(val: any, name: any) => [formatIDR(Number(val)), name]}
                    labelFormatter={(label) => `Tanggal: ${label}`}
                    contentStyle={{ borderRadius: '12px', fontSize: '12px', border: '1px solid #E2E8F0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                  <Bar yAxisId="left" dataKey="omzetMurni" name="Omzet Iklan Murni" fill="#10B981" radius={[4, 4, 0, 0]} barSize={20} />
                  <Bar yAxisId="left" dataKey="adSpend" name="Biaya Iklan (Spend)" fill="#F59E0B" radius={[4, 4, 0, 0]} barSize={20} />
                  <Line yAxisId="left" type="monotone" dataKey="netProfit" name="Laba Bersih Iklan" stroke="#3B82F6" strokeWidth={2.5} dot={{ r: 3 }} />
                  <Line yAxisId="right" type="monotone" dataKey="cprReal" name="CPR Real Closing" stroke="#8B5CF6" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detailed Ground-Truth Table */}
      <Card className="shadow-sm border-border/80">
        <CardHeader className="pb-3 flex flex-row items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-500" /> Rincian Harian Ground-Truth
            </CardTitle>
            <CardDescription className="text-xs">
              Setiap tanggal diverifikasi langsung dari lead Scalev yang terhubung ke pesanan riil.
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-xs font-mono">
            {dailyRows.length} Hari Tercatat
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 text-xs">
                  <TableHead>Tanggal</TableHead>
                  <TableHead className="text-right">Biaya Iklan</TableHead>
                  <TableHead className="text-center">Leads</TableHead>
                  <TableHead className="text-center">Closing</TableHead>
                  <TableHead className="text-center">Closing Rate</TableHead>
                  <TableHead className="text-right font-bold text-emerald-700 dark:text-emerald-400">CPR Real Closing</TableHead>
                  <TableHead className="text-center">Basket Size</TableHead>
                  <TableHead className="text-right">Omzet Murni</TableHead>
                  <TableHead className="text-right">HPP</TableHead>
                  <TableHead className="text-right font-bold">Laba Bersih Iklan</TableHead>
                  <TableHead className="text-center">POAS</TableHead>
                  <TableHead className="text-center w-24">Aksi</TableHead>
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

                        {/* Omzet Murni */}
                        <TableCell className="text-right font-mono font-medium text-foreground">
                          {formatIDR(row.omzet_murni)}
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
                            className="h-7 px-2 text-[11px] gap-1 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
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
              <div className="flex items-center justify-between text-xs bg-muted/40 p-3 rounded-lg border">
                <span>Total Closing Terdata: <strong>{detailList.length} Pembeli</strong></span>
                <span>Total Volume: <strong>{detailList.reduce((sum, d) => sum + d.honey_kg_used, 0).toFixed(1)} Kg</strong></span>
                <span>Total Omzet: <strong>{formatIDR(detailList.reduce((sum, d) => sum + d.subtotal_gross, 0))}</strong></span>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 text-xs">
                      <TableHead className="w-10">No</TableHead>
                      <TableHead>Nama Pelanggan</TableHead>
                      <TableHead>No. WhatsApp</TableHead>
                      <TableHead className="text-center">Volume</TableHead>
                      <TableHead className="text-right">Nilai Order</TableHead>
                      <TableHead className="text-center">Waktu Order</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailList.map((item, idx) => (
                      <TableRow key={item.order_id || idx} className="text-xs hover:bg-muted/20">
                        <TableCell className="text-muted-foreground font-mono">{idx + 1}</TableCell>
                        <TableCell className="font-semibold">{item.customer_name || item.lead_name}</TableCell>
                        <TableCell className="font-mono text-muted-foreground">
                          {item.customer_phone || item.lead_phone}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary" className="text-[10px] font-bold">
                            {item.honey_kg_used} Kg
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono font-medium text-emerald-700 dark:text-emerald-400">
                          {formatIDR(item.subtotal_gross)}
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

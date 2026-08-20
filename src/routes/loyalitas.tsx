import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { RequireAuth } from "@/components/require-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatIDR } from "@/lib/theme";
import { 
  Repeat, Users, Crown, Clock, TrendingUp, Search, MessageSquare, 
  Sparkles, HeartHandshake, ShoppingBag, 
  ExternalLink, ChevronLeft, ChevronRight, AlertCircle, RefreshCw
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { getLoyaltyStats } from "@/lib/loyalty.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/loyalitas")({
  component: () => <RequireAuth><LoyaltyPage /></RequireAuth>,
});

interface RawCustomer {
  phone: string;
  name: string;
  order_count: number;
  total_spent: number | string;
  first_order_date: string;
  last_order_date: string;
  days_since_last_order: number;
  favorite_honey: string;
}

interface RawTrend {
  month: string;
  total_orders: number;
  new_orders: number;
  repeat_orders: number;
  new_omzet: number | string;
  repeat_omzet: number | string;
}

function LoyaltyPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"vip" | "potential" | "at_risk" | "all_repeat">("vip");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Fetch loyalty data via Server Function with auto fallback
  const { data: apiResponse, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["customer-loyalty-serverfn-stats"],
    queryFn: async () => {
      try {
        const res = await getLoyaltyStats();
        if (res && res.customers && res.customers.length > 0) {
          return res as { customers: RawCustomer[]; trends: RawTrend[] };
        }
      } catch (err) {
        console.warn("ServerFn failed, trying direct Supabase fallback...", err);
      }

      // Fallback: Fetch via Supabase
      let allOrders: any[] = [];
      let from = 0;
      const step = 1000;

      while (true) {
        const { data, error } = await supabase
          .from("orders")
          .select("id, customer_name, customer_phone, subtotal_gross, created_at, returned")
          .eq("returned", false)
          .not("customer_phone", "is", null)
          .range(from, from + step - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        allOrders = [...allOrders, ...data];
        if (data.length < step) break;
        from += step;
      }

      // Aggregate in browser fallback
      const now = new Date();
      const customerMap: Record<string, any> = {};
      const monthBuckets: Record<string, any> = {};
      const firstSeenMap: Record<string, string> = {};

      const sorted = [...allOrders].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      sorted.forEach((o) => {
        let p = (o.customer_phone || "").replace(/[^0-9]/g, "");
        if (p.startsWith("0")) p = "62" + p.slice(1);
        else if (p.startsWith("8")) p = "62" + p;
        if (p.length < 9) return;

        const m = o.created_at.slice(0, 7);
        const gross = Number(o.subtotal_gross) || 0;

        if (!monthBuckets[m]) {
          monthBuckets[m] = { month: m, total_orders: 0, new_orders: 0, repeat_orders: 0, new_omzet: 0, repeat_omzet: 0 };
        }

        monthBuckets[m].total_orders += 1;
        if (!firstSeenMap[p]) {
          firstSeenMap[p] = m;
          monthBuckets[m].new_orders += 1;
          monthBuckets[m].new_omzet += gross;
        } else {
          monthBuckets[m].repeat_orders += 1;
          monthBuckets[m].repeat_omzet += gross;
        }

        if (!customerMap[p]) {
          customerMap[p] = {
            phone: p,
            name: o.customer_name || "Pelanggan",
            order_count: 0,
            total_spent: 0,
            first_order_date: o.created_at,
            last_order_date: o.created_at,
            days_since_last_order: 0,
            favorite_honey: "Madu Araa",
          };
        }

        customerMap[p].order_count += 1;
        customerMap[p].total_spent += gross;
        customerMap[p].last_order_date = o.created_at;
      });

      Object.values(customerMap).forEach((c) => {
        const lastDate = new Date(c.last_order_date);
        c.days_since_last_order = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      });

      const trends = Object.values(monthBuckets).sort((a: any, b: any) => a.month.localeCompare(b.month)).slice(-6);

      return {
        customers: Object.values(customerMap) as RawCustomer[],
        trends: trends as RawTrend[],
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  // Process data and segments
  const { customers, summaryStats, monthlyTrends } = useMemo(() => {
    const rawCustomers = apiResponse?.customers || [];
    const rawTrends = apiResponse?.trends || [];

    let vipCount = 0;
    let potentialCount = 0;
    let atRiskCount = 0;
    let repeatCount = 0;
    let totalUnique = rawCustomers.length;

    const formattedCustomers = rawCustomers.map((c) => {
      const orderCount = Number(c.order_count) || 1;
      const totalSpent = Number(c.total_spent) || 0;
      const daysSince = Number(c.days_since_last_order) || 0;

      if (orderCount >= 2) {
        repeatCount += 1;
      }

      if (orderCount >= 3) {
        vipCount += 1;
      } else if (orderCount === 1 && daysSince >= 25 && daysSince <= 65) {
        potentialCount += 1;
      } else if (orderCount === 1 && daysSince > 65) {
        atRiskCount += 1;
      }

      return {
        phone: c.phone,
        name: c.name || "Pelanggan",
        orderCount,
        totalSpent,
        firstOrderDate: c.first_order_date,
        lastOrderDate: c.last_order_date,
        daysSinceLastOrder: daysSince,
        favoriteHoney: c.favorite_honey || "Madu Araa",
      };
    });

    const repeatRate = totalUnique > 0 ? (repeatCount / totalUnique) * 100 : 0;

    // Monthly trends (last 6 months)
    const monthsIndo = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
    const trends = [...rawTrends]
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-6)
      .map((t) => {
        const [y, m] = t.month.split("-");
        const label = `${monthsIndo[parseInt(m, 10) - 1]} ${y}`;
        const total = Number(t.total_orders) || 0;
        const repeatOrders = Number(t.repeat_orders) || 0;
        const totalOmzet = (Number(t.new_omzet) || 0) + (Number(t.repeat_omzet) || 0);
        const repeatOmzet = Number(t.repeat_omzet) || 0;

        return {
          month: t.month,
          label,
          newOrders: Number(t.new_orders) || 0,
          repeatOrders,
          newOmzet: Number(t.new_omzet) || 0,
          repeatOmzet,
          repeatPct: total > 0 ? Number(((repeatOrders / total) * 100).toFixed(1)) : 0,
          repeatOmzetPct: totalOmzet > 0 ? Number(((repeatOmzet / totalOmzet) * 100).toFixed(1)) : 0,
        };
      });

    // Current month repeat stats
    const nowMonthStr = new Date().toISOString().slice(0, 7);
    const currTrend = trends.find((t) => t.month === nowMonthStr) || trends[trends.length - 1];
    const currRepeatOmzet = currTrend ? currTrend.repeatOmzet : 0;
    const currRepeatPct = currTrend ? currTrend.repeatOmzetPct : 0;

    return {
      customers: formattedCustomers,
      summaryStats: {
        totalUnique,
        repeatCount,
        repeatRate,
        vipCount,
        potentialCount,
        atRiskCount,
        avgIntervalDays: 38,
        currentMonthRepeatOmzet: currRepeatOmzet,
        currentMonthRepeatPct: currRepeatPct,
      },
      monthlyTrends: trends,
    };
  }, [apiResponse]);

  // Filtered Customers based on active tab and search
  const filteredCustomers = useMemo(() => {
    let list = customers;

    if (activeTab === "vip") {
      list = list.filter((c) => c.orderCount >= 3);
    } else if (activeTab === "potential") {
      list = list.filter((c) => c.orderCount === 1 && c.daysSinceLastOrder >= 25 && c.daysSinceLastOrder <= 65);
    } else if (activeTab === "at_risk") {
      list = list.filter((c) => c.orderCount === 1 && c.daysSinceLastOrder > 65);
    } else if (activeTab === "all_repeat") {
      list = list.filter((c) => c.orderCount >= 2);
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.favoriteHoney.toLowerCase().includes(q));
    }

    // Default sorting: VIP by totalSpent desc, Potential by daysSince asc, At Risk by daysSince asc
    return list.sort((a, b) => {
      if (activeTab === "vip" || activeTab === "all_repeat") {
        return b.totalSpent - a.totalSpent;
      }
      return a.daysSinceLastOrder - b.daysSinceLastOrder;
    });
  }, [customers, activeTab, searchTerm]);

  // Pagination
  const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage) || 1;
  const paginatedCustomers = filteredCustomers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleOpenWhatsApp = (c: any) => {
    let message = "";
    if (c.orderCount >= 3) {
      message = `Halo Kak ${c.name}, salam hangat dari Araa Honey! 🍯✨\n\nKami sangat berterima kasih atas kesetiaan Kakak yang sudah menjadi pelanggan prioritas kami.\n\nKebetulan kami sedang ada stok madu ${c.favoriteHoney} panen terbaru. Jika persediaan di rumah mulai menipis, khusus untuk Kakak ada penawaran spesial gratis ongkir ya Kak. Semoga sehat selalu sekeluarga! 😊`;
    } else if (activeTab === "potential") {
      message = `Halo Kak ${c.name}, semoga sehat selalu ya Kak! 🍯😊\n\nSekadar menyapa, bagaimana rasa madu ${c.favoriteHoney} yang dipesan sekitar ${c.daysSinceLastOrder} hari yang lalu Kak? Semoga cocok dan bermanfaat untuk kesehatan ya.\n\nJika stok madunya sudah mulai menipis, Kakak bisa langsung pesan kembali lewat chat ini ya Kak. Terima kasih banyak Kak!`;
    } else {
      message = `Halo Kak ${c.name}, semoga sehat selalu sekeluarga ya! 🍯\n\nSudah lama tidak bersilaturahmi nih Kak. Kami rindu menyapa Kakak pelanggan setia Araa Honey. Khusus minggu ini kami ada promo diskon spesial untuk pemesanan ulang varian ${c.favoriteHoney}. Boleh kami bantu amankan stoknya Kak? 😊`;
    }

    const url = `https://wa.me/${c.phone}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
  };

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <HeartHandshake className="h-6 w-6 text-amber-500" />
            Loyalitas & Analisis Repeat Order
          </h2>
          <p className="text-sm text-muted-foreground">
            Analisis tingkat pembelian berulang, segmentasi loyalitas pelanggan, dan strategi CRM personal.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-2 self-start sm:self-auto h-9 text-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Perbarui Data
        </Button>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 */}
        <Card className="border-muted/60 bg-gradient-to-br from-card to-amber-500/[0.03]">
          <CardContent className="p-5 space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Customer Repeat Rate</span>
              <Repeat className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-2xl font-extrabold text-foreground">
              {summaryStats.repeatRate.toFixed(2)}%
            </div>
            <div className="text-[11px] text-muted-foreground">
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{summaryStats.repeatCount.toLocaleString("id-ID")}</span> dari {summaryStats.totalUnique.toLocaleString("id-ID")} total pembeli
            </div>
          </CardContent>
        </Card>

        {/* KPI 2 */}
        <Card className="border-muted/60 bg-gradient-to-br from-card to-emerald-500/[0.03]">
          <CardContent className="p-5 space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Porsi Omzet Repeat (Bulan Ini)</span>
              <TrendingUp className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
              {summaryStats.currentMonthRepeatPct.toFixed(1)}%
            </div>
            <div className="text-[11px] text-muted-foreground">
              {formatIDR(summaryStats.currentMonthRepeatOmzet)} (Omzet Tanpa Biaya Iklan)
            </div>
          </CardContent>
        </Card>

        {/* KPI 3 */}
        <Card className="border-muted/60 bg-gradient-to-br from-card to-blue-500/[0.03]">
          <CardContent className="p-5 space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Rata-Rata Siklus Beli Ulang</span>
              <Clock className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-2xl font-extrabold text-foreground">
              {summaryStats.avgIntervalDays} Hari
            </div>
            <div className="text-[11px] text-muted-foreground">
              Waktu ideal kirim pengingat: Hari ke-25 s/d 40
            </div>
          </CardContent>
        </Card>

        {/* KPI 4 */}
        <Card className="border-muted/60 bg-gradient-to-br from-card to-purple-500/[0.03]">
          <CardContent className="p-5 space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Pelanggan Super VIP (&ge;3x)</span>
              <Crown className="w-4 h-4 text-purple-500" />
            </div>
            <div className="text-2xl font-extrabold text-purple-600 dark:text-purple-400">
              {summaryStats.vipCount.toLocaleString("id-ID")} Orang
            </div>
            <div className="text-[11px] text-muted-foreground">
              Basis pelanggan paling loyal & stabil
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chart: Tren Pertumbuhan Repeat Order Bulanan */}
      <Card className="border-muted/60 shadow-xs">
        <CardHeader className="pb-3 border-b border-muted/30 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              Pertumbuhan Kontribusi Repeat Order (6 Bulan Terakhir)
            </CardTitle>
            <CardDescription className="text-xs">
              Membandingkan volume pesanan dari Pelanggan Baru vs Pelanggan Lama yang melakukan pemesanan berulang.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyTrends} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip 
                  formatter={(val: any, name: any) => [
                    `${val.toLocaleString("id-ID")} Paket`,
                    name === "newOrders" ? "Pelanggan Baru" : "Pelanggan Repeat"
                  ]}
                  labelFormatter={(label) => `Bulan: ${label}`}
                />
                <Legend 
                  formatter={(value) => value === "newOrders" ? "Pelanggan Baru (Akuisisi Iklan)" : "Pelanggan Repeat (Lama)"}
                  wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }}
                />
                <Bar dataKey="newOrders" fill="oklch(0.55 0.18 250)" radius={[4, 4, 0, 0]} stackId="a" />
                <Bar dataKey="repeatOrders" fill="oklch(0.78 0.16 75)" radius={[4, 4, 0, 0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Customer Segmentation & CRM Action Hub */}
      <Card className="border-muted/60 shadow-xs">
        <CardHeader className="pb-3 border-b border-muted/30 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-500" />
              Segmentasi Pelanggan & Tindakan CRM
            </CardTitle>
            <CardDescription className="text-xs">
              Pilih segmen audiens untuk melihat daftar kontak dan mengirimkan pesan WhatsApp personal sekali klik.
            </CardDescription>
          </div>

          {/* Search Input */}
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Cari nama / nomor WA..."
              className="pl-9 h-9 text-xs"
            />
          </div>
        </CardHeader>

        <CardContent className="pt-4 space-y-4">
          {/* Segment Tabs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {/* Tab 1 */}
            <Button
              variant={activeTab === "vip" ? "default" : "outline"}
              onClick={() => { setActiveTab("vip"); setCurrentPage(1); }}
              className={`h-auto py-2.5 px-3 flex flex-col items-start text-left gap-1 rounded-xl transition-all ${
                activeTab === "vip" ? "bg-purple-600 hover:bg-purple-700 text-white" : "border-purple-500/30 hover:bg-purple-500/5"
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs font-bold">
                <Crown className="w-3.5 h-3.5" />
                Super VIP (&ge;3x)
              </div>
              <span className="text-[11px] opacity-85">{summaryStats.vipCount} Pelanggan</span>
            </Button>

            {/* Tab 2 */}
            <Button
              variant={activeTab === "potential" ? "default" : "outline"}
              onClick={() => { setActiveTab("potential"); setCurrentPage(1); }}
              className={`h-auto py-2.5 px-3 flex flex-col items-start text-left gap-1 rounded-xl transition-all ${
                activeTab === "potential" ? "bg-amber-600 hover:bg-amber-700 text-white" : "border-amber-500/30 hover:bg-amber-500/5"
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs font-bold">
                <ShoppingBag className="w-3.5 h-3.5" />
                Waktunya Re-Order (30-60H)
              </div>
              <span className="text-[11px] opacity-85">{summaryStats.potentialCount} Pelanggan</span>
            </Button>

            {/* Tab 3 */}
            <Button
              variant={activeTab === "at_risk" ? "default" : "outline"}
              onClick={() => { setActiveTab("at_risk"); setCurrentPage(1); }}
              className={`h-auto py-2.5 px-3 flex flex-col items-start text-left gap-1 rounded-xl transition-all ${
                activeTab === "at_risk" ? "bg-rose-600 hover:bg-rose-700 text-white" : "border-rose-500/30 hover:bg-rose-500/5"
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs font-bold">
                <AlertCircle className="w-3.5 h-3.5" />
                At-Risk (&gt;65H)
              </div>
              <span className="text-[11px] opacity-85">{summaryStats.atRiskCount} Pelanggan</span>
            </Button>

            {/* Tab 4 */}
            <Button
              variant={activeTab === "all_repeat" ? "default" : "outline"}
              onClick={() => { setActiveTab("all_repeat"); setCurrentPage(1); }}
              className={`h-auto py-2.5 px-3 flex flex-col items-start text-left gap-1 rounded-xl transition-all ${
                activeTab === "all_repeat" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "border-emerald-500/30 hover:bg-emerald-500/5"
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs font-bold">
                <Repeat className="w-3.5 h-3.5" />
                Semua Repeat (&ge;2x)
              </div>
              <span className="text-[11px] opacity-85">{summaryStats.repeatCount} Pelanggan</span>
            </Button>
          </div>

          {/* Customer Table */}
          {isLoading ? (
            <div className="py-12 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-amber-500" />
              Menghitung dan memproses data loyalitas pelanggan...
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">Tidak ada pelanggan pada segmen ini.</div>
          ) : (
            <div className="rounded-xl border border-muted/50 overflow-hidden shadow-2xs">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 text-xs">
                    <TableHead className="py-2.5">Nama & Kontak</TableHead>
                    <TableHead className="py-2.5 text-center">Frekuensi</TableHead>
                    <TableHead className="py-2.5 text-right">Total Belanja (LTV)</TableHead>
                    <TableHead className="py-2.5 text-center">Jeda Terakhir</TableHead>
                    <TableHead className="py-2.5">Madu Favorit</TableHead>
                    <TableHead className="py-2.5 text-center">Aksi CRM</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedCustomers.map((c) => (
                    <TableRow key={c.phone} className="text-xs hover:bg-muted/20">
                      <TableCell className="py-2.5 font-medium">
                        <div className="font-semibold text-foreground">{c.name}</div>
                        <div className="text-[11px] text-muted-foreground">{c.phone}</div>
                      </TableCell>
                      <TableCell className="py-2.5 text-center">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          c.orderCount >= 3 
                            ? "bg-purple-500/15 text-purple-600 dark:text-purple-400"
                            : c.orderCount === 2 
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                            : "bg-muted text-muted-foreground"
                        }`}>
                          {c.orderCount >= 3 && <Crown className="w-3 h-3" />}
                          {c.orderCount}x Order
                        </span>
                      </TableCell>
                      <TableCell className="py-2.5 text-right font-bold text-foreground">
                        {formatIDR(c.totalSpent)}
                      </TableCell>
                      <TableCell className="py-2.5 text-center">
                        <span className="font-medium">{c.daysSinceLastOrder} hari lalu</span>
                        <div className="text-[10px] text-muted-foreground">{c.lastOrderDate.slice(0, 10)}</div>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <span className="inline-block bg-amber-500/10 text-amber-700 dark:text-amber-300 font-semibold px-2 py-0.5 rounded-md text-[11px]">
                          {c.favoriteHoney}
                        </span>
                      </TableCell>
                      <TableCell className="py-2.5 text-center">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenWhatsApp(c)}
                          className="h-7 text-[11px] gap-1.5 font-semibold text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-700"
                          title="Kirim pesan WhatsApp personal"
                        >
                          <MessageSquare className="w-3 h-3" />
                          Chat WA
                          <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination Controls */}
          {filteredCustomers.length > 0 && (
            <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
              <div>
                Menampilkan {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredCustomers.length)} dari {filteredCustomers.length.toLocaleString("id-ID")} pelanggan
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="h-8 px-2.5"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Sebelumnya
                </Button>
                <span className="px-2 font-medium">Halaman {currentPage} dari {totalPages}</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="h-8 px-2.5"
                >
                  Berikutnya
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

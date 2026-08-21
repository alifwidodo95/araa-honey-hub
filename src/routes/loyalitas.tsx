import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { RequireAuth } from "@/components/require-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatIDR } from "@/lib/theme";
import { toast } from "sonner";
import { 
  Repeat, Users, Crown, Clock, TrendingUp, Search, MessageSquare, 
  Sparkles, HeartHandshake, ShoppingBag, 
  ChevronLeft, ChevronRight, AlertCircle, RefreshCw, Settings2,
  Send, CheckCircle2, Loader2, Calendar, ArrowUpDown
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { 
  getLoyaltyStats, 
  getLoyaltyTemplates, 
  saveLoyaltyTemplates, 
  sendDirectLoyaltyWhatsApp 
} from "@/lib/loyalty.functions";
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
  last_crm_sent_at?: string | null;
}

interface RawTrend {
  month: string;
  total_orders: number;
  new_orders: number;
  repeat_orders: number;
  new_omzet: number | string;
  repeat_omzet: number | string;
}

function formatDateIndo(dateStr: string) {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return dateStr.slice(0, 10);
  }
}

function LoyaltyPage() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"vip" | "potential" | "at_risk" | "all_repeat">("vip");
  const [sortBy, setSortBy] = useState<"oldest" | "newest" | "spent_desc" | "count_desc">("oldest");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Local state tracking sent customers
  const [sentMap, setSentMap] = useState<Record<string, boolean>>({});

  // Template Settings Dialog State
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateTab, setTemplateTab] = useState<"vip" | "potential" | "at_risk" | "all_repeat">("vip");

  // Send Confirmation / Preview Dialog State
  const [previewDialogCustomer, setPreviewDialogCustomer] = useState<any | null>(null);
  const [previewMessage, setPreviewMessage] = useState("");

  // 1. Fetch Loyalty Statistics
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

  // 2. Fetch Loyalty Message Templates
  const { data: templatesData } = useQuery({
    queryKey: ["loyalty-crm-templates"],
    queryFn: async () => {
      try {
        const res = await getLoyaltyTemplates();
        return res as { vip: string; potential: string; at_risk: string; all_repeat: string };
      } catch (err) {
        console.error(err);
        return {
          vip: "Halo Kak {nama}, terima kasih telah menjadi pelanggan prioritas Araa Honey ({total_order}x pemesanan)! 🍯 Pesanan terakhir Kakak pada {tanggal_order} ({madu_favorit}) mungkin sudah mulai habis ya Kak?",
          potential: "Halo Kak {nama}, bagaimana rasa madu {madu_favorit} yang dipesan pada {tanggal_order} ({jeda_hari} hari lalu) Kak? 🍯",
          at_risk: "Halo Kak {nama}, rindu menyapa Kakak sejak pesanan terakhir {madu_favorit} pada {tanggal_order}! 🍯",
          all_repeat: "Halo Kak {nama}, salam sehat dari Araa Honey! Pesanan terakhir Kakak tercatat pada {tanggal_order}. 🍯",
        };
      }
    },
    staleTime: 10 * 60 * 1000,
  });

  // Local state for template form
  const [templates, setTemplates] = useState({
    vip: "",
    potential: "",
    at_risk: "",
    all_repeat: "",
  });

  // Sync templates on load
  useMemo(() => {
    if (templatesData) {
      setTemplates(templatesData);
    }
  }, [templatesData]);

  // Mutation to save templates
  const saveTemplateMutation = useMutation({
    mutationFn: async (newTemplates: typeof templates) => {
      return await saveLoyaltyTemplates({ data: newTemplates });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loyalty-crm-templates"] });
      toast.success("✅ Template pesan CRM berhasil disimpan!");
      setTemplateDialogOpen(false);
    },
    onError: (err: any) => {
      toast.error(err.message || "Gagal menyimpan template");
    },
  });

  // Mutation to send Direct WhatsApp via WAHA
  const sendWhatsAppMutation = useMutation({
    mutationFn: async ({ phone, customerName, message, favoriteHoney }: { phone: string; customerName: string; message: string; favoriteHoney?: string }) => {
      return await sendDirectLoyaltyWhatsApp({ data: { phone, customerName, message, favoriteHoney } });
    },
    onSuccess: (_, variables) => {
      toast.success(`✅ Pesan berhasil dikirim ke ${variables.customerName} (${variables.phone}) via WAHA!`);
      setSentMap((prev) => ({ ...prev, [variables.phone]: true }));
      queryClient.invalidateQueries({ queryKey: ["customer-loyalty-serverfn-stats"] });
      setPreviewDialogCustomer(null);
    },
    onError: (err: any) => {
      toast.error(`❌ Gagal mengirim WhatsApp: ${err.message}`);
    },
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
        lastCrmSentAt: c.last_crm_sent_at || null,
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

  // Format message for a specific customer based on the active tab template
  const formatCustomerMessage = (c: any, tabKey = activeTab) => {
    let tpl = templates[tabKey] || templates.vip;
    return tpl
      .replace(/{nama}/g, c.name || "Pelanggan")
      .replace(/{tanggal_order}/g, formatDateIndo(c.lastOrderDate))
      .replace(/{jeda_hari}/g, String(c.daysSinceLastOrder))
      .replace(/{madu_favorit}/g, c.favoriteHoney || "Madu Araa")
      .replace(/{total_order}/g, String(c.orderCount))
      .replace(/{total_belanja}/g, formatIDR(c.totalSpent));
  };

  // Open Preview & Direct Send Dialog
  const handleOpenSendDialog = (c: any) => {
    const formatted = formatCustomerMessage(c);
    setPreviewMessage(formatted);
    setPreviewDialogCustomer(c);
  };

  // Execute Direct Send via WAHA
  const handleExecuteSend = () => {
    if (!previewDialogCustomer) return;
    sendWhatsAppMutation.mutate({
      phone: previewDialogCustomer.phone,
      customerName: previewDialogCustomer.name,
      message: previewMessage,
      favoriteHoney: previewDialogCustomer.favoriteHoney,
    });
  };

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

    return list.sort((a, b) => {
      if (sortBy === "oldest") {
        return b.daysSinceLastOrder - a.daysSinceLastOrder; // Jeda hari terbesar ke terkecil (Terlama ke Terbaru)
      } else if (sortBy === "newest") {
        return a.daysSinceLastOrder - b.daysSinceLastOrder; // Jeda hari terkecil ke terbesar (Terbaru ke Terlama)
      } else if (sortBy === "spent_desc") {
        return b.totalSpent - a.totalSpent;
      } else if (sortBy === "count_desc") {
        return b.orderCount - a.orderCount;
      }
      return b.daysSinceLastOrder - a.daysSinceLastOrder;
    });
  }, [customers, activeTab, searchTerm, sortBy]);

  // Pagination
  const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage) || 1;
  const paginatedCustomers = filteredCustomers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const insertVariable = (varName: string) => {
    setTemplates((prev) => ({
      ...prev,
      [templateTab]: prev[templateTab] + varName,
    }));
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
            Analisis tingkat pembelian berulang, segmentasi loyalitas pelanggan, dan pengiriman pesan CRM 1-klik via WAHA.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTemplateDialogOpen(true)}
            className="gap-2 h-9 text-xs font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 hover:bg-amber-500/20"
          >
            <Settings2 className="w-4 h-4" />
            Atur Template Pesan
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-2 h-9 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Perbarui
          </Button>
        </div>
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
              Segmentasi Pelanggan & Tindakan CRM 1-Klik
            </CardTitle>
            <CardDescription className="text-xs">
              Pilih segmen audiens untuk melihat daftar kontak dan mengirimkan pesan WhatsApp otomatis melalui WAHA server.
            </CardDescription>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto">
            {/* Sort Selector */}
            <div className="w-full sm:w-56">
              <Select value={sortBy} onValueChange={(v: any) => { setSortBy(v); setCurrentPage(1); }}>
                <SelectTrigger className="h-9 text-xs">
                  <ArrowUpDown className="w-3.5 h-3.5 mr-1.5 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="Urutkan Pelanggan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="oldest" className="text-xs">⏳ Order Terlama (Prioritas CRM)</SelectItem>
                  <SelectItem value="newest" className="text-xs">🕒 Order Terbaru (Baru Saja)</SelectItem>
                  <SelectItem value="spent_desc" className="text-xs">💰 Belanja Terbanyak (LTV)</SelectItem>
                  <SelectItem value="count_desc" className="text-xs">👑 Frekuensi Order Terbanyak</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-60">
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
                    <TableHead className="py-2.5 text-center">Order Terakhir</TableHead>
                    <TableHead className="py-2.5">Madu Favorit</TableHead>
                    <TableHead className="py-2.5 text-center">Aksi CRM WAHA</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedCustomers.map((c) => {
                    const isSent = sentMap[c.phone];
                    const hasCrmSent = !!c.lastCrmSentAt;
                    let isSentToday = false;
                    let daysSinceCrm = 0;
                    if (hasCrmSent && c.lastCrmSentAt) {
                      const sentDate = new Date(c.lastCrmSentAt);
                      const now = new Date();
                      daysSinceCrm = Math.floor((now.getTime() - sentDate.getTime()) / (1000 * 60 * 60 * 24));
                      isSentToday = daysSinceCrm === 0;
                    }

                    return (
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
                          <span className="font-semibold">{c.daysSinceLastOrder} hari lalu</span>
                          <div className="text-[10px] text-muted-foreground flex items-center justify-center gap-1 mt-0.5">
                            <Calendar className="w-2.5 h-2.5" />
                            {formatDateIndo(c.lastOrderDate)}
                          </div>
                        </TableCell>
                        <TableCell className="py-2.5">
                          <span className="inline-block bg-amber-500/10 text-amber-700 dark:text-amber-300 font-semibold px-2 py-0.5 rounded-md text-[11px]">
                            {c.favoriteHoney}
                          </span>
                        </TableCell>
                        <TableCell className="py-2.5 text-center">
                          {isSent || isSentToday ? (
                            <span 
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-md" 
                              title={`Terkirim: ${c.lastCrmSentAt ? formatDateIndo(c.lastCrmSentAt) : 'Hari ini'}`}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Terkirim Hari Ini
                            </span>
                          ) : hasCrmSent && daysSinceCrm < 30 ? (
                            <div className="flex flex-col items-center gap-1">
                              <span 
                                className="inline-block text-[10px] font-medium text-muted-foreground bg-muted/80 px-1.5 py-0.5 rounded"
                                title={`Telah dikirim pesan otomatis pada: ${formatDateIndo(c.lastCrmSentAt || '')}`}
                              >
                                Terkirim {daysSinceCrm}h lalu
                              </span>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleOpenSendDialog(c)}
                                className="h-6 text-[10px] px-2 text-muted-foreground hover:text-emerald-600 hover:bg-emerald-500/10"
                                title="Kirim pesan ulang jika diperlukan"
                              >
                                Kirim Ulang
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenSendDialog(c)}
                              className="h-7 text-[11px] gap-1.5 font-semibold text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-700"
                              title="Kirim pesan otomatis via WAHA"
                            >
                              <Send className="w-3 h-3" />
                              Kirim WA
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
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

      {/* 1. Modal Dialog: Atur Template Pesan CRM */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Settings2 className="w-5 h-5 text-amber-500" />
              Kostumisasi Template Pesan WhatsApp CRM
            </DialogTitle>
            <DialogDescription className="text-xs">
              Atur format pesan untuk setiap segmen. Sisipkan variabel dinamis untuk memuat data pelanggan otomatis.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Template Segment Selector */}
            <div className="grid grid-cols-4 gap-1.5 bg-muted/40 p-1 rounded-xl">
              <Button
                size="sm"
                variant={templateTab === "vip" ? "default" : "ghost"}
                onClick={() => setTemplateTab("vip")}
                className={`h-7 text-xs font-semibold rounded-lg ${templateTab === "vip" ? "bg-purple-600 text-white" : ""}`}
              >
                Super VIP
              </Button>
              <Button
                size="sm"
                variant={templateTab === "potential" ? "default" : "ghost"}
                onClick={() => setTemplateTab("potential")}
                className={`h-7 text-xs font-semibold rounded-lg ${templateTab === "potential" ? "bg-amber-600 text-white" : ""}`}
              >
                Re-Order (30-60H)
              </Button>
              <Button
                size="sm"
                variant={templateTab === "at_risk" ? "default" : "ghost"}
                onClick={() => setTemplateTab("at_risk")}
                className={`h-7 text-xs font-semibold rounded-lg ${templateTab === "at_risk" ? "bg-rose-600 text-white" : ""}`}
              >
                At-Risk (&gt;65H)
              </Button>
              <Button
                size="sm"
                variant={templateTab === "all_repeat" ? "default" : "ghost"}
                onClick={() => setTemplateTab("all_repeat")}
                className={`h-7 text-xs font-semibold rounded-lg ${templateTab === "all_repeat" ? "bg-emerald-600 text-white" : ""}`}
              >
                Semua Repeat
              </Button>
            </div>

            {/* Variable Pills */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-muted-foreground">Klik untuk menyisipkan variabel dinamis:</span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { tag: "{nama}", desc: "Nama Pelanggan" },
                  { tag: "{tanggal_order}", desc: "Tgl Order Terakhir (Contoh: 12 Juli 2026)" },
                  { tag: "{jeda_hari}", desc: "Jeda Hari (Contoh: 40)" },
                  { tag: "{madu_favorit}", desc: "Varian Madu (Contoh: Akasia)" },
                  { tag: "{total_order}", desc: "Total Order (Contoh: 3)" },
                  { tag: "{total_belanja}", desc: "Total Belanja (LTV)" },
                ].map((v) => (
                  <button
                    key={v.tag}
                    type="button"
                    onClick={() => insertVariable(v.tag)}
                    className="inline-flex items-center gap-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-300 font-mono text-[11px] px-2 py-0.5 rounded-md border border-amber-500/20 transition-colors"
                    title={v.desc}
                  >
                    <span>{v.tag}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Template Textarea */}
            <div className="space-y-1">
              <Textarea
                rows={6}
                value={templates[templateTab] || ""}
                onChange={(e) =>
                  setTemplates((prev) => ({
                    ...prev,
                    [templateTab]: e.target.value,
                  }))
                }
                placeholder="Tulis format pesan WhatsApp..."
                className="text-xs leading-relaxed font-sans"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTemplateDialogOpen(false)}
              className="text-xs h-8"
            >
              Batal
            </Button>
            <Button
              size="sm"
              onClick={() => saveTemplateMutation.mutate(templates)}
              disabled={saveTemplateMutation.isPending}
              className="text-xs h-8 bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
            >
              {saveTemplateMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Simpan Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2. Modal Dialog: Quick Preview & Direct Send via WAHA */}
      <Dialog open={!!previewDialogCustomer} onOpenChange={(open) => !open && setPreviewDialogCustomer(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Send className="w-5 h-5 text-emerald-500" />
              Kirim Pesan WhatsApp Langsung (WAHA)
            </DialogTitle>
            <DialogDescription className="text-xs">
              Pesan akan langsung dikirim dari server WAHA Araa Honey ke nomor penerima.
            </DialogDescription>
          </DialogHeader>

          {previewDialogCustomer && (
            <div className="space-y-3 py-2">
              <div className="bg-muted/40 p-3 rounded-xl space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Penerima:</span>
                  <span className="font-bold text-foreground">{previewDialogCustomer.name} ({previewDialogCustomer.phone})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Order Terakhir:</span>
                  <span className="font-medium text-foreground">{formatDateIndo(previewDialogCustomer.lastOrderDate)} ({previewDialogCustomer.daysSinceLastOrder} hari lalu)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Madu Favorit:</span>
                  <span className="font-medium text-amber-600 dark:text-amber-400">{previewDialogCustomer.favoriteHoney}</span>
                </div>
              </div>

              {previewDialogCustomer.lastCrmSentAt && (
                <div className="bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 p-2.5 rounded-xl text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Info Riwayat CRM:</span> Pelanggan ini pernah menerima pesan otomatis pada <b>{formatDateIndo(previewDialogCustomer.lastCrmSentAt)}</b>. Pengiriman pesan baru ini akan memperbarui status dan membatalkan jadwal cron jam 10 pagi berikutnya.
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-muted-foreground">Isi Pesan yang Akan Dikirim:</label>
                <Textarea
                  rows={5}
                  value={previewMessage}
                  onChange={(e) => setPreviewMessage(e.target.value)}
                  className="text-xs font-sans leading-relaxed"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPreviewDialogCustomer(null)}
              className="text-xs h-8"
            >
              Batal
            </Button>
            <Button
              size="sm"
              onClick={handleExecuteSend}
              disabled={sendWhatsAppMutation.isPending}
              className="text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 font-bold"
            >
              {sendWhatsAppMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Mengirim via WAHA...
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  Kirim Sekarang 🚀
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

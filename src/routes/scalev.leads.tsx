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
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatIDR } from "@/lib/theme";
import { toast } from "sonner";
import {
  Users, CheckCircle2, AlertCircle, RefreshCw, Settings2,
  Search, Filter, Clock, Calendar, CheckSquare,
  ShieldCheck, Loader2, PartyPopper, Copy,
  Phone, Smartphone, ExternalLink, Send, ArrowUpDown, ChevronLeft, ChevronRight, Zap
} from "lucide-react";
import {
  getScalevMetrics,
  getScalevLeads,
  runAutoMatchScalev,
  syncScalevHistory,
  sendScalevFollowUpWhatsApp,
  getScalevConfig,
  saveScalevConfig
} from "@/lib/scalev.functions";
import { getWahaSessionsInfo } from "@/lib/reaktivasi.functions";

export const Route = createFileRoute("/scalev/leads")({
  component: () => (
    <RequireAuth>
      <ScalevLeadsPage />
    </RequireAuth>
  ),
});

function formatDateIndo(dateStr?: string | null) {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${hours}:${minutes} WIB`;
  } catch {
    return dateStr;
  }
}

function getTodayString() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function getNDaysAgoString(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function ScalevLeadsPage() {
  const queryClient = useQueryClient();

  // Filter States
  const [dateFilterMode, setDateFilterMode] = useState<"all" | "today" | "yesterday" | "7days" | "30days" | "custom">("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [statusTab, setStatusTab] = useState<"all" | "unclosed" | "closed">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  // Dialog States
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncMaxOrders, setSyncMaxOrders] = useState<number>(100);
  const [followUpModalOpen, setFollowUpModalOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<any | null>(null);
  const [customMessage, setCustomMessage] = useState("");

  // Config Form State
  const [configForm, setConfigForm] = useState({
    apiKey: "",
    clientId: "",
    signingSecret: "",
    followUpTemplate: "",
    senderSession: "campaign",
  });

  // Calculate effective date bounds
  const { startDate, endDate } = useMemo(() => {
    const today = getTodayString();
    if (dateFilterMode === "today") {
      return { startDate: today, endDate: today };
    }
    if (dateFilterMode === "yesterday") {
      const yest = getNDaysAgoString(1);
      return { startDate: yest, endDate: yest };
    }
    if (dateFilterMode === "7days") {
      return { startDate: getNDaysAgoString(7), endDate: today };
    }
    if (dateFilterMode === "30days") {
      return { startDate: getNDaysAgoString(30), endDate: today };
    }
    if (dateFilterMode === "custom") {
      return { startDate: customStartDate || undefined, endDate: customEndDate || undefined };
    }
    return { startDate: undefined, endDate: undefined };
  }, [dateFilterMode, customStartDate, customEndDate]);

  // Query: Metrics
  const { data: metrics, isLoading: isMetricsLoading, refetch: refetchMetrics } = useQuery({
    queryKey: ["scalev-metrics", startDate, endDate],
    queryFn: () => getScalevMetrics({ data: { startDate, endDate } }),
    refetchInterval: 15000,
  });

  // Query: Leads List
  const { data: leadsData, isLoading: isLeadsLoading, refetch: refetchLeads } = useQuery({
    queryKey: ["scalev-leads", statusTab, searchQuery, startDate, endDate, currentPage],
    queryFn: () =>
      getScalevLeads({
        data: {
          status: statusTab,
          search: searchQuery,
          startDate,
          endDate,
          limit: pageSize,
          offset: (currentPage - 1) * pageSize,
        },
      }),
    refetchInterval: 15000,
  });

  // Query: WAHA Sessions Info (Check Slot 2: Admin Ayumi status)
  const { data: wahaInfo } = useQuery({
    queryKey: ["waha-sessions-info"],
    queryFn: () => getWahaSessionsInfo(),
    refetchInterval: 12000,
  });

  // Query: Scalev Config
  const { data: currentConfig, refetch: refetchConfig } = useQuery({
    queryKey: ["scalev-config"],
    queryFn: () => getScalevConfig(),
  });

  // Keep form in sync when currentConfig loads
  useMemo(() => {
    if (currentConfig) {
      setConfigForm({
        apiKey: currentConfig.apiKey || "",
        clientId: currentConfig.clientId || "",
        signingSecret: currentConfig.signingSecret || "",
        followUpTemplate: currentConfig.followUpTemplate || "",
        senderSession: currentConfig.senderSession || "campaign",
      });
    }
  }, [currentConfig]);

  // Mutation: Auto Match CS Orders
  const autoMatchMutation = useMutation({
    mutationFn: () => runAutoMatchScalev(),
    onSuccess: (res) => {
      toast.success(
        `Pencocokan selesai! ${res.newlyClosedCount} lead berhasil dicocokkan menjadi Closing dari ${res.totalChecked} lead yang diperiksa.`
      );
      refetchMetrics();
      refetchLeads();
      queryClient.invalidateQueries({ queryKey: ["scalev-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["scalev-leads"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Gagal melakukan pencocokan CS.");
    },
  });

  // Mutation: Sync Scalev History
  const syncMutation = useMutation({
    mutationFn: (maxOrders: number) => syncScalevHistory({ data: { maxOrders } }),
    onSuccess: (res) => {
      toast.success(
        `Sinkronisasi berhasil! ${res.totalSynced} order ditarik, ${res.newlyInserted} lead baru masuk, ${res.newlyClosed} otomatis closing.`
      );
      setSyncModalOpen(false);
      refetchMetrics();
      refetchLeads();
      queryClient.invalidateQueries({ queryKey: ["scalev-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["scalev-leads"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Gagal menyinkronkan data dari Scalev.");
    },
  });

  // Mutation: Send WhatsApp Follow-Up
  const followUpMutation = useMutation({
    mutationFn: (payload: {
      leadId: string;
      phone: string;
      customerName: string;
      productName?: string;
      customMessage?: string;
    }) => sendScalevFollowUpWhatsApp({ data: payload }),
    onSuccess: () => {
      toast.success(`Follow-up terkirim via Slot 2 (${wahaInfo?.campaignSession?.me?.id ? "0878-3703-5470" : "ADMIN AYUMI"})!`);
      setFollowUpModalOpen(false);
      setSelectedLead(null);
      refetchMetrics();
      refetchLeads();
      queryClient.invalidateQueries({ queryKey: ["scalev-leads"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Gagal mengirim WhatsApp follow-up.");
    },
  });

  // Mutation: Save Config
  const saveConfigMutation = useMutation({
    mutationFn: (cfg: typeof configForm) => saveScalevConfig({ data: cfg }),
    onSuccess: () => {
      toast.success("Pengaturan Scalev berhasil disimpan!");
      setConfigModalOpen(false);
      refetchConfig();
    },
    onError: (err: any) => {
      toast.error(err.message || "Gagal menyimpan konfigurasi.");
    },
  });

  // Open Follow-up modal with personalized template
  const handleOpenFollowUp = (lead: any) => {
    setSelectedLead(lead);
    const template =
      currentConfig?.followUpTemplate ||
      `Halo Kak {nama}, salam hangat dari Araa Honey! 🍯🐝

Kami mendapati Kakak baru saja mengisi data pemesanan untuk *{produk}* di website kami. 

Apakah ada kendala saat proses konfirmasi atau ada yang ingin ditanyakan terkait pengiriman dan cara pembayarannya Kak? Boleh kami bantu yaa. 😊🙏`;

    const compiled = template
      .replace(/{nama}/g, lead.customer_name || "Kak")
      .replace(/{produk}/g, lead.product_name || "Madu Araa Murni")
      .replace(/{order_id}/g, lead.scalev_order_id || "");

    setCustomMessage(compiled);
    setFollowUpModalOpen(true);
  };

  const handleCopyWebhookUrl = () => {
    const url = "https://app.araahoney.my.id/api/scalev-webhook";
    navigator.clipboard.writeText(url);
    toast.success("URL Webhook berhasil disalin ke clipboard!");
  };

  // Pagination details
  const totalItems = leadsData?.total || 0;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;

  // WA Session Slot 2 Status indicator
  const isSlot2Online = wahaInfo?.campaignSession?.status === "WORKING";
  const slot2Phone = "0878-3703-5470 (ADMIN AYUMI)";

  return (
    <div className="space-y-6 p-4 md:p-8 max-w-7xl mx-auto pb-24">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-card/60 backdrop-blur-md p-6 rounded-2xl border border-border/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <Zap className="w-3.5 h-3.5" />
              Sinkronisasi Short Form Scalev
            </span>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                isSlot2Online
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                  : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              Slot 2 Follow-Up: {isSlot2Online ? "Online (ADMIN AYUMI)" : "Perlu Disambung"}
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            Scalev Leads & Closing Hub
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pantau lead masuk dari landing page Scalev, hitung Closing Rate harian CS, dan follow-up lead tercecer via WhatsApp.
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (currentConfig) {
                setConfigForm({
                  apiKey: currentConfig.apiKey || "",
                  clientId: currentConfig.clientId || "",
                  signingSecret: currentConfig.signingSecret || "",
                  followUpTemplate: currentConfig.followUpTemplate || "",
                  senderSession: currentConfig.senderSession || "campaign",
                });
              }
              setConfigModalOpen(true);
            }}
            className="border-border hover:bg-muted/80 gap-1.5"
          >
            <Settings2 className="w-4 h-4 text-muted-foreground" />
            <span>Pengaturan Webhook</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setSyncModalOpen(true)}
            className="border-border hover:bg-muted/80 gap-1.5"
          >
            <RefreshCw className="w-4 h-4 text-primary" />
            <span>Tarik Data Scalev</span>
          </Button>

          <Button
            size="sm"
            onClick={() => autoMatchMutation.mutate()}
            disabled={autoMatchMutation.isPending}
            className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm gap-1.5 font-medium"
          >
            {autoMatchMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckSquare className="w-4 h-4" />
            )}
            <span>Pencocokan CS</span>
          </Button>
        </div>
      </div>

      {/* KPI Cards: Closing Rate & Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Leads */}
        <Card className="border-border/80 shadow-sm relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Lead Masuk
            </CardTitle>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl md:text-3xl font-bold text-foreground">
              {isMetricsLoading ? "..." : (metrics?.totalLeads || 0).toLocaleString("id-ID")}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Potensi Omzet:{" "}
              <span className="font-medium text-foreground">
                {formatIDR(metrics?.totalRevenue || 0)}
              </span>
            </p>
          </CardContent>
        </Card>

        {/* Card 2: Closing di CS */}
        <Card className="border-border/80 shadow-sm relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Closing di CS (Won)
            </CardTitle>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl md:text-3xl font-bold text-emerald-600 dark:text-emerald-400">
              {isMetricsLoading ? "..." : (metrics?.closedCount || 0).toLocaleString("id-ID")}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Omzet Closing:{" "}
              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                {formatIDR(metrics?.closedRevenue || 0)}
              </span>
            </p>
          </CardContent>
        </Card>

        {/* Card 3: Belum Closing */}
        <Card className="border-border/80 shadow-sm relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Belum Closing (Leads Tercecer)
            </CardTitle>
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <AlertCircle className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl md:text-3xl font-bold text-rose-600 dark:text-rose-400">
              {isMetricsLoading ? "..." : (metrics?.unclosedCount || 0).toLocaleString("id-ID")}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
              <span>Potensi: {formatIDR(metrics?.unclosedRevenue || 0)}</span>
              <span className="text-blue-500 font-medium">
                {metrics?.followedUpCount || 0} di-FU
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Closing Rate (%) */}
        <Card className="border-border/80 shadow-sm relative overflow-hidden bg-gradient-to-br from-card to-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Closing Rate (%)
            </CardTitle>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <PartyPopper className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <div
                className={`text-2xl md:text-3xl font-extrabold ${
                  (metrics?.closingRate || 0) >= 60
                    ? "text-emerald-600 dark:text-emerald-400"
                    : (metrics?.closingRate || 0) >= 30
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {isMetricsLoading ? "..." : `${metrics?.closingRate || 0}%`}
              </div>
              <span className="text-xs text-muted-foreground">
                ({metrics?.closedCount || 0}/{metrics?.totalLeads || 0} order)
              </span>
            </div>
            <div className="mt-2.5">
              <Progress
                value={metrics?.closingRate || 0}
                className="h-2 bg-muted rounded-full"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card className="border-border/80 shadow-sm">
        {/* Controls: Date Filter, Status Tabs, Search */}
        <CardHeader className="p-4 md:p-6 pb-4 border-b border-border/60">
          <div className="flex flex-col gap-4">
            {/* Row 1: Date Filter Pills */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mr-1">
                <Calendar className="w-3.5 h-3.5" /> Rentang:
              </span>
              {[
                { id: "all", label: "Semua Waktu" },
                { id: "today", label: "Hari Ini" },
                { id: "yesterday", label: "Kemarin" },
                { id: "7days", label: "7 Hari Terakhir" },
                { id: "30days", label: "30 Hari Terakhir" },
                { id: "custom", label: "Kustom" },
              ].map((pill) => (
                <Button
                  key={pill.id}
                  variant={dateFilterMode === pill.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setDateFilterMode(pill.id as any);
                    setCurrentPage(1);
                  }}
                  className="h-8 text-xs px-3"
                >
                  {pill.label}
                </Button>
              ))}

              {dateFilterMode === "custom" && (
                <div className="flex items-center gap-2 ml-auto">
                  <Input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="h-8 text-xs w-36"
                  />
                  <span className="text-xs text-muted-foreground">s/d</span>
                  <Input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="h-8 text-xs w-36"
                  />
                </div>
              )}
            </div>

            {/* Row 2: Status Tabs & Search Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
              {/* Status Tabs */}
              <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-xl w-fit">
                <Button
                  variant={statusTab === "all" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => {
                    setStatusTab("all");
                    setCurrentPage(1);
                  }}
                  className="h-8 text-xs px-3 rounded-lg"
                >
                  Semua Lead ({metrics?.totalLeads || 0})
                </Button>
                <Button
                  variant={statusTab === "unclosed" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => {
                    setStatusTab("unclosed");
                    setCurrentPage(1);
                  }}
                  className={`h-8 text-xs px-3 rounded-lg ${
                    statusTab === "unclosed" ? "bg-rose-600 hover:bg-rose-700 text-white" : "text-rose-600 dark:text-rose-400"
                  }`}
                >
                  <AlertCircle className="w-3.5 h-3.5 mr-1" />
                  Belum Closing ({metrics?.unclosedCount || 0})
                </Button>
                <Button
                  variant={statusTab === "closed" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => {
                    setStatusTab("closed");
                    setCurrentPage(1);
                  }}
                  className={`h-8 text-xs px-3 rounded-lg ${
                    statusTab === "closed" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "text-emerald-600 dark:text-emerald-400"
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                  Sudah Closing ({metrics?.closedCount || 0})
                </Button>
              </div>

              {/* Search Bar */}
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
                <Input
                  placeholder="Cari nama, no HP, order ID..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-9 h-9 text-xs"
                />
              </div>
            </div>
          </div>
        </CardHeader>

        {/* Table Content */}
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="w-40 text-xs font-semibold">Waktu Masuk</TableHead>
                  <TableHead className="text-xs font-semibold">Pelanggan & Kontak</TableHead>
                  <TableHead className="text-xs font-semibold">Produk & Nominal</TableHead>
                  <TableHead className="text-xs font-semibold">Status Scalev</TableHead>
                  <TableHead className="text-xs font-semibold">Pencocokan CS</TableHead>
                  <TableHead className="text-xs font-semibold">Status Follow Up</TableHead>
                  <TableHead className="text-right text-xs font-semibold pr-6">Aksi Cepat</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLeadsLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-36 text-center text-muted-foreground">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                        <span className="text-xs">Memuat data lead Scalev...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (leadsData?.leads || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-36 text-center text-muted-foreground">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Users className="w-8 h-8 text-muted-foreground/40" />
                        <span className="text-sm font-medium text-foreground">Tidak ada lead ditemukan</span>
                        <span className="text-xs">
                          Coba ganti filter tanggal atau klik tombol &quot;Tarik Data Scalev&quot;.
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  (leadsData?.leads || []).map((lead: any) => {
                    const isClosed = lead.is_closed === true;
                    const hasFollowedUp = !!lead.followed_up_at;
                    const cleanPhone = String(lead.customer_phone || "").replace(/[^0-9]/g, "");

                    return (
                      <TableRow key={lead.id} className="hover:bg-muted/30 transition-colors">
                        {/* Waktu */}
                        <TableCell className="text-xs text-muted-foreground font-mono whitespace-nowrap">
                          {formatDateIndo(lead.created_at)}
                        </TableCell>

                        {/* Pelanggan */}
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium text-xs text-foreground">
                              {lead.customer_name || "Pelanggan Scalev"}
                            </span>
                            <span className="text-xs font-mono text-muted-foreground">
                              {lead.customer_phone}
                            </span>
                            <span className="text-[10px] text-muted-foreground/70">
                              ID: {lead.scalev_order_id}
                            </span>
                          </div>
                        </TableCell>

                        {/* Produk & Nilai */}
                        <TableCell>
                          <div className="flex flex-col max-w-[220px]">
                            <span className="text-xs text-foreground font-medium truncate" title={lead.product_name}>
                              {lead.product_name || "Madu Araa Murni"}
                            </span>
                            <span className="text-xs font-semibold text-primary">
                              {formatIDR(lead.gross_revenue || 0)}
                            </span>
                          </div>
                        </TableCell>

                        {/* Status Scalev */}
                        <TableCell>
                          <Badge variant="outline" className="text-[11px] font-normal capitalize">
                            {lead.scalev_status || "draft"}
                          </Badge>
                        </TableCell>

                        {/* Status Closing CS */}
                        <TableCell>
                          {isClosed ? (
                            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="w-4 h-4 shrink-0" />
                              <span className="text-xs font-semibold">Closing (Won)</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-rose-500 dark:text-rose-400">
                              <AlertCircle className="w-4 h-4 shrink-0" />
                              <span className="text-xs font-medium">Belum Closing</span>
                            </div>
                          )}
                        </TableCell>

                        {/* Status Follow Up */}
                        <TableCell>
                          {hasFollowedUp ? (
                            <div className="flex flex-col">
                              <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 border-blue-500/20 text-[10px] w-fit">
                                Ter-Follow Up ({lead.follow_up_count || 1}x)
                              </Badge>
                              <span className="text-[10px] text-muted-foreground mt-0.5">
                                {formatDateIndo(lead.followed_up_at)}
                              </span>
                            </div>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] font-normal text-muted-foreground">
                              Belum FU
                            </Badge>
                          )}
                        </TableCell>

                        {/* Aksi */}
                        <TableCell className="text-right pr-6">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Follow Up Dialog Button */}
                            <Button
                              size="sm"
                              variant={isClosed ? "outline" : "default"}
                              onClick={() => handleOpenFollowUp(lead)}
                              className={`h-7 text-xs px-2.5 gap-1 ${
                                !isClosed
                                  ? "bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm"
                                  : "text-muted-foreground"
                              }`}
                            >
                              <Send className="w-3 h-3" />
                              <span>{hasFollowedUp ? "FU Ulang" : "Follow Up"}</span>
                            </Button>

                            {/* Direct WhatsApp Web Link */}
                            <a
                              href={`https://wa.me/${cleanPhone}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                              title="Buka Chat di WhatsApp Web"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-border/60">
              <span className="text-xs text-muted-foreground">
                Menampilkan {(currentPage - 1) * pageSize + 1} -{" "}
                {Math.min(currentPage * pageSize, totalItems)} dari {totalItems} lead
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-xs font-medium">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* DIALOG 1: Follow-Up WhatsApp Modal */}
      <Dialog open={followUpModalOpen} onOpenChange={setFollowUpModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold">Follow-Up Pesanan Scalev</DialogTitle>
                <DialogDescription className="text-xs">
                  Kirim pesan WhatsApp langsung melalui Slot 2 (ADMIN AYUMI).
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {selectedLead && (
            <div className="space-y-4 my-2">
              {/* Lead Info Box */}
              <div className="bg-muted/50 p-3 rounded-xl border border-border/70 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Penerima:</span>
                  <span className="font-semibold text-foreground">{selectedLead.customer_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nomor WhatsApp:</span>
                  <span className="font-mono text-foreground">{selectedLead.customer_phone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Produk:</span>
                  <span className="text-foreground truncate max-w-[200px]">{selectedLead.product_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nominal Pesanan:</span>
                  <span className="font-semibold text-primary">{formatIDR(selectedLead.gross_revenue || 0)}</span>
                </div>
              </div>

              {/* Sender Engine Info */}
              <div className="flex items-center justify-between text-[11px] px-3 py-2 rounded-lg bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20">
                <span className="flex items-center gap-1 font-medium">
                  <Smartphone className="w-3.5 h-3.5" />
                  Pengirim: Slot 2 ({slot2Phone})
                </span>
                <Badge variant="outline" className="text-[10px] bg-background">
                  {isSlot2Online ? "Terhubung" : "Offline"}
                </Badge>
              </div>

              {/* Message Textarea */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Pesan WhatsApp:</label>
                <Textarea
                  rows={5}
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  className="text-xs resize-none"
                  placeholder="Ketik pesan follow-up..."
                />
                <p className="text-[11px] text-muted-foreground">
                  Pesan di atas sudah otomatis dipersonalisasi dengan nama dan produk pelanggan.
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFollowUpModalOpen(false)}
              disabled={followUpMutation.isPending}
            >
              Batal
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (!selectedLead) return;
                followUpMutation.mutate({
                  leadId: selectedLead.id,
                  phone: selectedLead.customer_phone,
                  customerName: selectedLead.customer_name,
                  productName: selectedLead.product_name,
                  customMessage,
                });
              }}
              disabled={followUpMutation.isPending || !customMessage.trim()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
            >
              {followUpMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              <span>Kirim via Slot 2</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG 2: Sync Historical Scalev Orders */}
      <Dialog open={syncModalOpen} onOpenChange={setSyncModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <RefreshCw className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold">Tarik Data Order Scalev</DialogTitle>
                <DialogDescription className="text-xs">
                  Ambil data riwayat order dari Scalev API v3 dan otomatis cocokkan dengan database penjualan CS.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 my-2">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground">
                Jumlah Maksimal Order yang Ditarik:
              </label>
              <Select
                value={String(syncMaxOrders)}
                onValueChange={(val) => setSyncMaxOrders(Number(val))}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Pilih limit order" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25 Order Terakhir</SelectItem>
                  <SelectItem value="50">50 Order Terakhir</SelectItem>
                  <SelectItem value="100">100 Order Terakhir (Rekomendasi)</SelectItem>
                  <SelectItem value="250">250 Order Terakhir</SelectItem>
                  <SelectItem value="500">500 Order Terakhir</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl text-xs text-amber-800 dark:text-amber-300 space-y-1">
              <p className="font-semibold flex items-center gap-1">
                <Zap className="w-3.5 h-3.5" />
                Pencocokan Otomatis Real-Time:
              </p>
              <p className="text-[11px] leading-relaxed">
                Setiap order yang ditarik akan langsung dibandingkan dengan nomor WhatsApp di tabel pesanan CS. Jika cocok, otomatis ditandai status <strong>Closing (Won)</strong>.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSyncModalOpen(false)}
              disabled={syncMutation.isPending}
            >
              Batal
            </Button>
            <Button
              size="sm"
              onClick={() => syncMutation.mutate(syncMaxOrders)}
              disabled={syncMutation.isPending}
              className="bg-primary text-primary-foreground gap-1.5 font-medium"
            >
              {syncMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              <span>Mulai Sinkronisasi</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG 3: Webhook & API Settings Modal */}
      <Dialog open={configModalOpen} onOpenChange={setConfigModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Settings2 className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold">Konfigurasi Scalev & Follow-Up</DialogTitle>
                <DialogDescription className="text-xs">
                  Atur URL Webhook Scalev, API credentials, dan template WhatsApp follow-up.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 my-2 max-h-[65vh] overflow-y-auto pr-1">
            {/* Webhook URL Box */}
            <div className="space-y-1.5 p-3 rounded-xl bg-muted/60 border border-border">
              <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span>URL Webhook Scalev (Real-Time):</span>
                <span className="text-[10px] text-emerald-600 font-medium">Siap Dipakai</span>
              </label>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value="https://app.araahoney.my.id/api/scalev-webhook"
                  className="h-8 text-xs font-mono bg-background"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyWebhookUrl}
                  className="h-8 px-2.5 text-xs gap-1 shrink-0"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Salin
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">
                Tempel URL ini di <strong>Dashboard Scalev → Settings → Webhooks</strong>. Pilih event <code>order.created</code> dan <code>order.updated</code>.
              </p>
            </div>

            {/* API Key */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">API Key Secret Scalev:</label>
              <Input
                type="password"
                placeholder="sk_..."
                value={configForm.apiKey}
                onChange={(e) => setConfigForm({ ...configForm, apiKey: e.target.value })}
                className="h-8 text-xs font-mono"
              />
            </div>

            {/* Signing Secret */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Client ID:</label>
                <Input
                  placeholder="5823b649-..."
                  value={configForm.clientId}
                  onChange={(e) => setConfigForm({ ...configForm, clientId: e.target.value })}
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Signing Secret:</label>
                <Input
                  type="password"
                  placeholder="33FyqVrD2..."
                  value={configForm.signingSecret}
                  onChange={(e) => setConfigForm({ ...configForm, signingSecret: e.target.value })}
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>

            {/* WhatsApp Sender Slot */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">WhatsApp Engine Pengirim:</label>
              <Select
                value={configForm.senderSession}
                onValueChange={(val) => setConfigForm({ ...configForm, senderSession: val })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Pilih Slot Pengirim" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="campaign">
                    Slot 2: campaign ({slot2Phone}) - Rekomendasi
                  </SelectItem>
                  <SelectItem value="default">
                    Slot 1: default (Nomor Utama CS Araa Honey)
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Direkomendasikan menggunakan Slot 2 agar nomor utama CS terlindungi dari risiko pemblokiran.
              </p>
            </div>

            {/* Follow-Up Message Template */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Template Default Pesan Follow-Up:
              </label>
              <Textarea
                rows={4}
                value={configForm.followUpTemplate}
                onChange={(e) => setConfigForm({ ...configForm, followUpTemplate: e.target.value })}
                className="text-xs resize-none"
                placeholder="Halo Kak {nama}..."
              />
              <p className="text-[11px] text-muted-foreground">
                Variabel yang didukung: <code>{'{nama}'}</code>, <code>{'{produk}'}</code>, <code>{'{order_id}'}</code>.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfigModalOpen(false)}
              disabled={saveConfigMutation.isPending}
            >
              Batal
            </Button>
            <Button
              size="sm"
              onClick={() => saveConfigMutation.mutate(configForm)}
              disabled={saveConfigMutation.isPending}
              className="bg-primary text-primary-foreground font-medium gap-1.5"
            >
              {saveConfigMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              <span>Simpan Konfigurasi</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

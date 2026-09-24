import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useRef } from "react";
import { RequireAuth } from "@/components/require-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { formatIDR } from "@/lib/theme";
import { toast } from "sonner";
import { 
  Repeat, Users, Crown, Clock, TrendingUp, Search, MessageSquare, 
  Sparkles, HeartHandshake, ShoppingBag, 
  ChevronLeft, ChevronRight, AlertCircle, RefreshCw, Settings2,
  Send, CheckCircle2, Loader2, Calendar, ArrowUpDown, Target, ShieldAlert, ShieldCheck, CheckSquare, Square, Filter, PackageCheck,
  Smartphone, ExternalLink, Image as ImageIcon
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { 
  getLoyaltyStats, 
  getLoyaltyTemplates, 
  saveLoyaltyTemplates, 
  sendDirectLoyaltyWhatsApp 
} from "@/lib/loyalty.functions";
import { getMetaMessageTemplates } from "@/lib/waba-templates.functions";
import { getWahaSessionsInfo } from "@/lib/reaktivasi.functions";
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
  last_order_grams?: number | null;
  is_valid_wa?: boolean;
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
  const [crmFilter, setCrmFilter] = useState<"all" | "uncontacted" | "need_followup" | "contacted">("all");
  const [hideInvalidPhone, setHideInvalidPhone] = useState(true);
  const [sortBy, setSortBy] = useState<"oldest" | "newest" | "spent_desc" | "count_desc">("oldest");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Local state tracking sent customers
  const [sentMap, setSentMap] = useState<Record<string, boolean>>({});

  // Bulk Selection & Batch Send State
  const [selectedPhones, setSelectedPhones] = useState<string[]>([]);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [isBulkRunning, setIsBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{
    current: number;
    total: number;
    currentName: string;
    countdown: number;
    successCount: number;
    failedCount: number;
  }>({ current: 0, total: 0, currentName: "", countdown: 0, successCount: 0, failedCount: 0 });
  const bulkAbortRef = useRef(false);

  // Template Settings Dialog State
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateTab, setTemplateTab] = useState<"vip" | "potential" | "at_risk" | "all_repeat">("vip");

  // CRM Performance Timeframe Filter State
  const [crmTimeframe, setCrmTimeframe] = useState<"all" | "today" | "yesterday" | "7d" | "30d" | "this_month">("all");
  const [showDailyTable, setShowDailyTable] = useState(false);

  // Send Confirmation / Preview Dialog State
  const [previewDialogCustomer, setPreviewDialogCustomer] = useState<any | null>(null);
  const [previewMessage, setPreviewMessage] = useState("");
  const [previewImageUrl, setPreviewImageUrl] = useState("");

  // Sender WhatsApp Session State (waba, campaign, default)
  const [selectedSenderSession, setSelectedSenderSession] = useState<string>("waba");

  // Fetch WAHA & WABA Sessions Info
  const { data: wahaSessionsData } = useQuery({
    queryKey: ["crm-waha-sessions-info"],
    queryFn: async () => {
      return await getWahaSessionsInfo();
    },
    staleTime: 15 * 1000,
    refetchInterval: 15 * 1000,
  });

  // Fetch Meta Message Templates (Official HSM)
  const { data: metaTemplatesData, isLoading: isTemplatesLoading, refetch: refetchMetaTemplates } = useQuery({
    queryKey: ["meta-message-templates"],
    queryFn: () => getMetaMessageTemplates(),
  });

  const approvedMetaTemplates = useMemo(() => {
    return (metaTemplatesData?.templates || []).filter((t: any) => t.status === "APPROVED");
  }, [metaTemplatesData]);

  const [selectedMetaTemplateName, setSelectedMetaTemplateName] = useState<string>("repeat_order");

  const activeMetaTemplate = useMemo(() => {
    if (!approvedMetaTemplates.length) return null;
    return (
      approvedMetaTemplates.find((t: any) => t.name === selectedMetaTemplateName) ||
      approvedMetaTemplates[0]
    );
  }, [approvedMetaTemplates, selectedMetaTemplateName]);

  // 1. Fetch Loyalty Statistics
  const { data: apiResponse, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["customer-loyalty-serverfn-stats"],
    queryFn: async () => {
      try {
        const res = await getLoyaltyStats();
        if (res && res.customers && res.customers.length > 0) {
          return res as { customers: RawCustomer[]; trends: RawTrend[]; crmStats?: any; crmDailyTrends?: any[] };
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
          .select("id, customer_name, customer_phone, subtotal_gross, net_revenue, amount_received, created_at, returned")
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

      sorted.forEach((o: any) => {
        let p = (o.customer_phone || "").replace(/[^0-9]/g, "");
        if (p.startsWith("0")) p = "62" + p.slice(1);
        else if (p.startsWith("8")) p = "62" + p;
        if (p.length < 9) return;

        const m = o.created_at.slice(0, 7);
        const rev = Number(o.net_revenue !== null && o.net_revenue !== undefined ? o.net_revenue : (o.amount_received ?? o.subtotal_gross)) || 0;

        if (!monthBuckets[m]) {
          monthBuckets[m] = { month: m, total_orders: 0, new_orders: 0, repeat_orders: 0, new_omzet: 0, repeat_omzet: 0 };
        }

        monthBuckets[m].total_orders += 1;
        if (!firstSeenMap[p]) {
          firstSeenMap[p] = m;
          monthBuckets[m].new_orders += 1;
          monthBuckets[m].new_omzet += rev;
        } else {
          monthBuckets[m].repeat_orders += 1;
          monthBuckets[m].repeat_omzet += rev;
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
        customerMap[p].total_spent += rev;
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
        return res as {
          vip: string;
          potential: string;
          at_risk: string;
          all_repeat: string;
          vip_image_url?: string;
          potential_image_url?: string;
          at_risk_image_url?: string;
          all_repeat_image_url?: string;
        };
      } catch (err) {
        console.error(err);
        return {
          vip: "Halo Kak {nama}, terima kasih telah menjadi pelanggan prioritas Araa Honey ({total_order}x pemesanan)! 🍯",
          potential: "Halo Kak {nama}, bagaimana rasa madu {madu_favorit} yang dipesan pada {tanggal_order}? 🍯",
          at_risk: "Halo Kak {nama}, rindu menyapa Kakak sejak pesanan {tanggal_order}! 🍯",
          all_repeat: "Halo Kak {nama}, salam sehat dari Araa Honey! 🍯",
          vip_image_url: "",
          potential_image_url: "",
          at_risk_image_url: "",
          all_repeat_image_url: "",
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
    vip_image_url: "",
    potential_image_url: "",
    at_risk_image_url: "",
    all_repeat_image_url: "",
  });

  // Sync templates on load
  useMemo(() => {
    if (templatesData) {
      setTemplates({
        vip: templatesData.vip || "",
        potential: templatesData.potential || "",
        at_risk: templatesData.at_risk || "",
        all_repeat: templatesData.all_repeat || "",
        vip_image_url: templatesData.vip_image_url || "",
        potential_image_url: templatesData.potential_image_url || "",
        at_risk_image_url: templatesData.at_risk_image_url || "",
        all_repeat_image_url: templatesData.all_repeat_image_url || "",
      });
    }
  }, [templatesData]);

  // Mutation to save templates
  const saveTemplateMutation = useMutation({
    mutationFn: async (newTemplates: typeof templates) => {
      return await saveLoyaltyTemplates({ data: newTemplates });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loyalty-crm-templates"] });
      toast.success("✅ Template pesan & flyer CRM berhasil disimpan!");
      setTemplateDialogOpen(false);
    },
    onError: (err: any) => {
      toast.error(err.message || "Gagal menyimpan template");
    },
  });

  // Mutation to send Direct WhatsApp via WABA or WAHA
  const sendWhatsAppMutation = useMutation({
    mutationFn: async ({
      phone,
      customerName,
      message,
      favoriteHoney,
      imageUrl,
      senderSession,
      templateName,
      templateLanguage,
      namedParameters,
      headerImageUrl,
    }: {
      phone: string;
      customerName: string;
      message: string;
      favoriteHoney?: string;
      imageUrl?: string;
      senderSession?: string;
      templateName?: string;
      templateLanguage?: string;
      namedParameters?: Record<string, string>;
      headerImageUrl?: string;
    }) => {
      return await sendDirectLoyaltyWhatsApp({
        data: {
          phone,
          customerName,
          message,
          favoriteHoney,
          imageUrl,
          senderSession: senderSession || selectedSenderSession,
          templateName,
          templateLanguage,
          namedParameters,
          headerImageUrl,
        },
      });
    },
    onSuccess: (_, variables) => {
      const activeSess = variables.senderSession || selectedSenderSession;
      const channelLabel =
        activeSess === "waba"
          ? (variables.templateName ? `WABA Resmi Meta HSM [${variables.templateName}]` : "WABA Resmi Meta (+62 856-4540-6949)")
          : activeSess === "default"
          ? "Slot 1 (CS)"
          : "Slot 2 (Kampanye)";
      toast.success(`✅ Pesan ${variables.templateName ? "Template Resmi Meta " : variables.imageUrl ? "bergambar " : ""}berhasil dikirim ke ${variables.customerName} (${variables.phone}) via ${channelLabel}!`);
      setSentMap((prev) => ({ ...prev, [variables.phone]: true }));
      queryClient.invalidateQueries({ queryKey: ["customer-loyalty-serverfn-stats"] });
      setPreviewDialogCustomer(null);
    },
    onError: (err: any) => {
      toast.error(`❌ Gagal mengirim WhatsApp: ${err.message}`);
    },
  });

  // Process data and segments
  const { customers, summaryStats, monthlyTrends, crmDailyTrends } = useMemo(() => {
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
      const lastGrams = Number(c.last_order_grams) || 1000;
      const isValidWa = c.is_valid_wa !== false;

      // Smart Consumption Cycle Calculation
      let minCycle = 38;
      let maxCycle = 65;
      let cycleLabel = "~50 hari";

      if (lastGrams <= 250) {
        minCycle = 10;
        maxCycle = 25;
        cycleLabel = "~15 hari";
      } else if (lastGrams <= 500) {
        minCycle = 25;
        maxCycle = 45;
        cycleLabel = "~35 hari";
      } else if (lastGrams <= 1000) {
        minCycle = 38;
        maxCycle = 65;
        cycleLabel = "~50 hari";
      } else {
        minCycle = 60;
        maxCycle = 95;
        cycleLabel = "~75 hari";
      }

      if (orderCount >= 2) {
        repeatCount += 1;
      }

      if (orderCount >= 3) {
        vipCount += 1;
      } else if (orderCount === 1 && daysSince >= minCycle && daysSince <= maxCycle) {
        potentialCount += 1;
      } else if (orderCount === 1 && daysSince > maxCycle) {
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
        lastOrderGrams: lastGrams,
        cycleLabel,
        minCycle,
        maxCycle,
        isValidWa,
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

    const rawCrmStats = (apiResponse as any)?.crmStats || {};
    const totalCrmSent = Number(rawCrmStats.total_crm_sent) || 0;
    const convertedCustomers = Number(rawCrmStats.converted_customers) || 0;
    const crmRevenue = Number(rawCrmStats.crm_revenue) || 0;
    const crmConversionRate = totalCrmSent > 0 ? Number(((convertedCustomers / totalCrmSent) * 100).toFixed(1)) : 0;

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
        totalCrmSent,
        convertedCustomers,
        crmRevenue,
        crmConversionRate,
      },
      monthlyTrends: trends,
      crmDailyTrends: (apiResponse as any)?.crmDailyTrends || [],
    };
  }, [apiResponse]);

  // Dynamic CRM ROI Calculation based on selected timeframe
  const filteredCrmStats = useMemo(() => {
    const rawCrmStats = (apiResponse as any)?.crmStats || { total_crm_sent: 0, converted_customers: 0, crm_revenue: 0 };
    const dailyList: Array<{
      date: string;
      sent_count: number;
      loyalty_sent_count?: number;
      reaktivasi_sent_count?: number;
      waba_sent_count?: number;
      wa1_sent_count?: number;
      wa2_sent_count?: number;
      converted_count: number;
      waba_converted_count?: number;
      wa1_converted_count?: number;
      wa2_converted_count?: number;
      revenue: number;
      waba_revenue?: number;
      wa1_revenue?: number;
      wa2_revenue?: number;
    }> = crmDailyTrends || [];

    if (crmTimeframe === "all") {
      const totalSent = Number(rawCrmStats.total_crm_sent) || 0;
      const loyaltySent = Number(rawCrmStats.loyalty_crm_sent ?? rawCrmStats.total_crm_sent) || 0;
      const reaktivasiSent = Number(rawCrmStats.reaktivasi_crm_sent) || 0;
      const wabaSent = Number(rawCrmStats.waba_sent) || 0;
      const wa1Sent = Number(rawCrmStats.wa1_sent) || 0;
      const wa2Sent = Number(rawCrmStats.wa2_sent) || 0;

      const converted = Number(rawCrmStats.converted_customers) || 0;
      const wabaConverted = Number(rawCrmStats.waba_converted) || 0;
      const wa1Converted = Number(rawCrmStats.wa1_converted) || 0;
      const wa2Converted = Number(rawCrmStats.wa2_converted) || 0;

      const rev = Number(rawCrmStats.crm_revenue) || 0;
      const wabaRevenue = Number(rawCrmStats.waba_revenue) || 0;
      const wa1Revenue = Number(rawCrmStats.wa1_revenue) || 0;
      const wa2Revenue = Number(rawCrmStats.wa2_revenue) || 0;

      const rate = totalSent > 0 ? Number(((converted / totalSent) * 100).toFixed(1)) : 0;
      const wabaRate = wabaSent > 0 ? Number(((wabaConverted / wabaSent) * 100).toFixed(1)) : 0;
      const wa1Rate = wa1Sent > 0 ? Number(((wa1Converted / wa1Sent) * 100).toFixed(1)) : 0;
      const wa2Rate = wa2Sent > 0 ? Number(((wa2Converted / wa2Sent) * 100).toFixed(1)) : 0;

      return {
        totalSent,
        loyaltySent,
        reaktivasiSent,
        wabaSent,
        wa1Sent,
        wa2Sent,
        converted,
        wabaConverted,
        wa1Converted,
        wa2Converted,
        revenue: rev,
        wabaRevenue,
        wa1Revenue,
        wa2Revenue,
        rate,
        wabaRate,
        wa1Rate,
        wa2Rate,
        label: "Semua Waktu",
      };
    }

    // Time calculations in Asia/Jakarta (UTC+7)
    const nowUtc = new Date();
    const nowWib = new Date(nowUtc.getTime() + 7 * 60 * 60 * 1000);
    const todayStr = nowWib.toISOString().slice(0, 10);

    const yesterdayWib = new Date(nowWib.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayStr = yesterdayWib.toISOString().slice(0, 10);

    const sevenDaysAgoWib = new Date(nowWib.getTime() - 7 * 24 * 60 * 60 * 1000);
    const sevenDaysAgoStr = sevenDaysAgoWib.toISOString().slice(0, 10);

    const thirtyDaysAgoWib = new Date(nowWib.getTime() - 30 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgoStr = thirtyDaysAgoWib.toISOString().slice(0, 10);

    const thisMonthStr = todayStr.slice(0, 7);

    let matchingDays = dailyList;
    let label = "Semua Waktu";

    if (crmTimeframe === "today") {
      matchingDays = dailyList.filter((d) => d.date === todayStr);
      label = `Hari Ini (${formatDateIndo(todayStr)})`;
    } else if (crmTimeframe === "yesterday") {
      matchingDays = dailyList.filter((d) => d.date === yesterdayStr);
      label = `Kemarin (${formatDateIndo(yesterdayStr)})`;
    } else if (crmTimeframe === "7d") {
      matchingDays = dailyList.filter((d) => d.date >= sevenDaysAgoStr);
      label = "7 Hari Terakhir";
    } else if (crmTimeframe === "30d") {
      matchingDays = dailyList.filter((d) => d.date >= thirtyDaysAgoStr);
      label = "30 Hari Terakhir";
    } else if (crmTimeframe === "this_month") {
      matchingDays = dailyList.filter((d) => d.date.startsWith(thisMonthStr));
      label = "Bulan Ini";
    }

    const totalSent = matchingDays.reduce((acc, d) => acc + (Number(d.sent_count) || 0), 0);
    const loyaltySent = matchingDays.reduce((acc, d) => acc + (Number(d.loyalty_sent_count ?? d.sent_count) || 0), 0);
    const reaktivasiSent = matchingDays.reduce((acc, d) => acc + (Number(d.reaktivasi_sent_count) || 0), 0);
    const wabaSent = matchingDays.reduce((acc, d) => acc + (Number(d.waba_sent_count) || 0), 0);
    const wa1Sent = matchingDays.reduce((acc, d) => acc + (Number(d.wa1_sent_count) || 0), 0);
    const wa2Sent = matchingDays.reduce((acc, d) => acc + (Number(d.wa2_sent_count) || 0), 0);

    const converted = matchingDays.reduce((acc, d) => acc + (Number(d.converted_count) || 0), 0);
    const wabaConverted = matchingDays.reduce((acc, d) => acc + (Number(d.waba_converted_count) || 0), 0);
    const wa1Converted = matchingDays.reduce((acc, d) => acc + (Number(d.wa1_converted_count) || 0), 0);
    const wa2Converted = matchingDays.reduce((acc, d) => acc + (Number(d.wa2_converted_count) || 0), 0);

    const revenue = matchingDays.reduce((acc, d) => acc + (Number(d.revenue) || 0), 0);
    const wabaRevenue = matchingDays.reduce((acc, d) => acc + (Number(d.waba_revenue) || 0), 0);
    const wa1Revenue = matchingDays.reduce((acc, d) => acc + (Number(d.wa1_revenue) || 0), 0);
    const wa2Revenue = matchingDays.reduce((acc, d) => acc + (Number(d.wa2_revenue) || 0), 0);

    const rate = totalSent > 0 ? Number(((converted / totalSent) * 100).toFixed(1)) : 0;
    const wabaRate = wabaSent > 0 ? Number(((wabaConverted / wabaSent) * 100).toFixed(1)) : 0;
    const wa1Rate = wa1Sent > 0 ? Number(((wa1Converted / wa1Sent) * 100).toFixed(1)) : 0;
    const wa2Rate = wa2Sent > 0 ? Number(((wa2Converted / wa2Sent) * 100).toFixed(1)) : 0;

    return {
      totalSent,
      loyaltySent,
      reaktivasiSent,
      wabaSent,
      wa1Sent,
      wa2Sent,
      converted,
      wabaConverted,
      wa1Converted,
      wa2Converted,
      revenue,
      wabaRevenue,
      wa1Revenue,
      wa2Revenue,
      rate,
      wabaRate,
      wa1Rate,
      wa2Rate,
      label,
    };
  }, [apiResponse, crmDailyTrends, crmTimeframe]);

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
    const imgKey = `${activeTab}_image_url` as keyof typeof templates;
    setPreviewImageUrl(templates[imgKey] || "");
    setPreviewDialogCustomer(c);
  };

  // Execute Direct Send via WABA or WAHA
  const handleExecuteSend = () => {
    if (!previewDialogCustomer) return;
    const isWaba = selectedSenderSession === "waba";
    sendWhatsAppMutation.mutate({
      phone: previewDialogCustomer.phone,
      customerName: previewDialogCustomer.name,
      message: previewMessage,
      favoriteHoney: previewDialogCustomer.favoriteHoney,
      imageUrl: previewImageUrl,
      senderSession: selectedSenderSession,
      templateName: isWaba ? selectedMetaTemplateName : undefined,
      templateLanguage: isWaba ? (activeMetaTemplate?.language || "id") : undefined,
      namedParameters: isWaba ? {
        nama: previewDialogCustomer.name || "Pelanggan",
        tanggal_order: formatDateIndo(previewDialogCustomer.lastOrderDate),
      } : undefined,
      headerImageUrl: isWaba ? (previewImageUrl || undefined) : undefined,
    });
  };

  // Eligibility check for CRM action & bulk selection (Smart Cooldown Protection)
  const isEligibleForCrm = (c: {
    isValidWa?: boolean;
    daysSinceLastOrder: number;
    minCycle: number;
    lastCrmSentAt?: string | null;
    phone: string;
  }) => {
    if (!c.isValidWa) return false;
    // Must have reached minimum consumption cycle
    if (c.daysSinceLastOrder < c.minCycle) return false;
    // If already sent in this current session
    if (sentMap[c.phone]) return false;
    // If sent within the last 30 days
    if (c.lastCrmSentAt) {
      const sentDate = new Date(c.lastCrmSentAt);
      const now = new Date();
      const daysSinceCrm = Math.floor((now.getTime() - sentDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceCrm < 30) return false;
    }
    return true;
  };

  // Toggle selection for a single customer
  const handleToggleSelectPhone = (phone: string) => {
    setSelectedPhones((prev) =>
      prev.includes(phone) ? prev.filter((p) => p !== phone) : [...prev, phone]
    );
  };

  // Filtered Customers based on active tab, search, CRM status, and validity
  const filteredCustomers = useMemo(() => {
    let list = customers;

    if (activeTab === "vip") {
      list = list.filter((c) => c.orderCount >= 3);
    } else if (activeTab === "potential") {
      list = list.filter((c) => c.orderCount === 1 && c.daysSinceLastOrder >= c.minCycle && c.daysSinceLastOrder <= c.maxCycle);
    } else if (activeTab === "at_risk") {
      list = list.filter((c) => c.orderCount === 1 && c.daysSinceLastOrder > c.maxCycle);
    } else if (activeTab === "all_repeat") {
      list = list.filter((c) => c.orderCount >= 2);
    }

    // CRM Follow-Up Status Filter
    if (crmFilter === "uncontacted") {
      list = list.filter((c) => !c.lastCrmSentAt && !sentMap[c.phone]);
    } else if (crmFilter === "need_followup") {
      list = list.filter((c) => {
        if (c.daysSinceLastOrder < c.minCycle) return false;
        if (sentMap[c.phone]) return false;
        if (!c.lastCrmSentAt) return true;
        const days = Math.floor((new Date().getTime() - new Date(c.lastCrmSentAt).getTime()) / (1000 * 60 * 60 * 24));
        return days >= 30;
      });
    } else if (crmFilter === "contacted") {
      list = list.filter((c) => {
        if (sentMap[c.phone]) return true;
        if (!c.lastCrmSentAt) return false;
        const days = Math.floor((new Date().getTime() - new Date(c.lastCrmSentAt).getTime()) / (1000 * 60 * 60 * 24));
        return days < 30;
      });
    }

    // Filter invalid marketplace numbers
    if (hideInvalidPhone) {
      list = list.filter((c) => c.isValidWa);
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.favoriteHoney.toLowerCase().includes(q));
    }

    return list.sort((a, b) => {
      if (sortBy === "oldest") {
        return b.daysSinceLastOrder - a.daysSinceLastOrder;
      } else if (sortBy === "newest") {
        return a.daysSinceLastOrder - b.daysSinceLastOrder;
      } else if (sortBy === "spent_desc") {
        return b.totalSpent - a.totalSpent;
      } else if (sortBy === "count_desc") {
        return b.orderCount - a.orderCount;
      }
      return b.daysSinceLastOrder - a.daysSinceLastOrder;
    });
  }, [customers, activeTab, crmFilter, hideInvalidPhone, searchTerm, sortBy, sentMap]);

  // Pagination
  const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage) || 1;
  const paginatedCustomers = filteredCustomers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Toggle selection for all eligible customers on current page
  const handleToggleSelectAllPage = () => {
    const eligiblePagePhones = paginatedCustomers
      .filter(isEligibleForCrm)
      .map((c) => c.phone);
    if (eligiblePagePhones.length === 0) return;

    const allSelected = eligiblePagePhones.every((p) => selectedPhones.includes(p));

    if (allSelected) {
      setSelectedPhones((prev) => prev.filter((p) => !eligiblePagePhones.includes(p)));
    } else {
      setSelectedPhones((prev) => Array.from(new Set([...prev, ...eligiblePagePhones])));
    }
  };

  // Execute Bulk Send
  const handleExecuteBulkSend = async () => {
    if (selectedPhones.length === 0) return;
    setIsBulkRunning(true);
    bulkAbortRef.current = false;

    const targets = customers.filter(
      (c) => selectedPhones.includes(c.phone) && isEligibleForCrm(c)
    );
    const total = targets.length;
    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < total; i++) {
      if (bulkAbortRef.current) break;

      const c = targets[i];
      setBulkProgress({
        current: i + 1,
        total,
        currentName: c.name,
        countdown: 0,
        successCount,
        failedCount,
      });

      const formatted = formatCustomerMessage(c);
      const imgKey = `${activeTab}_image_url` as keyof typeof templates;
      const imgUrl = templates[imgKey] || "";

      const isWaba = selectedSenderSession === "waba";
      try {
        await sendDirectLoyaltyWhatsApp({
          data: {
            phone: c.phone,
            customerName: c.name,
            message: formatted,
            favoriteHoney: c.favoriteHoney,
            imageUrl: imgUrl,
            senderSession: selectedSenderSession,
            templateName: isWaba ? selectedMetaTemplateName : undefined,
            templateLanguage: isWaba ? (activeMetaTemplate?.language || "id") : undefined,
            namedParameters: isWaba ? {
              nama: c.name || "Pelanggan",
              tanggal_order: formatDateIndo(c.lastOrderDate),
            } : undefined,
            headerImageUrl: isWaba ? (imgUrl || undefined) : undefined,
          },
        });
        setSentMap((prev) => ({ ...prev, [c.phone]: true }));
        successCount++;
      } catch (err: any) {
        console.warn(`Bulk send error to ${c.phone}, retrying once in 2.5s...:`, err);
        // Smart retry once in case of temporary network or gateway glitch
        try {
          await new Promise((r) => setTimeout(r, 2500));
          if (!bulkAbortRef.current) {
            await sendDirectLoyaltyWhatsApp({
              data: {
                phone: c.phone,
                customerName: c.name,
                message: formatted,
                favoriteHoney: c.favoriteHoney,
                imageUrl: imgUrl,
                senderSession: selectedSenderSession,
                templateName: isWaba ? selectedMetaTemplateName : undefined,
                templateLanguage: isWaba ? (activeMetaTemplate?.language || "id") : undefined,
                namedParameters: isWaba ? {
                  nama: c.name || "Pelanggan",
                  tanggal_order: formatDateIndo(c.lastOrderDate),
                } : undefined,
                headerImageUrl: isWaba ? (imgUrl || undefined) : undefined,
              },
            });
            setSentMap((prev) => ({ ...prev, [c.phone]: true }));
            successCount++;
          } else {
            failedCount++;
          }
        } catch (retryErr: any) {
          console.error(`Bulk send retry also failed for ${c.phone}:`, retryErr);
          failedCount++;
        }
      }

      setBulkProgress((prev) => ({
        ...prev,
        successCount,
        failedCount,
      }));

      // Randomized safety delay (10-14 sec) to protect WhatsApp account from bans
      if (i < total - 1 && !bulkAbortRef.current) {
        const delay = Math.floor(Math.random() * 5) + 10;
        for (let cd = delay; cd > 0; cd--) {
          if (bulkAbortRef.current) break;
          setBulkProgress((prev) => ({ ...prev, countdown: cd }));
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }

    setIsBulkRunning(false);
    setBulkModalOpen(false);
    setSelectedPhones([]);
    queryClient.invalidateQueries({ queryKey: ["customer-loyalty-serverfn-stats"] });
    toast.success(`🎉 Selesai! Berhasil mengirim pesan ke ${successCount} pelanggan.`);
  };

  const handleStopBulkSend = () => {
    bulkAbortRef.current = true;
    toast.info("⏹️ Pengiriman massal dihentikan.");
  };

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

      {/* WhatsApp Sender Session Controller */}
      <div className="bg-card border border-muted/70 p-3.5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-foreground flex items-center gap-2">
              <span>Nomor WhatsApp Pengirim CRM:</span>
              <span className="text-[11px] font-normal text-muted-foreground">
                (Pilih jalur pengirim pesan loyalitas & sapaan repeat)
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
              <span>
                Status Sesi Pengirim:{" "}
                <strong className={
                  selectedSenderSession === "waba"
                    ? "text-emerald-600 dark:text-emerald-400 font-bold"
                    : (selectedSenderSession === "campaign"
                        ? wahaSessionsData?.campaignSession?.status === "WORKING"
                        : wahaSessionsData?.mainSession?.status === "WORKING")
                        ? "text-emerald-600 dark:text-emerald-400 font-bold"
                        : "text-amber-600 dark:text-amber-400 font-bold"
                }>
                  {selectedSenderSession === "waba"
                    ? "ONLINE (Resmi Meta Cloud API)"
                    : selectedSenderSession === "campaign"
                    ? (wahaSessionsData?.campaignSession?.status || "STOPPED")
                    : (wahaSessionsData?.mainSession?.status || "STOPPED")}
                </strong>
              </span>

              {selectedSenderSession === "waba" && (
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                  WABA Resmi Meta (+62 856-4540-6949) • Anti-Banned & Tombol Interaktif
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <Select value={selectedSenderSession} onValueChange={setSelectedSenderSession}>
            <SelectTrigger className="h-9 text-xs font-semibold min-w-[320px] bg-background border-muted/80 shadow-2xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="waba" className="text-xs">
                <div className="flex items-center justify-between gap-3 w-full">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="font-bold">WABA Resmi Meta (+62 856-4540-6949)</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-semibold ml-1 py-0 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                    Resmi Meta (Anti-Banned)
                  </Badge>
                </div>
              </SelectItem>
              <SelectItem value="campaign" className="text-xs">
                <div className="flex items-center justify-between gap-3 w-full">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${wahaSessionsData?.campaignSession?.status === "WORKING" ? "bg-emerald-500" : "bg-amber-500"}`} />
                    <span className="font-bold">Slot 2: Nomor Kampanye (WAHA Outreach)</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-mono ml-1 py-0 border-emerald-500/30 text-emerald-700 dark:text-emerald-300">
                    {wahaSessionsData?.campaignSession?.status === "WORKING"
                      ? (wahaSessionsData.campaignSession.me?.id?.split("@")[0] || "Online")
                      : (wahaSessionsData?.campaignSession?.status || "Perlu QR")}
                  </Badge>
                </div>
              </SelectItem>
              <SelectItem value="default" className="text-xs">
                <div className="flex items-center justify-between gap-3 w-full">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${wahaSessionsData?.mainSession?.status === "WORKING" ? "bg-emerald-500" : "bg-rose-500"}`} />
                    <span className="font-bold">Slot 1: CS Utama ({wahaSessionsData?.mainSession?.me?.id?.split("@")[0] || "081337324522"})</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-mono ml-1 py-0">
                    CS Utama
                  </Badge>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>

          {selectedSenderSession === "waba" && (
            <div className="flex items-center gap-1.5">
              <Select value={selectedMetaTemplateName} onValueChange={setSelectedMetaTemplateName}>
                <SelectTrigger className="h-9 text-xs font-bold min-w-[210px] bg-emerald-500/10 border-emerald-500/40 text-emerald-800 dark:text-emerald-200">
                  <div className="flex items-center gap-1.5 truncate">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Template: {selectedMetaTemplateName || "repeat_order"}</span>
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {approvedMetaTemplates.length === 0 ? (
                    <SelectItem value="repeat_order" className="text-xs font-bold">
                      repeat_order (MARKETING)
                    </SelectItem>
                  ) : (
                    approvedMetaTemplates.map((tpl: any) => (
                      <SelectItem key={tpl.id} value={tpl.name} className="text-xs">
                        <div className="flex items-center justify-between gap-3 w-full">
                          <span className="font-bold">{tpl.name}</span>
                          <span className="text-[10px] text-muted-foreground uppercase">{tpl.category}</span>
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          <Link to="/pengaturan/whatsapp">
            <Button size="sm" variant="outline" className="h-9 text-xs gap-1.5 font-semibold" title="Buka Pengaturan WhatsApp">
              <Settings2 className="w-3.5 h-3.5 text-muted-foreground" />
              Kelola Sesi & WABA
            </Button>
          </Link>
        </div>
      </div>

      {/* 4 KPI Cards Loyalitas Global */}
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
              Dihitung otomatis per gramasi botol
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

      {/* Header & Filter Periode CRM WhatsApp (ROI) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              Evaluasi Hasil Nyata & Konversi CRM (ROI)
              <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                {filteredCrmStats.label}
              </span>
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Pantau jumlah pengiriman harian dan berapa pelanggan yang langsung membeli ulang.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Timeframe Buttons */}
          <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-xl border border-muted/60 text-xs">
            <Button
              size="sm"
              variant={crmTimeframe === "today" ? "default" : "ghost"}
              onClick={() => setCrmTimeframe("today")}
              className={`h-7 text-xs px-2.5 rounded-lg ${crmTimeframe === "today" ? "bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-2xs" : "text-muted-foreground hover:text-foreground"}`}
            >
              Hari Ini
            </Button>
            <Button
              size="sm"
              variant={crmTimeframe === "yesterday" ? "default" : "ghost"}
              onClick={() => setCrmTimeframe("yesterday")}
              className={`h-7 text-xs px-2.5 rounded-lg ${crmTimeframe === "yesterday" ? "bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-2xs" : "text-muted-foreground hover:text-foreground"}`}
            >
              Kemarin
            </Button>
            <Button
              size="sm"
              variant={crmTimeframe === "7d" ? "default" : "ghost"}
              onClick={() => setCrmTimeframe("7d")}
              className={`h-7 text-xs px-2.5 rounded-lg ${crmTimeframe === "7d" ? "bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-2xs" : "text-muted-foreground hover:text-foreground"}`}
            >
              7 Hari
            </Button>
            <Button
              size="sm"
              variant={crmTimeframe === "30d" ? "default" : "ghost"}
              onClick={() => setCrmTimeframe("30d")}
              className={`h-7 text-xs px-2.5 rounded-lg ${crmTimeframe === "30d" ? "bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-2xs" : "text-muted-foreground hover:text-foreground"}`}
            >
              30 Hari
            </Button>
            <Button
              size="sm"
              variant={crmTimeframe === "this_month" ? "default" : "ghost"}
              onClick={() => setCrmTimeframe("this_month")}
              className={`h-7 text-xs px-2.5 rounded-lg ${crmTimeframe === "this_month" ? "bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-2xs" : "text-muted-foreground hover:text-foreground"}`}
            >
              Bulan Ini
            </Button>
            <Button
              size="sm"
              variant={crmTimeframe === "all" ? "default" : "ghost"}
              onClick={() => setCrmTimeframe("all")}
              className={`h-7 text-xs px-2.5 rounded-lg ${crmTimeframe === "all" ? "bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-2xs" : "text-muted-foreground hover:text-foreground"}`}
            >
              Semua Waktu
            </Button>
          </div>

          {/* Toggle Button for Daily Breakdown Table */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowDailyTable((prev) => !prev)}
            className="h-8 text-xs gap-1.5 border-muted/80 shadow-2xs"
          >
            <Calendar className="w-3.5 h-3.5 text-amber-500" />
            {showDailyTable ? "Tutup Rekap Harian" : "Lihat Rekap Harian"}
          </Button>
        </div>
      </div>

      {/* 3 KPI Cards: Metrik Hasil Nyata & Konversi CRM WhatsApp (ROI) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-stretch">
        <Card className="border-emerald-500/30 bg-gradient-to-br from-card to-emerald-500/[0.04] shadow-2xs flex flex-col justify-between">
          <CardContent className="p-4 flex flex-col justify-between h-full gap-3">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5">
                <Send className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Total Pesan WA Terkirim</p>
                <div className="text-xl font-extrabold text-foreground flex items-baseline gap-1.5 flex-wrap">
                  <span>{filteredCrmStats.loyaltySent.toLocaleString("id-ID")}</span>
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Pesan Loyalitas</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Periode: {filteredCrmStats.label}
                  {filteredCrmStats.reaktivasiSent > 0 && (
                    <span className="ml-1 text-sky-600 dark:text-sky-400 font-medium">
                      (+{filteredCrmStats.reaktivasiSent.toLocaleString("id-ID")} Reaktivasi)
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Breakdown Jalur Pengiriman WA: WABA, WA 1, WA 2 */}
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/50">
              <div className="bg-emerald-500/10 dark:bg-emerald-500/15 rounded-lg px-2 py-1.5 border border-emerald-500/20 text-center">
                <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">WABA</div>
                <div className="text-sm font-extrabold text-foreground">{(filteredCrmStats.wabaSent || 0).toLocaleString("id-ID")}</div>
              </div>
              <div className="bg-blue-500/10 dark:bg-blue-500/15 rounded-lg px-2 py-1.5 border border-blue-500/20 text-center">
                <div className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">WA 1 (CS)</div>
                <div className="text-sm font-extrabold text-foreground">{(filteredCrmStats.wa1Sent || 0).toLocaleString("id-ID")}</div>
              </div>
              <div className="bg-purple-500/10 dark:bg-purple-500/15 rounded-lg px-2 py-1.5 border border-purple-500/20 text-center">
                <div className="text-[11px] font-semibold text-purple-700 dark:text-purple-300">WA 2 (Outreach)</div>
                <div className="text-sm font-extrabold text-foreground">{(filteredCrmStats.wa2Sent || 0).toLocaleString("id-ID")}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-amber-500/30 bg-gradient-to-br from-card to-amber-500/[0.04] shadow-2xs flex flex-col justify-between">
          <CardContent className="p-4 flex flex-col justify-between h-full gap-3">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">
                <Target className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Konversi Repeat Pasca WA</p>
                <div className="text-xl font-extrabold text-amber-600 dark:text-amber-400 flex items-center gap-2">
                  {filteredCrmStats.converted.toLocaleString("id-ID")} Orang
                  <span className="text-xs px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold">
                    {filteredCrmStats.rate}%
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">Pelanggan beli kembali setelah di-WA</p>
              </div>
            </div>

            {/* Breakdown Closing & Tingkat Konversi per Jalur WA: WABA, WA 1, WA 2 */}
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/50">
              <div className="bg-emerald-500/10 dark:bg-emerald-500/15 rounded-lg px-2 py-1.5 border border-emerald-500/20 text-center">
                <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">WABA</div>
                <div className="text-sm font-extrabold text-foreground">
                  {(filteredCrmStats.wabaConverted || 0).toLocaleString("id-ID")}
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 ml-1">({filteredCrmStats.wabaRate}%)</span>
                </div>
              </div>
              <div className="bg-blue-500/10 dark:bg-blue-500/15 rounded-lg px-2 py-1.5 border border-blue-500/20 text-center">
                <div className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">WA 1 (CS)</div>
                <div className="text-sm font-extrabold text-foreground">
                  {(filteredCrmStats.wa1Converted || 0).toLocaleString("id-ID")}
                  <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 ml-1">({filteredCrmStats.wa1Rate}%)</span>
                </div>
              </div>
              <div className="bg-purple-500/10 dark:bg-purple-500/15 rounded-lg px-2 py-1.5 border border-purple-500/20 text-center">
                <div className="text-[11px] font-semibold text-purple-700 dark:text-purple-300">WA 2 (Outreach)</div>
                <div className="text-sm font-extrabold text-foreground">
                  {(filteredCrmStats.wa2Converted || 0).toLocaleString("id-ID")}
                  <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 ml-1">({filteredCrmStats.wa2Rate}%)</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-500/30 bg-gradient-to-br from-card to-blue-500/[0.04] shadow-2xs flex flex-col justify-between">
          <CardContent className="p-4 flex flex-col justify-between h-full gap-3">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Omzet Bersih CRM</p>
                  <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-1.5 py-0.2 rounded border border-blue-500/20">Net Omzet</span>
                </div>
                <div className="text-xl font-extrabold text-blue-600 dark:text-blue-400">
                  {formatIDR(filteredCrmStats.revenue)}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  AOV Bersih: {filteredCrmStats.converted > 0 ? formatIDR(Math.round(filteredCrmStats.revenue / filteredCrmStats.converted)) : "Rp 0"}
                </p>
              </div>
            </div>

            {/* Breakdown Omzet Bersih per Jalur WA: WABA, WA 1, WA 2 */}
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/50">
              <div className="bg-emerald-500/10 dark:bg-emerald-500/15 rounded-lg px-1.5 py-1.5 border border-emerald-500/20 text-center">
                <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">WABA</div>
                <div className="text-xs font-extrabold text-foreground truncate" title={formatIDR(filteredCrmStats.wabaRevenue || 0)}>
                  {formatIDR(filteredCrmStats.wabaRevenue || 0)}
                </div>
              </div>
              <div className="bg-blue-500/10 dark:bg-blue-500/15 rounded-lg px-1.5 py-1.5 border border-blue-500/20 text-center">
                <div className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">WA 1 (CS)</div>
                <div className="text-xs font-extrabold text-foreground truncate" title={formatIDR(filteredCrmStats.wa1Revenue || 0)}>
                  {formatIDR(filteredCrmStats.wa1Revenue || 0)}
                </div>
              </div>
              <div className="bg-purple-500/10 dark:bg-purple-500/15 rounded-lg px-1.5 py-1.5 border border-purple-500/20 text-center">
                <div className="text-[11px] font-semibold text-purple-700 dark:text-purple-300">WA 2 (Outreach)</div>
                <div className="text-xs font-extrabold text-foreground truncate" title={formatIDR(filteredCrmStats.wa2Revenue || 0)}>
                  {formatIDR(filteredCrmStats.wa2Revenue || 0)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabel Rincian Harian Performa CRM */}
      {showDailyTable && (
        <Card className="border-muted/60 shadow-xs animate-in fade-in duration-200">
          <CardHeader className="pb-3 border-b border-muted/30 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-600" />
                Rekap Harian Performa Pengiriman CRM (14 Hari Terakhir)
              </CardTitle>
              <CardDescription className="text-xs">
                Melihat perbandingan jumlah pesan terkirim, pelanggan yang closing, dan omzet per hari.
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowDailyTable(false)}
              className="h-7 text-xs text-muted-foreground"
            >
              Tutup
            </Button>
          </CardHeader>
          <CardContent className="pt-3 px-0 pb-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 text-xs">
                    <TableHead className="py-2.5 pl-4">Tanggal Kirim CRM</TableHead>
                    <TableHead className="py-2.5 text-center">Pesan Terkirim</TableHead>
                    <TableHead className="py-2.5 text-center">Closing / Repeat</TableHead>
                    <TableHead className="py-2.5 text-center">Tingkat Konversi</TableHead>
                    <TableHead className="py-2.5 text-right pr-4">Omzet Bersih CRM</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {crmDailyTrends && crmDailyTrends.length > 0 ? (
                    crmDailyTrends.slice(0, 14).map((d: any) => {
                      const sent = Number(d.sent_count) || 0;
                      const conv = Number(d.converted_count) || 0;
                      const rev = Number(d.revenue) || 0;
                      const rate = sent > 0 ? ((conv / sent) * 100).toFixed(1) : "0.0";
                      const isToday = d.date === new Date(new Date().getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);

                      return (
                        <TableRow key={d.date} className={`text-xs hover:bg-muted/20 ${isToday ? "bg-emerald-500/[0.04] font-semibold" : ""}`}>
                          <TableCell className="py-2.5 pl-4 font-medium flex items-center gap-2">
                            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                            <span>{formatDateIndo(d.date)}</span>
                            {isToday && (
                              <span className="text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold px-1.5 py-0.5 rounded">
                                Hari Ini
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="py-2.5 text-center font-semibold text-foreground">
                            <div>{Number(d.loyalty_sent_count ?? d.sent_count).toLocaleString("id-ID")} Pesan</div>
                            <div className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground mt-0.5 flex-wrap">
                              <span className="text-emerald-600 dark:text-emerald-400 font-medium">WABA: {Number(d.waba_sent_count || 0)}</span>
                              <span>•</span>
                              <span className="text-blue-600 dark:text-blue-400 font-medium">WA 1: {Number(d.wa1_sent_count || 0)}</span>
                              <span>•</span>
                              <span className="text-purple-600 dark:text-purple-400 font-medium">WA 2: {Number(d.wa2_sent_count || 0)}</span>
                            </div>
                            {Number(d.reaktivasi_sent_count) > 0 && (
                              <div className="text-[10px] text-sky-600 dark:text-sky-400 font-normal">
                                +{Number(d.reaktivasi_sent_count).toLocaleString("id-ID")} Reaktivasi
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="py-2.5 text-center font-bold text-amber-600 dark:text-amber-400">
                            <div>{conv.toLocaleString("id-ID")} Orang</div>
                            <div className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground mt-0.5 flex-wrap">
                              <span className="text-emerald-600 dark:text-emerald-400 font-medium">WABA: {Number(d.waba_converted_count || 0)}</span>
                              <span>•</span>
                              <span className="text-blue-600 dark:text-blue-400 font-medium">WA 1: {Number(d.wa1_converted_count || 0)}</span>
                              <span>•</span>
                              <span className="text-purple-600 dark:text-purple-400 font-medium">WA 2: {Number(d.wa2_converted_count || 0)}</span>
                            </div>
                          </TableCell>
                          <TableCell className="py-2.5 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${
                              Number(rate) >= 10
                                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                : Number(rate) >= 5
                                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                                : "bg-muted text-muted-foreground"
                            }`}>
                              {rate}%
                            </span>
                          </TableCell>
                          <TableCell className="py-2.5 text-right pr-4 font-bold text-foreground">
                            <div>{formatIDR(rev)}</div>
                            <div className="flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground mt-0.5 flex-wrap">
                              <span className="text-emerald-600 dark:text-emerald-400 font-medium">WABA: {formatIDR(Number(d.waba_revenue || 0))}</span>
                              <span>•</span>
                              <span className="text-blue-600 dark:text-blue-400 font-medium">WA 1: {formatIDR(Number(d.wa1_revenue || 0))}</span>
                              {Number(d.wa2_revenue || 0) > 0 && (
                                <>
                                  <span>•</span>
                                  <span className="text-purple-600 dark:text-purple-400 font-medium">WA 2: {formatIDR(Number(d.wa2_revenue || 0))}</span>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="py-6 text-center text-xs text-muted-foreground">
                        Belum ada riwayat pengiriman CRM harian yang tercatat.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

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
              Pilih segmen audiens, filter status kontak, dan kirimkan pesan WhatsApp 1-klik atau massal via WAHA server.
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
              onClick={() => { setActiveTab("vip"); setCurrentPage(1); setSelectedPhones([]); }}
              className={`h-auto py-2.5 px-3 flex flex-col items-start text-left gap-1 rounded-xl transition-all ${
                activeTab === "vip" ? "bg-purple-600 hover:bg-purple-700 text-white" : "border-purple-500/30 hover:bg-purple-500/5"
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs font-bold">
                <Crown className="w-3.5 h-3.5" />
                Super VIP (&ge;3x)
              </div>
              <span className="text-[11px] opacity-85">{summaryStats.vipCount.toLocaleString("id-ID")} Pelanggan</span>
            </Button>

            {/* Tab 2 */}
            <Button
              variant={activeTab === "potential" ? "default" : "outline"}
              onClick={() => { setActiveTab("potential"); setCurrentPage(1); setSelectedPhones([]); }}
              className={`h-auto py-2.5 px-3 flex flex-col items-start text-left gap-1 rounded-xl transition-all ${
                activeTab === "potential" ? "bg-amber-600 hover:bg-amber-700 text-white" : "border-amber-500/30 hover:bg-amber-500/5"
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs font-bold">
                <ShoppingBag className="w-3.5 h-3.5" />
                Waktunya Re-Order (Siklus Cerdas)
              </div>
              <span className="text-[11px] opacity-85">{summaryStats.potentialCount.toLocaleString("id-ID")} Pelanggan</span>
            </Button>

            {/* Tab 3 */}
            <Button
              variant={activeTab === "at_risk" ? "default" : "outline"}
              onClick={() => { setActiveTab("at_risk"); setCurrentPage(1); setSelectedPhones([]); }}
              className={`h-auto py-2.5 px-3 flex flex-col items-start text-left gap-1 rounded-xl transition-all ${
                activeTab === "at_risk" ? "bg-rose-600 hover:bg-rose-700 text-white" : "border-rose-500/30 hover:bg-rose-500/5"
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs font-bold">
                <AlertCircle className="w-3.5 h-3.5" />
                At-Risk (Lewat Siklus)
              </div>
              <span className="text-[11px] opacity-85">{summaryStats.atRiskCount.toLocaleString("id-ID")} Pelanggan</span>
            </Button>

            {/* Tab 4 */}
            <Button
              variant={activeTab === "all_repeat" ? "default" : "outline"}
              onClick={() => { setActiveTab("all_repeat"); setCurrentPage(1); setSelectedPhones([]); }}
              className={`h-auto py-2.5 px-3 flex flex-col items-start text-left gap-1 rounded-xl transition-all ${
                activeTab === "all_repeat" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "border-emerald-500/30 hover:bg-emerald-500/5"
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs font-bold">
                <Repeat className="w-3.5 h-3.5" />
                Semua Repeat (&ge;2x)
              </div>
              <span className="text-[11px] opacity-85">{summaryStats.repeatCount.toLocaleString("id-ID")} Pelanggan</span>
            </Button>
          </div>

          {/* CRM Status Filter Bar & Marketplace Sensor Toggle */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-2.5 rounded-xl bg-muted/40 border border-muted/50">
            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground mr-1 flex items-center gap-1">
                <Filter className="w-3.5 h-3.5" />
                Status WA:
              </span>
              <Button
                size="sm"
                variant={crmFilter === "all" ? "secondary" : "ghost"}
                onClick={() => { setCrmFilter("all"); setCurrentPage(1); }}
                className="h-7 text-xs px-2.5 rounded-lg"
              >
                Semua
              </Button>
              <Button
                size="sm"
                variant={crmFilter === "uncontacted" ? "secondary" : "ghost"}
                onClick={() => { setCrmFilter("uncontacted"); setCurrentPage(1); }}
                className={`h-7 text-xs px-2.5 rounded-lg gap-1.5 ${crmFilter === "uncontacted" ? "text-rose-600 dark:text-rose-400 font-bold" : "text-muted-foreground"}`}
              >
                <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
                Belum Pernah di-WA
              </Button>
              <Button
                size="sm"
                variant={crmFilter === "need_followup" ? "secondary" : "ghost"}
                onClick={() => { setCrmFilter("need_followup"); setCurrentPage(1); }}
                className={`h-7 text-xs px-2.5 rounded-lg gap-1.5 ${crmFilter === "need_followup" ? "text-amber-600 dark:text-amber-400 font-bold" : "text-muted-foreground"}`}
              >
                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                Perlu Follow-up Ulang
              </Button>
              <Button
                size="sm"
                variant={crmFilter === "contacted" ? "secondary" : "ghost"}
                onClick={() => { setCrmFilter("contacted"); setCurrentPage(1); }}
                className={`h-7 text-xs px-2.5 rounded-lg gap-1.5 ${crmFilter === "contacted" ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-muted-foreground"}`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                Sudah di-WA (&lt;30h)
              </Button>
            </div>

            {/* Invalid Phone Toggle */}
            <div className="flex items-center gap-2 pl-1">
              <Checkbox
                id="hide-invalid-phone"
                checked={hideInvalidPhone}
                onCheckedChange={(checked) => { setHideInvalidPhone(!!checked); setCurrentPage(1); }}
              />
              <label htmlFor="hide-invalid-phone" className="text-xs text-muted-foreground cursor-pointer select-none">
                Sembunyikan nomor sensor Shopee
              </label>
            </div>
          </div>

          {/* Floating Action Banner: Bulk Selection Active */}
          {selectedPhones.length > 0 && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-200">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
                <CheckSquare className="w-4 h-4 text-amber-600" />
                <span><strong className="text-foreground">{selectedPhones.length}</strong> pelanggan terpilih dari daftar</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedPhones([])}
                  className="h-8 text-xs border-amber-500/30 hover:bg-amber-500/10"
                >
                  Batal Pilih
                </Button>
                <Button
                  size="sm"
                  onClick={() => setBulkModalOpen(true)}
                  className="h-8 text-xs gap-1.5 font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                >
                  <Send className="w-3.5 h-3.5" />
                  Kirim WA Massal ({selectedPhones.length})
                </Button>
              </div>
            </div>
          )}

          {/* Customer Table */}
          {isLoading ? (
            <div className="py-12 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-amber-500" />
              Menghitung dan memproses data loyalitas pelanggan...
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">Tidak ada pelanggan yang sesuai dengan filter ini.</div>
          ) : (
            <div className="rounded-xl border border-muted/50 overflow-hidden shadow-2xs">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 text-xs">
                    <TableHead className="w-10 text-center py-2.5">
                      <Checkbox
                        checked={
                          paginatedCustomers.filter(isEligibleForCrm).length > 0 &&
                          paginatedCustomers.filter(isEligibleForCrm).every(c => selectedPhones.includes(c.phone))
                        }
                        onCheckedChange={handleToggleSelectAllPage}
                        title="Pilih semua pelanggan yang siap di-follow up di halaman ini"
                      />
                    </TableHead>
                    <TableHead className="py-2.5">Nama & Kontak</TableHead>
                    <TableHead className="py-2.5 text-center">Frekuensi</TableHead>
                    <TableHead className="py-2.5 text-right">Total Belanja (LTV)</TableHead>
                    <TableHead className="py-2.5 text-center">Order Terakhir</TableHead>
                    <TableHead className="py-2.5">Madu & Siklus Habis</TableHead>
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

                    const isSelected = selectedPhones.includes(c.phone);

                    return (
                      <TableRow key={c.phone} className={`text-xs hover:bg-muted/20 ${isSelected ? "bg-amber-500/[0.04]" : ""}`}>
                        <TableCell className="text-center py-2.5">
                          <Checkbox
                            checked={isSelected}
                            disabled={!isEligibleForCrm(c)}
                            onCheckedChange={() => handleToggleSelectPhone(c.phone)}
                          />
                        </TableCell>
                        <TableCell className="py-2.5 font-medium">
                          <div className="font-semibold text-foreground flex items-center gap-1.5">
                            {c.name}
                            {!c.isValidWa && (
                              <span className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-500/15 px-1 rounded font-normal" title="Nomor disensor oleh marketplace">
                                Disensor
                              </span>
                            )}
                          </div>
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
                          <div className="flex flex-col gap-0.5">
                            <span className="font-semibold text-foreground">{c.favoriteHoney}</span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-muted-foreground bg-muted/80 px-1.5 py-0.5 rounded font-medium">
                                {c.lastOrderGrams >= 1000 ? `${(c.lastOrderGrams/1000).toFixed(1)} kg` : `${c.lastOrderGrams} gr`} • Siklus {c.cycleLabel}
                              </span>
                              {c.daysSinceLastOrder >= c.minCycle && c.orderCount === 1 && (
                                <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded animate-pulse">
                                  ⚡ Waktunya Beli
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-2.5 text-center">
                          {!c.isValidWa ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground bg-muted/60 px-2 py-1 rounded-md" title="Nomor tidak dapat di-WA langsung">
                              <ShieldAlert className="w-3 h-3 text-muted-foreground" />
                              Disensor
                            </span>
                          ) : c.daysSinceLastOrder <= 7 ? (
                            <span 
                              className="inline-flex items-center gap-1 text-[11px] text-sky-700 dark:text-sky-400 bg-sky-500/10 px-2.5 py-1 rounded-md font-medium border border-sky-500/20" 
                              title={`Pesanan baru selesai ${c.daysSinceLastOrder} hari lalu (${c.lastOrderGrams >= 1000 ? (c.lastOrderGrams/1000).toFixed(1) + ' kg' : c.lastOrderGrams + ' gr'}). Belum saatnya follow-up.`}
                            >
                              <PackageCheck className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                              Baru Selesai Order
                            </span>
                          ) : c.daysSinceLastOrder < c.minCycle ? (
                            <span 
                              className="inline-flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-md font-medium border border-amber-500/20" 
                              title={`Madu masih dikonsumsi. Siklus re-order diperkirakan ~${c.minCycle - c.daysSinceLastOrder} hari lagi (${c.cycleLabel}).`}
                            >
                              <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                              Sedang Konsumsi (~{c.minCycle - c.daysSinceLastOrder}h lagi)
                            </span>
                          ) : isSent || isSentToday ? (
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
                              className="h-7 text-[11px] gap-1.5 font-semibold text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-700 shadow-2xs"
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

      {/* Modal Dialog: Kirim WA Massal (Bulk Send with Random Delay) */}
      <Dialog open={bulkModalOpen} onOpenChange={(open) => !isBulkRunning && setBulkModalOpen(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-emerald-600">
              <Send className="w-5 h-5" />
              Kirim WhatsApp Massal ({selectedPhones.length} Pelanggan)
            </DialogTitle>
            <DialogDescription className="text-xs">
              Pesan akan dikirim otomatis satu per satu melalui server WAHA dengan jeda acak aman (10–14 detik per pesan) untuk mencegah pemblokiran nomor.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {!isBulkRunning ? (
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-muted/40 border border-muted/60 text-xs space-y-1.5">
                  <div className="flex justify-between font-semibold">
                    <span>Jumlah Penerima:</span>
                    <span className="text-emerald-600 font-bold">{selectedPhones.length} Kontak Valid</span>
                  </div>
                  <div className="flex justify-between items-center text-muted-foreground">
                    <span>Jalur Pengirim:</span>
                    <span className="font-bold text-foreground flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${selectedSenderSession === "waba" ? "bg-emerald-500" : "bg-blue-500"}`} />
                      {selectedSenderSession === "waba" ? "WABA Resmi Meta (+62 856-4540-6949)" : selectedSenderSession === "campaign" ? "WAHA Slot 2" : "WAHA Slot 1"}
                    </span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Estimasi Waktu:</span>
                    <span>~{Math.ceil((selectedPhones.length * 12) / 60)} menit</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Template Digunakan:</span>
                    <span className="font-medium text-foreground">
                      {selectedSenderSession === "waba" ? `HSM Meta: ${selectedMetaTemplateName}` : `Segmen ${activeTab.replace('_', ' ')}`}
                    </span>
                  </div>
                </div>

                {selectedSenderSession === "waba" ? (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-800 dark:text-emerald-300 space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                      Jalur Resmi Meta Cloud API (100% Anti-Banned)
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Pesan akan dikirim menggunakan template resmi <b>{selectedMetaTemplateName}</b> yang telah disetujui Meta. Setiap penerima akan otomatis mendapatkan parameter nama dan riwayat order secara personal.
                    </p>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-200">
                    ⚠️ <strong>Proteksi Nomor Bisnis:</strong> Setiap pesan diberi jeda acak manusiawi agar nomor WhatsApp tetap aman dan nyaman bagi pelanggan.
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold">
                    <span>Progres Pengiriman:</span>
                    <span>{bulkProgress.current} / {bulkProgress.total}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                    <div 
                      className="bg-emerald-600 h-2.5 transition-all duration-300 rounded-full"
                      style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-muted/40 border border-muted/60 text-xs space-y-1">
                  <p className="font-semibold text-foreground truncate">
                    Sedang memproses: <span className="text-emerald-600">{bulkProgress.currentName}</span>
                  </p>
                  {bulkProgress.countdown > 0 ? (
                    <p className="text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-amber-500" />
                      Jeda aman berikutnya: <strong className="text-amber-600">{bulkProgress.countdown} detik</strong>
                    </p>
                  ) : (
                    <p className="text-emerald-600 font-medium flex items-center gap-1">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Mengirim via gateway WAHA...
                    </p>
                  )}
                </div>

                <div className="flex justify-between text-[11px] text-muted-foreground px-1">
                  <span>✅ Berhasil: {bulkProgress.successCount}</span>
                  <span>❌ Gagal: {bulkProgress.failedCount}</span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            {!isBulkRunning ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setBulkModalOpen(false)}>
                  Batal
                </Button>
                <Button size="sm" onClick={handleExecuteBulkSend} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
                  Mulai Kirim Sekarang
                </Button>
              </>
            ) : (
              <Button variant="destructive" size="sm" onClick={handleStopBulkSend} className="w-full">
                Hentikan Pengiriman
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            {selectedSenderSession === "waba" && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-800 dark:text-emerald-300 flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    Jalur Pengirim Aktif: WABA Resmi Meta (+62 856-4540-6949)
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Sesuai aturan Meta, pesan bisnis di luar 24 jam otomatis menggunakan <b>Template Resmi (HSM)</b> seperti <code>repeat_order</code>. Pengaturan teks bebas di bawah ini digunakan saat mengirim melalui <b>WA 1 (CS)</b> atau <b>WA 2 (Kampanye)</b>.
                  </p>
                </div>
                <Link to="/pengaturan/whatsapp">
                  <Button size="sm" variant="outline" className="text-[11px] h-7 shrink-0 border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
                    Kelola Template Meta
                  </Button>
                </Link>
              </div>
            )}

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

            {/* Image Flyer Input */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
                <span>URL Foto / Flyer Promo (Opsional):</span>
                {templates[`${templateTab}_image_url` as keyof typeof templates] && (
                  <button
                    type="button"
                    onClick={() =>
                      setTemplates((prev) => ({
                        ...prev,
                        [`${templateTab}_image_url`]: "",
                      }))
                    }
                    className="text-rose-500 hover:underline text-[10px]"
                  >
                    Hapus Gambar
                  </button>
                )}
              </div>
              <Input
                value={templates[`${templateTab}_image_url` as keyof typeof templates] || ""}
                onChange={(e) =>
                  setTemplates((prev) => ({
                    ...prev,
                    [`${templateTab}_image_url`]: e.target.value,
                  }))
                }
                placeholder="https://.../flyer-promo-madu.jpg (kosongkan jika teks saja)"
                className="h-8 text-xs font-mono"
              />
              {templates[`${templateTab}_image_url` as keyof typeof templates] && (
                <div className="flex items-center gap-3 p-2 bg-muted/40 rounded-xl border border-muted/60">
                  <img
                    src={templates[`${templateTab}_image_url` as keyof typeof templates]}
                    alt="Preview Promo"
                    className="h-14 w-14 object-cover rounded-lg border shadow-xs"
                    onError={(e) => {
                      (e.target as any).style.display = "none";
                    }}
                  />
                  <div className="text-[11px] text-muted-foreground">
                    <span className="font-semibold text-foreground flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-amber-500" />
                      Foto Flyer Terpasang
                    </span>
                    <p>Gambar ini akan otomatis terkirim bersama caption teks di bawah saat CS klik Kirim WA.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Template Textarea */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
                <span>Caption Teks WhatsApp:</span>
              </div>
              <Textarea
                rows={5}
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
              Simpan Template & Flyer
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
              Kirim Pesan WhatsApp CRM ({selectedSenderSession === "waba" ? "WABA Resmi Meta HSM" : selectedSenderSession === "campaign" ? "WAHA Slot 2" : "WAHA Slot 1"})
            </DialogTitle>
            <DialogDescription className="text-xs">
              {selectedSenderSession === "waba"
                ? "Pesan dikirim via WABA Resmi Meta Cloud API menggunakan Template Resmi (HSM) anti-banned 100%."
                : "Pesan akan langsung dikirim dari server WAHA Araa Honey ke nomor penerima."}
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
                <div className="flex justify-between items-center pt-1.5 border-t border-muted/50 text-[11px]">
                  <span className="text-muted-foreground">Nomor Pengirim:</span>
                  <div className="flex items-center gap-1.5 font-bold">
                    <span className={`w-2 h-2 rounded-full ${
                      selectedSenderSession === "waba"
                        ? "bg-emerald-500"
                        : (selectedSenderSession === "campaign"
                            ? wahaSessionsData?.campaignSession?.status === "WORKING"
                            : wahaSessionsData?.mainSession?.status === "WORKING")
                            ? "bg-emerald-500"
                            : "bg-amber-500"
                    }`} />
                    <span>
                      {selectedSenderSession === "waba"
                        ? "WABA Resmi Meta (+62 856-4540-6949)"
                        : selectedSenderSession === "campaign"
                        ? `Slot 2 (Kampanye - ${wahaSessionsData?.campaignSession?.me?.id?.split("@")[0] || "Outreach"})`
                        : `Slot 1 (CS Utama - ${wahaSessionsData?.mainSession?.me?.id?.split("@")[0] || "081337324522"})`}
                    </span>
                  </div>
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

              {/* JIKA WABA: TAMPILKAN PRATINJAU TEMPLATE RESMI META (HSM) */}
              {selectedSenderSession === "waba" ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <div>
                        <div className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                          Template Resmi Meta (HSM)
                        </div>
                        <div className="text-[10px] text-muted-foreground">Wajib lolos 24h window & Anti-Banned 100%</div>
                      </div>
                    </div>
                    <Select value={selectedMetaTemplateName} onValueChange={setSelectedMetaTemplateName}>
                      <SelectTrigger className="h-8 text-xs font-bold bg-background min-w-[170px] border-emerald-500/40">
                        <SelectValue placeholder="Pilih Template" />
                      </SelectTrigger>
                      <SelectContent>
                        {approvedMetaTemplates.length === 0 ? (
                          <SelectItem value="repeat_order" className="text-xs font-bold">repeat_order (MARKETING)</SelectItem>
                        ) : (
                          approvedMetaTemplates.map((t: any) => (
                            <SelectItem key={t.id} value={t.name} className="text-xs">
                              {t.name} ({t.category})
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* WhatsApp Chat Simulated Bubble Preview */}
                  <div className="rounded-xl border border-emerald-500/20 bg-muted/20 overflow-hidden shadow-xs">
                    {/* Header Image */}
                    <div className="w-full bg-black/5 flex items-center justify-center relative overflow-hidden border-b border-border/40">
                      <img
                        src={previewImageUrl || "https://waha.araahoney.my.id/media/1788438796747-chatgpt-image-sep-3-2026-07_32_54-pm.png"}
                        alt="Flyer Repeat Order"
                        className="w-full h-40 object-cover"
                        onError={(e) => {
                          (e.target as any).src = "https://waha.araahoney.my.id/media/1788438796747-chatgpt-image-sep-3-2026-07_32_54-pm.png";
                        }}
                      />
                      <Badge className="absolute top-2 right-2 bg-black/70 text-white backdrop-blur-xs text-[9px] border-none font-semibold">
                        Header Flyer Meta
                      </Badge>
                    </div>

                    {/* Body Text */}
                    <div className="p-3 space-y-2 text-xs">
                      <p className="whitespace-pre-line text-foreground leading-relaxed font-sans">
                        {activeMetaTemplate?.components?.find((c: any) => c.type === "BODY")?.text
                          ? activeMetaTemplate.components.find((c: any) => c.type === "BODY").text
                              .replace(/\{\{nama\}\}/g, previewDialogCustomer.name || "Pelanggan")
                              .replace(/\{\{tanggal_order\}\}/g, formatDateIndo(previewDialogCustomer.lastOrderDate))
                              .replace(/\{\{1\}\}/g, previewDialogCustomer.name || "Pelanggan")
                              .replace(/\{\{2\}\}/g, formatDateIndo(previewDialogCustomer.lastOrderDate))
                          : `Halo Bapak/Ibu ${previewDialogCustomer.name || "Pelanggan"}, salam hangat dari Araa Honey 🍯✨\n\nMengingat pesanan terakhir Bapak/Ibu pada tanggal ${formatDateIndo(previewDialogCustomer.lastOrderDate)}, sudah cukup lama belum stok Madu Araa-nya lagi nih 😊\n\nKebetulan kami baru saja selesai panen dan minggu ini ada promo khusus pelanggan setia:\n🚚 Subsidi ongkir\n🎁 1 Kg Madu Araa + BONUS 100 gr\n\nKalau stok madu di rumah sudah habis, tinggal klik "Order Lagi" di bawah ya Kak. Kami bantu proses pengirimannya 😊`}
                      </p>

                      <p className="text-[10px] text-muted-foreground pt-1.5 border-t border-border/40">
                        {activeMetaTemplate?.components?.find((c: any) => c.type === "FOOTER")?.text || "Araa Honey • Solusi Madu yang Terjamin Murni"}
                      </p>

                      {/* Interactive Button */}
                      <div className="pt-2 border-t border-border/40">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-[11px] font-bold shadow-2xs">
                          <ShoppingBag className="w-3.5 h-3.5" /> ORDER LAGI
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-[11px] text-muted-foreground flex items-center justify-between">
                    <span>Parameter Otomatis:</span>
                    <span className="font-semibold text-foreground">
                      nama = <b>{previewDialogCustomer.name}</b>, tanggal = <b>{formatDateIndo(previewDialogCustomer.lastOrderDate)}</b>
                    </span>
                  </div>
                </div>
              ) : (
                /* JIKA WAHA: TAMPILKAN FORMAT GAMBAR & TEXTAREA BIASA */
                <>
                  {previewImageUrl && (
                    <div className="relative rounded-xl overflow-hidden border border-emerald-500/30 bg-emerald-500/5 p-2.5 flex items-center gap-3">
                      <img
                        src={previewImageUrl}
                        alt="Promo Preview"
                        className="h-14 w-14 object-cover rounded-lg border shadow-2xs"
                        onError={(e) => {
                          (e.target as any).style.display = "none";
                        }}
                      />
                      <div className="text-xs flex-1">
                        <div className="font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5" />
                          Pesan Bergambar (Flyer Promo)
                        </div>
                        <p className="text-[10px] text-muted-foreground">Gambar akan dikirim bersama caption teks di bawah ke WA pelanggan.</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setPreviewImageUrl("")}
                        className="h-7 text-[11px] text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 px-2"
                        title="Kirim sebagai teks saja tanpa gambar"
                      >
                        Hapus Foto
                      </Button>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-muted-foreground">Isi Caption Teks:</label>
                    <Textarea
                      rows={5}
                      value={previewMessage}
                      onChange={(e) => setPreviewMessage(e.target.value)}
                      className="text-xs font-sans leading-relaxed"
                    />
                  </div>
                </>
              )}
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
                  Mengirim via {selectedSenderSession === "waba" ? "WABA..." : "WAHA..."}
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  {selectedSenderSession === "waba" ? "Kirim via WABA Resmi (HSM) 🚀" : "Kirim Sekarang 🚀"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RequireAuth } from "@/components/require-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatIDR } from "@/lib/theme";
import { 
  Megaphone, Key, ShieldAlert, CheckCircle, RefreshCw, AlertCircle,
  TrendingUp, Users, MousePointerClick, Percent, Target, CirclePlay, CirclePause, Eye,
  Database, Bot, Sparkles, Send, Lightbulb, CheckCircle2, AlertOctagon, Film,
  MessageSquare, Copy, ExternalLink, Loader2, Award, Zap
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from "recharts";
import { generateAIAdsAnalysis } from "@/lib/ai-ads-analyzer";
import { sendTelegramMessage } from "@/lib/telegram";

export const Route = createFileRoute("/meta-ads")({
  component: () => (
    <RequireAuth requiredPermission="meta_ads">
      <MetaAdsPage />
    </RequireAuth>
  ),
});

// Mock Data for Simulation Mode
const MOCK_ACCOUNTS = [
  { id: "act_294819401", name: "Araa Honey - Main Business Account", currency: "IDR", account_status: 1 },
  { id: "act_103849102", name: "Araa Honey - Retargeting Ad Account", currency: "IDR", account_status: 1 },
  { id: "act_849204910", name: "Personal Ad Account (Backup)", currency: "IDR", account_status: 1 }
];

const MOCK_CAMPAIGNS = [
  { id: "c_1", account_id: "act_294819401", name: "[Conversion] Promo Madu Hutan Riau - June 2026", status: "ACTIVE", objective: "OUTCOME_SALES", daily_budget: 250000, spend: 1750000, impressions: 125000, clicks: 3750, conversions: 125 },
  { id: "c_2", account_id: "act_294819401", name: "[Traffic] WhatsApp Chat Lead - Reseller Prospecting", status: "ACTIVE", objective: "OUTCOME_TRAFFIC", daily_budget: 100000, spend: 700000, impressions: 95000, clicks: 2850, conversions: 95 },
  { id: "c_3", account_id: "act_294819401", name: "[Awareness] Video Profile & Testimonials Araa Honey", status: "PAUSED", objective: "OUTCOME_AWARENESS", daily_budget: 50000, spend: 350000, impressions: 70000, clicks: 1400, conversions: 0 },
  
  { id: "c_4", account_id: "act_103849102", name: "[Retargeting] Custom Audience - Add to Cart 30 Days", status: "ACTIVE", objective: "OUTCOME_SALES", daily_budget: 80000, spend: 560000, impressions: 45000, clicks: 1350, conversions: 58 },
  { id: "c_5", account_id: "act_103849102", name: "[Retargeting] Social Engagement (Instagram/FB) 90 Days", status: "PAUSED", objective: "OUTCOME_SALES", daily_budget: 40000, spend: 280000, impressions: 32000, clicks: 960, conversions: 24 }
];

const MOCK_ADSETS = [
  { id: "as_1", campaign_id: "c_1", name: "Adset - LAL 2% Pembeli Madu Riau (All Indonesia)", status: "ACTIVE", daily_budget: 150000, spend: 1050000, impressions: 75000, clicks: 2250, conversions: 75 },
  { id: "as_2", campaign_id: "c_1", name: "Adset - Interest: Madu Murni, Herbal, Kesehatan", status: "ACTIVE", daily_budget: 100000, spend: 700000, impressions: 50000, clicks: 1500, conversions: 50 },
  { id: "as_3", campaign_id: "c_2", name: "Adset - Broad Audience (Age 25-45, Female)", status: "ACTIVE", daily_budget: 100000, spend: 700000, impressions: 95000, clicks: 2850, conversions: 95 },
  { id: "as_4", campaign_id: "c_3", name: "Adset - Broad Audience (Age 18+, Male/Female)", status: "PAUSED", daily_budget: 50000, spend: 350000, impressions: 70000, clicks: 1400, conversions: 0 },
  
  { id: "as_5", campaign_id: "c_4", name: "Adset - Website Visitors 30 Days", status: "ACTIVE", daily_budget: 80000, spend: 560000, impressions: 45000, clicks: 1350, conversions: 58 },
  { id: "as_6", campaign_id: "c_5", name: "Adset - IG Engagers 90 Days", status: "PAUSED", daily_budget: 40000, spend: 280000, impressions: 32000, clicks: 960, conversions: 24 }
];

const MOCK_ADS = [
  { id: "ad_1", adset_id: "as_1", name: "Ad 01 - Video Pouring Honey Aesthetic", status: "ACTIVE", spend: 600000, impressions: 42000, clicks: 1300, conversions: 48, preview_url: "https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=120" },
  { id: "ad_2", adset_id: "as_1", name: "Ad 02 - Carousel Benefit Madu Araa", status: "ACTIVE", spend: 450000, impressions: 33000, clicks: 950, conversions: 27, preview_url: "https://images.unsplash.com/photo-1558642452-9d2a7deb7f62?w=120" },
  { id: "ad_3", adset_id: "as_2", name: "Ad 03 - Image Testimonial Ibu Rumah Tangga", status: "ACTIVE", spend: 700000, impressions: 50000, clicks: 1500, conversions: 50, preview_url: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=120" },
  { id: "ad_4", adset_id: "as_3", name: "Ad 01 - WhatsApp Click Direct Chat", status: "ACTIVE", spend: 700000, impressions: 95000, clicks: 2850, conversions: 95, preview_url: "https://images.unsplash.com/photo-1614680376593-902f74fa0d41?w=120" },
  { id: "ad_5", adset_id: "as_4", name: "Ad 01 - Brand Story Video Short", status: "PAUSED", spend: 350000, impressions: 70000, clicks: 1400, conversions: 0, preview_url: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=120" },
  
  { id: "ad_6", adset_id: "as_5", name: "Ad 01 - Promo Diskon 15% Retargeting", status: "ACTIVE", spend: 560000, impressions: 45000, clicks: 1350, conversions: 58, preview_url: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=120" },
  { id: "ad_7", adset_id: "as_6", name: "Ad 01 - Social Proof Review 5 Stars", status: "PAUSED", spend: 280000, impressions: 32000, clicks: 960, conversions: 24, preview_url: "https://images.unsplash.com/photo-1560769629-975ec94e6a86?w=120" }
];

// Helper function to format date to Indonesian format
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

const CustomProfitabilityTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-background/95 backdrop-blur-md border border-border/80 p-3.5 rounded-xl shadow-xl space-y-2 text-xs font-semibold">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
          {formatDateIndo(label)}
        </p>
        {payload.map((pld: any) => {
          let dotColor = "bg-blue-500";
          if (pld.name === "Omzet Riil") dotColor = "bg-emerald-500";
          else if (pld.name === "Biaya Iklan") dotColor = "bg-amber-500";
          else if (pld.name === "Laba Bersih") dotColor = pld.value >= 0 ? "bg-sky-500" : "bg-red-500";

          return (
            <div key={pld.name} className="flex items-center justify-between gap-6">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
                {pld.name}
              </span>
              <span className={`font-bold ${pld.name === "Laba Bersih" && pld.value < 0 ? "text-red-500" : "text-foreground"}`}>
                {formatIDR(pld.value)}
              </span>
            </div>
          );
        })}
      </div>
    );
  }
  return null;
};

function MetaAdsPage() {
  const qc = useQueryClient();
  const [tokenInput, setTokenInput] = useState("");
  const [activeToken, setActiveToken] = useState("");
  const [selectedAccount, setSelectedAccount] = useState("");
  const [dateRange, setDateRange] = useState("7d"); // 1d, 7d, 30d
  const [isSimulation, setIsSimulation] = useState(true);
  const [syncingToDb, setSyncingToDb] = useState(false);
  const [showAllAccounts, setShowAllAccounts] = useState(false);

  // Simulation State
  const [simulatedCampaigns, setSimulatedCampaigns] = useState(MOCK_CAMPAIGNS);
  const [simulatedAdSets, setSimulatedAdSets] = useState(MOCK_ADSETS);
  const [simulatedAds, setSimulatedAds] = useState(MOCK_ADS);

  // Load Config from Database
  const { data: config, isLoading: loadingConfig } = useQuery({
    queryKey: ["meta-ads-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("*")
        .eq("key", "meta_ads_config")
        .single();
      if (error && error.code !== "PGRST116") {
        console.error("Gagal memuat setting meta ads:", error);
      }
      return data?.value as { token?: string; defaultAccountId?: string } || {};
    }
  });

  // Hydrate configurations
  useEffect(() => {
    const localToken = localStorage.getItem("meta_ads_token") || "";
    const dbToken = config?.token || "";
    const envToken = (import.meta.env.VITE_META_ADS_TOKEN as string) || "";
    const activeT = dbToken || localToken || envToken;

    const localAcc = localStorage.getItem("meta_ads_account_id") || "";
    const dbAcc = config?.defaultAccountId || "";
    const activeAcc = dbAcc || localAcc;

    if (activeT) {
      setActiveToken(activeT);
      setTokenInput(activeT);
      setIsSimulation(false);
    }
    if (activeAcc) {
      setSelectedAccount(activeAcc);
    }
  }, [config]);

  // Save Config Mutation
  const saveConfigMutation = useMutation({
    mutationFn: async ({ token, defaultAccountId }: { token: string; defaultAccountId: string }) => {
      localStorage.setItem("meta_ads_token", token);
      localStorage.setItem("meta_ads_account_id", defaultAccountId);
      
      const { error } = await supabase.from("app_settings").upsert({
        key: "meta_ads_config",
        value: { token, defaultAccountId }
      });
      if (error) {
        console.warn("Gagal simpan ke DB (menyimpan secara lokal):", error.message);
      }
    },
    onSuccess: () => {
      toast.success("Konfigurasi Meta Ads berhasil disimpan!");
      setActiveToken(tokenInput);
      if (tokenInput) setIsSimulation(false);
      qc.invalidateQueries({ queryKey: ["meta-ads-config"] });
    },
    onError: (err: any) => {
      toast.error("Gagal menyimpan konfigurasi: " + err.message);
    }
  });

  const handleSaveConfig = () => {
    saveConfigMutation.mutate({
      token: tokenInput.trim(),
      defaultAccountId: selectedAccount
    });
  };

  const handleResetConfig = () => {
    localStorage.removeItem("meta_ads_token");
    localStorage.removeItem("meta_ads_account_id");
    setTokenInput("");
    setActiveToken("");
    setSelectedAccount("");
    setIsSimulation(true);
    toast.success("Konfigurasi dihapus. Mode simulasi aktif.");
  };

  // Meta Ads API Query Calls
  // 1. Fetch Accounts
  const { data: realAccounts, isLoading: loadingAccounts, isFetching: fetchingAccounts, error: accountsError } = useQuery({
    queryKey: ["meta-ad-accounts", activeToken],
    queryFn: async () => {
      if (typeof window === 'undefined') return []; // Skip SSR to prevent Vercel US IP trigger
      if (!activeToken || isSimulation) return [];
      const res = await fetch(`https://graph.facebook.com/v19.0/me/adaccounts?fields=name,account_id,id,currency,timezone_name,account_status&access_token=${activeToken}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      return json.data || [];
    },
    enabled: !!activeToken && !isSimulation
  });

  // 2. Fetch Performance & Ads Manager Data
  const { data: realAdData, isLoading: loadingAdData, isFetching: fetchingAdData, error: adDataError } = useQuery({
    queryKey: ["meta-ad-data", selectedAccount, dateRange, activeToken],
    queryFn: async () => {
      if (typeof window === 'undefined') return null; // Skip SSR to prevent Vercel US IP trigger
      if (!activeToken || !selectedAccount || isSimulation) return null;
      
      // Determine date range preset for Meta Ads API (e.g. today, last_7d, last_30d)
      let datePreset = "last_7d";
      if (dateRange === "1d") datePreset = "today";
      if (dateRange === "30d") datePreset = "last_30d";

      // Fetch Campaigns
      const campRes = await fetch(`https://graph.facebook.com/v19.0/${selectedAccount}/campaigns?limit=150&fields=name,status,objective,daily_budget,lifetime_budget,insights.date_preset(${datePreset}){clicks,impressions,spend,actions}&access_token=${activeToken}`);
      const campJson = await campRes.json();
      if (campJson.error) throw new Error(campJson.error.message);
      const campaigns = campJson.data || [];

      // Fetch Adsets
      const adsetRes = await fetch(`https://graph.facebook.com/v19.0/${selectedAccount}/adsets?limit=150&fields=name,status,campaign{name},daily_budget,lifetime_budget,insights.date_preset(${datePreset}){clicks,impressions,spend,actions}&access_token=${activeToken}`);
      const adsetJson = await adsetRes.json();
      const adsets = adsetJson.data || [];

      // Fetch Ads
      const adsRes = await fetch(`https://graph.facebook.com/v19.0/${selectedAccount}/ads?limit=150&fields=name,status,adset{name},insights.date_preset(${datePreset}){clicks,impressions,spend,actions}&access_token=${activeToken}`);
      const adsJson = await adsRes.json();
      const ads = adsJson.data || [];

      return { campaigns, adsets, ads };
    },
    enabled: !!activeToken && !!selectedAccount && !isSimulation
  });

  const dateRangeBounds = useMemo(() => {
    const end = new Date();
    const start = new Date();
    if (dateRange === "1d") {
      start.setHours(0, 0, 0, 0);
    } else if (dateRange === "7d") {
      start.setDate(start.getDate() - 6);
    } else if (dateRange === "30d") {
      start.setDate(start.getDate() - 29);
    }
    return {
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10)
    };
  }, [dateRange]);

  const { data: dbOrders } = useQuery({
    queryKey: ["meta-db-orders", dateRangeBounds],
    queryFn: async () => {
      const startIso = `${dateRangeBounds.start}T00:00:00Z`;
      const endIso = `${dateRangeBounds.end}T23:59:59Z`;
      return (await supabase
        .from("orders")
        .select("net_revenue, cogs_total, created_at")
        .eq("returned", false)
        .gte("created_at", startIso)
        .lte("created_at", endIso)
      ).data ?? [];
    }
  });

  const { data: dbExpenses } = useQuery({
    queryKey: ["meta-db-expenses", dateRangeBounds],
    queryFn: async () => {
      return (await supabase
        .from("expenses_business")
        .select("amount, occurred_on")
        .eq("category", "meta_ads")
        .gte("occurred_on", dateRangeBounds.start)
        .lte("occurred_on", dateRangeBounds.end)
      ).data ?? [];
    }
  });

  const { data: dailyInsights } = useQuery({
    queryKey: ["meta-daily-insights", selectedAccount, dateRange, activeToken],
    queryFn: async () => {
      if (typeof window === 'undefined') return [];
      if (!activeToken || !selectedAccount || isSimulation) return [];
      
      let datePreset = "last_7d";
      if (dateRange === "1d") datePreset = "today";
      else if (dateRange === "30d") datePreset = "last_30d";

      const res = await fetch(`https://graph.facebook.com/v19.0/${selectedAccount}/insights?date_preset=${datePreset}&time_increment=1&fields=spend,date_start&access_token=${activeToken}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      return json.data || [];
    },
    enabled: !isSimulation && !!activeToken && !!selectedAccount
  });

  const totalRealRevenue = useMemo(() => {
    return (dbOrders ?? []).reduce((sum, o: any) => sum + Number(o.net_revenue || 0), 0);
  }, [dbOrders]);

  const handleSyncToDb = async () => {
    if (!activeToken || !selectedAccount || isSimulation) {
      toast.error("Tidak dapat mensinkronisasi data dalam mode simulasi.");
      return;
    }
    
    setSyncingToDb(true);
    try {
      let datePreset = "last_7d";
      if (dateRange === "1d") datePreset = "today";
      else if (dateRange === "30d") datePreset = "last_30d";

      // 1. Fetch daily spend from Meta API
      const res = await fetch(
        `https://graph.facebook.com/v19.0/${selectedAccount}/insights?date_preset=${datePreset}&time_increment=1&fields=spend&access_token=${activeToken}`
      );
      
      const json = await res.json();
      if (json.error) {
        throw new Error(json.error.message);
      }
      
      const insights = json.data || [];
      if (insights.length === 0) {
        toast.info("Tidak ada data pengeluaran iklan Meta Ads pada periode ini.");
        setSyncingToDb(false);
        return;
      }

      // 2. Fetch existing expenses in expenses_business for the same period and category 'meta_ads'
      const dates = insights.map((i: any) => i.date_start);
      const minDate = dates.reduce((min: string, d: string) => d < min ? d : min, dates[0]);
      const maxDate = dates.reduce((max: string, d: string) => d > max ? d : max, dates[0]);

      const { data: existing, error: fetchErr } = await supabase
        .from("expenses_business")
        .select("*")
        .eq("category", "meta_ads")
        .gte("occurred_on", minDate)
        .lte("occurred_on", maxDate);

      if (fetchErr) throw fetchErr;

      // 3. For each daily insight, upsert/insert/update
      let inserted = 0;
      let updated = 0;
      
      const accountsList = isSimulation ? MOCK_ACCOUNTS : (realAccounts || []);
      const selectedAccountName = accountsList.find((a: any) => a.id === selectedAccount)?.name || selectedAccount;

      for (const item of insights) {
        const date = item.date_start;
        const amount = Number(item.spend || 0);
        
        if (amount <= 0) continue; // Skip days with 0 spend

        const existingRecord = (existing || []).find((e: any) => e.occurred_on === date);

        if (existingRecord) {
          if (Number(existingRecord.amount) !== amount) {
            const { error: updErr } = await supabase
              .from("expenses_business")
              .update({ amount, note: `Auto-sync dari Meta Ads API (BM: ${selectedAccountName})` })
              .eq("id", existingRecord.id);
            if (updErr) throw updErr;
            updated++;
          }
        } else {
          const { error: insErr } = await supabase
            .from("expenses_business")
            .insert({
              category: "meta_ads",
              amount,
              occurred_on: date,
              note: `Auto-sync dari Meta Ads API (BM: ${selectedAccountName})`
            });
          if (insErr) throw insErr;
          inserted++;
        }
      }

      toast.success(`Sinkronisasi berhasil! ${inserted} pengeluaran baru ditambahkan, ${updated} diperbarui.`);
      qc.invalidateQueries({ queryKey: ["biz-expenses"] });
      qc.invalidateQueries({ queryKey: ["fin-biz"] });
    } catch (e: any) {
      console.error(e);
      toast.error(`Gagal melakukan sinkronisasi: ${e.message}`);
    } finally {
      setSyncingToDb(false);
    }
  };

  // Real Toggling Mutation
  const toggleCampaignMutation = useMutation({
    mutationFn: async ({ campaignId, newStatus }: { campaignId: string; newStatus: "ACTIVE" | "PAUSED" }) => {
      if (isSimulation) return;
      const res = await fetch(`https://graph.facebook.com/v19.0/${campaignId}?status=${newStatus}&access_token=${activeToken}`, {
        method: "POST"
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      return json;
    },
    onSuccess: () => {
      toast.success("Status kampanye berhasil diubah di Meta!");
      qc.invalidateQueries({ queryKey: ["meta-ad-data"] });
    },
    onError: (err: any) => {
      toast.error("Gagal mengubah status: " + err.message);
    }
  });

  // Handle Campaign Status Toggle (Real + Simulation)
  const handleToggleCampaign = (campaignId: string, currentStatus: string) => {
    const newStatus = currentStatus === "ACTIVE" ? "PAUSED" : "ACTIVE";
    
    if (isSimulation) {
      // Simulate status toggle locally
      setSimulatedCampaigns(prev => prev.map(c => c.id === campaignId ? { ...c, status: newStatus } : c));
      
      // Cascade simulation state changes to ad sets and ads
      const updatedCampaign = simulatedCampaigns.find(c => c.id === campaignId);
      if (updatedCampaign) {
        // Toggle related adsets
        setSimulatedAdSets(prev => prev.map(as => {
          if (as.campaign_id === campaignId) {
            return { ...as, status: newStatus };
          }
          return as;
        }));
        
        // Find related adset IDs
        const relatedAdSetIds = simulatedAdSets.filter(as => as.campaign_id === campaignId).map(as => as.id);
        
        // Toggle related ads
        setSimulatedAds(prev => prev.map(ad => {
          if (relatedAdSetIds.includes(ad.adset_id)) {
            return { ...ad, status: newStatus };
          }
          return ad;
        }));
      }

      toast.success(`[SIMULASI] Kampanye ${newStatus === "ACTIVE" ? "diaktifkan" : "dinonaktifkan"}`);
    } else {
      toggleCampaignMutation.mutate({ campaignId, newStatus });
    }
  };

  // Determine Accounts to list
  const adAccounts = useMemo(() => {
    if (isSimulation) return MOCK_ACCOUNTS;
    const dbAcc = config?.defaultAccountId || "";
    if (dbAcc && realAccounts && !showAllAccounts) {
      const matched = realAccounts.filter((acc: any) => 
        acc.id === dbAcc || 
        acc.account_id === dbAcc || 
        `act_${acc.account_id}` === dbAcc
      );
      if (matched.length > 0) return matched;
    }
    return realAccounts || [];
  }, [isSimulation, realAccounts, config?.defaultAccountId, showAllAccounts]);

  // Set default account when accounts list loaded
  useEffect(() => {
    if (adAccounts.length > 0 && !selectedAccount) {
      setSelectedAccount(adAccounts[0].id);
    }
  }, [adAccounts, selectedAccount]);

  // Date multiplier factor for Simulation Metrics
  const dateMultiplier = useMemo(() => {
    if (dateRange === "1d") return 0.2;
    if (dateRange === "30d") return 3.5;
    return 1.0; // default 7d
  }, [dateRange]);

  // Compute Active Simulation Lists
  const activeSimulationCampaigns = useMemo(() => {
    return simulatedCampaigns
      .filter(c => c.account_id === selectedAccount)
      .map(c => {
        const factor = c.status === "ACTIVE" ? dateMultiplier : 0.05 * dateMultiplier;
        return {
          ...c,
          spend: Math.round(c.spend * factor),
          impressions: Math.round(c.impressions * factor),
          clicks: Math.round(c.clicks * factor),
          conversions: Math.round(c.conversions * factor)
        };
      });
  }, [simulatedCampaigns, selectedAccount, dateMultiplier]);

  const activeSimulationAdSets = useMemo(() => {
    const campaignMap = new Map(simulatedCampaigns.map(c => [c.id, c]));
    return simulatedAdSets
      .filter(as => {
        const parentCampaign = campaignMap.get(as.campaign_id);
        return parentCampaign?.account_id === selectedAccount;
      })
      .map(as => {
        const factor = as.status === "ACTIVE" ? dateMultiplier : 0.05 * dateMultiplier;
        return {
          ...as,
          spend: Math.round(as.spend * factor),
          impressions: Math.round(as.impressions * factor),
          clicks: Math.round(as.clicks * factor),
          conversions: Math.round(as.conversions * factor),
          campaign_name: campaignMap.get(as.campaign_id)?.name || "—"
        };
      });
  }, [simulatedAdSets, simulatedCampaigns, selectedAccount, dateMultiplier]);

  const activeSimulationAds = useMemo(() => {
    const adSetMap = new Map(simulatedAdSets.map(as => [as.id, as]));
    const campaignMap = new Map(simulatedCampaigns.map(c => [c.id, c]));
    return simulatedAds
      .filter(ad => {
        const parentAdset = adSetMap.get(ad.adset_id);
        if (!parentAdset) return false;
        const parentCampaign = campaignMap.get(parentAdset.campaign_id);
        return parentCampaign?.account_id === selectedAccount;
      })
      .map(ad => {
        const factor = ad.status === "ACTIVE" ? dateMultiplier : 0.05 * dateMultiplier;
        return {
          ...ad,
          spend: Math.round(ad.spend * factor),
          impressions: Math.round(ad.impressions * factor),
          clicks: Math.round(ad.clicks * factor),
          conversions: Math.round(ad.conversions * factor),
          adset_name: adSetMap.get(ad.adset_id)?.name || "—"
        };
      });
  }, [simulatedAds, simulatedAdSets, simulatedCampaigns, selectedAccount, dateMultiplier]);

  // Parse Real API lists
  const activeRealCampaigns = useMemo(() => {
    if (!realAdData) return [];
    const list = (realAdData.campaigns || []).map((c: any) => {
      const insights = c.insights?.data?.[0] || {};
      const actions = insights.actions || [];
      const purchases = actions.find((a: any) => a.action_type === "purchase" || a.action_type === "offsite_conversion.fb_pixel_purchase");
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        objective: c.objective,
        daily_budget: Number(c.daily_budget || c.lifetime_budget || 0),
        spend: Number(insights.spend || 0),
        impressions: Number(insights.impressions || 0),
        clicks: Number(insights.clicks || 0),
        conversions: Number(purchases?.value || 0)
      };
    });
    return list.sort((a: any, b: any) => {
      if (a.status === "ACTIVE" && b.status !== "ACTIVE") return -1;
      if (a.status !== "ACTIVE" && b.status === "ACTIVE") return 1;
      return b.spend - a.spend;
    });
  }, [realAdData]);

  const activeRealAdSets = useMemo(() => {
    if (!realAdData) return [];
    const list = (realAdData.adsets || []).map((as: any) => {
      const insights = as.insights?.data?.[0] || {};
      const actions = insights.actions || [];
      const purchases = actions.find((a: any) => a.action_type === "purchase" || a.action_type === "offsite_conversion.fb_pixel_purchase");
      return {
        id: as.id,
        name: as.name,
        status: as.status,
        campaign_name: as.campaign?.name || "—",
        daily_budget: Number(as.daily_budget || as.lifetime_budget || 0),
        spend: Number(insights.spend || 0),
        impressions: Number(insights.impressions || 0),
        clicks: Number(insights.clicks || 0),
        conversions: Number(purchases?.value || 0)
      };
    });
    return list.sort((a: any, b: any) => {
      if (a.status === "ACTIVE" && b.status !== "ACTIVE") return -1;
      if (a.status !== "ACTIVE" && b.status === "ACTIVE") return 1;
      return b.spend - a.spend;
    });
  }, [realAdData]);

  const activeRealAds = useMemo(() => {
    if (!realAdData) return [];
    const list = (realAdData.ads || []).map((ad: any) => {
      const insights = ad.insights?.data?.[0] || {};
      const actions = insights.actions || [];
      const purchases = actions.find((a: any) => a.action_type === "purchase" || a.action_type === "offsite_conversion.fb_pixel_purchase");
      return {
        id: ad.id,
        name: ad.name,
        status: ad.status,
        adset_name: ad.adset?.name || "—",
        spend: Number(insights.spend || 0),
        impressions: Number(insights.impressions || 0),
        clicks: Number(insights.clicks || 0),
        conversions: Number(purchases?.value || 0),
        preview_url: null
      };
    });
    return list.sort((a: any, b: any) => {
      if (a.status === "ACTIVE" && b.status !== "ACTIVE") return -1;
      if (a.status !== "ACTIVE" && b.status === "ACTIVE") return 1;
      return b.spend - a.spend;
    });
  }, [realAdData]);

  // Aggregate Lists based on mode
  const campaignsList = isSimulation ? activeSimulationCampaigns : activeRealCampaigns;
  const adSetsList = isSimulation ? activeSimulationAdSets : activeRealAdSets;
  const adsList = isSimulation ? activeSimulationAds : activeRealAds;

  // Compute Overall KPI Metrics
  const summaryMetrics = useMemo(() => {
    let spend = 0;
    let impressions = 0;
    let clicks = 0;
    let conversions = 0;

    campaignsList.forEach((c: any) => {
      spend += c.spend;
      impressions += c.impressions;
      clicks += c.clicks;
      conversions += c.conversions;
    });

    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpc = clicks > 0 ? spend / clicks : 0;
    const roas = conversions > 0 ? (conversions * 150000) / (spend || 1) : 0; // Assume Rp 150k order value

    return { spend, impressions, clicks, ctr, cpc, conversions, roas };
  }, [campaignsList]);

  const realRoas = useMemo(() => {
    return summaryMetrics.spend > 0 ? totalRealRevenue / summaryMetrics.spend : 0;
  }, [totalRealRevenue, summaryMetrics.spend]);

  // Generate list of dates in the range
  const dateList = useMemo(() => {
    const dates: string[] = [];
    const curr = new Date(dateRangeBounds.start);
    const end = new Date(dateRangeBounds.end);
    while (curr <= end) {
      dates.push(curr.toISOString().slice(0, 10));
      curr.setDate(curr.getDate() + 1);
    }
    return dates;
  }, [dateRangeBounds]);

  const totalCogs = useMemo(() => {
    if (isSimulation) {
      return summaryMetrics.conversions * 60000;
    } else {
      return (dbOrders ?? []).reduce((sum, o: any) => sum + Number(o.cogs_total || 0), 0);
    }
  }, [isSimulation, summaryMetrics.conversions, dbOrders]);

  const totalRevenue = useMemo(() => {
    if (isSimulation) {
      return summaryMetrics.conversions * 150000;
    } else {
      return totalRealRevenue;
    }
  }, [isSimulation, summaryMetrics.conversions, totalRealRevenue]);

  const totalNetProfit = useMemo(() => {
    return totalRevenue - summaryMetrics.spend - totalCogs;
  }, [totalRevenue, summaryMetrics.spend, totalCogs]);

  const totalRoas = useMemo(() => {
    const spend = summaryMetrics.spend;
    return spend > 0 ? totalRevenue / spend : 0;
  }, [totalRevenue, summaryMetrics.spend]);

  // Telegram Configuration & State
  const [tgBotToken, setTgBotToken] = useState("8968515154:AAGP9rbB1Gjj7Psg1Dt4n5OmkEw2cN3ofwg");
  const [tgChatId, setTgChatId] = useState("7835561039");
  const [sendingTelegram, setSendingTelegram] = useState(false);
  const [testingBot, setTestingBot] = useState(false);

  // Fetch Telegram Config from DB
  const { data: tgConfig, refetch: refetchTgConfig } = useQuery({
    queryKey: ["telegram-ads-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "telegram_ads_config")
        .maybeSingle();
      if (error && error.code !== "PGRST116") console.error("Gagal memuat setting telegram:", error);
      return (data?.value as any) || {};
    }
  });

  useEffect(() => {
    if (tgConfig) {
      if (tgConfig.botToken) setTgBotToken(tgConfig.botToken);
      if (tgConfig.chatId) setTgChatId(tgConfig.chatId);
    }
  }, [tgConfig]);

  // Real Sales Data bundle for AI
  const realSalesBundle = useMemo(() => ({
    totalRevenue: totalRevenue,
    totalOrders: isSimulation ? summaryMetrics.conversions : (dbOrders ?? []).length,
    totalCogs: totalCogs,
    totalNetProfit: totalNetProfit,
    realRoas: totalRoas
  }), [totalRevenue, isSimulation, summaryMetrics.conversions, dbOrders, totalCogs, totalNetProfit, totalRoas]);

  // Generate AI Ads Analysis on the fly
  const aiAnalysis = useMemo(() => {
    const periodLabel = dateRange === "1d" ? "Hari Ini" : dateRange === "7d" ? "7 Hari Terakhir" : "30 Hari Terakhir";
    return generateAIAdsAnalysis(
      campaignsList,
      adSetsList,
      adsList,
      realSalesBundle,
      periodLabel
    );
  }, [campaignsList, adSetsList, adsList, realSalesBundle, dateRange]);

  // Dispatch Report to Telegram
  const handleSendTelegramReport = async () => {
    if (!tgBotToken || !tgChatId) {
      toast.error("Bot Token dan Chat ID Telegram wajib diisi.");
      return;
    }
    setSendingTelegram(true);
    try {
      const res = await sendTelegramMessage(tgBotToken, tgChatId, aiAnalysis.telegramFormattedText, "Markdown");
      if (res.success) {
        toast.success("Laporan Analisa AI berhasil dikirim ke Telegram!");
      } else {
        toast.error("Gagal kirim ke Telegram: " + res.error);
      }
    } catch (err: any) {
      toast.error("Error Telegram: " + err.message);
    } finally {
      setSendingTelegram(false);
    }
  };

  // Test Telegram Bot
  const handleTestBot = async () => {
    if (!tgBotToken || !tgChatId) {
      toast.error("Bot Token dan Chat ID Telegram wajib diisi.");
      return;
    }
    setTestingBot(true);
    try {
      const res = await sendTelegramMessage(
        tgBotToken,
        tgChatId,
        "🍯 *Tes Notifikasi Bot Telegram*\n\nKoneksi bot *Araa Honey Intelligence* aktif & siap menerima laporan harian!",
        "Markdown"
      );
      if (res.success) {
        toast.success("Pesan tes berhasil diterima di Telegram!");
      } else {
        toast.error("Gagal tes bot: " + res.error);
      }
    } catch (err: any) {
      toast.error("Error tes bot: " + err.message);
    } finally {
      setTestingBot(false);
    }
  };

  // Save Telegram Config to Supabase
  const handleSaveTelegramConfig = async () => {
    try {
      const { error } = await supabase.from("app_settings").upsert({
        key: "telegram_ads_config",
        value: {
          botToken: tgBotToken.trim(),
          chatId: tgChatId.trim(),
          enabled: true
        },
        updated_at: new Date().toISOString()
      });
      if (error) throw error;
      toast.success("Pengaturan Telegram berhasil disimpan!");
      refetchTgConfig();
    } catch (err: any) {
      toast.error("Gagal simpan setting Telegram: " + err.message);
    }
  };

  const chartData = useMemo(() => {
    if (isSimulation) {
      const daysCount = dateList.length;
      const totalSpend = summaryMetrics.spend;
      const totalConversions = summaryMetrics.conversions;

      return dateList.map((d, index) => {
        // Create a smooth curve pattern for simulation
        const multiplier = 0.7 + 0.5 * Math.sin((index / Math.max(1, daysCount - 1)) * Math.PI * 1.5);
        const daySpend = Math.round((totalSpend / Math.max(1, daysCount)) * multiplier);
        const dayConversions = Math.round((totalConversions / Math.max(1, daysCount)) * multiplier);
        const dayRevenue = dayConversions * 150000;
        const dayCogs = dayConversions * 60000;
        const dayNetProfit = dayRevenue - daySpend - dayCogs;
        const dayRoas = daySpend > 0 ? Number((dayRevenue / daySpend).toFixed(2)) : 0;

        return {
          date: d,
          revenue: dayRevenue,
          spend: daySpend,
          cogs: dayCogs,
          netProfit: dayNetProfit,
          roas: dayRoas
        };
      });
    } else {
      // Live Mode
      const insightsMap = new Map<string, number>();
      (dailyInsights || []).forEach((item: any) => {
        insightsMap.set(item.date_start, Number(item.spend || 0));
      });

      const expensesMap = new Map<string, number>();
      (dbExpenses || []).forEach((item: any) => {
        expensesMap.set(item.occurred_on, Number(item.amount || 0));
      });

      const ordersMap = new Map<string, { revenue: number; cogs: number }>();
      (dbOrders || []).forEach((o: any) => {
        const dateStr = o.created_at.slice(0, 10);
        const current = ordersMap.get(dateStr) || { revenue: 0, cogs: 0 };
        ordersMap.set(dateStr, {
          revenue: current.revenue + Number(o.net_revenue || 0),
          cogs: current.cogs + Number(o.cogs_total || 0)
        });
      });

      return dateList.map((d) => {
        // Priority for spend: Meta API -> Supabase expenses_business -> 0
        const spend = insightsMap.get(d) !== undefined 
          ? insightsMap.get(d)! 
          : (expensesMap.get(d) !== undefined ? expensesMap.get(d)! : 0);

        const orderData = ordersMap.get(d) || { revenue: 0, cogs: 0 };
        const revenue = orderData.revenue;
        const cogs = orderData.cogs;
        const netProfit = revenue - spend - cogs;
        const roas = spend > 0 ? Number((revenue / spend).toFixed(2)) : 0;

        return {
          date: d,
          revenue,
          spend,
          cogs,
          netProfit,
          roas
        };
      });
    }
  }, [isSimulation, dateList, summaryMetrics, dailyInsights, dbExpenses, dbOrders]);

  // Loading/Error states
  const loadingData = loadingConfig || loadingAccounts || loadingAdData;
  const isSyncing = fetchingAccounts || fetchingAdData;
  const apiError = accountsError || adDataError;

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Meta Ads Manager</h2>
          <p className="text-sm text-muted-foreground">Integrasikan dan kelola iklan Meta / Facebook Ads Anda.</p>
        </div>
        
        {/* Simulation Badge */}
        <div className="flex items-center gap-3 bg-card px-4 py-2 rounded-lg border shadow-sm self-start">
          <Badge variant={isSimulation ? "destructive" : "success"} className="animate-pulse">
            {isSimulation ? "Mode Simulasi" : "Live Terkoneksi"}
          </Badge>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Label htmlFor="sim-toggle" className="cursor-pointer">Simulasi</Label>
            <Switch 
              id="sim-toggle" 
              checked={isSimulation} 
              onCheckedChange={(checked) => {
                if (checked) {
                  setIsSimulation(true);
                } else if (!activeToken) {
                  toast.error("Masukkan Meta Access Token terlebih dahulu!");
                } else {
                  setIsSimulation(false);
                  toast.success("Beralih ke mode Live API");
                }
              }}
            />
          </div>
        </div>
      </div>

      {/* Meta Ads Token Configuration Card */}
      <Card className="border border-border/80 bg-gradient-to-r from-card to-accent/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Key className="w-5 h-5 text-honey" /> Konfigurasi Token Meta Iklan
          </CardTitle>
          <CardDescription>
            Masukkan System User Token atau Access Token Anda dari Facebook Developer Portal untuk menghubungkan akun BM.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row gap-3 items-end">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="meta-token">Meta Access Token</Label>
                <div className="relative">
                  <Input 
                    id="meta-token"
                    type="password" 
                    placeholder="EAA..." 
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    className="pr-10"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {activeToken ? (
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-500" />
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex gap-2">
                <Button 
                  onClick={handleSaveConfig} 
                  disabled={saveConfigMutation.isPending}
                  className="bg-honey hover:bg-honey-dark text-honey-foreground"
                >
                  {saveConfigMutation.isPending && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
                  Simpan Token
                </Button>
                {activeToken && (
                  <Button variant="outline" onClick={handleResetConfig}>
                    Putuskan Koneksi
                  </Button>
                )}
              </div>
            </div>

            {apiError && (
              <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 p-3 rounded-lg border border-destructive/20 mt-2">
                <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                <span>Error API Meta: {(apiError as Error).message}. Beralih ke Mode Simulasi otomatis.</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Main Controls Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Account Selector */}
        <div className="bg-card p-4 rounded-lg border shadow-sm space-y-1.5">
          <div className="flex justify-between items-center">
            <Label>Pilih Akun Iklan (BM)</Label>
            {!isSimulation && realAccounts && realAccounts.length > 1 && config?.defaultAccountId && (
              <button 
                type="button"
                onClick={() => setShowAllAccounts(prev => !prev)}
                className="text-[10px] text-primary hover:underline font-medium"
              >
                {showAllAccounts ? "Sembunyikan Akun Lain" : "Tampilkan Semua Akun"}
              </button>
            )}
          </div>
          <Select 
            value={selectedAccount} 
            onValueChange={setSelectedAccount}
            disabled={adAccounts.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder="Pilih akun iklan" />
            </SelectTrigger>
            <SelectContent>
              {adAccounts.map((acc: any) => (
                <SelectItem key={acc.id} value={acc.id}>
                  {acc.name} ({acc.id})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Date Range Picker */}
        <div className="bg-card p-4 rounded-lg border shadow-sm space-y-1.5">
          <Label>Rentang Waktu</Label>
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1d">Hari Ini (Today)</SelectItem>
              <SelectItem value="7d">7 Hari Terakhir</SelectItem>
              <SelectItem value="30d">30 Hari Terakhir</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Sync Buttons */}
        <div className="bg-card p-4 rounded-lg border shadow-sm flex items-end gap-2">
          <Button 
            variant="outline" 
            className="flex-1 flex items-center justify-center gap-1.5"
            onClick={() => {
              qc.invalidateQueries({ queryKey: ["meta-ad-accounts"] });
              qc.invalidateQueries({ queryKey: ["meta-ad-data"] });
              toast.success("Sedang menyinkronkan data...");
            }}
            disabled={isSyncing}
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
            API Sync
          </Button>
          {!isSimulation && activeToken && selectedAccount && (
            <Button 
              variant="default" 
              className="flex-1 flex items-center justify-center gap-1.5 bg-honey hover:bg-honey/95 text-honey-foreground font-semibold animate-in fade-in slide-in-from-right-2 duration-200"
              onClick={handleSyncToDb}
              disabled={syncingToDb || isSyncing}
            >
              <Database className="w-4 h-4" />
              {syncingToDb ? "Menyimpan..." : "Simpan Keuangan"}
            </Button>
          )}
        </div>
      </div>

      {/* Performance KPIs Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard 
          title="Total Biaya Iklan" 
          value={formatIDR(summaryMetrics.spend)} 
          icon={<TrendingUp className="w-4 h-4 text-honey" />} 
          description="Total dana iklan terpakai"
        />
        <KpiCard 
          title="Tayangan (Impressions)" 
          value={summaryMetrics.impressions.toLocaleString("id-ID")} 
          icon={<Users className="w-4 h-4 text-sky-500" />} 
          description="Jumlah iklan dilihat"
        />
        <KpiCard 
          title="Klik Link" 
          value={summaryMetrics.clicks.toLocaleString("id-ID")} 
          icon={<MousePointerClick className="w-4 h-4 text-emerald-500" />} 
          description="Jumlah klik pada tautan iklan"
        />
        <KpiCard 
          title="CTR Rata-rata" 
          value={`${summaryMetrics.ctr.toFixed(2)}%`} 
          icon={<Percent className="w-4 h-4 text-purple-500" />} 
          description="Rasio klik dibanding tayangan"
        />
        <KpiCard 
          title="CPC Rata-rata" 
          value={formatIDR(summaryMetrics.cpc)} 
          icon={<Percent className="w-4 h-4 text-amber-500" />} 
          description="Biaya per sekali klik link"
        />
        <KpiCard 
          title="Conversions (Hasil)" 
          value={`${summaryMetrics.conversions} Orders`} 
          icon={<Target className="w-4 h-4 text-red-500" />} 
          description="Jumlah pembelian (pembelian pixel)"
        />
        <KpiCard 
          title="Biaya Per Hasil" 
          value={summaryMetrics.conversions > 0 ? formatIDR(summaryMetrics.spend / summaryMetrics.conversions) : "Rp 0"} 
          icon={<Target className="w-4 h-4 text-pink-500" />} 
          description="Biaya per konversi pembelian"
        />
        <KpiCard 
          title="ROAS Riil (Database)" 
          value={totalRoas > 0 ? `${totalRoas.toFixed(2)}x` : "—"} 
          icon={<TrendingUp className="w-4 h-4 text-violet-500" />} 
          description={`Estimasi Pixel: ${summaryMetrics.roas > 0 ? `${summaryMetrics.roas.toFixed(2)}x` : "—"}`}
          accent
        />
        <KpiCard 
          title="Laba Bersih (Real-time)" 
          value={formatIDR(totalNetProfit)} 
          icon={<TrendingUp className="w-4 h-4 text-emerald-500" />} 
          description="Omzet Riil - HPP - Biaya Iklan"
          accent
        />
      </div>

      {/* Real-time Profitability Chart Card */}
      <Card className="rounded-2xl border border-border/80 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-muted/20">
          <div className="space-y-1">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <TrendingUp className="w-4.5 h-4.5 text-honey" />
              Grafik Profitabilitas Iklan (Real-time)
            </CardTitle>
            <p className="text-xs text-muted-foreground">Perbandingan harian antara Omzet Riil, Biaya Iklan (Spend), dan Laba Bersih</p>
          </div>
        </CardHeader>
        <CardContent className="p-6 h-80 pt-8">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0.0}/>
                </linearGradient>
                <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.0}/>
                </linearGradient>
                <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.0}/>
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
                  if (Math.abs(v) >= 1000000) return `${(v/1000000).toFixed(1)}M`;
                  if (Math.abs(v) >= 1000) return `${(v/1000).toFixed(0)}rb`;
                  return v;
                }}
              />
              <RechartsTooltip content={<CustomProfitabilityTooltip />} cursor={{ stroke: 'rgba(0, 0, 0, 0.15)', strokeWidth: 1, strokeDasharray: '4 4' }} />
              <Legend verticalAlign="top" height={36} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} />
              <Area 
                type="monotone"
                dataKey="revenue" 
                name="Omzet Riil"
                stroke="#10B981" 
                fill="url(#revGrad)" 
                strokeWidth={2.5}
                dot={{ stroke: '#10B981', strokeWidth: 1.5, fill: 'var(--background)', r: 3 }}
                activeDot={{ stroke: '#10B981', strokeWidth: 2, fill: '#10B981', r: 5 }}
              />
              <Area 
                type="monotone"
                dataKey="spend" 
                name="Biaya Iklan"
                stroke="#F59E0B" 
                fill="url(#spendGrad)" 
                strokeWidth={2.5}
                dot={{ stroke: '#F59E0B', strokeWidth: 1.5, fill: 'var(--background)', r: 3 }}
                activeDot={{ stroke: '#F59E0B', strokeWidth: 2, fill: '#F59E0B', r: 5 }}
              />
              <Area 
                type="monotone"
                dataKey="netProfit" 
                name="Laba Bersih"
                stroke="#3B82F6" 
                fill="url(#profitGrad)" 
                strokeWidth={2.5}
                dot={{ stroke: '#3B82F6', strokeWidth: 1.5, fill: 'var(--background)', r: 3 }}
                activeDot={{ stroke: '#3B82F6', strokeWidth: 2, fill: '#3B82F6', r: 5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Ads Manager Workspace Tabs */}
      <Card className="shadow-sm">
        <Tabs defaultValue="campaigns" className="w-full">
          <CardHeader className="border-b px-6 py-4 flex flex-row items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-honey" /> Kampanye & Iklan Aktif
              </CardTitle>
              <CardDescription>Visualisasikan kinerja iklan Anda dengan antarmuka yang terstruktur.</CardDescription>
            </div>
            
            <TabsList className="bg-muted">
              <TabsTrigger value="campaigns">Kampanye</TabsTrigger>
              <TabsTrigger value="adsets">Set Iklan (Adsets)</TabsTrigger>
              <TabsTrigger value="ads">Iklan (Ads)</TabsTrigger>
              <TabsTrigger value="ai-analysis" className="gap-1.5 font-semibold text-amber-700 dark:text-amber-400">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Analisa AI & Telegram
              </TabsTrigger>
            </TabsList>
          </CardHeader>

          {/* Campaigns Tab */}
          <TabsContent value="campaigns" className="m-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">On/Off</TableHead>
                    <TableHead>Nama Kampanye</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tujuan (Objective)</TableHead>
                    <TableHead>Anggaran Harian</TableHead>
                    <TableHead className="text-right">Biaya (Spend)</TableHead>
                    <TableHead className="text-right">Tayangan</TableHead>
                    <TableHead className="text-right">Klik</TableHead>
                    <TableHead className="text-right">CTR</TableHead>
                    <TableHead className="text-right">Hasil (Sales)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaignsList.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                        Belum ada kampanye iklan ditemukan pada akun ini.
                      </TableCell>
                    </TableRow>
                  ) : (
                    campaignsList.map((c: any) => {
                      const ctr = c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0;
                      return (
                        <TableRow key={c.id} className={c.status !== "ACTIVE" ? "opacity-60 bg-muted/20" : ""}>
                          <TableCell>
                            <Switch 
                              checked={c.status === "ACTIVE"} 
                              onCheckedChange={() => handleToggleCampaign(c.id, c.status)}
                            />
                          </TableCell>
                          <TableCell className="font-semibold">{c.name}</TableCell>
                          <TableCell>
                            <Badge variant={c.status === "ACTIVE" ? "success" : "secondary"} className="flex w-fit items-center gap-1">
                              {c.status === "ACTIVE" ? <CirclePlay className="w-3 h-3" /> : <CirclePause className="w-3 h-3" />}
                              {c.status === "ACTIVE" ? "Aktif" : "Nonaktif"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs uppercase tracking-wider">{c.objective.replace("OUTCOME_", "")}</TableCell>
                          <TableCell>{c.daily_budget ? formatIDR(c.daily_budget) : "—"}</TableCell>
                          <TableCell className="text-right font-medium">{formatIDR(c.spend)}</TableCell>
                          <TableCell className="text-right">{c.impressions.toLocaleString("id-ID")}</TableCell>
                          <TableCell className="text-right">{c.clicks.toLocaleString("id-ID")}</TableCell>
                          <TableCell className="text-right">{ctr.toFixed(2)}%</TableCell>
                          <TableCell className="text-right font-semibold text-honey-dark">{c.conversions}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* AdSets Tab */}
          <TabsContent value="adsets" className="m-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama Set Iklan</TableHead>
                    <TableHead>Kampanye Induk</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Anggaran Harian</TableHead>
                    <TableHead className="text-right">Biaya (Spend)</TableHead>
                    <TableHead className="text-right">Tayangan</TableHead>
                    <TableHead className="text-right">Klik</TableHead>
                    <TableHead className="text-right">CTR</TableHead>
                    <TableHead className="text-right">Hasil (Sales)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adSetsList.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        Belum ada Set Iklan ditemukan.
                      </TableCell>
                    </TableRow>
                  ) : (
                    adSetsList.map((as: any) => {
                      const ctr = as.impressions > 0 ? (as.clicks / as.impressions) * 100 : 0;
                      return (
                        <TableRow key={as.id} className={as.status !== "ACTIVE" ? "opacity-60 bg-muted/20" : ""}>
                          <TableCell className="font-semibold">{as.name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-xs truncate">{as.campaign_name}</TableCell>
                          <TableCell>
                            <Badge variant={as.status === "ACTIVE" ? "success" : "secondary"}>
                              {as.status === "ACTIVE" ? "Aktif" : "Nonaktif"}
                            </Badge>
                          </TableCell>
                          <TableCell>{as.daily_budget ? formatIDR(as.daily_budget) : "—"}</TableCell>
                          <TableCell className="text-right font-medium">{formatIDR(as.spend)}</TableCell>
                          <TableCell className="text-right">{as.impressions.toLocaleString("id-ID")}</TableCell>
                          <TableCell className="text-right">{as.clicks.toLocaleString("id-ID")}</TableCell>
                          <TableCell className="text-right">{ctr.toFixed(2)}%</TableCell>
                          <TableCell className="text-right font-semibold text-honey-dark">{as.conversions}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* Ads Tab */}
          <TabsContent value="ads" className="m-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Kreatif</TableHead>
                    <TableHead>Nama Iklan</TableHead>
                    <TableHead>Set Iklan Induk</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Biaya (Spend)</TableHead>
                    <TableHead className="text-right">Tayangan</TableHead>
                    <TableHead className="text-right">Klik</TableHead>
                    <TableHead className="text-right">CTR</TableHead>
                    <TableHead className="text-right">Hasil (Sales)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adsList.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        Belum ada materi iklan ditemukan.
                      </TableCell>
                    </TableRow>
                  ) : (
                    adsList.map((ad: any) => {
                      const ctr = ad.impressions > 0 ? (ad.clicks / ad.impressions) * 100 : 0;
                      return (
                        <TableRow key={ad.id} className={ad.status !== "ACTIVE" ? "opacity-60 bg-muted/20" : ""}>
                          <TableCell>
                            {ad.preview_url ? (
                              <img 
                                src={ad.preview_url} 
                                alt="ad creative" 
                                className="w-10 h-10 object-cover rounded-md border"
                              />
                            ) : (
                              <div className="w-10 h-10 bg-accent rounded-md flex items-center justify-center border text-muted-foreground">
                                <Eye className="w-4 h-4" />
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="font-semibold">{ad.name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-xs truncate">{ad.adset_name}</TableCell>
                          <TableCell>
                            <Badge variant={ad.status === "ACTIVE" ? "success" : "secondary"}>
                              {ad.status === "ACTIVE" ? "Aktif" : "Nonaktif"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">{formatIDR(ad.spend)}</TableCell>
                          <TableCell className="text-right">{ad.impressions.toLocaleString("id-ID")}</TableCell>
                          <TableCell className="text-right">{ad.clicks.toLocaleString("id-ID")}</TableCell>
                          <TableCell className="text-right">{ctr.toFixed(2)}%</TableCell>
                          <TableCell className="text-right font-semibold text-honey-dark">{ad.conversions}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* AI Intelligence & Telegram Tab */}
          <TabsContent value="ai-analysis" className="m-0 p-6 space-y-6 bg-slate-50/50 dark:bg-slate-900/20">
            {/* Top Score Banner */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5 bg-linear-to-r from-amber-500/10 via-honey/10 to-emerald-500/10 border border-honey/30 rounded-2xl">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-honey/20 border border-honey/40 flex items-center justify-center text-honey-dark shrink-0 shadow-xs">
                  <Bot className="w-7 h-7 text-honey" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-lg text-foreground">Asisten AI Media Buyer Araa Honey</h3>
                    <Badge variant={aiAnalysis.summary.healthStatus === "Sangat Sehat" ? "success" : aiAnalysis.summary.healthStatus === "Cukup Sehat" ? "warning" : "destructive"}>
                      {aiAnalysis.summary.healthStatus} ({aiAnalysis.summary.healthScore}/100)
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Evaluasi performa iklan berdasarkan <strong>{aiAnalysis.summary.periodText}</strong> dipadukan dengan data penjualan riil dari database.
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
                <Button
                  onClick={handleSendTelegramReport}
                  disabled={sendingTelegram}
                  className="bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  {sendingTelegram ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>Kirim Laporan ke Telegram</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestBot}
                  disabled={testingBot}
                  className="text-xs border-muted-foreground/30 hover:bg-muted cursor-pointer"
                >
                  {testingBot ? "Menguji..." : "Tes Bot"}
                </Button>
              </div>
            </div>

            {/* Quick Metrics Comparison Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 bg-background rounded-xl border shadow-xs space-y-1">
                <span className="text-[11px] text-muted-foreground font-semibold">Total Biaya Iklan</span>
                <p className="text-base font-bold text-amber-600 dark:text-amber-400">{formatIDR(aiAnalysis.summary.totalSpend)}</p>
                <span className="text-[10px] text-muted-foreground">Budget Meta Ads</span>
              </div>
              <div className="p-3.5 bg-background rounded-xl border shadow-xs space-y-1">
                <span className="text-[11px] text-muted-foreground font-semibold">Omzet Riil Database</span>
                <p className="text-base font-bold text-emerald-600 dark:text-emerald-400">{formatIDR(aiAnalysis.summary.realRevenue)}</p>
                <span className="text-[10px] text-muted-foreground">{aiAnalysis.summary.totalOrders} Pesanan Transaksi</span>
              </div>
              <div className="p-3.5 bg-background rounded-xl border shadow-xs space-y-1">
                <span className="text-[11px] text-muted-foreground font-semibold">Laba Bersih Real</span>
                <p className={`text-base font-bold ${aiAnalysis.summary.realNetProfit >= 0 ? "text-sky-600 dark:text-sky-400" : "text-rose-600"}`}>
                  {formatIDR(aiAnalysis.summary.realNetProfit)}
                </p>
                <span className="text-[10px] text-muted-foreground">Setelah HPP & Iklan</span>
              </div>
              <div className="p-3.5 bg-background rounded-xl border shadow-xs space-y-1">
                <span className="text-[11px] text-muted-foreground font-semibold">Real ROAS Nyata</span>
                <p className="text-base font-bold text-violet-600 dark:text-violet-400">{aiAnalysis.summary.realRoas.toFixed(2)}x</p>
                <span className="text-[10px] text-muted-foreground">Target Min: 3.0x</span>
              </div>
            </div>

            {/* Section 1: Deep Creative ADS-Level Diagnostics */}
            <Card className="rounded-xl border shadow-xs">
              <CardHeader className="pb-3 border-b border-muted/30">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Film className="w-4 h-4 text-honey" />
                  Pembedahan Mendalam Tingkat ADS (Kreatif / Video / Foto)
                </CardTitle>
                <CardDescription className="text-xs">
                  AI menganalisis rasio klik (CTR), efisiensi biaya, dan kecocokan pesan iklan terhadap closing penjualan.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                {aiAnalysis.creativeInsights.map((ci) => (
                  <div 
                    key={ci.adId}
                    className={`p-4 rounded-xl border transition-all ${
                      ci.status === "WINNER" 
                        ? "bg-emerald-500/5 border-emerald-500/30" 
                        : ci.status === "WARNING" 
                        ? "bg-amber-500/5 border-amber-500/30" 
                        : ci.status === "FATIGUE" 
                        ? "bg-rose-500/5 border-rose-500/30" 
                        : "bg-muted/20 border-border"
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-2.5 border-b border-border/50">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-foreground">{ci.adName}</span>
                          <Badge 
                            variant={
                              ci.status === "WINNER" 
                                ? "success" 
                                : ci.status === "WARNING" 
                                ? "warning" 
                                : ci.status === "FATIGUE" 
                                ? "destructive" 
                                : "secondary"
                            } 
                            className="text-[10px]"
                          >
                            {ci.status === "WINNER" ? "⭐ IKLAN PEMENANG" : ci.status === "WARNING" ? "⚠️ PERLU PERBAIKAN" : ci.status === "FATIGUE" ? "🔄 CREATIVE FATIGUE" : "⏳ LEARNING PHASE"}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground font-mono">{ci.adsetName}</p>
                      </div>
                      <div className="flex items-center gap-4 text-xs font-semibold">
                        <div>
                          <span className="text-muted-foreground block text-[10px]">Spend</span>
                          <span className="font-mono">{formatIDR(ci.spend)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block text-[10px]">CTR Link</span>
                          <span className={ci.ctr >= 1.5 ? "text-emerald-600 font-bold" : "text-foreground"}>{ci.ctr.toFixed(2)}%</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 text-xs">
                      <div className="space-y-1">
                        <span className="font-semibold text-muted-foreground text-[11px] flex items-center gap-1">
                          <Eye className="w-3 h-3 text-sky-500" /> Diagnosa AI:
                        </span>
                        <p className="text-foreground/90 leading-relaxed bg-background/60 p-2.5 rounded-lg border border-border/60">
                          {ci.diagnosis}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <span className="font-semibold text-honey-dark text-[11px] flex items-center gap-1">
                          <Lightbulb className="w-3 h-3 text-honey" /> Rekomendasi Aksi Media Buyer:
                        </span>
                        <p className="text-foreground/90 leading-relaxed bg-honey/10 dark:bg-honey/5 p-2.5 rounded-lg border border-honey/20 font-medium">
                          {ci.actionRecommendation}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Section 2 & 3: Action Plan + New Creative Ideation */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Daily Action Plan */}
              <Card className="rounded-xl border shadow-xs">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <Target className="w-4 h-4 text-emerald-500" />
                    Rencana Tindakan Taktis Hari Ini
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5 text-xs">
                  {aiAnalysis.nextDayActionPlan.map((action, idx) => (
                    <div key={idx} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-muted/40 border border-muted/60">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span className="leading-relaxed font-medium">{action}</span>
                    </div>
                  ))}
                  {aiAnalysis.campaignInsights.budgetRecommendations.map((bRec, idx) => (
                    <div key={'b-' + idx} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200">
                      <Zap className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <span className="leading-relaxed font-medium">{bRec}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* New Creative Ideation */}
              <Card className="rounded-xl border shadow-xs">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    Ide Konsep Iklan Baru (Creative Ideation)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  {aiAnalysis.creativeIdeas.map((idea, idx) => (
                    <div key={idx} className="p-3 rounded-lg bg-background border shadow-2xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-foreground flex items-center gap-1.5">
                          <Film className="w-3.5 h-3.5 text-honey" /> {idea.title}
                        </span>
                        <Badge variant="outline" className="text-[9px] bg-honey/5 border-honey/30 text-honey-dark font-medium">
                          {idea.angle}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground italic bg-muted/30 p-2 rounded border border-muted/50">
                        {idea.hook}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        🎯 Target: <strong>{idea.targetAudience}</strong>
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Section 4: Telegram Settings & Automation Config */}
            <Card className="rounded-xl border shadow-xs">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-sky-500" />
                  Pengaturan Bot Telegram & Jadwal Otomatis
                </CardTitle>
                <CardDescription className="text-xs">
                  Konfigurasikan Bot Telegram agar laporan AI di atas dikirim otomatis ke akun Telegram Anda setiap hari.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="tg-token" className="text-xs font-semibold">Bot Token Telegram:</Label>
                    <Input
                      id="tg-token"
                      value={tgBotToken}
                      onChange={(e) => setTgBotToken(e.target.value)}
                      placeholder="8968515154:AAGP..."
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="tg-chat-id" className="text-xs font-semibold">Chat ID Telegram:</Label>
                    <Input
                      id="tg-chat-id"
                      value={tgChatId}
                      onChange={(e) => setTgChatId(e.target.value)}
                      placeholder="7835561039"
                      className="font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button 
                    onClick={handleSaveTelegramConfig} 
                    size="sm"
                    className="bg-honey hover:bg-honey-dark text-honey-foreground font-semibold text-xs cursor-pointer"
                  >
                    Simpan Pengaturan Telegram
                  </Button>
                </div>

                <div className="border-t pt-3 space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground">Info Cron Laporan Harian Telegram:</Label>
                  <div className="bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded border border-border/80 text-[10px] space-y-1 font-mono select-all">
                    <div className="text-slate-500 dark:text-slate-400 break-all font-semibold">GET https://app.araahoney.my.id/api/cron/send-ads-report</div>
                    <div className="text-slate-400 dark:text-slate-500 break-all">Header: Authorization: Bearer 5b8ab0ab88d7cbe1f85d7ca34e68a2ac</div>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-normal">
                    Daftarkan URL di atas ke <strong>cron-job.org</strong> setiap hari jam <strong>08:00 WIB</strong> untuk menerima ringkasan otomatis setiap pagi ke Telegram Big Bos.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}

// Helper Card component for KPIs
function KpiCard({ 
  title, 
  value, 
  icon, 
  description, 
  accent 
}: { 
  title: string; 
  value: string; 
  icon: React.ReactNode; 
  description: string; 
  accent?: boolean;
}) {
  return (
    <Card className={`shadow-sm ${accent ? "border-honey/40 bg-honey/5" : ""}`}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between space-y-0 pb-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
          {icon}
        </div>
        <div className="text-2xl font-bold mt-1">{value}</div>
        <p className="text-[10px] text-muted-foreground mt-1.5">{description}</p>
      </CardContent>
    </Card>
  );
}

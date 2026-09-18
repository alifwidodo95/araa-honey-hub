import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RequireAuth } from "@/components/require-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { 
  Bot, MessageSquare, Settings, RefreshCw, Send, CheckCircle, 
  User, ShieldAlert, Cpu, HeartHandshake, Eye, EyeOff, Save, Phone,
  Play, Pause, QrCode, AlertTriangle, XCircle, MapPin, Search, AlertCircle, Sparkles,
  ChevronDown, ShoppingCart
} from "lucide-react";

export const Route = createFileRoute("/whatsapp-ai")({
  component: () => (
    <RequireAuth ownerOnly>
      <WhatsAppAiPage />
    </RequireAuth>
  ),
});

interface WhatsAppAiSettings {
  user_id: string;
  deepseek_api_key: string | null;
  system_prompt: string | null;
  is_active: boolean;
  waha_url: string | null;
  waha_session: string;
  waha_api_key: string | null;
  biteship_origin_area_id?: string | null;
  biteship_origin_name?: string | null;
}

interface ChatLog {
  id: string;
  chat_id: string;
  customer_phone: string;
  customer_name: string | null;
  message: string;
  direction: 'incoming' | 'outgoing';
  replied_by: 'ai' | 'manual' | null;
  channel?: 'waba' | 'waha_main' | 'waha_campaign' | string | null;
  created_at: string;
}

function WhatsAppAiPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"chats" | "settings">("chats");
  
  // Settings States
  const [isActive, setIsActive] = useState(false);
  const [deepseekKey, setDeepseekKey] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [wahaUrl, setWahaUrl] = useState("");
  const [wahaSession, setWahaSession] = useState("default");
  const [wahaApiKey, setWahaApiKey] = useState("");
  const [showToken, setShowToken] = useState(false);

  // Biteship Origin States
  const [originAreaId, setOriginAreaId] = useState("");
  const [originAreaName, setOriginAreaName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  // WAHA Session Status & QR States
  const [sessionStatus, setSessionStatus] = useState<string>("DISCONNECTED");
  const [qrRefreshTrigger, setQrRefreshTrigger] = useState(0);
  const [qrImageUrl, setQrImageUrl] = useState<string>("");
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // 1. Fetch User Profile
  const { data: userProfile } = useQuery({
    queryKey: ["current-user-profile"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    }
  });

  // Fetch global WAHA Config from app_settings
  const { data: globalWahaConfig } = useQuery({
    queryKey: ["global-waha-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "waha_config")
        .maybeSingle();
      if (error) {
        console.error("Gagal memuat konfigurasi global WAHA:", error);
        throw error;
      }
      return data?.value as any || {};
    }
  });

  const userId = userProfile?.id;

  // 2. Fetch AI Settings
  const { data: rawSettings, refetch: refetchSettings, isLoading: loadingSettings } = useQuery<WhatsAppAiSettings | null>({
    queryKey: ["whatsapp-ai-settings", userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("whatsapp_ai_settings")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.error("Gagal memuat setelan WA AI:", error);
        throw error;
      }
      return data as WhatsAppAiSettings | null;
    },
    enabled: !!userId
  });

  const getWahaHeaders = () => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const keyToUse = wahaApiKey.trim() || globalWahaConfig?.apiKey || "";
    if (keyToUse) {
      headers["X-Api-Key"] = keyToUse;
    }
    return headers;
  };

  const safeJson = async (res: Response) => {
    const text = await res.text();
    if (!text || !text.trim()) return {};
    try {
      return JSON.parse(text);
    } catch (e) {
      console.warn("Response is not valid JSON:", text);
      return { message: text };
    }
  };

  const checkSessionStatus = async (silent = false) => {
    const currentWahaUrl = wahaUrl.trim() || globalWahaConfig?.wahaUrl || "https://waha.araahoney.my.id";
    const currentSession = wahaSession.trim() || "default";
    if (!silent) setLoadingStatus(true);
    try {
      const res = await fetch("/api/waha-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: `${currentWahaUrl}/api/sessions/${currentSession}`,
          method: "GET",
          headers: getWahaHeaders()
        })
      });
      if (!res.ok) {
        if (res.status === 404) {
          setSessionStatus("STOPPED");
        } else {
          throw new Error("HTTP status " + res.status);
        }
        return;
      }
      const data = await safeJson(res);
      let normalizedStatus = data.status || "STOPPED";
      if (data.status === "SCAN_QR_CODE") {
        normalizedStatus = "SCAN_QR";
      }
      setSessionStatus(normalizedStatus);
      if (normalizedStatus === "SCAN_QR") {
        setQrRefreshTrigger(prev => prev + 1);
      }
    } catch (err: any) {
      setSessionStatus("DISCONNECTED");
    } finally {
      if (!silent) setLoadingStatus(false);
    }
  };

  const handleStartSession = async () => {
    const currentWahaUrl = wahaUrl.trim() || globalWahaConfig?.wahaUrl || "https://waha.araahoney.my.id";
    const currentSession = wahaSession.trim() || "default";
    setActionLoading(true);
    try {
      const res = await fetch("/api/waha-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: `${currentWahaUrl}/api/sessions/start`,
          method: "POST",
          headers: getWahaHeaders(),
          body: { name: currentSession }
        })
      });
      const data = await safeJson(res);
      
      if (!res.ok) {
        throw new Error(data.message || "Gagal menyalakan sesi WhatsApp.");
      }
      
      toast.success("Sesi WhatsApp AI sedang dimulai...");
      setTimeout(() => checkSessionStatus(true), 2000);
      setTimeout(() => checkSessionStatus(true), 5000);
      setTimeout(() => checkSessionStatus(true), 10000);
    } catch (err: any) {
      toast.error(err.message || "Gagal menghubungkan server WAHA.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleStopSession = async () => {
    if (!confirm("Apakah Anda yakin ingin menghentikan sesi WhatsApp AI ini?")) return;
    const currentWahaUrl = wahaUrl.trim() || globalWahaConfig?.wahaUrl || "https://waha.araahoney.my.id";
    const currentSession = wahaSession.trim() || "default";
    setActionLoading(true);
    try {
      const res = await fetch("/api/waha-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: `${currentWahaUrl}/api/sessions/stop`,
          method: "POST",
          headers: getWahaHeaders(),
          body: { name: currentSession }
        })
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.message || "Gagal menghentikan sesi.");
      }
      toast.success("Sesi berhasil dihentikan.");
      setSessionStatus("STOPPED");
    } catch (err: any) {
      toast.error(err.message || "Gagal menghentikan sesi.");
    } finally {
      setActionLoading(false);
    }
  };

  // Poll session status
  useEffect(() => {
    const currentWahaUrl = wahaUrl.trim() || globalWahaConfig?.wahaUrl || "https://waha.araahoney.my.id";
    if (currentWahaUrl && wahaSession) {
      checkSessionStatus(true);
      const interval = setInterval(() => {
        checkSessionStatus(true);
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [wahaUrl, wahaSession, wahaApiKey, globalWahaConfig]);

  // Fetch QR image
  useEffect(() => {
    let active = true;
    const currentWahaUrl = wahaUrl.trim() || globalWahaConfig?.wahaUrl || "https://waha.araahoney.my.id";
    const currentSession = wahaSession.trim() || "default";

    if (sessionStatus !== "SCAN_QR" || !currentWahaUrl || !currentSession) {
      setQrImageUrl("");
      return;
    }

    const fetchQrImage = async () => {
      try {
        const res = await fetch("/api/waha-proxy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: `${currentWahaUrl}/api/${currentSession}/auth/qr`,
            method: "GET",
            headers: getWahaHeaders()
          })
        });
        if (!res.ok) throw new Error("Failed to fetch QR image");
        const blob = await res.blob();
        if (active) {
          const url = URL.createObjectURL(blob);
          setQrImageUrl(url);
        }
      } catch (err) {
        console.error("Gagal mengambil QR image:", err);
      }
    };

    fetchQrImage();
    const interval = setInterval(fetchQrImage, 10000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [sessionStatus, qrRefreshTrigger, wahaUrl, wahaSession, wahaApiKey, globalWahaConfig]);

  // Chat Monitor States
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [manualReplyText, setManualReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [chatSearch, setChatSearch] = useState("");
  const [responseFilter, setResponseFilter] = useState<"all" | "replied" | "order" | "waiting">("all");
  const [updatingTagPhone, setUpdatingTagPhone] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Sync settings to state
  useEffect(() => {
    if (rawSettings) {
      setIsActive(rawSettings.is_active);
      setDeepseekKey(rawSettings.deepseek_api_key || "");
      setSystemPrompt(rawSettings.system_prompt || "");
      setWahaUrl(rawSettings.waha_url || "");
      setWahaSession(rawSettings.waha_session || "default");
      setWahaApiKey(rawSettings.waha_api_key || "");
      setOriginAreaId(rawSettings.biteship_origin_area_id || "");
      setOriginAreaName(rawSettings.biteship_origin_name || "");
      setSearchQuery(rawSettings.biteship_origin_name || "");
    }
  }, [rawSettings]);

  // 3. Fetch Chat Logs (Store-wide across WA 1, WA 2, and WABA Meta)
  const { data: chatLogs = [], refetch: refetchLogs, isLoading: loadingLogs } = useQuery<ChatLog[]>({
    queryKey: ["whatsapp-chat-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_chat_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300);

      if (error) {
        console.error("Gagal mengambil log chat:", error);
        throw error;
      }
      return data as ChatLog[];
    },
    refetchInterval: 5000 // Polling backup every 5 seconds
  });

  // Realtime Supabase Subscription for instant live chat updates
  useEffect(() => {
    const channel = supabase
      .channel("realtime-whatsapp-chat-logs")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_chat_logs" },
        () => {
          refetchLogs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetchLogs]);

  // 4. Fetch Manual Chat Tags from whatsapp_chat_tags
  const { data: chatTags = [], refetch: refetchTags } = useQuery<{ phone: string; tag: string; updated_at: string }[]>({
    queryKey: ["whatsapp-chat-tags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_chat_tags" as any)
        .select("*");
      if (error) {
        console.error("Gagal mengambil tag chat:", error);
        return [];
      }
      return (data || []) as { phone: string; tag: string; updated_at: string }[];
    },
    refetchInterval: 5000,
  });

  // Realtime Supabase Subscription for chat tags
  useEffect(() => {
    const channel = supabase
      .channel("realtime-whatsapp-chat-tags")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_chat_tags" },
        () => {
          refetchTags();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetchTags]);

  // Fast lookup Map: phone digits -> tag
  const chatTagsMap = useMemo(() => {
    const map = new Map<string, string>();
    chatTags.forEach(t => {
      const clean = (t.phone || "").replace(/[^0-9]/g, "");
      if (clean) map.set(clean, t.tag);
    });
    return map;
  }, [chatTags]);

  // Toggle Order Tag Handler
  const handleToggleOrderTag = async (phone: string, shouldTag: boolean) => {
    const cleanPhone = phone.replace(/[^0-9]/g, "");
    if (!cleanPhone) return;

    setUpdatingTagPhone(cleanPhone);
    try {
      if (shouldTag) {
        const { error } = await supabase
          .from("whatsapp_chat_tags" as any)
          .upsert({ phone: cleanPhone, tag: "order", updated_at: new Date().toISOString() });
        if (error) throw error;
        toast.success("Kontak berhasil diberi label Order! 🛒");
      } else {
        const { error } = await supabase
          .from("whatsapp_chat_tags" as any)
          .delete()
          .eq("phone", cleanPhone);
        if (error) throw error;
        toast.success("Label Order berhasil dilepas.");
      }
      refetchTags();
    } catch (err: any) {
      toast.error("Gagal memperbarui label: " + (err.message || "Error"));
    } finally {
      setUpdatingTagPhone(null);
    }
  };

  // Helper to format clean Indonesian phone numbers nicely (+62 819-0194-2233)
  const formatDisplayPhone = (phone?: string) => {
    if (!phone) return "";
    let clean = phone.replace(/[^0-9]/g, "");
    if (clean.startsWith("0")) clean = "62" + clean.substring(1);
    if (clean.startsWith("62")) {
      const rest = clean.substring(2);
      if (rest.length >= 9) {
        return `+62 ${rest.substring(0, 3)}-${rest.substring(3, 7)}-${rest.substring(7)}`;
      }
      return `+62 ${rest}`;
    }
    return `+${clean}`;
  };

  // Grouped unique chats with enriched contact info & response status
  const uniqueChats = useMemo(() => {
    const chatsMap = new Map<string, {
      chat_id: string;
      latestLog: ChatLog;
      customer_name: string;
      customer_phone: string;
      formatted_phone: string;
      messageCount: number;
      hasIncoming: boolean;
      isOrderAgain: boolean;
    }>();

    chatLogs.forEach(log => {
      // Exclusively monitor WABA Meta Cloud API chats
      if (log.channel !== "waba") return;

      const cleanPhone = (log.customer_phone || log.chat_id.replace(/[^0-9]/g, "")).trim();
      const existing = chatsMap.get(log.chat_id);
      const isInc = log.direction === "incoming";
      const isOrder = isInc && (log.message || "").toUpperCase().includes("ORDER");

      const isGoodName = (name?: string | null) => {
        if (!name) return false;
        const lower = name.trim().toLowerCase();
        return (
          lower !== "meta status" &&
          lower !== "pelanggan" &&
          lower !== "pelanggan wa" &&
          !lower.startsWith("+") &&
          !/^\d+$/.test(lower)
        );
      };

      if (!existing) {
        chatsMap.set(log.chat_id, {
          chat_id: log.chat_id,
          latestLog: log,
          customer_name: log.customer_name || "Pelanggan",
          customer_phone: cleanPhone,
          formatted_phone: formatDisplayPhone(cleanPhone),
          messageCount: 1,
          hasIncoming: isInc,
          isOrderAgain: isOrder,
        });
      } else {
        existing.messageCount++;
        if (isInc) {
          existing.hasIncoming = true;
          if (isOrder) existing.isOrderAgain = true;
        }
        // If existing doesn't have a real name, but this log has a real customer name, adopt it!
        if (!isGoodName(existing.customer_name) && isGoodName(log.customer_name)) {
          existing.customer_name = log.customer_name!;
        }
      }
    });

    return Array.from(chatsMap.values());
  }, [chatLogs]);

  // Response status statistics for WABA (all, replied, order, waiting)
  const responseCounts = useMemo(() => {
    let replied = 0;
    let order = 0;
    let waiting = 0;
    uniqueChats.forEach(c => {
      const isTaggedOrder = chatTagsMap.get(c.customer_phone) === "order";
      if (isTaggedOrder) order++;
      if (c.hasIncoming) replied++;
      else waiting++;
    });
    return {
      all: uniqueChats.length,
      replied,
      order,
      waiting
    };
  }, [uniqueChats, chatTagsMap]);

  // Filtered by responseFilter and chatSearch query
  const filteredChats = useMemo(() => {
    let list = uniqueChats;

    if (responseFilter === "replied") {
      list = list.filter(c => c.hasIncoming);
    } else if (responseFilter === "order") {
      list = list.filter(c => chatTagsMap.get(c.customer_phone) === "order");
    } else if (responseFilter === "waiting") {
      list = list.filter(c => !c.hasIncoming);
    }

    if (!chatSearch.trim()) return list;
    const q = chatSearch.trim().toLowerCase();
    const qDigits = q.replace(/[^0-9]/g, "");
    return list.filter(c => {
      const matchName = c.customer_name.toLowerCase().includes(q);
      const matchPhone = (qDigits && c.customer_phone.includes(qDigits)) || c.formatted_phone.toLowerCase().includes(q);
      const matchMsg = c.latestLog.message.toLowerCase().includes(q);
      return matchName || matchPhone || matchMsg;
    });
  }, [uniqueChats, responseFilter, chatSearch, chatTagsMap]);

  // Active chat bubbles (WABA only)
  const selectedChatMessages = useMemo(() => {
    if (!selectedChatId) return [];
    return chatLogs
      .filter(log => log.chat_id === selectedChatId && log.channel === "waba")
      .reverse(); // Order chronological (oldest to newest)
  }, [chatLogs, selectedChatId]);

  // Scroll to bottom when selected chat messages change
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedChatMessages]);

  // Mutation to Save Settings
  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      if (!userId) return;
      const { error } = await supabase
        .from("whatsapp_ai_settings")
        .upsert({
          user_id: userId,
          is_active: isActive,
          deepseek_api_key: deepseekKey.trim() || null,
          system_prompt: systemPrompt.trim() || null,
          waha_url: wahaUrl.trim() || null,
          waha_session: wahaSession.trim(),
          waha_api_key: wahaApiKey.trim() || null,
          biteship_origin_area_id: originAreaId.trim() || null,
          biteship_origin_name: originAreaName.trim() || null,
          updated_at: new Date().toISOString()
        });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pengaturan WhatsApp AI berhasil disimpan!");
      refetchSettings();
    },
    onError: (err: any) => {
      toast.error("Gagal menyimpan: " + err.message);
    }
  });

  // Debounce search area Biteship
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    // If the searchQuery is exactly the currently selected originAreaName, don't trigger search
    if (searchQuery === originAreaName) {
      return;
    }

    setIsSearching(true);
    const delayDebounceFn = setTimeout(async () => {
      try {
        const res = await fetch(`/api/biteship/search-area?input=${encodeURIComponent(searchQuery)}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.areas || []);
        }
      } catch (err) {
        console.error("Gagal mencari area Biteship:", err);
      } finally {
        setIsSearching(false);
      }
    }, 600); // 600ms debounce

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, originAreaName]);

  const handleQueryChange = (val: string) => {
    setSearchQuery(val);
    if (!val.trim()) {
      setOriginAreaId("");
      setOriginAreaName("");
      setSearchResults([]);
    }
  };

  const handleSelectArea = (area: any) => {
    const fullName = area.name || `${area.administrative_division_level_3_name}, ${area.administrative_division_level_2_name}, ${area.administrative_division_level_1_name}`;
    setOriginAreaId(area.id);
    setOriginAreaName(fullName);
    setSearchQuery(fullName);
    setSearchResults([]);
    setShowDropdown(false);
    toast.success(`Gudang keberangkatan dipilih: ${fullName}`);
  };

  // Send Manual Reply via Unified Dispatcher (/api/whatsapp/send)
  const handleSendManualReply = async () => {
    const text = manualReplyText.trim();
    if (!text || !selectedChatId) return;

    setSendingReply(true);
    try {
      const activeChatInfo = uniqueChats.find(c => c.chat_id === selectedChatId);
      const targetChannel = "waba";
      const customerPhone = activeChatInfo?.customer_phone || selectedChatId.split("@")[0].replace("waba:", "").replace(/[^0-9]/g, "");
      const customerName = activeChatInfo?.customer_name || "Pelanggan WA";

      // 1. Call Unified WhatsApp Send API (which automatically logs to whatsapp_chat_logs)
      const sendRes = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: customerPhone,
          message: text,
          channel: "waba",
          customerName: customerName,
          replied_by: "manual"
        })
      });

      const sendData = await sendRes.json().catch(() => ({}));
      if (!sendRes.ok || !sendData.success) {
        throw new Error(sendData.error || "Gagal mengirim via WABA Meta");
      }

      toast.success("Balasan manual berhasil dikirim via WABA Resmi Meta!");
      setManualReplyText("");
      refetchLogs();
    } catch (err: any) {
      toast.error(err.message || "Gagal mengirim balasan.");
    } finally {
      setSendingReply(false);
    }
  };

  const [markingHandled, setMarkingHandled] = useState(false);

  const handleMarkAsHandled = async (chat: any) => {
    if (!chat) return;
    setMarkingHandled(true);
    try {
      const cleanPhone = (chat.customer_phone || chat.chat_id.replace(/[^0-9]/g, "")).trim();
      const { error } = await supabase.from("whatsapp_chat_logs").insert({
        chat_id: chat.chat_id,
        customer_phone: cleanPhone,
        customer_name: chat.customer_name,
        message: "✅ [Obrolan Ditandai Selesai oleh CS]",
        direction: "outgoing",
        channel: chat.latestLog?.channel || "waba",
        replied_by: "manual",
      });
      if (error) throw error;
      toast.success(`Obrolan dengan ${chat.customer_name || cleanPhone} berhasil ditandai selesai!`);
      refetchLogs();
    } catch (err: any) {
      toast.error("Gagal menandai obrolan: " + (err.message || "Error"));
    } finally {
      setMarkingHandled(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-emerald-500" />
            WhatsApp Monitor
          </h1>
          <p className="text-muted-foreground text-sm">
            Pusat pemantauan obrolan pelanggan, status respon pesan, dan asisten pintar secara real-time.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            onClick={() => {
              refetchLogs();
              refetchSettings();
              toast.success("Data WhatsApp Monitor diperbarui!");
            }} 
            variant="outline" 
            size="sm"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Perbarui
          </Button>
        </div>
      </div>

      {/* Tabs Toggles */}
      <div className="flex border-b border-border bg-slate-50/50 p-1.5 rounded-xl border">
        <button
          onClick={() => setActiveTab("chats")}
          className={`flex-1 py-2.5 px-4 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
            activeTab === "chats" 
              ? "bg-white text-amber-600 shadow-sm border border-slate-200" 
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <MessageSquare className="h-4 w-4" />
          Riwayat Chat Monitor
        </button>
        <button
          onClick={() => setActiveTab("settings")}
          className={`flex-1 py-2.5 px-4 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
            activeTab === "settings" 
              ? "bg-white text-amber-600 shadow-sm border border-slate-200" 
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Settings className="h-4 w-4" />
          Pengaturan AI Bot
        </button>

      </div>

      {/* Tab CONTENT 1: CHATS MONITOR */}
      {activeTab === "chats" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[650px]">
          {/* Chat List (Left Panel) */}
          <Card className="lg:col-span-1 flex flex-col h-full overflow-hidden">
            <CardHeader className="py-3 px-4 border-b space-y-2.5 shrink-0 bg-slate-50/50">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <span>Daftar Obrolan WABA</span>
                    <Badge variant="outline" className="text-[11px] bg-emerald-50 text-emerald-800 border-emerald-300 font-semibold">
                      {filteredChats.length} Kontak
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-xs">Pantau pesan masuk & respon resmi Meta WABA</CardDescription>
                </div>
                <Button 
                  size="icon" 
                  variant="ghost" 
                  className="h-8 w-8 text-slate-500 hover:text-amber-600"
                  onClick={() => {
                    refetchLogs();
                    toast.success("Log chat WABA disegarkan!");
                  }}
                  title="Segarkan Chat"
                >
                  <RefreshCw className={`h-4 w-4 ${loadingLogs ? "animate-spin text-amber-500" : ""}`} />
                </Button>
              </div>

              {/* Response Status Filter Pills (Semua, Dibalas, Order, Menunggu) */}
              <div className="grid grid-cols-4 gap-1 p-1 bg-slate-200/70 rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() => setResponseFilter("all")}
                  className={`py-1.5 px-1 rounded-md font-medium text-[11px] flex items-center justify-center gap-1 transition-all ${
                    responseFilter === "all"
                      ? "bg-white text-slate-900 shadow-xs font-bold"
                      : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                  }`}
                >
                  <span>Semua</span>
                  <span className="text-[10px] opacity-75">({responseCounts.all})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setResponseFilter("replied")}
                  className={`py-1.5 px-1 rounded-md font-medium text-[11px] flex items-center justify-center gap-1 transition-all ${
                    responseFilter === "replied"
                      ? "bg-emerald-600 text-white shadow-xs font-bold"
                      : "text-emerald-800 hover:bg-emerald-100/70 font-semibold"
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                  <span>Dibalas</span>
                  <span className="text-[10px] opacity-90">({responseCounts.replied})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setResponseFilter("order")}
                  className={`py-1.5 px-1 rounded-md font-medium text-[11px] flex items-center justify-center gap-1 transition-all ${
                    responseFilter === "order"
                      ? "bg-amber-500 text-white shadow-xs font-bold"
                      : "text-amber-800 hover:bg-amber-100/70 font-semibold"
                  }`}
                >
                  <span>🛒 Order</span>
                  <span className="text-[10px] opacity-90 font-bold">({responseCounts.order})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setResponseFilter("waiting")}
                  className={`py-1.5 px-1 rounded-md font-medium text-[11px] flex items-center justify-center gap-1 transition-all ${
                    responseFilter === "waiting"
                      ? "bg-slate-700 text-white shadow-xs font-bold"
                      : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                  }`}
                >
                  <span>Menunggu</span>
                  <span className="text-[10px] opacity-75">({responseCounts.waiting})</span>
                </button>
              </div>

              {/* Search Bar for filtering contacts / numbers */}
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Cari nomor HP (cth: 0819...) atau nama..."
                  value={chatSearch}
                  onChange={(e) => setChatSearch(e.target.value)}
                  className="h-8 pl-8 pr-7 text-xs bg-white rounded-lg border-slate-200"
                />
                {chatSearch && (
                  <button 
                    onClick={() => setChatSearch("")} 
                    className="absolute right-2 top-2 h-4 w-4 text-xs flex items-center justify-center text-muted-foreground hover:text-slate-800 rounded-full bg-slate-100"
                    title="Hapus pencarian"
                  >
                    ×
                  </button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-y-auto flex-1">
              {filteredChats.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground p-4 text-center">
                  <Phone className="h-8 w-8 mb-2 opacity-50 text-amber-500" />
                  <p className="text-sm font-medium">
                    {chatSearch || responseFilter !== "all" ? "Tidak ada kontak yang cocok di filter ini" : "Belum ada riwayat chat WABA."}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {chatSearch || responseFilter !== "all" ? "Coba ganti kata kunci pencarian atau status respon." : "Pesan masuk/keluar WABA akan muncul di sini secara otomatis."}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredChats.map((chat) => {
                    const isSelected = selectedChatId === chat.chat_id;
                    const cleanDate = new Date(chat.latestLog.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
                    const isGoodName = chat.customer_name && chat.customer_name !== "Pelanggan" && chat.customer_name !== "Meta Status";
                    const isError = chat.latestLog.replied_by === "meta_error" || chat.latestLog.message.startsWith("❌");
                    const isLastIncoming = chat.latestLog.direction === "incoming";
                    const isOrdered = chatTagsMap.get(chat.customer_phone) === "order";

                    return (
                      <div
                        key={chat.chat_id}
                        onClick={() => setSelectedChatId(chat.chat_id)}
                        className={`w-full p-3.5 text-left flex items-start justify-between gap-2.5 hover:bg-slate-50/80 transition-colors cursor-pointer group ${
                          isSelected ? "bg-amber-50/80 border-r-4 border-r-amber-500 shadow-xs" : ""
                        }`}
                      >
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            {chat.hasIncoming && (
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" title="Konsumen Merespon!" />
                            )}
                            <p className="font-semibold text-sm truncate text-slate-900 group-hover:text-amber-700 transition-colors">
                              {isGoodName ? chat.customer_name : chat.formatted_phone || `+${chat.customer_phone}`}
                            </p>
                          </div>
                          <p className="text-[11px] font-mono font-medium text-emerald-700">
                            {chat.formatted_phone || `+${chat.customer_phone}`}
                          </p>
                          <p className={`text-xs truncate ${isLastIncoming ? "text-emerald-700 font-semibold" : isError ? "text-rose-600 font-medium" : "text-slate-500"}`}>
                            {isLastIncoming ? `💬 ${chat.latestLog.message}` : chat.latestLog.message}
                          </p>
                        </div>

                        <div className="flex flex-col items-end gap-1.5 shrink-0 pt-0.5">
                          {/* Top Row: Time & Minimalist Chevron Action */}
                          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <span className="text-[10px] text-muted-foreground">{cleanDate}</span>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  className="h-6 w-6 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-900 hover:bg-slate-200/90 hover:scale-110 active:scale-95 transition-all shadow-2xs hover:shadow-xs border border-transparent hover:border-slate-300 cursor-pointer"
                                  title="Menu Label Chat"
                                >
                                  <ChevronDown className="h-3.5 w-3.5 stroke-[2.5]" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44 p-1 shadow-lg bg-white border border-slate-200 z-50">
                                {isOrdered ? (
                                  <DropdownMenuItem
                                    onClick={() => handleToggleOrderTag(chat.customer_phone, false)}
                                    className="text-xs text-rose-600 focus:text-rose-700 focus:bg-rose-50 cursor-pointer font-medium gap-2 py-2"
                                  >
                                    <XCircle className="h-4 w-4 text-rose-500" />
                                    <span>Lepas Label Order</span>
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    onClick={() => handleToggleOrderTag(chat.customer_phone, true)}
                                    className="text-xs text-amber-700 focus:text-amber-800 focus:bg-amber-50 cursor-pointer font-semibold gap-2 py-2"
                                  >
                                    <ShoppingCart className="h-4 w-4 text-amber-500" />
                                    <span>Beri Label Order</span>
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>

                          {/* Bottom Row: Minimalist Order Badge (Only visible when tagged Order) */}
                          {isOrdered && (
                            <div className="flex items-center gap-1 justify-end">
                              <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-[9px] px-2 py-0.5 font-bold shadow-2xs flex items-center gap-1">
                                <ShoppingCart className="h-2.5 w-2.5" />
                                <span>Order</span>
                              </Badge>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Chat Bubbles (Right Panel) */}
          <Card className="lg:col-span-2 flex flex-col h-full overflow-hidden">
            {selectedChatId ? (
              <>
                {(() => {
                  const activeChat = uniqueChats.find(c => c.chat_id === selectedChatId);
                  const isGoodName = activeChat?.customer_name && activeChat.customer_name !== "Pelanggan" && activeChat.customer_name !== "Meta Status";
                  const displayName = isGoodName ? activeChat.customer_name : "Pelanggan";
                  const displayPhone = activeChat?.formatted_phone || formatDisplayPhone(selectedChatId.replace(/[^0-9]/g, ""));
                  const isCurrentOrdered = activeChat ? chatTagsMap.get(activeChat.customer_phone) === "order" : false;

                  return (
                    <>
                      <CardHeader className="py-3 px-4 border-b flex flex-row items-center justify-between shrink-0 bg-slate-50/50">
                        <div>
                          <CardTitle className="text-base flex items-center gap-2">
                            <span>{displayName}</span>
                            <span className="text-xs font-mono font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              {displayPhone}
                            </span>
                            <Badge className="bg-emerald-600 text-white text-[10px]">WABA Resmi Meta</Badge>
                            {isCurrentOrdered && (
                              <Badge className="bg-amber-500 text-white text-[10px] flex items-center gap-1">
                                <ShoppingCart className="h-3 w-3" />
                                <span>Order</span>
                              </Badge>
                            )}
                          </CardTitle>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Jalur: Meta Cloud API (+62 856-4540-6949)
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {/* Order Toggle Button in Header */}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={updatingTagPhone === activeChat?.customer_phone}
                            onClick={() => activeChat && handleToggleOrderTag(activeChat.customer_phone, !isCurrentOrdered)}
                            className={`h-7 px-2.5 text-[11px] gap-1.5 font-semibold shadow-2xs transition-all cursor-pointer ${
                              isCurrentOrdered
                                ? "bg-amber-50 hover:bg-rose-50 text-amber-800 hover:text-rose-700 border-amber-300 hover:border-rose-300"
                                : "text-slate-600 hover:text-amber-800 hover:bg-amber-50/80 border-slate-200"
                            }`}
                            title={isCurrentOrdered ? "Klik untuk melepas label order" : "Klik untuk menandai order"}
                          >
                            <ShoppingCart className={`h-3.5 w-3.5 ${isCurrentOrdered ? "text-amber-600" : "text-slate-400"}`} />
                            <span>{isCurrentOrdered ? "🛒 Order (Lepas)" : "Tandai Order"}</span>
                          </Button>

                          {activeChat?.latestLog?.direction === "incoming" && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={markingHandled}
                              onClick={() => handleMarkAsHandled(activeChat)}
                              className="h-7 px-2.5 text-[11px] gap-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold shadow-2xs transition-all active:scale-95 cursor-pointer"
                              title="Tandai chat ini sudah dibaca/ditangani agar notifikasi di sidebar berkurang"
                            >
                              <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                              <span>{markingHandled ? "Menandai..." : "Tandai Selesai"}</span>
                            </Button>
                          )}
                        </div>
                      </CardHeader>

                      <CardContent className="flex-1 overflow-y-auto p-4 bg-slate-50/40 space-y-3.5">
                        {selectedChatMessages.map((msg) => {
                          const isIncoming = msg.direction === "incoming";
                          const isError = msg.replied_by === "meta_error" || msg.message.startsWith("❌");
                          const msgTime = new Date(msg.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

                          if (isError) {
                            return (
                              <div key={msg.id} className="flex justify-center my-2">
                                <div className="max-w-[90%] bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-3 shadow-2xs flex items-start gap-2.5">
                                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                                  <div className="space-y-1">
                                    <p className="text-xs font-semibold text-rose-900">Notifikasi Sistem Meta WABA</p>
                                    <p className="text-xs whitespace-pre-wrap leading-relaxed">{msg.message}</p>
                                    <span className="text-[9px] text-rose-500 block">{msgTime}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          const isOrderAgain = isIncoming && (msg.message || "").trim().toUpperCase().includes("ORDER");
                          const isWabaTemplate = msg.channel === "waba" || msg.replied_by === "template" || msg.message.startsWith("[Template");
                          const isAi = msg.replied_by === "ai";
                          const isManual = msg.replied_by === "manual";

                          if (isIncoming) {
                            return (
                              <div key={msg.id} className="flex justify-start my-1">
                                <div className="max-w-[78%] rounded-2xl p-3.5 shadow-xs bg-white border-2 border-emerald-500/40 text-slate-800 rounded-tl-none ring-2 ring-emerald-500/10">
                                  <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-emerald-100 text-[11px] font-bold text-emerald-800">
                                    <div className="flex items-center gap-1.5">
                                      <User className="w-3.5 h-3.5 text-emerald-600" />
                                      <span>Balasan Konsumen</span>
                                    </div>
                                    {isOrderAgain ? (
                                      <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-[9px] px-2 py-0.5 font-bold shadow-2xs animate-pulse">
                                        🎯 RESPON TOMBOL: ORDER LAGI
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 text-[9px] px-1.5 py-0 font-semibold">
                                        Chat Masuk
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-sm whitespace-pre-wrap leading-relaxed font-medium text-slate-800">{msg.message}</p>
                                  <div className="flex items-center gap-1.5 justify-end mt-1.5 text-slate-400 text-[9px]">
                                    <span>{msgTime}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div key={msg.id} className="flex justify-end my-1">
                              <div className={`max-w-[78%] rounded-2xl p-3.5 shadow-sm text-white rounded-tr-none ${
                                isWabaTemplate
                                  ? "bg-emerald-600 shadow-emerald-700/20"
                                  : isAi
                                  ? "bg-blue-600 shadow-blue-700/20"
                                  : isManual
                                  ? "bg-amber-600 shadow-amber-700/20"
                                  : "bg-slate-700 shadow-slate-800/20"
                              }`}>
                                <div className="flex items-center gap-1.5 pb-1.5 mb-1.5 border-b border-white/20 text-[11px] font-semibold text-white/90">
                                  {isWabaTemplate ? (
                                    <>
                                      <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                                      <span>Pesan Resmi WABA (Meta HSM)</span>
                                    </>
                                  ) : isAi ? (
                                    <>
                                      <Bot className="w-3.5 h-3.5 text-cyan-300" />
                                      <span>Asisten AI DeepSeek</span>
                                    </>
                                  ) : isManual ? (
                                    <>
                                      <User className="w-3.5 h-3.5 text-amber-200" />
                                      <span>Balasan Manual CS</span>
                                    </>
                                  ) : (
                                    <span>Sistem Otomatis</span>
                                  )}
                                </div>
                                <p className="text-sm whitespace-pre-wrap leading-relaxed font-sans">{msg.message}</p>
                                <div className="flex items-center gap-1.5 justify-end mt-1.5 text-white/75">
                                  <span className="text-[9px]">{msgTime}</span>
                                  <span className="text-[9px] font-bold uppercase tracking-wider">
                                    {isWabaTemplate ? "WABA TEMPLATE" : isAi ? "AI DEEPSEEK" : isManual ? "CS MANUAL" : "SISTEM"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        <div ref={chatEndRef} />
                      </CardContent>

                      <div className="p-3 border-t shrink-0 flex gap-2 bg-white">
                        <Input
                          placeholder={`Tulis balasan manual ke ${displayPhone}...`}
                          value={manualReplyText}
                          onChange={(e) => setManualReplyText(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleSendManualReply()}
                          disabled={sendingReply}
                          className="flex-1 rounded-xl"
                        />
                        <Button 
                          onClick={handleSendManualReply} 
                          disabled={sendingReply || !manualReplyText.trim()}
                          className="bg-amber-500 hover:bg-amber-600 text-white rounded-xl"
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      </div>
                    </>
                  );
                })()}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8 text-center bg-slate-50/10">
                <Bot className="h-12 w-12 mb-3 text-slate-300 animate-pulse" />
                <h3 className="font-semibold text-lg">Pilih Kontak</h3>
                <p className="text-sm max-w-sm mt-1">
                  Pilih salah satu nomor obrolan di sebelah kiri untuk melihat pesan masuk, status pengiriman WABA/WAHA, dan melakukan takeover chat secara manual.
                </p>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Tab CONTENT 2: SETTINGS */}
      {activeTab === "settings" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Settings className="h-5 w-5 text-amber-500" />
              Pengaturan AI & Sesi WhatsApp
            </CardTitle>
            <CardDescription>
              Konfigurasikan kunci API DeepSeek dan arahkan instansi WhatsApp Bot Anda ke VPS server WAHA.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: AI & API Keys */}
              <div className="lg:col-span-2 space-y-6">
                {/* Toggle Switch */}
                <div className="flex items-center justify-between p-4 bg-slate-50 border rounded-xl">
                  <div className="space-y-0.5">
                    <Label className="text-base font-semibold">Aktifkan WhatsApp AI Bot</Label>
                    <p className="text-xs text-muted-foreground">
                      Saat diaktifkan, DeepSeek akan langsung membalas setiap pesan masuk secara otomatis.
                    </p>
                  </div>
                  <Switch 
                    checked={isActive} 
                    onCheckedChange={setIsActive} 
                  />
                </div>

                {/* DeepSeek API Key */}
                <div className="space-y-2">
                  <Label className="font-semibold">DeepSeek API Key</Label>
                  <div className="flex gap-2">
                    <Input
                      type={showToken ? "text" : "password"}
                      placeholder="Masukkan Kunci API DeepSeek (sk-...)"
                      value={deepseekKey}
                      onChange={(e) => setDeepseekKey(e.target.value)}
                      className="font-mono"
                    />
                    <Button 
                      variant="outline" 
                      onClick={() => setShowToken(!showToken)}
                      className="px-3"
                    >
                      {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Kunci API disimpan secara terenkripsi di database Anda. Dapatkan di platform.deepseek.com.
                  </p>
                </div>

                {/* System Prompt / AI Character */}
                <div className="space-y-2">
                  <Label className="font-semibold">Instruksi Karakter & System Prompt AI</Label>
                  <Textarea
                    rows={5}
                    placeholder="Tulis karakter dan panduan bagi AI (Contoh: Anda adalah CS toko Madu Araa yang ramah...)"
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    className="leading-relaxed"
                  />
                  <p className="text-xs text-muted-foreground">
                    Tulis aturan main, gaya bahasa, jam kerja, kontak alternatif, dan kebijakan retur. AI akan patuh penuh pada instruksi ini.
                  </p>
                </div>

                {/* Biteship Origin Warehouse Settings */}
                <div className="space-y-3 border-t pt-6">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-amber-500" />
                    <Label className="text-sm font-bold text-slate-800">Gudang Keberangkatan (Biteship Origin)</Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Tentukan lokasi kecamatan dan kabupaten/kota asal pengiriman untuk hitung ongkir otomatis lewat Biteship.
                  </p>

                  <div className="relative">
                    <Input
                      type="text"
                      placeholder="Cari kecamatan / kabupaten asal (misal: Blimbing, Malang)"
                      value={searchQuery}
                      onChange={(e) => handleQueryChange(e.target.value)}
                      onFocus={() => setShowDropdown(true)}
                      onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                      className="pr-10"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      {isSearching ? (
                        <RefreshCw className="h-4 w-4 animate-spin text-slate-400" />
                      ) : searchQuery && (
                        <button 
                          type="button"
                          onClick={() => {
                            handleQueryChange("");
                            setShowDropdown(false);
                          }}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    {showDropdown && searchResults.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto divide-y divide-slate-100">
                        {searchResults.map((area: any) => (
                          <button
                            key={area.id}
                            type="button"
                            onClick={() => handleSelectArea(area)}
                            className="w-full text-left px-4 py-2.5 hover:bg-amber-50/50 transition-colors text-sm flex flex-col gap-0.5"
                          >
                            <span className="font-medium text-slate-800">
                              Kec. {area.administrative_division_level_3_name || area.name.split(',')[0]}
                            </span>
                            <span className="text-xs text-slate-500">
                              {area.name || `${area.administrative_division_level_2_name}, ${area.administrative_division_level_1_name}`}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    {showDropdown && searchQuery && !isSearching && searchResults.length === 0 && searchQuery !== originAreaName && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg p-4 text-center text-sm text-slate-500">
                        Tidak ditemukan lokasi yang cocok. Coba kata kunci lain.
                      </div>
                    )}
                  </div>

                  {originAreaId && (
                    <div className="flex items-center gap-2 mt-2 bg-emerald-50 border border-emerald-100 rounded-lg p-2.5">
                      <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                      <div className="text-xs">
                        <span className="font-semibold text-emerald-800">Gudang Asal Terpilih:</span>{" "}
                        <span className="text-emerald-700">{originAreaName}</span>{" "}
                        <span className="text-slate-400 font-mono text-[10px]">({originAreaId})</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* WAHA Server Configuration (Optional Overrides) */}
                <div className="border-t pt-6">
                  <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-amber-500" />
                    Konfigurasi VPS WAHA Khusus (Opsional)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">WAHA Server URL</Label>
                      <Input 
                        placeholder="https://waha.araahoney.my.id" 
                        value={wahaUrl} 
                        onChange={(e) => setWahaUrl(e.target.value)} 
                      />
                      <p className="text-[10px] text-muted-foreground">Kosongkan untuk memakai VPS global.</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Nama Sesi (Session Name)</Label>
                      <Input 
                        value={wahaSession} 
                        onChange={(e) => setWahaSession(e.target.value)} 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">WAHA API Key (Opsional)</Label>
                      <Input 
                        type="password" 
                        placeholder="Password API WAHA" 
                        value={wahaApiKey} 
                        onChange={(e) => setWahaApiKey(e.target.value)} 
                      />
                    </div>
                  </div>
                </div>

                {/* Save Button */}
                <div className="flex justify-end pt-4 border-t">
                  <Button 
                    onClick={() => saveSettingsMutation.mutate()} 
                    disabled={saveSettingsMutation.isPending}
                    className="bg-amber-500 hover:bg-amber-600 text-white font-semibold flex items-center gap-2 rounded-xl"
                  >
                    <Save className="h-4 w-4" />
                    Simpan Konfigurasi
                  </Button>
                </div>
              </div>

              {/* Right Column: Connection Status & Barcode Scan */}
              <div className="lg:col-span-1">
                <div className="border border-slate-200 bg-slate-50/50 rounded-xl p-4 space-y-4 flex flex-col h-full justify-between shadow-xs">
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold flex items-center gap-2 text-slate-800">
                      <QrCode className="h-4 w-4 text-amber-500" />
                      Status Sesi & Hubungkan WA
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Scan QR Code menggunakan nomor WhatsApp khusus untuk asisten AI ini.
                    </p>
                  </div>

                  {/* Status Badge */}
                  <div className="p-3 bg-white border rounded-xl flex items-center justify-between shadow-xs">
                    <span className="text-xs font-medium text-slate-500">Status Sesi ({wahaSession}):</span>
                    {sessionStatus === "WORKING" && (
                      <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white border-0 flex items-center gap-1 text-[10px]">
                        <CheckCircle className="h-3 w-3" /> AKTIF & KONEK
                      </Badge>
                    )}
                    {sessionStatus === "SCAN_QR" && (
                      <Badge className="bg-amber-500 hover:bg-amber-600 text-white border-0 flex items-center gap-1 text-[10px]">
                        <QrCode className="h-3 w-3" /> PINDAI QR CODE
                      </Badge>
                    )}
                    {sessionStatus === "STARTING" && (
                      <Badge className="bg-blue-500 hover:bg-blue-600 text-white border-0 flex items-center gap-1 text-[10px] animate-pulse">
                        <RefreshCw className="h-3 w-3 animate-spin" /> MENYALAKAN...
                      </Badge>
                    )}
                    {sessionStatus === "STOPPED" && (
                      <Badge className="bg-slate-400 hover:bg-slate-500 text-white border-0 flex items-center gap-1 text-[10px]">
                        <XCircle className="h-3 w-3" /> NONAKTIF (MATI)
                      </Badge>
                    )}
                    {sessionStatus === "DISCONNECTED" && (
                      <Badge className="bg-destructive hover:bg-destructive text-white border-0 flex items-center gap-1 text-[10px]">
                        <AlertTriangle className="h-3 w-3" /> DISKONEK / DOWN
                      </Badge>
                    )}
                  </div>

                  {/* QR Code / Status Visual Display Area */}
                  <div className="flex-1 min-h-[220px] border border-dashed rounded-xl bg-white flex flex-col items-center justify-center p-4 text-center">
                    {sessionStatus === "SCAN_QR" && qrImageUrl ? (
                      <div className="space-y-3 flex flex-col items-center">
                        <img 
                          src={qrImageUrl} 
                          alt="WAHA QR Code" 
                          className="h-44 w-44 object-contain border p-2 rounded-lg bg-white shadow-xs" 
                        />
                        <p className="text-[10px] text-muted-foreground max-w-[180px] leading-relaxed">
                          Buka WhatsApp &gt; Perangkat Tertaut &gt; Tautkan Perangkat, lalu scan QR Code di atas.
                        </p>
                        <Button 
                          variant="outline" 
                          size="xs" 
                          onClick={() => setQrRefreshTrigger(p => p + 1)}
                          className="text-[10px] h-7 px-2.5"
                        >
                          <RefreshCw className="h-3 w-3 mr-1" /> Segarkan QR
                        </Button>
                      </div>
                    ) : sessionStatus === "WORKING" ? (
                      <div className="space-y-2 flex flex-col items-center">
                        <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center">
                          <CheckCircle className="h-6 w-6 text-emerald-600" />
                        </div>
                        <h4 className="font-bold text-xs text-slate-800">WhatsApp Terhubung!</h4>
                        <p className="text-[10px] text-slate-500 max-w-[180px] leading-relaxed">
                          Bot AI saat ini aktif dan siap merespon chat pelanggan secara otomatis menggunakan nomor ini.
                        </p>
                      </div>
                    ) : sessionStatus === "STARTING" ? (
                      <div className="space-y-2 flex flex-col items-center">
                        <RefreshCw className="h-8 w-8 text-amber-500 animate-spin" />
                        <h4 className="font-bold text-xs text-slate-800">Menghubungkan...</h4>
                        <p className="text-[10px] text-slate-500 max-w-[180px]">
                          Sedang memuat data sesi WhatsApp dari server. Mohon tunggu sebentar.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2 flex flex-col items-center text-slate-400">
                        <QrCode className="h-10 w-10 opacity-30 text-slate-400" />
                        <h4 className="font-bold text-xs text-slate-650">Sesi Belum Dinyalakan</h4>
                        <p className="text-[10px] text-slate-400 max-w-[180px]">
                          Klik tombol **Mulai Sesi** di bawah untuk membuat barcode WhatsApp.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Controller Action Buttons */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => checkSessionStatus(false)}
                      disabled={loadingStatus || actionLoading}
                      className="text-xs h-9 flex items-center justify-center gap-1 rounded-xl"
                    >
                      <RefreshCw className={`h-3 w-3 ${loadingStatus ? "animate-spin" : ""}`} />
                      Cek Status
                    </Button>
                    
                    {sessionStatus === "WORKING" || sessionStatus === "SCAN_QR" || sessionStatus === "STARTING" ? (
                      <Button 
                        size="sm" 
                        variant="destructive"
                        onClick={handleStopSession}
                        disabled={actionLoading}
                        className="text-xs h-9 flex items-center justify-center gap-1 rounded-xl"
                      >
                        <Pause className="h-3 w-3" />
                        Mati Sesi
                      </Button>
                    ) : (
                      <Button 
                        size="sm" 
                        onClick={handleStartSession}
                        disabled={actionLoading || sessionStatus === "DISCONNECTED"}
                        className="text-xs h-9 bg-amber-500 hover:bg-amber-600 text-white font-semibold flex items-center justify-center gap-1 rounded-xl"
                      >
                        <Play className="h-3 w-3" />
                        Mulai Sesi
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}


    </div>
  );
}

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
import { toast } from "sonner";
import { 
  Bot, MessageSquare, Settings, RefreshCw, Send, CheckCircle, 
  User, ShieldAlert, Cpu, HeartHandshake, Eye, EyeOff, Save, Phone,
  Play, Pause, QrCode, AlertTriangle, XCircle, MapPin
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

  // 3. Fetch Chat Logs
  const { data: chatLogs = [], refetch: refetchLogs, isLoading: loadingLogs } = useQuery<ChatLog[]>({
    queryKey: ["whatsapp-chat-logs", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("whatsapp_chat_logs")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Gagal mengambil log chat:", error);
        throw error;
      }
      return data as ChatLog[];
    },
    enabled: !!userId,
    refetchInterval: 5000 // Auto refresh every 5 seconds for real-time chat feeling!
  });



  // Unique chats list derived from chatLogs
  const uniqueChats = useMemo(() => {
    const chatsMap = new Map<string, ChatLog>();
    // Since logs are ordered descending, the first one we see is the newest message
    chatLogs.forEach(log => {
      if (!chatsMap.has(log.chat_id)) {
        chatsMap.set(log.chat_id, log);
      }
    });
    return Array.from(chatsMap.values());
  }, [chatLogs]);

  // Active chat bubbles
  const selectedChatMessages = useMemo(() => {
    if (!selectedChatId) return [];
    return chatLogs
      .filter(log => log.chat_id === selectedChatId)
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

  // Send Manual Reply via WAHA Proxy and log to DB
  const handleSendManualReply = async () => {
    const text = manualReplyText.trim();
    if (!text || !selectedChatId || !userId) return;

    setSendingReply(true);
    try {
      // 1. Get WAHA configurations
      const currentWahaUrl = wahaUrl.trim() || "https://waha.araahoney.my.id";
      const currentWahaApiKey = wahaApiKey.trim() || "";
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (currentWahaApiKey) {
        headers["X-Api-Key"] = currentWahaApiKey;
      }

      // 2. Call WAHA Proxy to send text
      const sendRes = await fetch("/api/waha-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: `${currentWahaUrl}/api/messages/sendText`,
          method: "POST",
          headers,
          body: {
            session: wahaSession,
            chatId: selectedChatId,
            text
          }
        })
      });

      if (!sendRes.ok) {
        const errText = await sendRes.text();
        throw new Error(`Gagal mengirim via WAHA: ${errText}`);
      }

      // 3. Log manual message to database
      const customerPhone = selectedChatId.split("@")[0];
      const activeChatInfo = uniqueChats.find(c => c.chat_id === selectedChatId);
      const customerName = activeChatInfo?.customer_name || "Pelanggan WA";

      const { error: logErr } = await supabase
        .from("whatsapp_chat_logs")
        .insert({
          user_id: userId,
          chat_id: selectedChatId,
          customer_phone: customerPhone,
          customer_name: customerName,
          message: text,
          direction: "outgoing",
          replied_by: "manual",
          created_at: new Date().toISOString()
        });

      if (logErr) {
        console.error("Gagal mencatat log manual:", logErr.message);
      }

      toast.success("Balasan manual berhasil dikirim!");
      setManualReplyText("");
      refetchLogs();
    } catch (err: any) {
      toast.error(err.message || "Gagal mengirim balasan.");
    } finally {
      setSendingReply(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Bot className="h-6 w-6 text-amber-500" />
            Asisten WhatsApp AI (DeepSeek)
          </h1>
          <p className="text-muted-foreground text-sm">
            Otomatisasi balasan chat WhatsApp pelanggan menggunakan kecerdasan buatan DeepSeek-V3 yang super murah dan pintar.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            onClick={() => {
              refetchLogs();
              refetchSettings();
              toast.success("Data WhatsApp AI diperbarui!");
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[600px]">
          {/* Chat List (Left Panel) */}
          <Card className="lg:col-span-1 flex flex-col h-full overflow-hidden">
            <CardHeader className="py-4 border-b">
              <CardTitle className="text-base">Daftar Obrolan</CardTitle>
              <CardDescription>Pilih kontak untuk memantau detail chat.</CardDescription>
            </CardHeader>
            <CardContent className="p-0 overflow-y-auto flex-1">
              {uniqueChats.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground p-4 text-center">
                  <Phone className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm font-medium">Belum ada riwayat chat.</p>
                  <p className="text-xs">Chat pelanggan masuk akan muncul di sini secara otomatis.</p>
                </div>
              ) : (
                <div className="divide-y">
                  {uniqueChats.map((chat) => {
                    const isSelected = selectedChatId === chat.chat_id;
                    const cleanDate = new Date(chat.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
                    return (
                      <button
                        key={chat.id}
                        onClick={() => setSelectedChatId(chat.chat_id)}
                        className={`w-full p-4 text-left flex items-start justify-between gap-2 hover:bg-slate-50 transition-colors ${
                          isSelected ? "bg-amber-50/70 border-r-4 border-r-amber-500" : ""
                        }`}
                      >
                        <div className="space-y-1 min-w-0">
                          <p className="font-semibold text-sm truncate text-slate-800">
                            {chat.customer_name || `+${chat.customer_phone}`}
                          </p>
                          <p className="text-xs text-slate-500 truncate">
                            {chat.message}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <span className="text-[10px] text-muted-foreground">{cleanDate}</span>
                          {chat.direction === "outgoing" && (
                            <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${
                              chat.replied_by === "ai" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-blue-50 text-blue-700 border-blue-200"
                            }`}>
                              {chat.replied_by === "ai" ? "AI" : "Manual"}
                            </Badge>
                          )}
                        </div>
                      </button>
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
                <CardHeader className="py-3 border-b flex flex-row items-center justify-between shrink-0">
                  <div>
                    <CardTitle className="text-base">
                      {uniqueChats.find(c => c.chat_id === selectedChatId)?.customer_name || `+${selectedChatId.split("@")[0]}`}
                    </CardTitle>
                    <p className="text-[11px] text-muted-foreground">ID Sesi WAHA: {wahaSession}</p>
                  </div>
                  <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-amber-200">
                    Sesi Aktif
                  </Badge>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto p-4 bg-slate-50/50 space-y-4">
                  {selectedChatMessages.map((msg) => {
                    const isIncoming = msg.direction === "incoming";
                    const msgTime = new Date(msg.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isIncoming ? "justify-start" : "justify-end"}`}
                      >
                        <div className={`max-w-[75%] rounded-2xl p-3 shadow-sm ${
                          isIncoming 
                            ? "bg-white border text-slate-800 rounded-tl-none" 
                            : "bg-amber-500 text-white rounded-tr-none"
                        }`}>
                          <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.message}</p>
                          <div className={`flex items-center gap-1.5 justify-end mt-1 ${isIncoming ? "text-slate-400" : "text-amber-100"}`}>
                            <span className="text-[9px]">{msgTime}</span>
                            {!isIncoming && (
                              <span className="text-[9px] font-bold uppercase">
                                {msg.replied_by || "system"}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={chatEndRef} />
                </CardContent>
                <div className="p-3 border-t shrink-0 flex gap-2 bg-white">
                  <Input
                    placeholder="Tulis balasan manual di sini..."
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
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8 text-center bg-slate-50/10">
                <Bot className="h-12 w-12 mb-3 text-slate-300 animate-pulse" />
                <h3 className="font-semibold text-lg">Pilih Kontak</h3>
                <p className="text-sm max-w-sm mt-1">
                  Pilih salah satu nomor obrolan di sebelah kiri untuk melihat pesan masuk, transkripsi suara, analisis bukti transfer, dan melakukan takeover chat secara manual.
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

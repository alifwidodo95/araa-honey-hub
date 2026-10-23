import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from "react";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { 
  Bot, MessageSquare, Settings, RefreshCw, Send, CheckCircle, 
  User, ShieldAlert, Cpu, HeartHandshake, Eye, EyeOff, Save, Phone,
  Play, Pause, QrCode, AlertTriangle, XCircle, MapPin, Search, AlertCircle, Sparkles,
  ChevronDown, ShoppingCart, Pencil, Trash2, Plus, Zap, Check, CheckCheck, Smile,
  Pin, PinOff, Calendar, Clock, Copy,
  Image as ImageIcon, Download, ZoomIn, ExternalLink,
  Maximize2, Minimize2, Paperclip, Video, X, Loader2,
  Package, Truck
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
  is_read?: boolean | null;
  media_id?: string | null;
  media_url?: string | null;
  created_at: string;
  status?: 'sending' | 'failed' | 'sent';
  errorMsg?: string;
  delivery_status?: 'sent' | 'delivered' | 'read' | 'failed' | null;
  wamid?: string | null;
}

interface WhatsAppPinnedChat {
  phone: string;
  chat_id: string | null;
  customer_name: string | null;
  is_pinned: boolean;
  follow_up_date: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

interface EmojiItem {
  emoji: string;
  name: string;
  keywords: string[];
}

const EMOJI_LIST: { category: string; label: string; items: EmojiItem[] }[] = [
  {
    category: "salam",
    label: "🙏 CS",
    items: [
      { emoji: "🙏", name: "terima kasih", keywords: ["makasih", "thanks", "tq", "doa", "maaf", "salam"] },
      { emoji: "😊", name: "senyum", keywords: ["smile", "ramah", "senang", "happy"] },
      { emoji: "👍", name: "jempol", keywords: ["ok", "siap", "mantap", "bagus", "baik", "setuju"] },
      { emoji: "😇", name: "senyum malaikat", keywords: ["baik", "tulus", "ikhlas"] },
      { emoji: "🤝", name: "jabat tangan", keywords: ["deal", "kerjasama", "sepakat"] },
      { emoji: "🤗", name: "peluk ramah", keywords: ["hangat", "ramah", "welcome"] },
      { emoji: "❤️", name: "hati merah", keywords: ["love", "cinta", "suka"] },
      { emoji: "👏", name: "tepuk tangan", keywords: ["selamat", "hebat", "mantul"] },
      { emoji: "👌", name: "tangan oke", keywords: ["ok", "siap", "beres"] },
      { emoji: "🥰", name: "penuh cinta", keywords: ["senang", "gemas", "suka"] },
      { emoji: "😍", name: "mata hati", keywords: ["kagum", "suka", "love"] },
      { emoji: "😁", name: "senyum lebar", keywords: ["gembira", "tertawa"] },
      { emoji: "🙌", name: "angkat tangan", keywords: ["hore", "syukur", "alhamdulillah"] },
      { emoji: "👋", name: "lambaian tangan", keywords: ["halo", "hai", "selamat tinggal"] },
      { emoji: "🎉", name: "pesta terompet", keywords: ["selamat", "promo", "kejutan"] },
      { emoji: "✨", name: "kilau bintang", keywords: ["spesial", "berkilau", "baru"] },
    ]
  },
  {
    category: "toko",
    label: "🛒 Toko",
    items: [
      { emoji: "🛒", name: "keranjang belanja", keywords: ["troli", "order", "beli", "checkout"] },
      { emoji: "📦", name: "paket kardus", keywords: ["box", "packing", "pesanan", "barang"] },
      { emoji: "🚚", name: "truk kirim", keywords: ["kurir", "ekspedisi", "ongkir", "jalan", "antar"] },
      { emoji: "🛵", name: "motor kurir", keywords: ["ojol", "instan", "sameday"] },
      { emoji: "💰", name: "kantong uang", keywords: ["duit", "bayar", "transfer", "lunas", "harga"] },
      { emoji: "💳", name: "kartu atm", keywords: ["bank", "rekening", "transfer", "qris"] },
      { emoji: "🏷️", name: "label diskon", keywords: ["promo", "potongan", "voucher"] },
      { emoji: "🎁", name: "hadiah kado", keywords: ["free", "gratis", "bonus"] },
      { emoji: "🧾", name: "struk kwitansi", keywords: ["nota", "invoice", "resi"] },
      { emoji: "🛍️", name: "tas belanja", keywords: ["shopping", "toko"] },
      { emoji: "⏰", name: "jam weker", keywords: ["waktu", "segera", "deadline"] },
      { emoji: "📍", name: "pin lokasi", keywords: ["alamat", "lokasi", "tujuan"] },
      { emoji: "📱", name: "handphone", keywords: ["wa", "hp", "chat", "kontak"] },
      { emoji: "📞", name: "gagang telepon", keywords: ["hubungi", "telepon", "call"] },
    ]
  },
  {
    category: "madu",
    label: "🍯 Madu",
    items: [
      { emoji: "🍯", name: "pot madu", keywords: ["madu", "honey", "araa", "manis", "murni"] },
      { emoji: "🐝", name: "lebah madu", keywords: ["bee", "tawon", "ternak"] },
      { emoji: "🌸", name: "bunga sakura", keywords: ["nektar", "bunga", "cantik"] },
      { emoji: "🌿", name: "daun herbal", keywords: ["herbal", "alami", "sehat"] },
      { emoji: "🍃", name: "daun hijau", keywords: ["organik", "fresh", "segar"] },
      { emoji: "🍶", name: "botol madu", keywords: ["kemasan", "jerigen", "botol"] },
      { emoji: "🥄", name: "sendok", keywords: ["minum", "dosis", "aturan"] },
      { emoji: "💛", name: "hati kuning", keywords: ["kuning", "madu", "emas"] },
      { emoji: "🍋", name: "lemon", keywords: ["jeruk", "campuran", "wedang"] },
      { emoji: "💧", name: "tetes air", keywords: ["tetes", "kental", "cair"] },
      { emoji: "🌱", name: "tunas benih", keywords: ["tumbuh", "alam"] },
      { emoji: "☀️", name: "matahari cerah", keywords: ["pagi", "sehat", "daya tahan"] },
    ]
  },
  {
    category: "simbol",
    label: "✅ Simbol",
    items: [
      { emoji: "✅", name: "centang hijau", keywords: ["sukses", "benar", "lunas", "ready", "ada"] },
      { emoji: "❌", name: "silang merah", keywords: ["batal", "habis", "kosong", "salah"] },
      { emoji: "⚠️", name: "peringatan", keywords: ["penting", "perhatian", "awas"] },
      { emoji: "ℹ️", name: "informasi", keywords: ["info", "keterangan", "catatan"] },
      { emoji: "📌", name: "pin tusuk", keywords: ["catatan", "simpan", "ingat"] },
      { emoji: "⭐", name: "bintang", keywords: ["review", "testimoni", "favorit", "rating"] },
      { emoji: "💯", name: "seratus persen", keywords: ["asli", "murni", "dijamin", "pasti"] },
      { emoji: "🔥", name: "api membara", keywords: ["laris", "hot", "terbaru"] },
      { emoji: "💬", name: "balon obrolan", keywords: ["pesan", "tanya", "jawab"] },
      { emoji: "💡", name: "lampu ide", keywords: ["tips", "saran", "rekomendasi"] },
      { emoji: "🎯", name: "sasaran target", keywords: ["fokus", "tepat"] },
      { emoji: "➡️", name: "panah kanan", keywords: ["lanjut", "berikut"] },
    ]
  }
];

// Helper Functions for WhatsApp Date & Time Display
function isSameDay(dateStr1: string, dateStr2: string): boolean {
  if (!dateStr1 || !dateStr2) return false;
  const d1 = new Date(dateStr1);
  const d2 = new Date(dateStr2);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return false;
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function isVideoMedia(url?: string | null, message?: string | null): boolean {
  if (message && (/\[video\]/i.test(message) || message.toLowerCase().includes("[video dikirim]"))) return true;
  if (!url) return false;
  return /\.(mp4|mov|webm|avi|m4v)(\?.*)?$/i.test(url) || url.includes("type=video") || url.includes("video/mp4");
}

function WhatsAppChatMedia({
  mediaUrl,
  mediaId,
  message,
  onPreview,
  isOutgoing = false,
}: {
  mediaUrl?: string | null;
  mediaId?: string | null;
  message?: string | null;
  onPreview: (url: string, caption?: string, isVideo?: boolean) => void;
  isOutgoing?: boolean;
}) {
  const effectiveSrc = mediaUrl || (mediaId ? `/api/whatsapp-media?media_id=${mediaId}` : "");
  const initiallyVideo = isVideoMedia(effectiveSrc, message);
  const [isVideo, setIsVideo] = useState(initiallyVideo);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setIsVideo(isVideoMedia(effectiveSrc, message));
    setHasError(false);
  }, [effectiveSrc, message]);

  if (!effectiveSrc) return null;

  if (hasError) {
    return (
      <div className="p-3 text-xs text-amber-900 bg-amber-50 rounded-xl flex items-center gap-2 border border-amber-200 my-1">
        <span>🖼️</span>
        <span>Media tidak dapat dimuat atau telah kedaluwarsa dari server WhatsApp.</span>
      </div>
    );
  }

  if (isVideo) {
    return (
      <div className={`overflow-hidden rounded-xl border ${isOutgoing ? "border-white/20 bg-black" : "border-slate-200 bg-black"} shadow-xs max-w-sm my-1`}>
        <video
          src={effectiveSrc}
          controls
          className="w-full max-h-72 rounded-xl"
          preload="metadata"
          onError={() => setHasError(true)}
        />
      </div>
    );
  }

  return (
    <div
      onClick={() => onPreview(effectiveSrc, (message !== '[Pelanggan Mengirim Gambar]' && message !== '[Foto Dikirim]' && message !== '[Video Dikirim]') ? (message || undefined) : undefined, false)}
      className={`relative group/media overflow-hidden rounded-xl border ${isOutgoing ? "border-white/20 bg-black/10" : "border-slate-200 bg-slate-100"} cursor-pointer shadow-xs max-w-sm hover:shadow-md transition-all my-1`}
    >
      <img
        src={effectiveSrc}
        alt="Media WhatsApp"
        className="w-full max-h-72 object-cover object-top hover:scale-[1.02] transition-transform duration-200 rounded-xl"
        loading="lazy"
        onError={() => {
          // If image decoding failed, it's very likely a video (e.g. MP4)! Auto-switch to video player
          setIsVideo(true);
        }}
      />
      <div className="absolute inset-0 bg-black/35 opacity-0 group-hover/media:opacity-100 transition-opacity flex items-center justify-center gap-2 text-white text-xs font-semibold backdrop-blur-[1px] rounded-xl">
        <ZoomIn className="h-4 w-4" />
        <span>Klik untuk Perbesar</span>
      </div>
    </div>
  );
}

function formatChatDividerDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";

  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const targetMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((todayMidnight - targetMidnight) / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) {
    return "Hari Ini";
  } else if (diffDays === 1) {
    return "Kemarin";
  } else {
    return d.toLocaleDateString("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  }
}

function formatSidebarChatTime(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";

  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const targetMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((todayMidnight - targetMidnight) / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) {
    return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(".", ":");
  } else if (diffDays === 1) {
    return "Kemarin";
  } else if (diffDays > 1 && diffDays < 7) {
    return d.toLocaleDateString("id-ID", { weekday: "long" });
  } else if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
  } else {
    return d.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "2-digit" });
  }
}

function formatMessageTooltip(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";

  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const targetMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((todayMidnight - targetMidnight) / (1000 * 60 * 60 * 24));

  const timeStr = d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(".", ":");
  const fullDate = d.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });

  if (diffDays <= 0) {
    return `Hari Ini (${fullDate}) pukul ${timeStr}`;
  } else if (diffDays === 1) {
    return `Kemarin (${fullDate}) pukul ${timeStr}`;
  } else {
    return `${fullDate} pukul ${timeStr}`;
  }
}

function WhatsAppAiPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"chats" | "settings">("chats");
  
  // Wide Mode State: default true (lebar penuh / widescreen) with localStorage persistence
  const [isWideMode, setIsWideMode] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("waba_wide_mode");
      return saved !== null ? saved === "true" : true;
    }
    return true;
  });
  
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

  const getWahaHeaders = useCallback(() => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const keyToUse = wahaApiKey.trim() || globalWahaConfig?.apiKey || "";
    if (keyToUse) {
      headers["X-Api-Key"] = keyToUse;
    }
    return headers;
  }, [wahaApiKey, globalWahaConfig]);

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

  const checkSessionStatus = useCallback(async (silent = false) => {
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
  }, [wahaUrl, globalWahaConfig, wahaSession, getWahaHeaders]);

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
  }, [wahaUrl, wahaSession, globalWahaConfig, checkSessionStatus]);

  // Fetch QR image with memory leak prevention
  useEffect(() => {
    let active = true;
    const currentWahaUrl = wahaUrl.trim() || globalWahaConfig?.wahaUrl || "https://waha.araahoney.my.id";
    const currentSession = wahaSession.trim() || "default";

    if (sessionStatus !== "SCAN_QR" || !currentWahaUrl || !currentSession) {
      setQrImageUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return "";
      });
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
          setQrImageUrl(prev => {
            if (prev) URL.revokeObjectURL(prev);
            return url;
          });
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
      setQrImageUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return "";
      });
    };
  }, [sessionStatus, qrRefreshTrigger, wahaUrl, wahaSession, globalWahaConfig, getWahaHeaders]);

  // Chat Monitor States
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [manualReplyText, setManualReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [pendingMessages, setPendingMessages] = useState<ChatLog[]>([]);

  // Media Attachment States for Outgoing Photo / Video
  const [mediaAttachment, setMediaAttachment] = useState<{
    file: File;
    previewUrl: string;
    mediaType: "image" | "video";
    fileName: string;
    fileSize: number;
  } | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (file: File) => {
    if (!file) return;

    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");

    if (!isImage && !isVideo) {
      toast.error("Format berkas tidak didukung. Harap pilih foto (JPG, PNG, WebP) atau video (MP4, MOV).");
      return;
    }

    // Size limit: Image max 5 MB, Video max 16 MB
    if (isImage && file.size > 5 * 1024 * 1024) {
      toast.error(`Ukuran foto terlalu besar (${(file.size / (1024 * 1024)).toFixed(1)} MB). Batas maksimal Meta WABA adalah 5 MB.`);
      return;
    }

    if (isVideo && file.size > 16 * 1024 * 1024) {
      toast.error(`Ukuran video terlalu besar (${(file.size / (1024 * 1024)).toFixed(1)} MB). Batas maksimal Meta WABA adalah 16 MB.`);
      return;
    }

    if (mediaAttachment?.previewUrl) {
      URL.revokeObjectURL(mediaAttachment.previewUrl);
    }

    const previewUrl = URL.createObjectURL(file);
    const mediaType: "image" | "video" = isVideo ? "video" : "image";

    setMediaAttachment({
      file,
      previewUrl,
      mediaType,
      fileName: file.name,
      fileSize: file.size,
    });

    toast.success(`${mediaType === "video" ? "Video" : "Foto"} siap dikirim! Anda dapat mengetik keterangan caption jika perlu.`);
    if (manualInputRef.current) {
      manualInputRef.current.focus();
    }
  };

  const handleRemoveMediaAttachment = () => {
    if (mediaAttachment?.previewUrl) {
      URL.revokeObjectURL(mediaAttachment.previewUrl);
    }
    setMediaAttachment(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handlePasteMedia = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf("image") !== -1 || item.type.indexOf("video") !== -1) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          handleFileSelect(file);
          return;
        }
      }
    }
  };

  const uploadMediaToStorage = async (file: File): Promise<string> => {
    const fileExt = file.name.split(".").pop() || (file.type.startsWith("video/") ? "mp4" : "jpg");
    const cleanBaseName = file.name
      .replace(/\.[^/.]+$/, "")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 30);
    const filePath = `chat-media/${Date.now()}-${cleanBaseName}.${fileExt}`;

    const { data, error } = await supabase.storage
      .from("crm-media")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || (file.name.endsWith(".mp4") ? "video/mp4" : "image/jpeg")
      });

    if (error) {
      throw new Error("Gagal mengunggah media ke penyimpanan: " + error.message);
    }

    const { data: pubData } = supabase.storage
      .from("crm-media")
      .getPublicUrl(data.path);

    if (!pubData?.publicUrl) {
      throw new Error("Gagal mendapatkan tautan publik berkas.");
    }

    return pubData.publicUrl;
  };
  const [chatSearch, setChatSearch] = useState("");
  const [responseFilter, setResponseFilter] = useState<"all" | "unread" | "order" | "done" | "pinned">("all");
  const [updatingTagPhone, setUpdatingTagPhone] = useState<string | null>(null);
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pinDialogChat, setPinDialogChat] = useState<{
    chat_id: string;
    customer_name: string;
    customer_phone: string;
    formatted_phone: string;
  } | null>(null);
  const [pinDate, setPinDate] = useState<string>("");
  const [pinNote, setPinNote] = useState<string>("");
  const [savingPin, setSavingPin] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [previewImageCaption, setPreviewImageCaption] = useState<string | null>(null);
  const [previewIsVideo, setPreviewIsVideo] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const handlePreviewImage = useCallback((url: string, caption?: string, isVideo?: boolean) => {
    setPreviewImageUrl(url);
    setPreviewImageCaption(caption || null);
    setPreviewIsVideo(!!isVideo || isVideoMedia(url, caption));
  }, []);

  // Helper to extract clean digit-only phone (no +, -, or spaces; e.g. 6281284629656) for Agregator CRM search
  const getCleanCopyPhone = useCallback((phone?: string) => {
    if (!phone) return "";
    let clean = phone.replace(/[^0-9]/g, "");
    if (clean.startsWith("0")) {
      clean = "62" + clean.substring(1);
    }
    return clean;
  }, []);

  const handleCopyPhone = useCallback((phone?: string) => {
    const clean = getCleanCopyPhone(phone);
    if (!clean) return;
    navigator.clipboard.writeText(clean);
    setCopiedPhone(true);
    toast.success(`Nomor ${clean} berhasil disalin! Siap dipaste ke Agregator 📋`);
    setTimeout(() => setCopiedPhone(false), 2000);
  }, [getCleanCopyPhone]);

  // Lincah Customer & Order History Modal States
  const [isLincahModalOpen, setIsLincahModalOpen] = useState(false);
  const [lincahLoading, setLincahLoading] = useState(false);
  const [lincahError, setLincahError] = useState<string | null>(null);
  const [lincahSearchPhone, setLincahSearchPhone] = useState("");
  const [lincahData, setLincahData] = useState<{
    found: boolean;
    customer: {
      name: string;
      phone: string;
      address: string;
      destination: string;
      full_address: string;
      score: string | null;
      total_orders: number;
      latest_resi: string | null;
      latest_status: string | null;
      latest_product: string | null;
    } | null;
    orders: Array<{
      id: string;
      no_order: string | null;
      resi: string | null;
      name: string;
      phone: string;
      address: string;
      destination: string;
      full_address: string;
      product_name: string;
      quantity: number;
      type: string;
      cod_price: number;
      courier: string;
      courier_service: string;
      status: string;
      lastStatus: string | null;
      score: string | null;
      createdAt: string | null;
      completedAt: string | null;
    }>;
  } | null>(null);

  const fetchLincahData = useCallback(async (phoneToQuery: string) => {
    const clean = phoneToQuery.replace(/[^0-9]/g, "");
    if (!clean) {
      toast.error("Nomor telepon tidak valid atau kosong.");
      return;
    }
    setLincahLoading(true);
    setLincahError(null);
    setLincahSearchPhone(clean);
    try {
      const res = await fetch(`/api/lincah/customer?phone=${encodeURIComponent(clean)}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      setLincahData(json);
      if (!json.found) {
        toast.info("Tidak ditemukan riwayat pesanan Lincah untuk nomor ini.");
      }
    } catch (err: any) {
      console.error("[Lincah] Gagal mengambil data:", err);
      const isTimeout = err?.message && err.message.toLowerCase().includes("timeout");
      const friendlyMsg = isTimeout
        ? "Server Lincah memerlukan waktu lebih dari 45 detik untuk menyisir 20.000+ data pesanan. Silakan coba klik tombol Cari lagi."
        : (err.message || "Koneksi ke Lincah mengalami gangguan.");
      setLincahError(friendlyMsg);
      toast.error(`Gagal cek Lincah: ${friendlyMsg}`);
    } finally {
      setLincahLoading(false);
    }
  }, []);

  const handleOpenLincahDialog = useCallback((phone?: string) => {
    const clean = getCleanCopyPhone(phone);
    if (!clean) {
      toast.error("Pilih chat atau nomor telepon pelanggan terlebih dahulu.");
      return;
    }
    setIsLincahModalOpen(true);
    fetchLincahData(clean);
  }, [getCleanCopyPhone, fetchLincahData]);

  const handleForwardLincahToChat = useCallback((
    order: {
      name: string;
      phone: string;
      full_address: string;
      product_name: string;
      quantity: number;
      type: string;
      cod_price: number;
      courier: string;
      resi: string | null;
    },
    mode: "full" | "address" | "product" = "full"
  ) => {
    let formattedText = "";
    if (mode === "full") {
      const typeLabel = order.type === "cod" ? "COD (Bayar di Tempat)" : "Non-COD / Transfer";
      const priceText = order.cod_price ? `Rp ${Number(order.cod_price).toLocaleString("id-ID")}` : "-";
      const resiText = order.resi ? `${order.courier ? order.courier + " " : ""}${order.resi}` : "-";

      formattedText = `📦 *DATA PESANAN KONSUMEN (LINCAH)*
👤 *Nama:* ${order.name}
📱 *No. HP:* ${order.phone}
📍 *Alamat:* ${order.full_address}
🍯 *Produk:* ${order.product_name} (${order.quantity} pcs)
💰 *Pembayaran:* ${typeLabel} - ${priceText}
🚚 *Ekspedisi & Resi:* ${resiText}`;
    } else if (mode === "address") {
      formattedText = `👤 *Nama:* ${order.name}
📱 *No. HP:* ${order.phone}
📍 *Alamat:* ${order.full_address}`;
    } else if (mode === "product") {
      const typeLabel = order.type === "cod" ? "COD" : "Transfer";
      const priceText = order.cod_price ? `Rp ${Number(order.cod_price).toLocaleString("id-ID")}` : "-";
      formattedText = `🍯 *Pesanan:* ${order.product_name} (${order.quantity} pcs)
💰 *Harga:* ${typeLabel} ${priceText}`;
    }

    setManualReplyText(prev => {
      const trimmed = prev.trim();
      return trimmed ? `${trimmed}\n\n${formattedText}` : formattedText;
    });

    setIsLincahModalOpen(false);
    toast.success("Data berhasil ditempel ke kolom chat!");
    setTimeout(() => {
      if (manualInputRef.current) {
        manualInputRef.current.focus();
        manualInputRef.current.selectionStart = manualInputRef.current.value.length;
        manualInputRef.current.selectionEnd = manualInputRef.current.value.length;
      }
    }, 100);
  }, []);

  // Mark all unread incoming messages for a customer/chat as read
  const markingReadRef = useRef<Set<string>>(new Set());

  const markChatAsRead = useCallback(async (chatId: string, phone?: string) => {
    const cleanPhone = (phone || "").replace(/[^0-9]/g, "");
    const lockKey = cleanPhone || chatId;
    if (!lockKey || markingReadRef.current.has(lockKey)) return;
    markingReadRef.current.add(lockKey);

    try {
      const promises = [];
      if (chatId) {
        promises.push(
          supabase
            .from("whatsapp_chat_logs")
            .update({ is_read: true })
            .eq("channel", "waba")
            .eq("direction", "incoming")
            .eq("chat_id", chatId)
            .eq("is_read", false)
        );
      }
      if (cleanPhone) {
        promises.push(
          supabase
            .from("whatsapp_chat_logs")
            .update({ is_read: true })
            .eq("channel", "waba")
            .eq("direction", "incoming")
            .eq("customer_phone", cleanPhone)
            .eq("is_read", false)
        );
      }
      await Promise.all(promises);

      // Invalidate chat logs, order chat logs, sidebar unreplied badge, and dedicated conversation query
      qc.invalidateQueries({ queryKey: ["whatsapp-chat-logs"] });
      qc.invalidateQueries({ queryKey: ["whatsapp-order-chat-logs"] });
      qc.invalidateQueries({ queryKey: ["unreplied-whatsapp-chats"] });
      qc.invalidateQueries({ queryKey: ["whatsapp-conversation"] });
    } catch (err) {
      console.error("Gagal menandai pesan telah dibaca:", err);
    } finally {
      setTimeout(() => {
        markingReadRef.current.delete(lockKey);
      }, 500);
    }
  }, [qc]);

  // Store metadata for dynamically selected contacts (e.g. from Universal Search)
  const [selectedCustomerMeta, setSelectedCustomerMeta] = useState<{
    chat_id: string;
    customer_name: string;
    customer_phone: string;
    formatted_phone: string;
  } | null>(null);

  // Handle clicking chat balloon in left panel or search results
  const handleSelectChat = (chat: {
    chat_id: string;
    customer_phone: string;
    customer_name?: string | null;
    formatted_phone?: string;
    isUnread?: boolean;
  }) => {
    setSelectedChatId(chat.chat_id);
    const cleanPhone = (chat.customer_phone || chat.chat_id.replace(/[^0-9]/g, "")).trim();
    setSelectedCustomerMeta({
      chat_id: chat.chat_id,
      customer_name: chat.customer_name || "Pelanggan",
      customer_phone: cleanPhone,
      formatted_phone: chat.formatted_phone || formatDisplayPhone(cleanPhone),
    });
    if (chat.isUnread) {
      markChatAsRead(chat.chat_id, chat.customer_phone);
    }
  };

  // Quick Reply States
  const [showQuickReplyMenu, setShowQuickReplyMenu] = useState(false);
  const [isQuickReplySheetOpen, setIsQuickReplySheetOpen] = useState(false);
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [formShortcut, setFormShortcut] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [isSavingReply, setIsSavingReply] = useState(false);
  const [deletingReplyId, setDeletingReplyId] = useState<string | null>(null);

  // Emoji Picker States
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [activeEmojiTab, setActiveEmojiTab] = useState("salam");
  const [emojiFilterText, setEmojiFilterText] = useState("");
  const manualInputRef = useRef<HTMLTextAreaElement>(null);

  const handleInsertEmoji = (emoji: string) => {
    const input = manualInputRef.current;
    if (input) {
      const start = input.selectionStart ?? manualReplyText.length;
      const end = input.selectionEnd ?? manualReplyText.length;
      const nextText = manualReplyText.substring(0, start) + emoji + manualReplyText.substring(end);
      setManualReplyText(nextText);
      setTimeout(() => {
        input.focus();
        const nextPos = start + emoji.length;
        input.setSelectionRange(nextPos, nextPos);
        input.style.height = "auto";
        input.style.height = Math.min(input.scrollHeight, 160) + "px";
      }, 10);
    } else {
      setManualReplyText(prev => prev + emoji);
    }
  };

  const filteredEmojiItems = useMemo(() => {
    const q = emojiFilterText.trim().toLowerCase();
    if (!q) {
      const activeCat = EMOJI_LIST.find(c => c.category === activeEmojiTab);
      return activeCat?.items || [];
    }
    const allItems = EMOJI_LIST.flatMap(c => c.items);
    return allItems.filter(item => 
      item.name.toLowerCase().includes(q) || 
      item.keywords.some(k => k.toLowerCase().includes(q))
    );
  }, [emojiFilterText, activeEmojiTab]);

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

  // 3. Fetch Chat Logs (Supabase Pro: batched range fetch to bypass PostgREST 1000-row cap)
  const [contactListLimit, setContactListLimit] = useState(2500);

  const { data: chatLogs = [], refetch: refetchLogs, isLoading: loadingLogs, isFetching: fetchingLogs } = useQuery<ChatLog[]>({
    queryKey: ["whatsapp-chat-logs", contactListLimit],
    queryFn: async () => {
      const BATCH_SIZE = 1000;
      const numBatches = Math.ceil(contactListLimit / BATCH_SIZE);
      const promises = [];

      for (let i = 0; i < numBatches; i++) {
        const from = i * BATCH_SIZE;
        const to = Math.min((i + 1) * BATCH_SIZE - 1, contactListLimit - 1);
        promises.push(
          supabase
            .from("whatsapp_chat_logs" as any)
            .select("id, chat_id, customer_phone, customer_name, message, direction, channel, is_read, replied_by, created_at, media_id, media_url, delivery_status")
            .eq("channel", "waba")
            .order("created_at", { ascending: false })
            .range(from, to)
        );
      }

      const results = await Promise.all(promises);
      const seenIds = new Set<string>();
      let allLogs: ChatLog[] = [];
      for (const res of results) {
        if (res.error) {
          console.error("Gagal mengambil log chat batch:", res.error);
          throw res.error;
        }
        if (res.data) {
          for (const log of (res.data as unknown as ChatLog[])) {
            if (log.id && !seenIds.has(log.id)) {
              seenIds.add(log.id);
              allLogs.push(log);
            } else if (!log.id) {
              allLogs.push(log);
            }
          }
        }
      }
      return allLogs;
    },
    refetchInterval: 60000, // Gentle background fallback (60s)
    refetchOnWindowFocus: true,
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
          qc.invalidateQueries({ queryKey: ["whatsapp-order-chat-logs"] });
          qc.invalidateQueries({ queryKey: ["whatsapp-conversation"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetchLogs, qc]);

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
    refetchInterval: 60000, // Gentle background fallback (60s)
    refetchOnWindowFocus: true,
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

  // Fast lookup Map: phone digits -> tag (normalizes both 628... and 08...)
  const chatTagsMap = useMemo(() => {
    const map = new Map<string, string>();
    chatTags.forEach(t => {
      const clean = (t.phone || "").replace(/[^0-9]/g, "");
      if (clean) {
        map.set(clean, t.tag);
        if (clean.startsWith("62")) {
          map.set("0" + clean.slice(2), t.tag);
        } else if (clean.startsWith("0")) {
          map.set("62" + clean.slice(1), t.tag);
        }
      }
    });
    return map;
  }, [chatTags]);

  // Extract canonical active order phones (unique 628... format)
  const canonicalOrderPhones = useMemo(() => {
    const phones = new Set<string>();
    chatTags
      .filter(t => t.tag === "order")
      .forEach(t => {
        let clean = (t.phone || "").replace(/[^0-9]/g, "");
        if (clean.startsWith("0")) clean = "62" + clean.slice(1);
        if (clean) phones.add(clean);
      });
    return Array.from(phones);
  }, [chatTags]);

  // Dedicated query to guarantee all active order chats are ALWAYS present in memory
  const { data: orderChatLogs = [] } = useQuery<ChatLog[]>({
    queryKey: ["whatsapp-order-chat-logs", canonicalOrderPhones],
    queryFn: async () => {
      if (canonicalOrderPhones.length === 0) return [];
      
      const queryVariants = [
        ...canonicalOrderPhones,
        ...canonicalOrderPhones.map(p => "0" + p.slice(2))
      ];

      const { data, error } = await supabase
        .from("whatsapp_chat_logs" as any)
        .select("id, chat_id, customer_phone, customer_name, message, direction, channel, is_read, replied_by, created_at, media_id, media_url, delivery_status")
        .eq("channel", "waba")
        .in("customer_phone", queryVariants)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Gagal mengambil log order chats:", error);
        return [];
      }
      return (data || []) as unknown as ChatLog[];
    },
    enabled: canonicalOrderPhones.length > 0,
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
  });

  // Chat Tag Handler (order, done, null)
  const handleSetChatTag = async (phone: string, tag: "order" | "done" | null) => {
    const cleanPhone = phone.replace(/[^0-9]/g, "");
    if (!cleanPhone) return;

    const canonical62 = cleanPhone.startsWith("0") ? "62" + cleanPhone.slice(1) : cleanPhone.startsWith("62") ? cleanPhone : "62" + cleanPhone;
    const canonical08 = cleanPhone.startsWith("62") ? "0" + cleanPhone.slice(2) : cleanPhone.startsWith("0") ? cleanPhone : "0" + cleanPhone;
    const phoneVariants = Array.from(new Set([cleanPhone, canonical62, canonical08]));

    setUpdatingTagPhone(cleanPhone);
    try {
      if (tag) {
        if (canonical08 !== canonical62) {
          await supabase.from("whatsapp_chat_tags" as any).delete().eq("phone", canonical08);
        }
        const { error } = await supabase
          .from("whatsapp_chat_tags" as any)
          .upsert({ phone: canonical62, tag: tag, updated_at: new Date().toISOString() });
        if (error) throw error;
        if (tag === "order") {
          toast.success("Kontak berhasil diberi label Order! 🛒");
        } else if (tag === "done") {
          toast.success("Order ditandai Selesai! ✅");
        }
      } else {
        const { error } = await supabase
          .from("whatsapp_chat_tags" as any)
          .delete()
          .in("phone", phoneVariants);
        if (error) throw error;
        toast.success("Label berhasil dilepas.");
      }
      qc.invalidateQueries({ queryKey: ["whatsapp-chat-tags"] });
      qc.invalidateQueries({ queryKey: ["whatsapp-order-chat-logs"] });
    } catch (err: any) {
      toast.error("Gagal memperbarui label: " + (err.message || "Error"));
    } finally {
      setUpdatingTagPhone(null);
    }
  };

  const handleToggleOrderTag = (phone: string, shouldTag: boolean) => {
    return handleSetChatTag(phone, shouldTag ? "order" : null);
  };

  // 4b. Fetch Pinned Chats & Follow-up Reminders from whatsapp_pinned_chats
  const { data: pinnedChats = [], refetch: refetchPinned } = useQuery<WhatsAppPinnedChat[]>({
    queryKey: ["whatsapp-pinned-chats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_pinned_chats" as any)
        .select("*")
        .eq("is_pinned", true);
      if (error) {
        console.error("Gagal mengambil pinned chats:", error);
        return [];
      }
      return (data || []) as WhatsAppPinnedChat[];
    },
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
  });

  // Realtime Supabase Subscription for pinned chats
  useEffect(() => {
    const channel = supabase
      .channel("realtime-whatsapp-pinned-chats")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_pinned_chats" },
        () => {
          refetchPinned();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetchPinned]);

  // Auto-refetch when CS returns to the tab (window focus or tab visibility restored)
  useEffect(() => {
    const handleRefetch = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        refetchLogs();
        refetchTags();
        refetchPinned();
        qc.invalidateQueries({ queryKey: ["whatsapp-conversation"] });
      }
    };
    window.addEventListener("focus", handleRefetch);
    document.addEventListener("visibilitychange", handleRefetch);
    return () => {
      window.removeEventListener("focus", handleRefetch);
      document.removeEventListener("visibilitychange", handleRefetch);
    };
  }, [refetchLogs, refetchTags, refetchPinned, qc]);

  // Fast lookup Map: phone digits or chat_id -> WhatsAppPinnedChat
  const pinnedMap = useMemo(() => {
    const map = new Map<string, WhatsAppPinnedChat>();
    pinnedChats.forEach(p => {
      if (p.is_pinned) {
        const clean = (p.phone || "").replace(/[^0-9]/g, "");
        if (clean) {
          map.set(clean, p);
          if (clean.startsWith("62")) {
            map.set("0" + clean.slice(2), p);
          } else if (clean.startsWith("0")) {
            map.set("62" + clean.slice(1), p);
          }
        }
        if (p.chat_id) map.set(p.chat_id, p);
      }
    });
    return map;
  }, [pinnedChats]);

  // Open Pin Dialog Modal
  const handleOpenPinDialog = useCallback((chat: {
    chat_id: string;
    customer_name: string;
    customer_phone: string;
    formatted_phone: string;
  }) => {
    const cleanPhone = (chat.customer_phone || "").replace(/[^0-9]/g, "");
    const current = pinnedMap.get(cleanPhone) || (chat.chat_id ? pinnedMap.get(chat.chat_id) : undefined);

    setPinDialogChat(chat);
    setPinDate(current?.follow_up_date || "");
    setPinNote(current?.note || "");
    setPinDialogOpen(true);
  }, [pinnedMap]);

  // Save or Update Pin & Follow-up Note
  const handleSavePin = async () => {
    if (!pinDialogChat) return;
    const cleanPhone = (pinDialogChat.customer_phone || "").replace(/[^0-9]/g, "");
    if (!cleanPhone) {
      toast.error("Nomor kontak tidak valid");
      return;
    }

    setSavingPin(true);
    try {
      const payload = {
        phone: cleanPhone,
        chat_id: pinDialogChat.chat_id,
        customer_name: pinDialogChat.customer_name,
        is_pinned: true,
        follow_up_date: pinDate ? pinDate : null,
        note: pinNote.trim() ? pinNote.trim() : null,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from("whatsapp_pinned_chats" as any)
        .upsert(payload, { onConflict: "phone" });

      if (error) throw error;

      toast.success("Chat berhasil disematkan & follow-up tersimpan! 📌");
      refetchPinned();
      setPinDialogOpen(false);
    } catch (err: any) {
      console.error("Error saving pin:", err);
      toast.error("Gagal menyimpan pin: " + (err.message || "Error"));
    } finally {
      setSavingPin(false);
    }
  };

  // Remove Pin (Unpin)
  const handleUnpin = async (phone: string, chatId?: string) => {
    const cleanPhone = (phone || "").replace(/[^0-9]/g, "");
    if (!cleanPhone && !chatId) return;

    setSavingPin(true);
    try {
      let query = supabase.from("whatsapp_pinned_chats" as any).delete();
      if (cleanPhone) {
        query = query.eq("phone", cleanPhone);
      } else if (chatId) {
        query = query.eq("chat_id", chatId);
      }
      const { error } = await query;
      if (error) throw error;

      toast.success("Pin chat berhasil dilepas.");
      refetchPinned();
      setPinDialogOpen(false);
    } catch (err: any) {
      console.error("Error unpinning:", err);
      toast.error("Gagal melepas pin: " + (err.message || "Error"));
    } finally {
      setSavingPin(false);
    }
  };

  // 5. Fetch Quick Replies (Balas Cepat)
  const { data: quickReplies = [], refetch: refetchQuickReplies } = useQuery<{
    id: string;
    shortcut: string;
    title: string;
    message: string;
    created_at: string;
    updated_at: string;
  }[]>({
    queryKey: ["whatsapp-quick-replies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_quick_replies" as any)
        .select("*")
        .order("shortcut", { ascending: true });
      if (error) {
        console.error("Gagal mengambil balas cepat:", error);
        return [];
      }
      return (data || []) as any[];
    },
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
  });

  // Realtime Supabase Subscription for quick replies
  useEffect(() => {
    const channel = supabase
      .channel("realtime-whatsapp-quick-replies")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_quick_replies" },
        () => {
          refetchQuickReplies();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetchQuickReplies]);

  // Handle Save / Update Quick Reply
  const handleSaveQuickReply = async () => {
    const shortcut = formShortcut.trim().replace(/^\//, "").toLowerCase();
    const title = formTitle.trim();
    const message = formMessage.trim();

    if (!shortcut) {
      toast.error("Pintasan / Shortcut wajib diisi (contoh: rekening).");
      return;
    }
    if (!title) {
      toast.error("Judul singkat wajib diisi.");
      return;
    }
    if (!message) {
      toast.error("Isi pesan balas cepat wajib diisi.");
      return;
    }

    setIsSavingReply(true);
    try {
      if (editingReplyId) {
        const { error } = await supabase
          .from("whatsapp_quick_replies" as any)
          .update({
            shortcut,
            title,
            message,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingReplyId);
        if (error) throw error;
        toast.success(`Balas cepat /${shortcut} berhasil diperbarui!`);
      } else {
        const { error } = await supabase
          .from("whatsapp_quick_replies" as any)
          .insert({
            shortcut,
            title,
            message,
          });
        if (error) throw error;
        toast.success(`Balas cepat /${shortcut} berhasil ditambahkan!`);
      }

      // Reset form
      setEditingReplyId(null);
      setFormShortcut("");
      setFormTitle("");
      setFormMessage("");
      refetchQuickReplies();
    } catch (err: any) {
      toast.error("Gagal menyimpan balas cepat: " + (err.message || "Error"));
    } finally {
      setIsSavingReply(false);
    }
  };

  // Handle Delete Quick Reply
  const handleDeleteQuickReply = async (id: string, shortcut: string) => {
    setDeletingReplyId(id);
    try {
      const { error } = await supabase
        .from("whatsapp_quick_replies" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
      toast.success(`Balas cepat /${shortcut} berhasil dihapus.`);
      if (editingReplyId === id) {
        setEditingReplyId(null);
        setFormShortcut("");
        setFormTitle("");
        setFormMessage("");
      }
      refetchQuickReplies();
    } catch (err: any) {
      toast.error("Gagal menghapus balas cepat: " + (err.message || "Error"));
    } finally {
      setDeletingReplyId(null);
    }
  };

  // Populate form for editing
  const handleStartEditQuickReply = (qr: { id: string; shortcut: string; title: string; message: string }) => {
    setEditingReplyId(qr.id);
    setFormShortcut(qr.shortcut);
    setFormTitle(qr.title);
    setFormMessage(qr.message);
  };

  // Reset edit form
  const handleCancelEdit = () => {
    setEditingReplyId(null);
    setFormShortcut("");
    setFormTitle("");
    setFormMessage("");
  };

  // Select Quick Reply into manual reply input
  const handleSelectQuickReply = (qr: { shortcut: string; title: string; message: string }, customerName?: string) => {
    let msg = qr.message;
    const nameToUse = (customerName && customerName !== "Pelanggan" && customerName !== "Meta Status") ? customerName : "Kak";
    msg = msg.replace(/\{nama\}/gi, nameToUse);
    setManualReplyText(msg);
    setShowQuickReplyMenu(false);
    setTimeout(() => {
      if (manualInputRef.current) {
        manualInputRef.current.focus();
        manualInputRef.current.style.height = "auto";
        manualInputRef.current.style.height = Math.min(manualInputRef.current.scrollHeight, 160) + "px";
      }
    }, 10);
  };

  // Quick reply search query derived from manualReplyText
  const isTriggeredBySlash = manualReplyText.startsWith("/") && !manualReplyText.includes("\n");
  const quickReplySearch = isTriggeredBySlash ? manualReplyText.slice(1).trim().toLowerCase() : "";
  const isQuickReplyMenuOpen = showQuickReplyMenu || isTriggeredBySlash;

  // Filtered quick replies based on search query
  const matchingQuickReplies = useMemo(() => {
    if (!quickReplySearch) return quickReplies;
    return quickReplies.filter(qr => 
      qr.shortcut.toLowerCase().includes(quickReplySearch) ||
      qr.title.toLowerCase().includes(quickReplySearch) ||
      qr.message.toLowerCase().includes(quickReplySearch)
    );
  }, [quickReplies, quickReplySearch]);

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

  // Date helpers for Follow-up & Pin reminders (Asia/Jakarta)
  const getTodayStrJakarta = () => {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
    } catch (e) {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
  };

  const getFutureDateStr = (daysToAdd: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysToAdd);
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(d);
    } catch (e) {
      return d.toISOString().split("T")[0];
    }
  };

  const formatFollowUpDate = (dateStr: string) => {
    if (!dateStr) return "";
    try {
      const [year, month, day] = dateStr.split("-").map(Number);
      const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"];
      return `${day} ${months[month - 1]}`;
    } catch (e) {
      return dateStr;
    }
  };

  const getFollowUpStatus = (dateStr: string | null | undefined) => {
    if (!dateStr) return "no_date";
    const today = getTodayStrJakarta();
    if (dateStr === today) return "today";
    if (dateStr < today) return "overdue";
    return "upcoming";
  };

  // Tier 1: Grouped unique chats with enriched contact info & Pinned Contacts Guarantee
  const uniqueChats = useMemo(() => {
    const chatsMap = new Map<string, {
      chat_id: string;
      latestLog: ChatLog;
      customer_name: string;
      customer_phone: string;
      formatted_phone: string;
      messageCount: number;
      hasIncoming: boolean;
      isUnread: boolean;
      isOrderAgain: boolean;
    }>();

    const combinedLogs = [...pendingMessages, ...orderChatLogs, ...chatLogs];
    const seenLogIds = new Set<string>();

    combinedLogs.forEach(log => {
      // Exclusively monitor WABA Meta Cloud API chats
      if (log.channel !== "waba") return;

      // Prevent duplicate logs between orderChatLogs and chatLogs from inflating messageCount
      if (log.id) {
        if (seenLogIds.has(log.id)) return;
        seenLogIds.add(log.id);
      }

      const cleanPhone = (log.customer_phone || log.chat_id.replace(/[^0-9]/g, "")).trim();
      const existing = chatsMap.get(log.chat_id);
      const isInc = log.direction === "incoming";
      const isOrder = isInc && (log.message || "").toUpperCase().includes("ORDER");
      const isUnreadMsg = isInc && !log.is_read;

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
          isUnread: isUnreadMsg,
          isOrderAgain: isOrder,
        });
      } else {
        existing.messageCount++;
        // Guarantee latestLog is always the newest message
        if (new Date(log.created_at).getTime() > new Date(existing.latestLog.created_at).getTime()) {
          existing.latestLog = log;
        }
        if (isInc) {
          existing.hasIncoming = true;
          if (isOrder) existing.isOrderAgain = true;
        }
        // If this log is an unread incoming message, keep chat marked unread
        if (isUnreadMsg) {
          existing.isUnread = true;
        }
        // If existing doesn't have a real name, but this log has a real customer name, adopt it!
        if (!isGoodName(existing.customer_name) && isGoodName(log.customer_name)) {
          existing.customer_name = log.customer_name!;
        }
      }
    });

    // Tier 1 Guarantee: Ensure ALL contacts marked with tag === 'order' are ALWAYS present in uniqueChats (deduplicated)
    canonicalOrderPhones.forEach(cleanPhone => {
      if (!cleanPhone) return;

      const altPhone = cleanPhone.startsWith("62") ? "0" + cleanPhone.slice(2) : cleanPhone;
      let existing = false;
      for (const c of chatsMap.values()) {
        const cPhone = (c.customer_phone || "").replace(/[^0-9]/g, "");
        const cChatId = (c.chat_id || "").replace(/[^0-9]/g, "");
        if (
          cPhone === cleanPhone ||
          cPhone === altPhone ||
          cChatId === cleanPhone ||
          cChatId === altPhone
        ) {
          existing = true;
          break;
        }
      }

      if (!existing) {
        const targetId = `${cleanPhone}@c.us`;
        chatsMap.set(targetId, {
          chat_id: targetId,
          latestLog: {
            id: `order-tag-${cleanPhone}`,
            chat_id: targetId,
            customer_phone: cleanPhone,
            customer_name: "Pelanggan Order",
            message: "🛒 [Pesanan Aktif]",
            direction: "outgoing",
            replied_by: null,
            channel: "waba",
            is_read: true,
            created_at: new Date().toISOString(),
          },
          customer_name: "Pelanggan Order",
          customer_phone: cleanPhone,
          formatted_phone: formatDisplayPhone(cleanPhone),
          messageCount: 1,
          hasIncoming: false,
          isUnread: false,
          isOrderAgain: false,
        });
      }
    });

    // Tier 1 Guarantee: Ensure all contacts in pinnedChats are present in uniqueChats
    pinnedChats.forEach(p => {
      if (!p.is_pinned) return;
      const cleanPhone = (p.phone || "").replace(/[^0-9]/g, "");
      const targetChatId = p.chat_id || cleanPhone;
      if (!targetChatId && !cleanPhone) return;

      // Check if already present by chat_id or phone
      let existing = chatsMap.get(targetChatId);
      if (!existing && cleanPhone) {
        for (const c of chatsMap.values()) {
          if (c.customer_phone === cleanPhone) {
            existing = c;
            break;
          }
        }
      }

      if (existing) {
        if (p.customer_name && (!existing.customer_name || existing.customer_name === "Pelanggan" || existing.customer_name === "Pelanggan WA")) {
          existing.customer_name = p.customer_name;
        }
      } else {
        chatsMap.set(targetChatId, {
          chat_id: targetChatId,
          latestLog: {
            id: `pinned-${cleanPhone || targetChatId}`,
            chat_id: targetChatId,
            customer_phone: cleanPhone,
            customer_name: p.customer_name || "Pelanggan",
            message: p.note ? `📌 ${p.note}` : "(Chat Disematkan)",
            direction: "outgoing",
            replied_by: null,
            channel: "waba",
            is_read: true,
            created_at: p.updated_at || p.created_at || new Date().toISOString(),
          },
          customer_name: p.customer_name || "Pelanggan",
          customer_phone: cleanPhone,
          formatted_phone: formatDisplayPhone(cleanPhone),
          messageCount: 0,
          hasIncoming: false,
          isUnread: false,
          isOrderAgain: false,
        });
      }
    });

    // Also inject selectedCustomerMeta if selected from Universal Search
    if (selectedCustomerMeta) {
      const cleanPhone = (selectedCustomerMeta.customer_phone || selectedCustomerMeta.chat_id.replace(/[^0-9]/g, "")).trim();
      const targetId = selectedCustomerMeta.chat_id || cleanPhone;
      let existing = chatsMap.get(targetId);
      if (!existing && cleanPhone) {
        for (const c of chatsMap.values()) {
          if (c.customer_phone === cleanPhone) {
            existing = c;
            break;
          }
        }
      }
      if (!existing && targetId) {
        chatsMap.set(targetId, {
          chat_id: targetId,
          latestLog: {
            id: `selected-${cleanPhone || targetId}`,
            chat_id: targetId,
            customer_phone: cleanPhone,
            customer_name: selectedCustomerMeta.customer_name || "Pelanggan",
            message: "(Obrolan Dipilih)",
            direction: "outgoing",
            replied_by: null,
            channel: "waba",
            is_read: true,
            created_at: new Date().toISOString(),
          },
          customer_name: selectedCustomerMeta.customer_name || "Pelanggan",
          customer_phone: cleanPhone,
          formatted_phone: selectedCustomerMeta.formatted_phone || formatDisplayPhone(cleanPhone),
          messageCount: 0,
          hasIncoming: false,
          isUnread: false,
          isOrderAgain: false,
        });
      }
    }

    return Array.from(chatsMap.values());
  }, [chatLogs, orderChatLogs, canonicalOrderPhones, pendingMessages, pinnedChats, selectedCustomerMeta]);

  // Response status statistics for WABA (all, unread, order, done, pinned)
  const responseCounts = useMemo(() => {
    let unread = 0;
    let order = 0;
    let done = 0;
    let pinned = 0;
    uniqueChats.forEach(c => {
      const tag = chatTagsMap.get(c.customer_phone);
      if (tag === "order") order++;
      if (tag === "done") done++;
      if (c.isUnread) unread++;
      if (pinnedMap.has(c.customer_phone) || (c.chat_id && pinnedMap.has(c.chat_id))) {
        pinned++;
      }
    });
    return {
      all: uniqueChats.length,
      unread,
      order,
      done,
      pinned,
    };
  }, [uniqueChats, chatTagsMap, pinnedMap]);

  // Filtered and sorted: Pinned chats stick to the top, followed by urgency and latest message
  const filteredChats = useMemo(() => {
    let list = uniqueChats;

    if (responseFilter === "unread") {
      // Tetap munculkan chat yang sedang dibuka (selectedChatId) agar tidak lenyap mendadak saat admin membaca/membalas
      list = list.filter(c => c.isUnread || c.chat_id === selectedChatId);
    } else if (responseFilter === "order") {
      list = list.filter(c => chatTagsMap.get(c.customer_phone) === "order");
    } else if (responseFilter === "done") {
      list = list.filter(c => chatTagsMap.get(c.customer_phone) === "done");
    } else if (responseFilter === "pinned") {
      list = list.filter(c => pinnedMap.has(c.customer_phone) || (c.chat_id && pinnedMap.has(c.chat_id)));
    }

    if (chatSearch.trim()) {
      const q = chatSearch.trim().toLowerCase();
      const qDigits = q.replace(/[^0-9]/g, "");
      list = list.filter(c => {
        const matchName = c.customer_name.toLowerCase().includes(q);
        const matchPhone = (qDigits && c.customer_phone.includes(qDigits)) || c.formatted_phone.toLowerCase().includes(q);
        const matchMsg = c.latestLog.message.toLowerCase().includes(q);
        const pin = pinnedMap.get(c.customer_phone) || (c.chat_id ? pinnedMap.get(c.chat_id) : undefined);
        const matchNote = pin?.note?.toLowerCase().includes(q);
        return matchName || matchPhone || matchMsg || matchNote;
      });
    }

    // Sort: Pinned chats strictly stick to the top
    const today = getTodayStrJakarta();
    return [...list].sort((a, b) => {
      const pinA = pinnedMap.get(a.customer_phone) || (a.chat_id ? pinnedMap.get(a.chat_id) : undefined);
      const pinB = pinnedMap.get(b.customer_phone) || (b.chat_id ? pinnedMap.get(b.chat_id) : undefined);

      const isPinA = !!pinA;
      const isPinB = !!pinB;

      // Pinned chats come before unpinned chats
      if (isPinA && !isPinB) return -1;
      if (!isPinA && isPinB) return 1;

      // When both are pinned, prioritize follow-up urgency:
      if (isPinA && isPinB) {
        const dateA = pinA?.follow_up_date || "";
        const dateB = pinB?.follow_up_date || "";

        if (dateA && dateB) {
          if (dateA === today && dateB !== today) return -1;
          if (dateB === today && dateA !== today) return 1;
          if (dateA < today && dateB > today) return -1;
          if (dateB < today && dateA > today) return 1;
          if (dateA !== dateB) return dateA.localeCompare(dateB);
        } else if (dateA && !dateB) {
          return -1;
        } else if (!dateA && dateB) {
          return 1;
        }

        return new Date(b.latestLog.created_at).getTime() - new Date(a.latestLog.created_at).getTime();
      }

      // Default non-pinned: newest log first
      return new Date(b.latestLog.created_at).getTime() - new Date(a.latestLog.created_at).getTime();
    });
  }, [uniqueChats, responseFilter, selectedChatId, chatSearch, chatTagsMap, pinnedMap]);

  // Tier 2: Dedicated Conversation Query with Pagination & Deep History
  const activeChatInfo = useMemo(() => {
    return uniqueChats.find(c => c.chat_id === selectedChatId) || selectedCustomerMeta;
  }, [uniqueChats, selectedChatId, selectedCustomerMeta]);

  const activeCleanPhone = useMemo(() => {
    if (!selectedChatId) return "";
    return (activeChatInfo?.customer_phone || selectedChatId.replace(/[^0-9]/g, "")).trim();
  }, [activeChatInfo, selectedChatId]);

  const [historyLimit, setHistoryLimit] = useState(300);
  const prevSelectedChatIdRef = useRef<string | null>(null);

  // Reset pagination limit when selecting another chat (default 300 messages on Supabase Pro)
  useEffect(() => {
    if (selectedChatId !== prevSelectedChatIdRef.current) {
      prevSelectedChatIdRef.current = selectedChatId;
      setHistoryLimit(300);
    }
  }, [selectedChatId]);

  // Dedicated query specifically for selected conversation with infinite load-more
  const {
    data: conversationLogs = [],
    refetch: refetchConversation,
    isLoading: loadingConversation,
    isFetching: fetchingConversation,
  } = useQuery<ChatLog[]>({
    queryKey: ["whatsapp-conversation", selectedChatId, activeCleanPhone, historyLimit],
    queryFn: async () => {
      if (!selectedChatId) return [];

      let query = supabase
        .from("whatsapp_chat_logs" as any)
        .select("*")
        .eq("channel", "waba")
        .order("created_at", { ascending: false })
        .limit(historyLimit);

      const targets = new Set<string>();
      if (selectedChatId) targets.add(selectedChatId);
      if (activeCleanPhone) {
        targets.add(activeCleanPhone);
        if (activeCleanPhone.startsWith("62")) {
          targets.add("0" + activeCleanPhone.slice(2));
        } else if (activeCleanPhone.startsWith("0")) {
          targets.add("62" + activeCleanPhone.slice(1));
        }
      }

      const orClauses: string[] = [];
      targets.forEach(t => {
        orClauses.push(`chat_id.eq.${t}`);
        orClauses.push(`customer_phone.eq.${t}`);
      });

      if (orClauses.length > 0) {
        query = query.or(orClauses.join(","));
      }

      if (historyLimit <= 1000) {
        const { data, error } = await query;
        if (error) {
          console.error("Gagal mengambil riwayat percakapan:", error);
          throw error;
        }
        return (data || []) as unknown as ChatLog[];
      } else {
        const BATCH_SIZE = 1000;
        const numBatches = Math.ceil(historyLimit / BATCH_SIZE);
        const promises = [];
        for (let i = 0; i < numBatches; i++) {
          const from = i * BATCH_SIZE;
          const to = Math.min((i + 1) * BATCH_SIZE - 1, historyLimit - 1);
          let bQuery = supabase
            .from("whatsapp_chat_logs" as any)
            .select("*")
            .eq("channel", "waba")
            .order("created_at", { ascending: false })
            .range(from, to);
          if (orClauses.length > 0) {
            bQuery = bQuery.or(orClauses.join(","));
          }
          promises.push(bQuery);
        }
        const results = await Promise.all(promises);
        const seenIds = new Set<string>();
        let allLogs: ChatLog[] = [];
        for (const res of results) {
          if (res.error) {
            console.error("Gagal mengambil riwayat percakapan batch:", res.error);
            throw res.error;
          }
          if (res.data) {
            for (const log of (res.data as unknown as ChatLog[])) {
              if (log.id && !seenIds.has(log.id)) {
                seenIds.add(log.id);
                allLogs.push(log);
              } else if (!log.id) {
                allLogs.push(log);
              }
            }
          }
        }
        return allLogs;
      }
    },
    enabled: !!selectedChatId,
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
  });

  const hasMoreHistory = conversationLogs.length >= historyLimit;

  const handleLoadMoreHistory = () => {
    setHistoryLimit(prev => prev + 300);
  };

  // Tier 3: Universal Customer & Chat Search across Supabase (4,848 customers)
  const isLocalSearchEmpty = Boolean(chatSearch.trim().length >= 2 && filteredChats.length === 0);

  const {
    data: serverSearchResults = [],
    isLoading: isSearchingServer
  } = useQuery<{
    chat_id: string;
    customer_name: string;
    customer_phone: string;
    formatted_phone: string;
    latest_message?: string;
    created_at?: string;
    source: 'chat_logs' | 'orders';
  }[]>({
    queryKey: ["whatsapp-universal-search", chatSearch.trim()],
    queryFn: async () => {
      const q = chatSearch.trim();
      if (!q || q.length < 2) return [];

      const cleanDigits = q.replace(/[^0-9]/g, "");
      const resultsMap = new Map<string, {
        chat_id: string;
        customer_name: string;
        customer_phone: string;
        formatted_phone: string;
        latest_message?: string;
        created_at?: string;
        source: 'chat_logs' | 'orders';
      }>();

      // 1. Search in whatsapp_chat_logs for historical conversations
      try {
        let logQuery = supabase
          .from("whatsapp_chat_logs" as any)
          .select("chat_id, customer_phone, customer_name, message, created_at")
          .eq("channel", "waba")
          .order("created_at", { ascending: false })
          .limit(60);

        if (cleanDigits && cleanDigits.length >= 3) {
          logQuery = logQuery.or(`customer_phone.ilike.%${cleanDigits}%,chat_id.ilike.%${cleanDigits}%,customer_name.ilike.%${q}%`);
        } else {
          logQuery = logQuery.ilike("customer_name", `%${q}%`);
        }

        const { data: logsData } = await logQuery;
        if (logsData) {
          logsData.forEach((item: any) => {
            const phone = (item.customer_phone || item.chat_id?.replace(/[^0-9]/g, "") || "").trim();
            const id = item.chat_id || phone;
            if (id && !resultsMap.has(id)) {
              resultsMap.set(id, {
                chat_id: id,
                customer_name: item.customer_name || "Pelanggan",
                customer_phone: phone,
                formatted_phone: formatDisplayPhone(phone),
                latest_message: item.message,
                created_at: item.created_at,
                source: 'chat_logs',
              });
            }
          });
        }
      } catch (err) {
        console.error("Gagal cari chat logs server:", err);
      }

      // 2. Search in orders table for customer records (4,848 customer pool)
      try {
        let ordersQuery = supabase
          .from("orders" as any)
          .select("customer_name, customer_phone, created_at")
          .order("created_at", { ascending: false })
          .limit(60);

        if (cleanDigits && cleanDigits.length >= 3) {
          ordersQuery = ordersQuery.or(`customer_phone.ilike.%${cleanDigits}%,customer_name.ilike.%${q}%`);
        } else {
          ordersQuery = ordersQuery.ilike("customer_name", `%${q}%`);
        }

        const { data: ordersData } = await ordersQuery;
        if (ordersData) {
          ordersData.forEach((item: any) => {
            if (!item.customer_phone) return;
            const phone = item.customer_phone.replace(/[^0-9]/g, "").trim();
            if (!phone) return;
            if (!resultsMap.has(phone)) {
              resultsMap.set(phone, {
                chat_id: phone,
                customer_name: item.customer_name || "Pelanggan",
                customer_phone: phone,
                formatted_phone: formatDisplayPhone(phone),
                latest_message: "(Pelanggan Database Orders)",
                created_at: item.created_at,
                source: 'orders',
              });
            }
          });
        }
      } catch (err) {
        console.error("Gagal cari orders server:", err);
      }

      return Array.from(resultsMap.values());
    },
    enabled: isLocalSearchEmpty,
    staleTime: 30000,
  });

  // Active chat bubbles with Tier 2 deep history and zero-delay optimistic messages
  const selectedChatMessages = useMemo(() => {
    if (!selectedChatId) return [];

    let serverMessages: ChatLog[] = [];
    if (conversationLogs.length > 0) {
      serverMessages = [...conversationLogs].reverse();
    } else if (loadingConversation) {
      // Instant cache fallback from Tier 1 chatLogs while Tier 2 loads
      serverMessages = chatLogs
        .filter(log => (log.chat_id === selectedChatId || (activeCleanPhone && log.customer_phone === activeCleanPhone)) && log.channel === "waba")
        .reverse();
    }

    // Current pending messages for selected chat
    const currentPending = pendingMessages.filter(p => {
      const matchChat = p.chat_id === selectedChatId || (activeCleanPhone && p.customer_phone === activeCleanPhone);
      if (!matchChat) return false;

      // Filter out if server already contains this exact message within 30 seconds
      const pTime = new Date(p.created_at).getTime();
      const alreadyInServer = serverMessages.some(s => 
        s.direction === "outgoing" && 
        s.message === p.message && 
        Math.abs(new Date(s.created_at).getTime() - pTime) < 30000
      );
      return !alreadyInServer;
    });

    return [...serverMessages, ...currentPending];
  }, [conversationLogs, loadingConversation, chatLogs, selectedChatId, activeCleanPhone, pendingMessages]);

  // Intelligent scroll: scroll to bottom on chat switch or new sent/received messages, but preserve scroll on loading older history
  const prevLimitRef = useRef(historyLimit);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedChatId]);

  useEffect(() => {
    if (historyLimit === prevLimitRef.current) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevLimitRef.current = historyLimit;
  }, [selectedChatMessages, historyLimit]);

  // Auto-mark active chat as read if new incoming messages arrive while chat is open
  useEffect(() => {
    if (!selectedChatId) return;
    const active = uniqueChats.find(c => c.chat_id === selectedChatId);
    if (active && active.isUnread) {
      markChatAsRead(active.chat_id, active.customer_phone);
    }
  }, [selectedChatId, uniqueChats, markChatAsRead]);

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

  // Send Manual Reply via Unified Dispatcher (/api/whatsapp/send) with Zero-Delay Optimistic UI
  const handleSendManualReply = async (retryMsg?: ChatLog) => {
    const text = (retryMsg ? retryMsg.message : manualReplyText).trim();
    const currentAttachment = retryMsg ? null : mediaAttachment;

    if ((!text && !currentAttachment && !retryMsg?.media_url) || !selectedChatId) return;

    const currentChat = activeChatInfo;
    const targetChannel = "waba";
    const customerPhone = currentChat?.customer_phone || selectedChatId.split("@")[0].replace("waba:", "").replace(/[^0-9]/g, "");
    const customerName = currentChat?.customer_name || "Pelanggan WA";

    const tempId = retryMsg ? retryMsg.id : `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const effectiveMediaType = currentAttachment?.mediaType || (retryMsg?.media_url && isVideoMedia(retryMsg.media_url) ? "video" : "image");
    const optimisticMediaUrl = currentAttachment?.previewUrl || retryMsg?.media_url;

    const fallbackMessage = optimisticMediaUrl 
      ? (effectiveMediaType === "video" ? "[Video Dikirim]" : "[Foto Dikirim]")
      : "";

    const pendingLog: ChatLog = {
      id: tempId,
      chat_id: selectedChatId,
      customer_phone: customerPhone,
      customer_name: customerName,
      message: text || fallbackMessage,
      media_url: optimisticMediaUrl,
      direction: "outgoing",
      replied_by: "manual",
      channel: targetChannel,
      is_read: true,
      created_at: retryMsg ? retryMsg.created_at : new Date().toISOString(),
      status: "sending"
    };

    if (!retryMsg) {
      // 1. INSTANT (0ms): Clear input and append optimistic message immediately
      setManualReplyText("");
      setMediaAttachment(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      if (manualInputRef.current) {
        manualInputRef.current.style.height = "auto";
      }
      setPendingMessages(prev => [...prev, pendingLog]);
    } else {
      // Retrying: reset status back to sending
      setPendingMessages(prev => prev.map(p => p.id === tempId ? { ...p, status: "sending", errorMsg: undefined } : p));
    }

    // Scroll to bottom immediately
    setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 10);

    // 2. BACKGROUND: Dispatch network request to Meta WABA
    setSendingReply(true);
    try {
      let finalMediaUrl: string | undefined = retryMsg?.media_url || undefined;
      if (currentAttachment) {
        setUploadingMedia(true);
        finalMediaUrl = await uploadMediaToStorage(currentAttachment.file);
      }

      const sendRes = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: customerPhone,
          message: text,
          mediaUrl: finalMediaUrl,
          mediaType: effectiveMediaType,
          channel: "waba",
          customerName: customerName,
          replied_by: "manual"
        })
      });

      const sendData = await sendRes.json().catch(() => ({}));
      if (!sendRes.ok || !sendData.success) {
        throw new Error(sendData.error || "Gagal mengirim via WABA Meta");
      }

      // Success: mark as sent
      setPendingMessages(prev => prev.map(p => p.id === tempId ? { ...p, status: "sent", media_url: finalMediaUrl || p.media_url } : p));

      // Auto-cleanup sent temp message after 4 seconds (once server logs have synced)
      setTimeout(() => {
        setPendingMessages(prev => prev.filter(p => p.id !== tempId));
      }, 4000);

      if (selectedChatId) {
        markChatAsRead(selectedChatId, customerPhone);
      }
      refetchLogs();
      qc.invalidateQueries({ queryKey: ["whatsapp-order-chat-logs"] });
      refetchConversation();
    } catch (err: any) {
      // Failed: mark as failed with error details for retry
      setPendingMessages(prev => prev.map(p => 
        p.id === tempId ? { ...p, status: "failed", errorMsg: err.message || "Gagal mengirim balasan." } : p
      ));
      toast.error(err.message || "Gagal mengirim balasan.");
    } finally {
      setSendingReply(false);
      setUploadingMedia(false);
    }
  };

  const [markingHandled, setMarkingHandled] = useState(false);

  const handleMarkAsHandled = async (chat: any) => {
    if (!chat) return;
    setMarkingHandled(true);
    try {
      const cleanPhone = (chat.customer_phone || chat.chat_id.replace(/[^0-9]/g, "")).trim();
      await markChatAsRead(chat.chat_id, cleanPhone);

      const { error } = await supabase.from("whatsapp_chat_logs").insert({
        chat_id: chat.chat_id,
        customer_phone: cleanPhone,
        customer_name: chat.customer_name,
        message: "✅ [Obrolan Ditandai Selesai oleh CS]",
        direction: "outgoing",
        channel: chat.latestLog?.channel || "waba",
        replied_by: "manual",
        is_read: true,
      });
      if (error) throw error;
      toast.success(`Obrolan dengan ${chat.customer_name || cleanPhone} berhasil ditandai selesai!`);
      refetchLogs();
      qc.invalidateQueries({ queryKey: ["whatsapp-order-chat-logs"] });
      refetchConversation();
    } catch (err: any) {
      toast.error("Gagal menandai obrolan: " + (err.message || "Error"));
    } finally {
      setMarkingHandled(false);
    }
  };

  return (
    <div className={`space-y-4 pb-4 transition-all duration-150 ${isWideMode ? "w-full" : "max-w-7xl mx-auto"}`}>
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
        <div className="flex items-center gap-2 sm:gap-3">
          <Button
            onClick={() => {
              const next = !isWideMode;
              setIsWideMode(next);
              localStorage.setItem("waba_wide_mode", String(next));
              toast.success(next ? "Mode Layar Lebar aktif!" : "Mode Standar aktif!");
            }}
            variant="outline"
            size="sm"
            className="text-xs h-9 gap-1.5 border-slate-200 cursor-pointer shadow-2xs"
            title={isWideMode ? "Beralih ke tampilan standar (terpusat)" : "Perbesar ke tampilan layar penuh"}
          >
            {isWideMode ? (
              <>
                <Minimize2 className="h-3.5 w-3.5 text-slate-600" />
                <span className="hidden sm:inline">Tampilan Standar</span>
              </>
            ) : (
              <>
                <Maximize2 className="h-3.5 w-3.5 text-amber-600" />
                <span className="hidden sm:inline">Layar Lebar</span>
              </>
            )}
          </Button>
          <Button 
            onClick={() => {
              refetchLogs();
              refetchSettings();
              toast.success("Data WhatsApp Monitor diperbarui!");
            }} 
            variant="outline" 
            size="sm"
            className="text-xs h-9 cursor-pointer shadow-2xs"
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
        <div className="flex flex-col lg:flex-row gap-4 h-auto lg:h-[calc(100vh-14rem)] min-h-[560px]">
          {/* Chat List (Left Panel) */}
          <Card className="w-full lg:w-[350px] xl:w-[390px] shrink-0 flex flex-col h-[500px] lg:h-full overflow-hidden border-slate-200/90 shadow-xs">
            <CardHeader className="py-3 px-4 border-b space-y-2.5 shrink-0 bg-slate-50/50">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base whitespace-nowrap">
                      Daftar Obrolan WABA
                    </CardTitle>
                    <Badge variant="outline" className="text-[11px] bg-emerald-50 text-emerald-800 border-emerald-300 font-semibold shrink-0">
                      {filteredChats.length} Kontak
                    </Badge>
                  </div>
                  <CardDescription className="text-xs truncate">
                    Pantau pesan masuk & respon resmi Meta WABA
                  </CardDescription>
                </div>
                <Button 
                  size="icon" 
                  variant="ghost" 
                  className="h-8 w-8 text-slate-500 hover:text-amber-600 shrink-0"
                  onClick={() => {
                    refetchLogs();
                    toast.success("Log chat WABA disegarkan!");
                  }}
                  title="Segarkan Chat"
                >
                  <RefreshCw className={`h-4 w-4 ${loadingLogs ? "animate-spin text-amber-500" : ""}`} />
                </Button>
              </div>

              {/* WhatsApp Web-Style Horizontal Scrollable Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 select-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                <button
                  type="button"
                  onClick={() => setResponseFilter("all")}
                  className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                    responseFilter === "all"
                      ? "bg-slate-900 text-white shadow-xs"
                      : "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/70"
                  }`}
                  title="Tampilkan semua obrolan"
                >
                  <span>Semua</span>
                  <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                    responseFilter === "all" ? "bg-white/20 text-white font-bold" : "bg-slate-200 text-slate-600"
                  }`}>
                    {responseCounts.all}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setResponseFilter("unread")}
                  className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                    responseFilter === "unread"
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/70"
                  }`}
                  title="Obrolan belum dibaca"
                >
                  {responseCounts.unread > 0 && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  )}
                  <span>Belum</span>
                  <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                    responseFilter === "unread" ? "bg-white/20 text-white font-bold" : "bg-emerald-200/70 text-emerald-800 font-bold"
                  }`}>
                    {responseCounts.unread}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setResponseFilter("order")}
                  className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                    responseFilter === "order"
                      ? "bg-amber-500 text-white shadow-xs font-bold"
                      : "bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200/70"
                  }`}
                  title="Obrolan dengan pesanan aktif (perlu dikerjakan)"
                >
                  <span>🛒 Order</span>
                  <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                    responseFilter === "order" ? "bg-white/20 text-white font-bold" : "bg-amber-200/70 text-amber-900 font-bold"
                  }`}>
                    {responseCounts.order}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setResponseFilter("done")}
                  className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                    responseFilter === "done"
                      ? "bg-emerald-700 text-white shadow-xs font-bold"
                      : "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/70"
                  }`}
                  title="Pesanan yang sudah selesai dikerjakan"
                >
                  <span>✅ Selesai</span>
                  <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                    responseFilter === "done" ? "bg-white/20 text-white font-bold" : "bg-slate-200 text-slate-700 font-bold"
                  }`}>
                    {responseCounts.done}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setResponseFilter("pinned")}
                  className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                    responseFilter === "pinned"
                      ? "bg-sky-600 text-white shadow-xs font-bold"
                      : "bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200/70"
                  }`}
                  title="Obrolan yang di-pin"
                >
                  <span>📌 Pin</span>
                  <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                    responseFilter === "pinned" ? "bg-white/20 text-white font-bold" : "bg-sky-200/70 text-sky-900 font-bold"
                  }`}>
                    {responseCounts.pinned}
                  </span>
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
                chatSearch.trim().length >= 2 ? (
                  isSearchingServer ? (
                    <div className="flex flex-col items-center justify-center h-48 text-muted-foreground p-4 text-center space-y-2">
                      <RefreshCw className="h-6 w-6 animate-spin text-amber-500" />
                      <p className="text-xs font-semibold text-slate-700">Mencari di seluruh database pelanggan...</p>
                      <p className="text-[11px] text-slate-400">Menelusuri database kontak di Supabase Pro</p>
                    </div>
                  ) : serverSearchResults.length > 0 ? (
                    <div className="divide-y divide-slate-100">
                      <div className="bg-amber-50/80 border-b border-amber-200/70 px-3.5 py-2 text-[11px] font-semibold text-amber-900 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <Search className="h-3.5 w-3.5 text-amber-600" />
                          <span>Hasil Pencarian Database ({serverSearchResults.length})</span>
                        </span>
                        <span className="text-[10px] text-amber-700 bg-amber-100/80 px-1.5 py-0.5 rounded font-mono font-bold">
                          Database Pelanggan
                        </span>
                      </div>
                      {serverSearchResults.map((item) => {
                        const isSelected = selectedChatId === item.chat_id;
                        return (
                          <div
                            key={item.chat_id}
                            onClick={() => handleSelectChat({
                              chat_id: item.chat_id,
                              customer_phone: item.customer_phone,
                              customer_name: item.customer_name,
                              formatted_phone: item.formatted_phone,
                            })}
                            className={`w-full p-3.5 text-left flex items-start justify-between gap-2.5 hover:bg-slate-50/80 transition-colors cursor-pointer group ${
                              isSelected ? "bg-amber-50/80 border-r-4 border-r-amber-500 shadow-xs" : ""
                            }`}
                          >
                            <div className="space-y-1 min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-amber-600 font-bold shrink-0">
                                  {item.source === 'orders' ? '🛒' : '💬'}
                                </span>
                                <p className="font-semibold text-sm truncate text-slate-900 group-hover:text-amber-700 transition-colors">
                                  {item.customer_name}
                                </p>
                                <Badge variant="outline" className="text-[9px] px-1 py-0 bg-slate-50 border-slate-200 text-slate-600">
                                  {item.source === 'orders' ? 'Database Order' : 'Riwayat Chat'}
                                </Badge>
                              </div>
                              <p className="text-[11px] font-mono font-medium text-emerald-700">
                                {item.formatted_phone || `+${item.customer_phone}`}
                              </p>
                              <p className="text-xs truncate text-slate-500">
                                {item.latest_message || "(Klik untuk membuka obrolan)"}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-48 text-muted-foreground p-4 text-center">
                      <Search className="h-8 w-8 mb-2 opacity-40 text-slate-400" />
                      <p className="text-sm font-medium text-slate-700">
                        Tidak ditemukan kontak yang cocok
                      </p>
                      <p className="text-xs text-slate-400 mt-1 max-w-xs">
                        Tidak ada kecocokan nama/nomor "{chatSearch}" di daftar chat aktif maupun riwayat pelanggan di Supabase.
                      </p>
                      {(() => {
                        const cleanDigits = chatSearch.replace(/[^0-9]/g, "");
                        if (cleanDigits.length >= 8) {
                          return (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleSelectChat({
                                chat_id: cleanDigits,
                                customer_phone: cleanDigits,
                                customer_name: "Pelanggan Baru",
                                formatted_phone: formatDisplayPhone(cleanDigits),
                              })}
                              className="mt-3 text-xs text-emerald-700 border-emerald-300 bg-emerald-50 hover:bg-emerald-100 cursor-pointer shadow-2xs"
                            >
                              <Plus className="h-3.5 w-3.5 mr-1" /> Mulai Chat Baru ke +{cleanDigits}
                            </Button>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  )
                ) : (
                  <div className="flex flex-col items-center justify-center h-48 text-muted-foreground p-4 text-center">
                    <Phone className="h-8 w-8 mb-2 opacity-50 text-amber-500" />
                    <p className="text-sm font-medium">
                      {chatSearch || responseFilter !== "all" ? "Tidak ada kontak yang cocok di filter ini" : "Belum ada riwayat chat WABA."}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {chatSearch || responseFilter !== "all" ? "Coba ketik minimal 2 karakter untuk mencari di seluruh database pelanggan." : "Pesan masuk/keluar WABA akan muncul di sini secara otomatis."}
                    </p>
                  </div>
                )
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredChats.map((chat) => {
                    const isSelected = selectedChatId === chat.chat_id;
                    const cleanDate = formatSidebarChatTime(chat.latestLog.created_at);
                    const chatDateTooltip = formatMessageTooltip(chat.latestLog.created_at);
                    const isGoodName = chat.customer_name && chat.customer_name !== "Pelanggan" && chat.customer_name !== "Meta Status";
                    const isError = chat.latestLog.replied_by === "meta_error" || chat.latestLog.message.startsWith("❌");
                    const isLastIncoming = chat.latestLog.direction === "incoming";
                    const currentChatTag = chatTagsMap.get(chat.customer_phone);
                    const isOrdered = currentChatTag === "order";
                    const isDone = currentChatTag === "done";
                    const pinData = pinnedMap.get(chat.customer_phone) || (chat.chat_id ? pinnedMap.get(chat.chat_id) : undefined);
                    const isPinned = !!pinData;

                    return (
                      <div
                        key={chat.chat_id}
                        onClick={() => handleSelectChat(chat)}
                        className={`w-full p-3.5 text-left flex items-start justify-between gap-2.5 hover:bg-slate-50/80 transition-colors cursor-pointer group ${
                          isSelected ? "bg-amber-50/80 border-r-4 border-r-amber-500 shadow-xs" : ""
                        }`}
                      >
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            {chat.isUnread && (
                              <span
                                className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0 ring-2 ring-emerald-200"
                                title="Pesan baru belum dibaca! Klik untuk membuka dan menandai dibaca."
                              />
                            )}
                            {isPinned && (
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenPinDialog(chat);
                                }}
                                className="text-xs shrink-0 cursor-pointer hover:scale-125 transition-transform"
                                title="Chat disematkan (PIN) - Klik untuk kelola reminder follow-up"
                              >
                                📌
                              </span>
                            )}
                            <p className="font-semibold text-sm truncate text-slate-900 group-hover:text-amber-700 transition-colors">
                              {isGoodName ? chat.customer_name : chat.formatted_phone || `+${chat.customer_phone}`}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-[11px] font-mono font-medium text-emerald-700">
                              {chat.formatted_phone || `+${chat.customer_phone}`}
                            </p>
                            {isPinned && (
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenPinDialog(chat);
                                }}
                                className="cursor-pointer"
                                title="Klik untuk ubah jadwal follow-up atau catatan"
                              >
                                {(() => {
                                  const status = getFollowUpStatus(pinData?.follow_up_date);
                                  if (status === "today") {
                                    return (
                                      <span className="bg-rose-500 text-white font-bold px-1.5 py-0.2 rounded text-[10px] flex items-center gap-0.5 animate-pulse shadow-2xs">
                                        🔥 HARI INI {pinData?.note ? `("${pinData.note}")` : ""}
                                      </span>
                                    );
                                  }
                                  if (status === "overdue") {
                                    return (
                                      <span className="bg-amber-100 border border-amber-300 text-amber-900 font-semibold px-1.5 py-0.2 rounded text-[10px] flex items-center gap-0.5">
                                        ⚠️ Lewat: {formatFollowUpDate(pinData?.follow_up_date!)} {pinData?.note ? `("${pinData.note}")` : ""}
                                      </span>
                                    );
                                  }
                                  if (status === "upcoming") {
                                    return (
                                      <span className="bg-sky-50 border border-sky-200 text-sky-800 font-medium px-1.5 py-0.2 rounded text-[10px] flex items-center gap-0.5">
                                        📌 Janji: {formatFollowUpDate(pinData?.follow_up_date!)} {pinData?.note ? `("${pinData.note}")` : ""}
                                      </span>
                                    );
                                  }
                                  return (
                                    <span className="bg-amber-50 border border-amber-200 text-amber-800 font-medium px-1.5 py-0.2 rounded text-[10px] flex items-center gap-0.5">
                                      📌 Tersemat {pinData?.note ? `("${pinData.note}")` : ""}
                                    </span>
                                  );
                                })()}
                              </div>
                            )}
                          </div>

                          <p className={`text-xs truncate flex items-center gap-1.5 ${chat.isUnread ? "text-emerald-700 font-semibold" : isLastIncoming ? "text-slate-700 font-medium" : isError ? "text-rose-600 font-medium" : "text-slate-500"}`}>
                            {!isLastIncoming && !isError && (
                              chat.latestLog.delivery_status === "read" ? (
                                <CheckCheck className="w-3.5 h-3.5 text-cyan-500 shrink-0 stroke-[2.8]" title="Pesan sudah dibaca" />
                              ) : chat.latestLog.delivery_status === "delivered" ? (
                                <CheckCheck className="w-3.5 h-3.5 text-slate-400 shrink-0 stroke-[2]" title="Pesan terkirim ke HP" />
                              ) : (
                                <Check className="w-3.5 h-3.5 text-slate-400 shrink-0 stroke-[2]" title="Pesan terkirim" />
                              )
                            )}
                            <span className="truncate">
                              {chat.latestLog.media_id || chat.latestLog.message.includes('[Pelanggan Mengirim Gambar]')
                                ? `📷 Foto ${chat.latestLog.message !== '[Pelanggan Mengirim Gambar]' ? chat.latestLog.message : ''}`.trim()
                                : isLastIncoming
                                ? `💬 ${chat.latestLog.message}`
                                : chat.latestLog.message}
                            </span>
                          </p>
                        </div>

                        <div className="flex flex-col items-end gap-1.5 shrink-0 pt-0.5">
                          {/* Top Row: Time & Minimalist Chevron Action */}
                          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <span className="text-[10px] text-muted-foreground font-medium" title={chatDateTooltip}>{cleanDate}</span>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  className="h-6 w-6 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-900 hover:bg-slate-200/90 hover:scale-110 active:scale-95 transition-all shadow-2xs hover:shadow-xs border border-transparent hover:border-slate-300 cursor-pointer"
                                  title="Menu Label & Follow-up Chat"
                                >
                                  <ChevronDown className="h-3.5 w-3.5 stroke-[2.5]" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48 p-1 shadow-lg bg-white border border-slate-200 z-50">
                                <DropdownMenuItem
                                  onClick={() => handleOpenPinDialog(chat)}
                                  className="text-xs text-amber-800 focus:text-amber-900 focus:bg-amber-50 cursor-pointer font-semibold gap-2 py-2"
                                >
                                  <Pin className="h-4 w-4 text-amber-600" />
                                  <span>{isPinned ? "Ubah Pin / Follow-up" : "📌 Pin & Follow-up"}</span>
                                </DropdownMenuItem>
                                {isPinned && (
                                  <DropdownMenuItem
                                    onClick={() => handleUnpin(chat.customer_phone, chat.chat_id)}
                                    className="text-xs text-slate-600 focus:text-slate-900 focus:bg-slate-100 cursor-pointer font-medium gap-2 py-1.5"
                                  >
                                    <PinOff className="h-4 w-4 text-slate-500" />
                                    <span>Lepas Pin Chat</span>
                                  </DropdownMenuItem>
                                )}

                                <div className="h-px bg-slate-100 my-1" />

                                {isOrdered ? (
                                  <>
                                    <DropdownMenuItem
                                      onClick={() => handleSetChatTag(chat.customer_phone, "done")}
                                      className="text-xs text-emerald-700 focus:text-emerald-800 focus:bg-emerald-50 cursor-pointer font-bold gap-2 py-2"
                                    >
                                      <CheckCircle className="h-4 w-4 text-emerald-600" />
                                      <span>✅ Tandai Selesai</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => handleSetChatTag(chat.customer_phone, null)}
                                      className="text-xs text-rose-600 focus:text-rose-700 focus:bg-rose-50 cursor-pointer font-medium gap-2 py-1.5"
                                    >
                                      <XCircle className="h-4 w-4 text-rose-500" />
                                      <span>Lepas Label Order</span>
                                    </DropdownMenuItem>
                                  </>
                                ) : isDone ? (
                                  <>
                                    <DropdownMenuItem
                                      onClick={() => handleSetChatTag(chat.customer_phone, "order")}
                                      className="text-xs text-amber-700 focus:text-amber-800 focus:bg-amber-50 cursor-pointer font-semibold gap-2 py-2"
                                    >
                                      <ShoppingCart className="h-4 w-4 text-amber-500" />
                                      <span>🛒 Kembalikan ke Order</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => handleSetChatTag(chat.customer_phone, null)}
                                      className="text-xs text-rose-600 focus:text-rose-700 focus:bg-rose-50 cursor-pointer font-medium gap-2 py-1.5"
                                    >
                                      <XCircle className="h-4 w-4 text-rose-500" />
                                      <span>Hapus Tanda Selesai</span>
                                    </DropdownMenuItem>
                                  </>
                                ) : (
                                  <>
                                    <DropdownMenuItem
                                      onClick={() => handleSetChatTag(chat.customer_phone, "order")}
                                      className="text-xs text-amber-700 focus:text-amber-800 focus:bg-amber-50 cursor-pointer font-semibold gap-2 py-2"
                                    >
                                      <ShoppingCart className="h-4 w-4 text-amber-500" />
                                      <span>🛒 Beri Label Order</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => handleSetChatTag(chat.customer_phone, "done")}
                                      className="text-xs text-emerald-700 focus:text-emerald-800 focus:bg-emerald-50 cursor-pointer font-semibold gap-2 py-2"
                                    >
                                      <CheckCircle className="h-4 w-4 text-emerald-600" />
                                      <span>✅ Beri Tanda Selesai</span>
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>

                          {/* Bottom Row: Minimalist Order / Selesai Badge */}
                          {isOrdered && (
                            <div className="flex items-center gap-1 justify-end">
                              <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-[9px] px-2 py-0.5 font-bold shadow-2xs flex items-center gap-1">
                                <ShoppingCart className="h-2.5 w-2.5" />
                                <span>Order</span>
                              </Badge>
                            </div>
                          )}
                          {isDone && (
                            <div className="flex items-center gap-1 justify-end">
                              <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] px-2 py-0.5 font-bold shadow-2xs flex items-center gap-1">
                                <CheckCircle className="h-2.5 w-2.5" />
                                <span>Selesai</span>
                              </Badge>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Load More Older Chats Button at bottom of contact list */}
                  {!chatSearch && (
                    <div className="p-3 bg-slate-50/80 border-t border-slate-200/80 flex flex-col items-center gap-1.5 select-none">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={fetchingLogs}
                        onClick={() => setContactListLimit(prev => prev + 1500)}
                        className="w-full text-xs text-slate-700 bg-white hover:bg-amber-50 hover:text-amber-800 hover:border-amber-300 border-slate-200 shadow-2xs gap-1.5 cursor-pointer font-semibold py-2"
                        title="Tarik percakapan kemarin dan hari sebelumnya dari database Supabase Pro"
                      >
                        {fetchingLogs ? (
                          <>
                            <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-600" />
                            <span>Memuat riwayat chat...</span>
                          </>
                        ) : (
                          <>
                            <Clock className="h-3.5 w-3.5 text-amber-600" />
                            <span>Muat Obrolan Sebelumnya (+1.500 Log)</span>
                          </>
                        )}
                      </Button>
                      <span className="text-[10px] text-slate-400">
                        Menampilkan {filteredChats.length} kontak ({chatLogs.length.toLocaleString("id-ID")} riwayat termuat)
                      </span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Chat Bubbles (Right Panel) */}
          <Card className="flex-1 min-w-0 flex flex-col h-[600px] lg:h-full overflow-hidden border-slate-200/90 shadow-xs">
            {selectedChatId ? (
              <>
                {(() => {
                  const activeChat = uniqueChats.find(c => c.chat_id === selectedChatId) || selectedCustomerMeta;
                  const isGoodName = activeChat?.customer_name && activeChat.customer_name !== "Pelanggan" && activeChat.customer_name !== "Meta Status";
                  const displayName = isGoodName ? activeChat.customer_name : "Pelanggan";
                  const displayPhone = activeChat?.formatted_phone || formatDisplayPhone(selectedChatId.replace(/[^0-9]/g, ""));
                  const currentChatTag = activeChat ? chatTagsMap.get(activeChat.customer_phone) : null;
                  const isCurrentOrdered = currentChatTag === "order";
                  const isCurrentDone = currentChatTag === "done";
                  const currentPin = activeChat ? (pinnedMap.get(activeChat.customer_phone) || (activeChat.chat_id ? pinnedMap.get(activeChat.chat_id) : undefined)) : undefined;

                  return (
                    <>
                      <CardHeader className="py-2.5 px-4 border-b flex flex-row items-center justify-between shrink-0 bg-slate-50/50 gap-3">
                        <div className="min-w-0">
                          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-800 truncate">{displayName}</span>
                            <TooltipProvider delayDuration={150}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyPhone(activeChat?.customer_phone || selectedChatId)}
                                    className="group/phone inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100/90 active:scale-95 px-2 py-0.5 rounded border border-emerald-200 hover:border-emerald-300 transition-all cursor-pointer shadow-2xs whitespace-nowrap shrink-0"
                                    title="Klik untuk salin nomor murni tanpa strip"
                                  >
                                    <span className="whitespace-nowrap">{displayPhone}</span>
                                    {copiedPhone ? (
                                      <Check className="h-3 w-3 text-emerald-600 animate-in zoom-in shrink-0" />
                                    ) : (
                                      <Copy className="h-3 w-3 text-emerald-600/70 opacity-0 group-hover/phone:opacity-100 transition-opacity shrink-0" />
                                    )}
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="bg-slate-900 text-white border border-slate-700 text-xs py-1.5 px-3 shadow-xl flex items-center gap-1.5 z-50 rounded-lg">
                                  {copiedPhone ? (
                                    <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                                      <Check className="h-3.5 w-3.5" /> Tersalin: {getCleanCopyPhone(activeChat?.customer_phone || selectedChatId)}!
                                    </span>
                                  ) : (
                                    <span className="flex items-center gap-1.5">
                                      <Copy className="h-3.5 w-3.5 text-amber-400" /> Salin nomor: <strong className="font-mono text-amber-300">{getCleanCopyPhone(activeChat?.customer_phone || selectedChatId)}</strong>
                                    </span>
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>

                            {isCurrentOrdered && (
                              <Badge className="bg-amber-500 text-white text-[10px] flex items-center gap-1 whitespace-nowrap shrink-0">
                                <ShoppingCart className="h-3 w-3" />
                                <span>Order</span>
                              </Badge>
                            )}
                            {isCurrentDone && (
                              <Badge className="bg-emerald-600 text-white text-[10px] flex items-center gap-1 whitespace-nowrap shrink-0">
                                <CheckCircle className="h-3 w-3" />
                                <span>Selesai</span>
                              </Badge>
                            )}
                          </CardTitle>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                            <Badge className="bg-emerald-600 text-white text-[9px] px-1.5 py-0 font-medium whitespace-nowrap shrink-0">
                              WABA Resmi Meta
                            </Badge>
                            <span className="truncate">Jalur: Meta Cloud API (+62 856-4540-6949)</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Tombol Tarik Data Konsumen Lincah */}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const targetPhone = activeChat?.customer_phone || selectedChatId;
                              if (targetPhone) handleOpenLincahDialog(targetPhone);
                            }}
                            className="h-7 px-2.5 text-[11px] gap-1.5 font-semibold text-blue-700 bg-blue-50/90 hover:bg-blue-100 hover:text-blue-800 border-blue-200 hover:border-blue-300 shadow-2xs transition-all cursor-pointer whitespace-nowrap shrink-0"
                            title="Tarik data alamat & riwayat pesanan dari Agregator Lincah"
                          >
                            <Package className="h-3.5 w-3.5 text-blue-600" />
                            <span>Data Lincah</span>
                          </Button>

                          {/* Pin / Follow-up Button in Header */}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => activeChat && handleOpenPinDialog(activeChat)}
                            className={`h-7 px-2.5 text-[11px] gap-1.5 font-semibold shadow-2xs transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                              currentPin
                                ? "bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-300"
                                : "text-slate-600 hover:text-amber-800 hover:bg-amber-50/80 border-slate-200"
                            }`}
                            title={currentPin ? "Ubah rencana follow-up" : "Sematkan chat & jadwalkan follow-up"}
                          >
                            <Pin className={`h-3.5 w-3.5 ${currentPin ? "text-amber-600 fill-amber-500" : "text-slate-400"}`} />
                            <span>{currentPin ? "📌 Follow-up" : "Pin Follow-up"}</span>
                          </Button>

                          {/* Order / Selesai Tag Action Buttons in Header */}
                          {isCurrentOrdered ? (
                            <div className="flex items-center gap-1 shrink-0">
                              {/* Direct One-Click Button to complete order */}
                              <Button
                                size="sm"
                                variant="default"
                                disabled={updatingTagPhone === activeChat?.customer_phone}
                                onClick={() => activeChat && handleSetChatTag(activeChat.customer_phone, "done")}
                                className="h-7 px-2 text-[11px] gap-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-2xs transition-all active:scale-95 cursor-pointer whitespace-nowrap shrink-0"
                                title="Klik bila pesanan konsumen ini sudah selesai dikerjakan / dikirim"
                              >
                                <CheckCircle className="h-3.5 w-3.5" />
                                <span>Selesai</span>
                              </Button>

                              {/* Order Dropdown for options */}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 text-[11px] gap-1 font-semibold bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100 shadow-2xs cursor-pointer whitespace-nowrap shrink-0"
                                    title="Status: Order (Klik untuk opsi)"
                                  >
                                    <ShoppingCart className="h-3.5 w-3.5 text-amber-600" />
                                    <span>Order</span>
                                    <ChevronDown className="h-3 w-3 opacity-60" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48 p-1 shadow-lg bg-white border border-slate-200 z-50">
                                  <DropdownMenuItem
                                    onClick={() => activeChat && handleSetChatTag(activeChat.customer_phone, "done")}
                                    className="text-xs text-emerald-700 font-bold gap-2 cursor-pointer py-1.5"
                                  >
                                    <CheckCircle className="h-4 w-4 text-emerald-600" />
                                    <span>✅ Tandai Selesai</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => activeChat && handleSetChatTag(activeChat.customer_phone, null)}
                                    className="text-xs text-rose-600 font-medium gap-2 cursor-pointer py-1.5"
                                  >
                                    <XCircle className="h-4 w-4 text-rose-500" />
                                    <span>Lepas Label Order</span>
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          ) : isCurrentDone ? (
                            /* Selesai Dropdown */
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2.5 text-[11px] gap-1.5 font-bold bg-emerald-50 text-emerald-900 border-emerald-400 hover:bg-emerald-100 shadow-2xs cursor-pointer whitespace-nowrap shrink-0"
                                  title="Pesanan sudah selesai dikerjakan. Klik untuk opsi."
                                >
                                  <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                                  <span>✅ Order Selesai</span>
                                  <ChevronDown className="h-3 w-3 opacity-60" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-52 p-1 shadow-lg bg-white border border-slate-200 z-50">
                                <DropdownMenuItem
                                  onClick={() => activeChat && handleSetChatTag(activeChat.customer_phone, "order")}
                                  className="text-xs text-amber-800 font-semibold gap-2 cursor-pointer py-1.5"
                                >
                                  <ShoppingCart className="h-4 w-4 text-amber-600" />
                                  <span>🛒 Kembalikan ke Order</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => activeChat && handleSetChatTag(activeChat.customer_phone, null)}
                                  className="text-xs text-rose-600 font-medium gap-2 cursor-pointer py-1.5"
                                >
                                  <XCircle className="h-4 w-4 text-rose-500" />
                                  <span>Hapus Tanda Selesai</span>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : (
                            /* Default: No Tag yet -> Tandai Order with dropdown */
                            <DropdownMenu>
                              <div className="inline-flex rounded-md shadow-2xs shrink-0">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={updatingTagPhone === activeChat?.customer_phone}
                                  onClick={() => activeChat && handleSetChatTag(activeChat.customer_phone, "order")}
                                  className="h-7 px-2.5 text-[11px] gap-1.5 font-semibold text-slate-700 hover:text-amber-800 hover:bg-amber-50/80 border-slate-200 rounded-r-none cursor-pointer whitespace-nowrap"
                                  title="Tandai kontak ini sedang order"
                                >
                                  <ShoppingCart className="h-3.5 w-3.5 text-slate-400" />
                                  <span>Tandai Order</span>
                                </Button>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-1.5 text-[11px] text-slate-500 hover:text-slate-800 border-l-0 border-slate-200 rounded-l-none cursor-pointer whitespace-nowrap"
                                    title="Opsi label lainnya"
                                  >
                                    <ChevronDown className="h-3 w-3" />
                                  </Button>
                                </DropdownMenuTrigger>
                              </div>
                              <DropdownMenuContent align="end" className="w-48 p-1 shadow-lg bg-white border border-slate-200 z-50">
                                <DropdownMenuItem
                                  onClick={() => activeChat && handleSetChatTag(activeChat.customer_phone, "order")}
                                  className="text-xs text-amber-800 font-semibold gap-2 cursor-pointer py-1.5"
                                >
                                  <ShoppingCart className="h-4 w-4 text-amber-600" />
                                  <span>🛒 Beri Label Order</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => activeChat && handleSetChatTag(activeChat.customer_phone, "done")}
                                  className="text-xs text-emerald-700 font-semibold gap-2 cursor-pointer py-1.5"
                                >
                                  <CheckCircle className="h-4 w-4 text-emerald-600" />
                                  <span>✅ Langsung Selesai</span>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}

                          {/* Quick Mark Read button if chat is unread */}
                          {(activeChat as any)?.isUnread && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={markingHandled}
                              onClick={() => handleMarkAsHandled(activeChat)}
                              className="h-7 px-2 text-[11px] gap-1 bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300 font-medium shadow-2xs transition-all active:scale-95 cursor-pointer"
                              title="Tandai pesan baru ini sudah dibaca agar notifikasi hijau hilang"
                            >
                              <Check className="h-3.5 w-3.5 text-slate-500" />
                              <span>{markingHandled ? "..." : "Tandai Dibaca"}</span>
                            </Button>
                          )}
                        </div>
                      </CardHeader>

                      {/* Follow-up Reminder Banner */}
                      {currentPin && (
                        <div className="px-4 py-2 bg-gradient-to-r from-amber-50 via-amber-50/60 to-orange-50 border-b border-amber-200 flex items-center justify-between text-xs text-amber-950">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <span className="font-bold flex items-center gap-1 shrink-0 text-amber-900">
                              📌 Follow-up:
                            </span>
                            {currentPin.follow_up_date && (
                              <span className={`px-2 py-0.5 rounded font-bold text-[11px] shrink-0 ${
                                getFollowUpStatus(currentPin.follow_up_date) === "today"
                                  ? "bg-rose-500 text-white animate-pulse shadow-2xs"
                                  : getFollowUpStatus(currentPin.follow_up_date) === "overdue"
                                  ? "bg-amber-200 text-amber-900 border border-amber-400"
                                  : "bg-sky-100 text-sky-800 border border-sky-200"
                              }`}>
                                {getFollowUpStatus(currentPin.follow_up_date) === "today"
                                  ? "🔥 HARI INI"
                                  : getFollowUpStatus(currentPin.follow_up_date) === "overdue"
                                  ? `⚠️ Terlewat (${formatFollowUpDate(currentPin.follow_up_date)})`
                                  : `📅 ${formatFollowUpDate(currentPin.follow_up_date)}`}
                              </span>
                            )}
                            {currentPin.note ? (
                              <span className="text-slate-800 font-medium bg-white/80 px-2 py-0.5 rounded border border-amber-200 truncate max-w-md">
                                {currentPin.note}
                              </span>
                            ) : (
                              <span className="text-slate-500 italic text-[11px]">
                                (Belum ada catatan)
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => activeChat && handleOpenPinDialog(activeChat)}
                              className="h-6 px-2 text-[11px] text-amber-800 hover:bg-amber-200/70 font-semibold cursor-pointer"
                            >
                              Ubah
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => activeChat && handleUnpin(activeChat.customer_phone, activeChat.chat_id)}
                              className="h-6 px-2 text-[11px] text-rose-700 hover:bg-rose-100 font-medium cursor-pointer"
                              title="Selesai follow-up dan lepas pin"
                            >
                              Lepas Pin
                            </Button>
                          </div>
                        </div>
                      )}

                      <CardContent className="flex-1 overflow-y-auto p-4 bg-slate-50/40 space-y-3.5">
                        {/* Tier 2: Load More History Button */}
                        {hasMoreHistory && (
                          <div className="flex items-center justify-center my-2 gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={fetchingConversation}
                              onClick={handleLoadMoreHistory}
                              className="text-xs text-amber-800 bg-amber-50/90 hover:bg-amber-100 border-amber-200 shadow-2xs gap-1.5 cursor-pointer font-medium"
                              title="Bongkar riwayat chat lebih lama dari Supabase Pro"
                            >
                              {fetchingConversation ? (
                                <>
                                  <RefreshCw className="h-3 w-3 animate-spin text-amber-600" />
                                  <span>Memuat pesan sebelumnya...</span>
                                </>
                              ) : (
                                <>
                                  <Clock className="h-3.5 w-3.5 text-amber-600" />
                                  <span>Muat pesan sebelumnya (+300)</span>
                                </>
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={fetchingConversation}
                              onClick={() => setHistoryLimit(prev => prev + 2000)}
                              className="text-xs text-amber-700 bg-white hover:bg-amber-50 border-amber-200 shadow-2xs cursor-pointer font-semibold"
                              title="Bongkar seluruh riwayat chat untuk kontak ini"
                            >
                              <span>Muat Semua</span>
                            </Button>
                          </div>
                        )}

                        {!hasMoreHistory && selectedChatMessages.length >= 300 && (
                          <div className="flex justify-center my-1 select-none">
                            <span className="text-[10px] text-slate-400 bg-slate-100/80 px-2.5 py-0.5 rounded-full border border-slate-200/60">
                              Awal mula riwayat pesan tercatat
                            </span>
                          </div>
                        )}

                        {loadingConversation && selectedChatMessages.length === 0 && (
                          <div className="flex flex-col items-center justify-center h-48 text-slate-400 space-y-2">
                            <RefreshCw className="h-6 w-6 animate-spin text-amber-500" />
                            <p className="text-xs font-medium text-slate-600">Memuat riwayat percakapan...</p>
                          </div>
                        )}

                        {!loadingConversation && selectedChatMessages.length === 0 && (
                          <div className="flex flex-col items-center justify-center h-48 text-slate-400 space-y-1">
                            <MessageSquare className="h-8 w-8 text-slate-300 mb-1" />
                            <p className="text-xs font-medium text-slate-600">Belum ada riwayat pesan untuk kontak ini.</p>
                            <p className="text-[11px] text-slate-400">Ketik pesan di bawah untuk memulai percakapan via WABA.</p>
                          </div>
                        )}

                        {selectedChatMessages.map((msg, index) => {
                          const isIncoming = msg.direction === "incoming";
                          const isError = msg.replied_by === "meta_error" || msg.message.startsWith("❌");
                          const msgTime = new Date(msg.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(".", ":");
                          const msgDateTooltip = formatMessageTooltip(msg.created_at);

                          const prevMsg = index > 0 ? selectedChatMessages[index - 1] : null;
                          const showDateDivider = !prevMsg || !isSameDay(msg.created_at, prevMsg.created_at);
                          const dividerLabel = showDateDivider ? formatChatDividerDate(msg.created_at) : null;

                          if (isError) {
                            return (
                              <Fragment key={msg.id || `error-${index}`}>
                                {showDateDivider && (
                                  <div className="flex justify-center my-3 select-none">
                                    <span className="bg-slate-200/90 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-semibold px-3 py-1 rounded-full shadow-2xs border border-slate-300/70 dark:border-slate-700">
                                      {dividerLabel}
                                    </span>
                                  </div>
                                )}
                                <div className="flex justify-center my-2">
                                  <div className="max-w-[90%] bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-3 shadow-2xs flex items-start gap-2.5">
                                    <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                                    <div className="space-y-1">
                                      <p className="text-xs font-semibold text-rose-900">Notifikasi Sistem Meta WABA</p>
                                      <p className="text-xs whitespace-pre-wrap leading-relaxed">{msg.message}</p>
                                      <span className="text-[9px] text-rose-500 block cursor-help" title={msgDateTooltip}>{msgTime}</span>
                                    </div>
                                  </div>
                                </div>
                              </Fragment>
                            );
                          }

                          const isOrderAgain = isIncoming && (msg.message || "").trim().toUpperCase().includes("ORDER");
                          const isWabaTemplate = msg.channel === "waba" || msg.replied_by === "template" || msg.message.startsWith("[Template");
                          const isAi = msg.replied_by === "ai";
                          const isManual = msg.replied_by === "manual";
                          const isReaction = (msg.message || "").startsWith("[Reaksi: ") || msg.message === "[Pesan reaction]";
                          const reactionEmoji = msg.message.startsWith("[Reaksi: ")
                            ? msg.message.replace("[Reaksi: ", "").replace("]", "").trim()
                            : "❤️";

                          if (isIncoming) {
                            return (
                              <Fragment key={msg.id || `in-${index}`}>
                                {showDateDivider && (
                                  <div className="flex justify-center my-3 select-none">
                                    <span className="bg-slate-200/90 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-semibold px-3 py-1 rounded-full shadow-2xs border border-slate-300/70 dark:border-slate-700">
                                      {dividerLabel}
                                    </span>
                                  </div>
                                )}
                                <div className="flex justify-start my-1">
                                  <div className="max-w-[88%] xl:max-w-[75%] rounded-2xl p-3.5 shadow-xs bg-white border-2 border-emerald-500/40 text-slate-800 rounded-tl-none ring-2 ring-emerald-500/10">
                                    <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-emerald-100 text-[11px] font-bold text-emerald-800">
                                      <div className="flex items-center gap-1.5">
                                        <User className="w-3.5 h-3.5 text-emerald-600" />
                                        <span>Balasan Konsumen</span>
                                      </div>
                                      {isOrderAgain ? (
                                        <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-[9px] px-2 py-0.5 font-bold shadow-2xs animate-pulse">
                                          🎯 RESPON TOMBOL: ORDER LAGI
                                        </Badge>
                                      ) : isReaction ? (
                                        <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 text-[9px] px-1.5 py-0 font-semibold flex items-center gap-1">
                                          <span>Reaksi</span>
                                        </Badge>
                                      ) : (
                                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 text-[9px] px-1.5 py-0 font-semibold">
                                          Chat Masuk
                                        </Badge>
                                      )}
                                    </div>
                                    {/* Render Media Image or Video if available */}
                                    {(msg.media_id || msg.media_url) && (
                                      <div className="mb-2">
                                        <WhatsAppChatMedia
                                          mediaUrl={msg.media_url}
                                          mediaId={msg.media_id}
                                          message={msg.message}
                                          onPreview={handlePreviewImage}
                                          isOutgoing={false}
                                        />
                                      </div>
                                    )}

                                    {isReaction ? (
                                      <div className="flex items-center gap-2.5 py-1">
                                        <span className="text-2xl filter drop-shadow-xs select-none">{reactionEmoji}</span>
                                        <div className="text-xs">
                                          <span className="font-semibold text-emerald-900 block">Reaksi Emotikon</span>
                                          <span className="text-emerald-700/80 text-[11px]">Konsumen bereaksi terhadap pesan</span>
                                        </div>
                                      </div>
                                    ) : (
                                      (!msg.media_id && !msg.media_url) || (msg.message !== '[Pelanggan Mengirim Gambar]' && msg.message !== '[Foto Dikirim]' && msg.message !== '[Video Dikirim]') ? (
                                        <p className="text-sm whitespace-pre-wrap leading-relaxed font-medium text-slate-800">{msg.message}</p>
                                      ) : null
                                    )}

                                    <div className="flex items-center gap-1.5 justify-end mt-1.5 text-slate-400 text-[9px]">
                                      <span className="cursor-help" title={msgDateTooltip}>{msgTime}</span>
                                    </div>
                                  </div>
                                </div>
                              </Fragment>
                            );
                          }

                          return (
                            <Fragment key={msg.id || `out-${index}`}>
                              {showDateDivider && (
                                <div className="flex justify-center my-3 select-none">
                                  <span className="bg-slate-200/90 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-semibold px-3 py-1 rounded-full shadow-2xs border border-slate-300/70 dark:border-slate-700">
                                    {dividerLabel}
                                  </span>
                                </div>
                              )}
                              <div className="flex justify-end my-1">
                                <div className={`max-w-[88%] xl:max-w-[75%] rounded-2xl p-3.5 shadow-sm text-white rounded-tr-none transition-all ${
                                  isWabaTemplate
                                    ? "bg-emerald-600 shadow-emerald-700/20"
                                    : isAi
                                    ? "bg-blue-600 shadow-blue-700/20"
                                    : isManual
                                    ? msg.status === "failed"
                                      ? "bg-rose-600 shadow-rose-700/20 border border-rose-300"
                                      : msg.status === "sending"
                                      ? "bg-amber-600/90 shadow-amber-700/20"
                                      : "bg-amber-600 shadow-amber-700/20"
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
                                        {msg.status === "sending" && (
                                          <Badge className="bg-amber-500/50 text-amber-100 border-0 text-[9px] px-1.5 py-0 font-normal ml-auto flex items-center gap-1 animate-pulse">
                                            <Clock className="w-2.5 h-2.5 animate-spin" />
                                            <span>Mengirim...</span>
                                          </Badge>
                                        )}
                                        {msg.status === "failed" && (
                                          <Badge className="bg-rose-950/70 text-rose-200 border-0 text-[9px] px-1.5 py-0 font-semibold ml-auto flex items-center gap-1">
                                            <AlertCircle className="w-2.5 h-2.5 text-rose-300" />
                                            <span>Gagal Kirim</span>
                                          </Badge>
                                        )}
                                      </>
                                    ) : (
                                      <span>Sistem Otomatis</span>
                                    )}
                                  </div>

                                  {/* Render Media Image or Video for Outgoing if available */}
                                  {(msg.media_id || msg.media_url) && (
                                    <div className="mb-2">
                                      <WhatsAppChatMedia
                                        mediaUrl={msg.media_url}
                                        mediaId={msg.media_id}
                                        message={msg.message}
                                        onPreview={handlePreviewImage}
                                        isOutgoing={true}
                                      />
                                    </div>
                                  )}

                                  {msg.message && msg.message !== '[Foto Dikirim]' && msg.message !== '[Video Dikirim]' && (
                                    <p className="text-sm whitespace-pre-wrap leading-relaxed font-sans">{msg.message}</p>
                                  )}

                                  {/* Retry button if failed */}
                                  {msg.status === "failed" && (
                                    <div className="mt-2.5 pt-2 border-t border-rose-400/40 flex items-center justify-between text-xs gap-2">
                                      <span className="text-rose-200 text-[10px] truncate max-w-[200px]" title={msg.errorMsg}>
                                        {msg.errorMsg || "Gagal menghubungi Meta WABA"}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => handleSendManualReply(msg)}
                                        className="text-[11px] bg-white text-rose-700 hover:bg-rose-50 font-bold px-2.5 py-1 rounded-lg cursor-pointer transition-colors shadow-2xs shrink-0 flex items-center gap-1 active:scale-95"
                                      >
                                        <span>↺ Coba Lagi</span>
                                      </button>
                                    </div>
                                  )}

                                  <div className="flex items-center gap-1.5 justify-end mt-1.5 text-white/75">
                                    <span className="text-[9px] cursor-help" title={msgDateTooltip}>{msgTime}</span>
                                    <span className="text-[9px] font-bold uppercase tracking-wider">
                                      {isWabaTemplate ? "WABA TEMPLATE" : isAi ? "AI DEEPSEEK" : isManual ? "CS MANUAL" : "SISTEM"}
                                    </span>
                                    {/* Delivery & Read Receipts (Sent ✓, Delivered ✓✓, Read ✓✓ Biru/Tebal) */}
                                    {msg.status === "sending" ? (
                                      <Clock className="w-3 h-3 text-amber-200 animate-spin" title="Sedang meluncur..." />
                                    ) : msg.status === "failed" || msg.delivery_status === "failed" ? (
                                      <AlertCircle className="w-3.5 h-3.5 text-rose-300" title="Gagal terkirim" />
                                    ) : msg.delivery_status === "read" ? (
                                      <span className="inline-flex items-center text-cyan-300 font-extrabold" title="Pesan sudah dibaca oleh konsumen (Centang 2 Tebal / Biru)">
                                        <CheckCheck className="w-3.5 h-3.5 text-cyan-300 stroke-[3] filter drop-shadow-[0_0_2px_rgba(103,232,249,0.8)]" />
                                      </span>
                                    ) : msg.delivery_status === "delivered" ? (
                                      <span className="inline-flex items-center text-white/80" title="Pesan sudah sampai di HP konsumen (Centang 2 Abu-abu)">
                                        <CheckCheck className="w-3.5 h-3.5 text-white/80 stroke-[2.2]" />
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center text-white/70" title="Pesan terkirim ke server WhatsApp (Centang 1)">
                                        <Check className="w-3.5 h-3.5 text-white/70 stroke-[2.2]" />
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </Fragment>
                          );
                        })}
                        <div ref={chatEndRef} />
                      </CardContent>

                      <div className="border-t shrink-0 bg-white relative">
                        {/* Media Attachment Preview Card */}
                        {mediaAttachment && (
                          <div className="mx-3 mt-3 p-2.5 bg-amber-50/80 border border-amber-200 rounded-xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-1 duration-150">
                            <div className="flex items-center gap-2.5 min-w-0">
                              {mediaAttachment.mediaType === "video" ? (
                                <div className="relative h-14 w-20 bg-black rounded-lg overflow-hidden shrink-0 flex items-center justify-center">
                                  <video src={mediaAttachment.previewUrl} className="h-full w-full object-cover" />
                                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white">
                                    <Video className="h-5 w-5" />
                                  </div>
                                </div>
                              ) : (
                                <img
                                  src={mediaAttachment.previewUrl}
                                  alt="Preview Lampiran"
                                  className="h-14 w-14 object-cover rounded-lg border border-amber-200 shrink-0"
                                />
                              )}
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <Badge className="text-[10px] font-bold bg-amber-500 text-white border-0 px-1.5 py-0">
                                    {mediaAttachment.mediaType === "video" ? "🎥 Video (WABA)" : "📷 Foto (WABA)"}
                                  </Badge>
                                  <span className="text-xs font-semibold text-slate-800 truncate max-w-[200px] sm:max-w-xs" title={mediaAttachment.fileName}>
                                    {mediaAttachment.fileName}
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                  {(mediaAttachment.fileSize / (1024 * 1024)).toFixed(2)} MB • Ketik keterangan di bawah atau langsung tekan kirim
                                </p>
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={handleRemoveMediaAttachment}
                              className="h-8 w-8 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg shrink-0 cursor-pointer"
                              title="Hapus Lampiran"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        )}

                        <div className="p-3 flex gap-2 items-end">
                        {/* Floating Quick Reply Menu */}
                        {isQuickReplyMenuOpen && (
                          <div className="absolute bottom-full left-3 right-3 mb-2 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden z-40 animate-in fade-in slide-in-from-bottom-2 duration-150 max-h-72 flex flex-col">
                            {/* Floating Menu Header */}
                            <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200 shrink-0">
                              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                                <Zap className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                                <span>Balas Cepat (/)</span>
                                {quickReplySearch && (
                                  <span className="text-[11px] font-normal text-slate-500">
                                    Cari: <code className="bg-amber-100 text-amber-800 px-1 rounded font-mono">/{quickReplySearch}</code>
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowQuickReplyMenu(false);
                                    setIsQuickReplySheetOpen(true);
                                  }}
                                  className="h-6 px-2 rounded flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-amber-800 hover:bg-amber-50 border border-transparent hover:border-amber-200 transition-all cursor-pointer"
                                  title="Kelola & Tambah Balas Cepat"
                                >
                                  <Pencil className="h-3.5 w-3.5 text-amber-600" />
                                  <span>Kelola</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setShowQuickReplyMenu(false)}
                                  className="h-6 w-6 rounded flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/80 transition-all cursor-pointer text-sm font-bold"
                                  title="Tutup"
                                >
                                  ×
                                </button>
                              </div>
                            </div>

                            {/* Quick Reply Items List */}
                            <div className="overflow-y-auto max-h-56 divide-y divide-slate-100 p-1">
                              {matchingQuickReplies.length === 0 ? (
                                <div className="p-4 text-center text-xs text-slate-500 space-y-2">
                                  <p className="font-medium">
                                    {quickReplies.length === 0 
                                      ? "Belum ada template balas cepat." 
                                      : `Tidak ditemukan balas cepat dengan kata kunci "/${quickReplySearch}"`}
                                  </p>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    type="button"
                                    onClick={() => {
                                      setShowQuickReplyMenu(false);
                                      setIsQuickReplySheetOpen(true);
                                      if (quickReplySearch) {
                                        setFormShortcut(quickReplySearch);
                                      }
                                    }}
                                    className="h-7 text-xs gap-1 border-amber-300 text-amber-800 hover:bg-amber-50 cursor-pointer"
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                    <span>Tambah Balas Cepat {quickReplySearch ? `/${quickReplySearch}` : ""}</span>
                                  </Button>
                                </div>
                              ) : (
                                matchingQuickReplies.map((qr) => (
                                  <button
                                    key={qr.id}
                                    type="button"
                                    onClick={() => handleSelectQuickReply(qr, displayName)}
                                    className="w-full text-left p-2.5 rounded-lg hover:bg-amber-50/80 transition-colors flex items-start gap-2.5 group cursor-pointer"
                                  >
                                    <Badge variant="outline" className="bg-amber-100/70 text-amber-800 border-amber-300 font-mono text-[11px] font-bold shrink-0 mt-0.5 group-hover:bg-amber-500 group-hover:text-white transition-colors">
                                      /{qr.shortcut}
                                    </Badge>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-semibold text-slate-800 truncate group-hover:text-amber-900">{qr.title}</p>
                                      <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5 whitespace-pre-wrap">{qr.message}</p>
                                    </div>
                                  </button>
                                ))
                              )}
                            </div>
                          </div>
                        )}

                        {/* Zap Toggle Button */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setShowQuickReplyMenu(prev => !prev)}
                          className={`h-9 w-9 shrink-0 rounded-xl transition-all cursor-pointer ${
                            isQuickReplyMenuOpen ? "bg-amber-100 text-amber-700 font-bold" : "text-slate-400 hover:text-amber-600 hover:bg-amber-50"
                          }`}
                          title="Buka Balas Cepat (atau ketik /)"
                        >
                          <Zap className="h-4 w-4" />
                        </Button>

                        {/* Emoji Picker Popover */}
                        <Popover open={isEmojiPickerOpen} onOpenChange={setIsEmojiPickerOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className={`h-9 w-9 shrink-0 rounded-xl transition-all cursor-pointer ${
                                isEmojiPickerOpen ? "bg-amber-100 text-amber-700 font-bold" : "text-slate-400 hover:text-amber-600 hover:bg-amber-50"
                              }`}
                              title="Pilih Emoji (😊)"
                            >
                              <Smile className="h-4 w-4" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent
                            side="top"
                            align="start"
                            sideOffset={8}
                            className="w-80 p-2.5 rounded-2xl shadow-xl border border-slate-200 bg-white z-50 animate-in fade-in zoom-in-95 duration-150"
                          >
                            <div className="space-y-2">
                              {/* Header & Category Pills */}
                              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 px-0.5">
                                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                  <span>😊</span>
                                  <span>Pilih Emoji</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setIsEmojiPickerOpen(false)}
                                  className="h-5 w-5 rounded flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 text-xs font-bold cursor-pointer"
                                  title="Tutup"
                                >
                                  ×
                                </button>
                              </div>

                              {/* Search bar inside emoji picker */}
                              <div className="relative">
                                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                                <Input
                                  placeholder="Cari emoji (cth: madu, makasih, jempol)..."
                                  value={emojiFilterText}
                                  onChange={(e) => setEmojiFilterText(e.target.value)}
                                  className="h-7 pl-8 pr-6 text-xs bg-slate-50 rounded-lg border-slate-200"
                                />
                                {emojiFilterText && (
                                  <button
                                    type="button"
                                    onClick={() => setEmojiFilterText("")}
                                    className="absolute right-2 top-1.5 h-4 w-4 rounded-full text-[10px] text-slate-400 hover:text-slate-700 flex items-center justify-center bg-slate-200 cursor-pointer"
                                  >
                                    ×
                                  </button>
                                )}
                              </div>

                              {/* Category Tabs (tampil jika tidak sedang mencari) */}
                              {!emojiFilterText && (
                                <div className="grid grid-cols-4 gap-1 p-0.5 bg-slate-100 rounded-lg text-[10px]">
                                  {EMOJI_LIST.map(cat => (
                                    <button
                                      key={cat.category}
                                      type="button"
                                      onClick={() => setActiveEmojiTab(cat.category)}
                                      className={`py-1 px-1 rounded font-medium truncate text-center transition-all cursor-pointer ${
                                        activeEmojiTab === cat.category
                                          ? "bg-white text-amber-700 shadow-2xs font-bold"
                                          : "text-slate-600 hover:text-slate-900"
                                      }`}
                                    >
                                      {cat.label}
                                    </button>
                                  ))}
                                </div>
                              )}

                              {/* Emoji Grid */}
                              <div className="max-h-48 overflow-y-auto p-1 grid grid-cols-6 gap-1">
                                {filteredEmojiItems.length === 0 ? (
                                  <div className="col-span-6 py-6 text-center text-xs text-slate-400">
                                    Emoji tidak ditemukan
                                  </div>
                                ) : (
                                  filteredEmojiItems.map((item, idx) => (
                                    <button
                                      key={`${item.emoji}-${idx}`}
                                      type="button"
                                      onClick={() => handleInsertEmoji(item.emoji)}
                                      className="h-9 w-9 rounded-lg flex items-center justify-center text-xl hover:bg-amber-100/70 hover:scale-125 transition-transform active:scale-95 cursor-pointer select-none"
                                      title={`${item.name} (${item.emoji})`}
                                    >
                                      {item.emoji}
                                    </button>
                                  ))
                                )}
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>

                        {/* Attachment Button for Photos & Videos */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={sendingReply || uploadingMedia}
                          className="h-9 w-9 shrink-0 rounded-xl text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-all cursor-pointer"
                          title="Lampirkan Foto (maks 5MB) atau Video (maks 16MB)"
                        >
                          <Paperclip className="h-4 w-4" />
                        </Button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileSelect(file);
                          }}
                        />

                        <Textarea
                          ref={manualInputRef}
                          rows={1}
                          placeholder={
                            mediaAttachment 
                              ? `Tulis keterangan ${mediaAttachment.mediaType === "video" ? "video" : "foto"} (opsional, tekan Enter kirim)...` 
                              : "Tulis balasan manual (Enter kirim, Shift+Enter baris baru, / balas cepat, Ctrl+V foto)..."
                          }
                          value={manualReplyText}
                          onPaste={handlePasteMedia}
                          onChange={(e) => {
                            setManualReplyText(e.target.value);
                            e.target.style.height = "auto";
                            e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              if (isQuickReplyMenuOpen && matchingQuickReplies.length > 0 && isTriggeredBySlash) {
                                handleSelectQuickReply(matchingQuickReplies[0], displayName);
                              } else {
                                handleSendManualReply();
                              }
                            } else if (e.key === "Escape") {
                              setShowQuickReplyMenu(false);
                            }
                          }}
                          className="flex-1 min-h-[38px] max-h-[160px] resize-none py-2 px-3 text-sm rounded-xl leading-relaxed border-input focus-visible:ring-amber-500"
                        />
                        <Button 
                          type="button"
                          onClick={() => handleSendManualReply()} 
                          disabled={(!manualReplyText.trim() && !mediaAttachment) || sendingReply || uploadingMedia}
                          className="bg-amber-500 hover:bg-amber-600 text-white rounded-xl cursor-pointer h-9 px-3 shrink-0"
                          title="Kirim Pesan (Enter)"
                        >
                          {sendingReply || uploadingMedia ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
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
        <Card className={isWideMode ? "max-w-6xl mx-auto border-slate-200/90 shadow-xs" : "border-slate-200/90 shadow-xs"}>
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

      {/* Slide-over Sheet Kelola Balas Cepat (Pop-up dari Samping Kanan) */}
      <Sheet open={isQuickReplySheetOpen} onOpenChange={setIsQuickReplySheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto flex flex-col p-6 z-50">
          <SheetHeader className="space-y-1 pb-3 border-b">
            <SheetTitle className="text-lg flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-500 fill-amber-500" />
              <span>Kelola Balas Cepat</span>
            </SheetTitle>
            <SheetDescription className="text-xs">
              Buat pintasan cepat (shortcut) untuk mempercepat CS dalam membalas chat konsumen.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6 pt-4 flex-1">
            {/* Form Tambah / Edit */}
            <Card className="border-amber-200 bg-amber-50/30 shadow-xs">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="font-bold text-slate-800">{editingReplyId ? "Edit Balas Cepat" : "Tambah Balas Cepat Baru"}</span>
                  {editingReplyId && (
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      onClick={handleCancelEdit}
                      className="h-6 text-xs text-slate-500 hover:text-slate-800"
                    >
                      Batal
                    </Button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0 space-y-3">
                <div>
                  <Label className="text-xs font-medium text-slate-700">Pintasan / Shortcut</Label>
                  <div className="relative mt-1">
                    <span className="absolute left-2.5 top-2 text-xs font-mono font-bold text-slate-400">/</span>
                    <Input
                      placeholder="rekening, ongkir, salam..."
                      value={formShortcut}
                      onChange={(e) => setFormShortcut(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))}
                      className="h-8 pl-6 text-xs bg-white rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-medium text-slate-700">Judul Singkat</Label>
                  <Input
                    placeholder="cth: Rekening BCA Resmi Araa Honey"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    className="h-8 text-xs bg-white rounded-lg mt-1"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-slate-700">Isi Pesan Balasan</Label>
                    <span className="text-[10px] text-muted-foreground font-mono">Gunakan {'{nama}'}</span>
                  </div>
                  <Textarea
                    placeholder="Halo Kak {nama}, terima kasih sudah menghubungi Araa Honey..."
                    value={formMessage}
                    onChange={(e) => setFormMessage(e.target.value)}
                    className="text-xs bg-white rounded-lg min-h-[90px] mt-1 font-sans"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    💡 <b>Tips:</b> Gunakan <code className="bg-slate-200 px-1 py-0.5 rounded font-mono">{'{nama}'}</code> untuk otomatis menyapa nama pelanggan aktif.
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  {editingReplyId && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleCancelEdit}
                      className="h-8 text-xs cursor-pointer"
                    >
                      Batal
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    disabled={isSavingReply}
                    onClick={handleSaveQuickReply}
                    className="h-8 text-xs bg-amber-500 hover:bg-amber-600 text-white font-semibold gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>{isSavingReply ? "Menyimpan..." : editingReplyId ? "Perbarui" : "Simpan Balas Cepat"}</span>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* List of Existing Quick Replies */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Daftar Template ({quickReplies.length})
                </h4>
              </div>

              {quickReplies.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400 border border-dashed rounded-xl">
                  Belum ada balas cepat yang dibuat. Silakan tambahkan template pertama Anda pada formulir di atas.
                </div>
              ) : (
                <div className="space-y-2">
                  {quickReplies.map((qr) => (
                    <div
                      key={qr.id}
                      className={`p-3 rounded-xl border bg-white shadow-2xs space-y-1.5 transition-all ${
                        editingReplyId === qr.id ? "ring-2 ring-amber-500 border-amber-300 bg-amber-50/20" : "border-slate-200"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Badge className="bg-amber-100 text-amber-800 border-amber-300 font-mono text-[11px] font-bold">
                            /{qr.shortcut}
                          </Badge>
                          <span className="text-xs font-semibold text-slate-900 truncate max-w-[160px]">{qr.title}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleStartEditQuickReply(qr)}
                            className="h-7 w-7 rounded-md flex items-center justify-center text-slate-500 hover:text-amber-700 hover:bg-amber-50 transition-colors cursor-pointer"
                            title="Edit Template"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={deletingReplyId === qr.id}
                            onClick={() => handleDeleteQuickReply(qr.id, qr.shortcut)}
                            className="h-7 w-7 rounded-md flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Hapus Template"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-slate-600 whitespace-pre-wrap line-clamp-3 bg-slate-50 p-2 rounded-md font-sans">
                        {qr.message}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Smart PIN & Follow-up Reminder Dialog */}
      <Dialog open={pinDialogOpen} onOpenChange={setPinDialogOpen}>
        <DialogContent className="sm:max-w-[460px] p-6 bg-white rounded-xl shadow-2xl">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-slate-900">
              <Pin className="h-5 w-5 text-amber-600 fill-amber-500" />
              <span>Sematkan Chat & Pengingat Follow-up</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Chat yang disematkan akan selalu berada di posisi paling atas agar tidak tertumpuk pesan lain.
            </DialogDescription>
          </DialogHeader>

          {pinDialogChat && (
            <div className="space-y-4 pt-2">
              {/* Customer info card */}
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm text-slate-900">
                    {pinDialogChat.customer_name && pinDialogChat.customer_name !== "Pelanggan" && pinDialogChat.customer_name !== "Meta Status"
                      ? pinDialogChat.customer_name
                      : pinDialogChat.formatted_phone}
                  </p>
                  <p className="text-xs text-emerald-700 font-mono font-medium">
                    {pinDialogChat.formatted_phone}
                  </p>
                </div>
                {Boolean(
                  (pinDialogChat.customer_phone && pinnedMap.has((pinDialogChat.customer_phone || "").replace(/[^0-9]/g, ""))) ||
                  (pinDialogChat.chat_id && pinnedMap.has(pinDialogChat.chat_id))
                ) && (
                  <Badge className="bg-amber-500 text-white text-[10px] font-bold">
                    📌 Sedang Tersemat
                  </Badge>
                )}
              </div>

              {/* Tanggal Follow-up */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-amber-600" />
                    <span>Tanggal Rencana Follow-up:</span>
                  </Label>
                  {pinDate && (
                    <button
                      type="button"
                      onClick={() => setPinDate("")}
                      className="text-[11px] text-rose-600 hover:underline font-normal cursor-pointer"
                    >
                      Hapus Tanggal
                    </button>
                  )}
                </div>
                <Input
                  type="date"
                  value={pinDate}
                  onChange={(e) => setPinDate(e.target.value)}
                  className="text-xs h-9 bg-white cursor-pointer"
                />

                {/* Quick Date Shortcut Buttons */}
                <div className="flex flex-wrap gap-1 pt-1">
                  <button
                    type="button"
                    onClick={() => setPinDate(getTodayStrJakarta())}
                    className={`px-2 py-1 rounded text-[11px] border font-medium transition-all cursor-pointer ${
                      pinDate === getTodayStrJakarta()
                        ? "bg-amber-600 text-white border-amber-600 font-bold"
                        : "bg-slate-50 hover:bg-amber-50 text-slate-700 border-slate-200"
                    }`}
                  >
                    Hari Ini
                  </button>
                  <button
                    type="button"
                    onClick={() => setPinDate(getFutureDateStr(1))}
                    className={`px-2 py-1 rounded text-[11px] border font-medium transition-all cursor-pointer ${
                      pinDate === getFutureDateStr(1)
                        ? "bg-amber-600 text-white border-amber-600 font-bold"
                        : "bg-slate-50 hover:bg-amber-50 text-slate-700 border-slate-200"
                    }`}
                  >
                    Besok
                  </button>
                  <button
                    type="button"
                    onClick={() => setPinDate(getFutureDateStr(2))}
                    className={`px-2 py-1 rounded text-[11px] border font-medium transition-all cursor-pointer ${
                      pinDate === getFutureDateStr(2)
                        ? "bg-amber-600 text-white border-amber-600 font-bold"
                        : "bg-slate-50 hover:bg-amber-50 text-slate-700 border-slate-200"
                    }`}
                  >
                    Lusa
                  </button>
                  <button
                    type="button"
                    onClick={() => setPinDate(getFutureDateStr(3))}
                    className={`px-2 py-1 rounded text-[11px] border font-medium transition-all cursor-pointer ${
                      pinDate === getFutureDateStr(3)
                        ? "bg-amber-600 text-white border-amber-600 font-bold"
                        : "bg-slate-50 hover:bg-amber-50 text-slate-700 border-slate-200"
                    }`}
                  >
                    +3 Hari
                  </button>
                  <button
                    type="button"
                    onClick={() => setPinDate(getFutureDateStr(7))}
                    className={`px-2 py-1 rounded text-[11px] border font-medium transition-all cursor-pointer ${
                      pinDate === getFutureDateStr(7)
                        ? "bg-amber-600 text-white border-amber-600 font-bold"
                        : "bg-slate-50 hover:bg-amber-50 text-slate-700 border-slate-200"
                    }`}
                  >
                    +1 Minggu
                  </button>
                </div>
              </div>

              {/* Catatan Follow-up (100% custom-typed by Big Bos / Admin) */}
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-amber-600" />
                  <span>Catatan Khusus (Bisa diketik bebas):</span>
                </Label>
                <Textarea
                  placeholder="Ketik catatan manual di sini... Cth: di Tasikmalaya, janji transfer tgl 25, tunggu gajian, minta katalog reseller..."
                  value={pinNote}
                  onChange={(e) => setPinNote(e.target.value)}
                  rows={3}
                  className="text-xs bg-white resize-none"
                />

                {/* Quick chip suggestions */}
                <div className="flex flex-wrap items-center gap-1 pt-0.5">
                  <span className="text-[10px] text-slate-500 font-medium">Contoh cepat:</span>
                  {[
                    "Janji Transfer",
                    "Tunggu Gajian",
                    "Tanya Stok",
                    "Minta Sampel",
                    "di Luar Kota",
                  ].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => {
                        setPinNote(prev => (prev ? `${prev} - ${chip}` : chip));
                      }}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-800 border border-slate-200 transition-colors cursor-pointer"
                    >
                      +{chip}
                    </button>
                  ))}
                </div>
              </div>

              <DialogFooter className="flex items-center justify-between sm:justify-between pt-3 border-t border-slate-100">
                <div>
                  {Boolean(
                    (pinDialogChat.customer_phone && pinnedMap.has((pinDialogChat.customer_phone || "").replace(/[^0-9]/g, ""))) ||
                    (pinDialogChat.chat_id && pinnedMap.has(pinDialogChat.chat_id))
                  ) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={savingPin}
                      onClick={() => handleUnpin(pinDialogChat.customer_phone, pinDialogChat.chat_id)}
                      className="h-8 text-xs text-rose-600 hover:bg-rose-50 border-rose-200 cursor-pointer"
                    >
                      <PinOff className="h-3.5 w-3.5 mr-1" />
                      Lepas Pin
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={savingPin}
                    onClick={() => setPinDialogOpen(false)}
                    className="h-8 text-xs text-slate-600 cursor-pointer"
                  >
                    Batal
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={savingPin}
                    onClick={handleSavePin}
                    className="h-8 text-xs bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Pin className="h-3.5 w-3.5 fill-slate-900" />
                    <span>{savingPin ? "Menyimpan..." : "Simpan Pin"}</span>
                  </Button>
                </div>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* WhatsApp Media Lightbox / Image & Video Zoom Modal */}
      <Dialog open={!!previewImageUrl} onOpenChange={(open) => !open && setPreviewImageUrl(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] p-4 bg-slate-950 text-white rounded-2xl shadow-2xl flex flex-col items-center justify-between border border-slate-800 overflow-hidden">
          <DialogHeader className="w-full flex flex-row items-center justify-between pb-2 border-b border-slate-800 shrink-0">
            <DialogTitle className="text-sm font-semibold flex items-center gap-2 text-slate-200">
              {previewIsVideo || isVideoMedia(previewImageUrl) ? (
                <>
                  <Video className="h-4 w-4 text-amber-400" />
                  <span>Pratinjau Video WhatsApp</span>
                </>
              ) : (
                <>
                  <ImageIcon className="h-4 w-4 text-amber-400" />
                  <span>Pratinjau Foto WhatsApp</span>
                </>
              )}
            </DialogTitle>
            {previewImageUrl && (
              <a
                href={previewImageUrl}
                target="_blank"
                rel="noopener noreferrer"
                download={previewIsVideo || isVideoMedia(previewImageUrl) ? "video-whatsapp.mp4" : "foto-whatsapp.jpg"}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-slate-950 transition-colors shadow-xs cursor-pointer mr-6"
                title="Buka atau unduh berkas asli"
              >
                <Download className="h-3.5 w-3.5" />
                <span>{previewIsVideo || isVideoMedia(previewImageUrl) ? "Unduh Video" : "Unduh Gambar"}</span>
              </a>
            )}
          </DialogHeader>

          <div className="w-full flex-1 overflow-auto flex items-center justify-center p-2 min-h-[300px]">
            {previewImageUrl && (
              previewIsVideo || isVideoMedia(previewImageUrl) ? (
                <video
                  src={previewImageUrl}
                  controls
                  autoPlay
                  className="max-h-[72vh] w-auto max-w-full rounded-lg shadow-xl bg-black"
                />
              ) : (
                <img
                  src={previewImageUrl}
                  alt="Pratinjau Gambar"
                  className="max-h-[72vh] w-auto max-w-full object-contain rounded-lg shadow-xl"
                  onError={() => setPreviewIsVideo(true)}
                />
              )
            )}
          </div>

          {previewImageCaption && (
            <div className="w-full pt-2 border-t border-slate-800 text-xs text-slate-300 text-center font-medium shrink-0">
              {previewImageCaption}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal Riwayat Pesanan & Data Konsumen Lincah */}
      <Dialog open={isLincahModalOpen} onOpenChange={setIsLincahModalOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] p-0 flex flex-col overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200">
          <div className="p-4 sm:p-5 border-b border-slate-100 bg-gradient-to-r from-blue-50/80 via-indigo-50/50 to-slate-50 flex items-center justify-between shrink-0">
            <div>
              <DialogTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
                <div className="p-1.5 bg-blue-600 text-white rounded-lg shadow-2xs">
                  <Package className="h-4 w-4" />
                </div>
                <span>Data Konsumen & Riwayat Pesanan (Lincah)</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-1">
                Tarik otomatis riwayat pesanan, status resi, dan alamat dari Agregator Lincah untuk diteruskan ke chat.
              </DialogDescription>
            </div>
          </div>

          {/* Search bar & Badges */}
          <div className="p-3.5 bg-slate-50/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex-1 min-w-[240px] flex items-center gap-2">
              <div className="relative flex-1">
                <Phone className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  value={lincahSearchPhone}
                  onChange={(e) => setLincahSearchPhone(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      fetchLincahData(lincahSearchPhone);
                    }
                  }}
                  placeholder="Cari no. HP pelanggan (cth: 0812... atau 628...)"
                  className="h-8 pl-8 text-xs bg-white border-slate-300"
                />
              </div>
              <Button
                size="sm"
                disabled={lincahLoading || !lincahSearchPhone.trim()}
                onClick={() => fetchLincahData(lincahSearchPhone)}
                className="h-8 px-3 text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium cursor-pointer shadow-2xs gap-1.5"
              >
                {lincahLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Search className="h-3.5 w-3.5" />
                )}
                <span>Cari</span>
              </Button>
            </div>

            {/* Badges */}
            {lincahData?.customer && (
              <div className="flex items-center gap-2">
                {lincahData.customer.score ? (
                  <Badge
                    variant="outline"
                    className={`text-xs font-semibold px-2.5 py-0.5 border ${
                      lincahData.customer.score === "A"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                        : lincahData.customer.score === "B"
                        ? "bg-blue-50 text-blue-700 border-blue-300"
                        : lincahData.customer.score === "C"
                        ? "bg-amber-50 text-amber-700 border-amber-300"
                        : "bg-rose-50 text-rose-700 border-rose-300"
                    }`}
                  >
                    ⭐ Skor COD: Grade {lincahData.customer.score}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs bg-slate-100 text-slate-600 border-slate-200">
                    Skor COD: Belum ada
                  </Badge>
                )}
                <Badge variant="secondary" className="text-xs font-medium">
                  Total: {lincahData.orders.length} Pesanan
                </Badge>
              </div>
            )}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 max-h-[58vh]">
            {lincahLoading ? (
              <div className="py-12 flex flex-col items-center justify-center text-center px-4">
                <Loader2 className="h-9 w-9 animate-spin text-blue-600 mb-3" />
                <p className="text-sm font-semibold text-slate-800">Menghubungkan ke API Lincah...</p>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">
                  Sedang menyisir riwayat 20.000+ pesanan di server Lincah. Proses ini memerlukan waktu sekitar 15–25 detik, mohon tunggu sebentar ya...
                </p>
              </div>
            ) : lincahError ? (
              <div className="py-10 px-4 text-center border border-dashed border-rose-200 rounded-xl bg-rose-50/50">
                <AlertCircle className="h-9 w-9 text-rose-500 mx-auto mb-2" />
                <h4 className="text-sm font-semibold text-rose-800">Koneksi Lincah Mengalami Kendala</h4>
                <p className="text-xs text-rose-600 max-w-md mx-auto mt-1">
                  {lincahError}
                </p>
                <Button
                  size="sm"
                  onClick={() => fetchLincahData(lincahSearchPhone)}
                  className="mt-3.5 h-8 px-4 text-xs bg-rose-600 hover:bg-rose-700 text-white font-medium cursor-pointer shadow-2xs gap-1.5"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Coba Lagi</span>
                </Button>
              </div>
            ) : !lincahData?.found ? (
              <div className="py-10 px-4 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                <AlertCircle className="h-9 w-9 text-slate-400 mx-auto mb-2" />
                <h4 className="text-sm font-semibold text-slate-700">Data Tidak Ditemukan</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                  Tidak ditemukan riwayat pesanan untuk nomor <strong className="font-mono text-slate-700">{lincahSearchPhone || "-"}</strong> di akun Lincah Anda.
                </p>
                <p className="text-[11px] text-slate-400 mt-2">
                  Tip: Pastikan nomor HP sama dengan yang didaftarkan saat pemesanan di ekspedisi atau ketik nomor lain di kolom pencarian.
                </p>
              </div>
            ) : (
              <>
                {/* Summary Pelanggan Card */}
                {lincahData.customer && (
                  <div className="p-3.5 bg-gradient-to-br from-blue-50/80 via-slate-50 to-indigo-50/40 rounded-xl border border-blue-200/80 shadow-2xs space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-800">{lincahData.customer.name}</span>
                          <span className="text-xs font-mono text-slate-500">({lincahData.customer.phone})</span>
                        </div>
                        <div className="flex items-start gap-1.5 text-xs text-slate-600">
                          <MapPin className="h-3.5 w-3.5 text-rose-500 shrink-0 mt-0.5" />
                          <span className="leading-relaxed">{lincahData.customer.full_address}</span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          navigator.clipboard.writeText(lincahData.customer!.full_address);
                          toast.success("Alamat berhasil disalin!");
                        }}
                        className="h-7 px-2 text-[11px] text-blue-700 hover:bg-blue-100/70 border border-blue-200 shrink-0 cursor-pointer"
                        title="Salin alamat lengkap"
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Salin Alamat
                      </Button>
                    </div>
                  </div>
                )}

                {/* List Orders */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-600 px-1">
                    <span>Riwayat Pesanan ({lincahData.orders.length})</span>
                    <span className="text-[11px] text-slate-400 font-normal">Pilih pesanan untuk diteruskan ke chat</span>
                  </div>

                  {lincahData.orders.map((order, idx) => {
                    const isComplete = (order.status || "").toLowerCase().includes("complete") || (order.status || "").toLowerCase().includes("done");
                    const isShipping = (order.status || "").toLowerCase().includes("ship") || (order.status || "").toLowerCase().includes("picked");
                    const isCanceled = (order.status || "").toLowerCase().includes("cancel") || (order.status || "").toLowerCase().includes("retur");

                    return (
                      <div
                        key={order.id || idx}
                        className="p-3.5 rounded-xl border border-slate-200 hover:border-blue-300 bg-white shadow-2xs hover:shadow-xs transition-all space-y-3"
                      >
                        {/* Order Header: No Order, Date & Status */}
                        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-mono font-bold text-slate-700">
                              {order.no_order ? `#${order.no_order}` : `Pesanan #${idx + 1}`}
                            </span>
                            {order.createdAt && (
                              <span className="text-[11px] text-slate-400">
                                {new Date(order.createdAt).toLocaleDateString("id-ID", {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric"
                                })}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Badge
                              className={`text-[10px] font-semibold ${
                                isComplete
                                  ? "bg-emerald-600 text-white"
                                  : isShipping
                                  ? "bg-blue-600 text-white"
                                  : isCanceled
                                  ? "bg-rose-600 text-white"
                                  : "bg-amber-500 text-white"
                              }`}
                            >
                              {(order.status || "STATUS").toUpperCase()}
                            </Badge>
                          </div>
                        </div>

                        {/* Product & Courier Info */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          <div className="space-y-1">
                            <div className="text-[11px] text-slate-400 font-medium">Produk Dibeli:</div>
                            <div className="font-semibold text-slate-800 leading-snug">
                              {order.product_name} <span className="text-amber-700">({order.quantity} pcs)</span>
                            </div>
                            <div className="text-[11px] text-slate-600 pt-0.5">
                              <span className="font-medium">{order.type === "cod" ? "COD" : "Transfer"}:</span>{" "}
                              <strong className="text-emerald-700 font-mono">
                                Rp {Number(order.cod_price || 0).toLocaleString("id-ID")}
                              </strong>
                            </div>
                          </div>

                          <div className="space-y-1 sm:border-l sm:border-slate-100 sm:pl-3">
                            <div className="text-[11px] text-slate-400 font-medium">Ekspedisi & Resi:</div>
                            <div className="flex items-center gap-1.5 font-medium text-slate-700">
                              <Truck className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                              <span>{order.courier} {order.courier_service ? `(${order.courier_service})` : ""}</span>
                            </div>
                            {order.resi ? (
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                                  {order.resi}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(order.resi || "");
                                    toast.success("No. Resi disalin!");
                                  }}
                                  className="text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
                                  title="Salin Resi"
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic">Belum ada resi</span>
                            )}
                            {order.lastStatus && (
                              <div className="text-[10px] text-slate-500 italic truncate" title={order.lastStatus}>
                                Status scan: {order.lastStatus}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Address */}
                        <div className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100 flex items-start gap-1.5">
                          <MapPin className="h-3 w-3 text-slate-400 shrink-0 mt-0.5" />
                          <span className="line-clamp-2">{order.full_address}</span>
                        </div>

                        {/* Action Buttons to Forward into Chat */}
                        <div className="pt-1 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleForwardLincahToChat(order, "address")}
                            className="h-7 px-2.5 text-[11px] text-slate-700 hover:text-blue-800 hover:bg-blue-50 border-slate-200 cursor-pointer"
                            title="Hanya tempel Nama, No. HP, dan Alamat ke kolom chat"
                          >
                            <MapPin className="h-3 w-3 mr-1 text-rose-500" />
                            Tempel Alamat
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleForwardLincahToChat(order, "product")}
                            className="h-7 px-2.5 text-[11px] text-slate-700 hover:text-amber-800 hover:bg-amber-50 border-slate-200 cursor-pointer"
                            title="Hanya tempel Produk & Harga ke kolom chat"
                          >
                            🍯 Tempel Pesanan
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleForwardLincahToChat(order, "full")}
                            className="h-7 px-3 text-[11px] bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer shadow-2xs gap-1.5"
                            title="Tempel alamat lengkap dan detail pesanan ke kolom chat"
                          >
                            <Send className="h-3 w-3" />
                            <span>Forward ke Chat</span>
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
            <span>Data bersumber dari API Agregator Lincah</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsLincahModalOpen(false)}
              className="h-7 text-xs text-slate-600 cursor-pointer"
            >
              Tutup
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}

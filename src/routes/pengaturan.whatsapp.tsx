import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RequireAuth } from "@/components/require-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { 
  MessageSquare, Settings, QrCode, Play, Pause, RefreshCw, 
  CheckCircle, AlertTriangle, Send, LogOut, FileSpreadsheet,
  XCircle, Trash2, Clock, Calendar, Bell
} from "lucide-react";

export const Route = createFileRoute("/pengaturan/whatsapp")({
  component: () => (
    <RequireAuth ownerOnly>
      <WhatsAppPage />
    </RequireAuth>
  ),
});

interface WahaSession {
  name: string;
  status: string;
  config?: any;
}

function WhatsAppPage() {
  const qc = useQueryClient();
  
  // WAHA Configurations (Persisted to localStorage + Supabase app_settings)
  const [wahaUrl, setWahaUrl] = useState(() => localStorage.getItem("waha_url") || "http://localhost:3000");
  const [sessionName, setSessionName] = useState(() => localStorage.getItem("waha_session") || "default");
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("waha_api_key") || "");
  const [scheduleTime, setScheduleTime] = useState(() => localStorage.getItem("waha_schedule_time") || "19:00");
  const [intervalVal, setIntervalVal] = useState(() => localStorage.getItem("waha_send_interval") || "60"); // in seconds
  const [autoSchedule, setAutoSchedule] = useState(() => localStorage.getItem("waha_auto_schedule") === "true");
  const [messageTemplate, setMessageTemplate] = useState(() => localStorage.getItem("waha_message_template") || `Halo Kak {customer_name},\n\nPaket madu Araa Honey pesanan Kakak telah dikirim menggunakan {expedition}.\n\n*Resi Pengiriman:* {tracking_number}\n\nKakak bisa melacak status pengiriman secara berkala di aplikasi pelacakan ekspedisi terkait. Terima kasih banyak telah berbelanja di Araa Honey! 🍯🐝`);
  const [followUpTemplate, setFollowUpTemplate] = useState(() => localStorage.getItem("waha_followup_template") || `Halo Kak {customer_name},\n\nKami mendapati paket madu Araa Honey Kakak dengan nomor resi {tracking_number} ({expedition}) dikembalikan oleh pihak ekspedisi (retur).\n\nBoleh kami tahu alasan paketnya diretur, Kak? Apakah kurir tidak datang ke alamat Kakak, atau ada kendala lain?\n\nJika memang ada kesalahan dari pihak kurir/ekspedisi, kami bersedia mengirimkan ulang paket yang baru secara gratis tanpa biaya tambahan untuk Kakak. 😊🍯\n\nTerima kasih banyak atas perhatiannya, Kak!`);
  const [activeTemplateTab, setActiveTemplateTab] = useState<"resi" | "retur">("resi");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Tab State
  const [activeTab, setActiveTab] = useState<"waha" | "crm">("waha");

  // CRM State Configurations
  const [crmEnabled, setCrmEnabled] = useState(true);
  const [crmDelayDays, setCrmDelayDays] = useState(45);
  const [crmMaxDailyLimit, setCrmMaxDailyLimit] = useState(50);
  const [crmTemplate, setCrmTemplate] = useState(`Halo Kak {customer_name},\n\nSemoga sehat selalu ya Kak. 🍯😊\n\nSekadar mengingatkan, Kakak terakhir kali memesan {honey_type} pada sekitar 45 hari yang lalu.\n\nJika persediaan madu Araa Honey di rumah sudah mulai menipis, Kakak bisa langsung membalas chat ini untuk memesan kembali ya. Terima kasih banyak Kak!`);
  const crmTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch CRM Config from Supabase
  const { data: dbCrmConfig, refetch: refetchCrmConfig } = useQuery({
    queryKey: ["crm-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "crm_config")
        .maybeSingle();
      if (error) {
        console.error("Gagal mengambil CRM config:", error);
        throw error;
      }
      return data?.value as any || null;
    }
  });

  // Sync Supabase CRM settings to state on load
  useEffect(() => {
    if (dbCrmConfig) {
      if (dbCrmConfig.enabled !== undefined) setCrmEnabled(dbCrmConfig.enabled);
      if (dbCrmConfig.delayDays !== undefined) setCrmDelayDays(dbCrmConfig.delayDays);
      if (dbCrmConfig.template) setCrmTemplate(dbCrmConfig.template);
      if (dbCrmConfig.maxDailyLimit !== undefined) setCrmMaxDailyLimit(dbCrmConfig.maxDailyLimit);
    }
  }, [dbCrmConfig]);

  // Fetch pending reminders
  const { data: activeReminders, refetch: refetchActiveReminders, isLoading: loadingActiveReminders } = useQuery({
    queryKey: ["active-crm-reminders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_reminders" as any)
        .select("*, orders(customer_name, created_at)")
        .eq("status", "pending")
        .order("scheduled_for", { ascending: true });
      if (error) {
        console.error("Gagal memuat antrean CRM:", error);
        throw error;
      }
      return data || [];
    }
  });

  // Fetch crm history (sent/failed/cancelled)
  const { data: crmHistory, refetch: refetchCrmHistory, isLoading: loadingCrmHistory } = useQuery({
    queryKey: ["crm-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_reminders" as any)
        .select("*, orders(customer_name, created_at)")
        .neq("status", "pending")
        .order("updated_at", { ascending: false } as any)
        .limit(50);
      if (error) {
        console.error("Gagal memuat riwayat CRM:", error);
        throw error;
      }
      return data || [];
    }
  });

  // Save CRM config handler
  const handleSaveCrmConfig = async () => {
    try {
      const { error } = await supabase
        .from("app_settings")
        .upsert({
          key: "crm_config",
          value: {
            enabled: crmEnabled,
            delayDays: Number(crmDelayDays),
            template: crmTemplate.trim(),
            maxDailyLimit: Number(crmMaxDailyLimit)
          }
        });
      if (error) throw error;
      toast.success("Konfigurasi CRM berhasil disimpan!");
      refetchCrmConfig();
    } catch (err: any) {
      toast.error(err.message || "Gagal menyimpan konfigurasi CRM.");
    }
  };

  // Immediate toggle save helper for CRM
  const handleToggleCrmEnabled = async (checked: boolean) => {
    setCrmEnabled(checked);
    try {
      const { error } = await supabase
        .from("app_settings")
        .upsert({
          key: "crm_config",
          value: {
            enabled: checked,
            delayDays: Number(crmDelayDays),
            template: crmTemplate.trim(),
            maxDailyLimit: Number(crmMaxDailyLimit)
          }
        });
      if (error) throw error;
      toast.success(checked ? "CRM Auto-Reminders diaktifkan!" : "CRM Auto-Reminders dinonaktifkan!");
      refetchCrmConfig();
    } catch (err: any) {
      toast.error(err.message || "Gagal memperbarui status CRM.");
      setCrmEnabled(!checked);
    }
  };

  // Insert placeholder helper for CRM
  const insertCrmPlaceholder = (ph: string) => {
    const el = crmTextareaRef.current;
    if (!el) {
      setCrmTemplate(prev => prev + ph);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const text = el.value;
    const before = text.substring(0, start);
    const after = text.substring(end, text.length);
    const newText = before + ph + after;
    setCrmTemplate(newText);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + ph.length, start + ph.length);
    }, 0);
  };

  const [backfilling, setBackfilling] = useState(false);

  const handleBackfillCrm = async () => {
    if (!confirm("Apakah Anda yakin ingin menyinkronkan seluruh data pesanan WhatsApp lama ke antrean CRM? Proses ini akan mendeteksi tanggal transaksi paling awal secara otomatis, mencari transaksi terakhir masing-masing pelanggan, dan menjadwalkan reminder (+45 hari).")) return;
    setBackfilling(true);
    try {
      const { data, error } = await supabase.rpc("backfill_crm_reminders");
      if (error) throw error;
      
      const res = (data as any)?.[0] || { inserted_count: 0, cancelled_count: 0 };
      toast.success(
        `Sinkronisasi CRM Sukses! Menambahkan ${res.inserted_count || 0} pengingat baru dan memperbarui ${res.cancelled_count || 0} antrean lama.`
      );
      refetchActiveReminders();
      refetchCrmHistory();
    } catch (err: any) {
      toast.error(err.message || "Gagal menyinkronkan data CRM.");
    } finally {
      setBackfilling(false);
    }
  };

  const [sendingReminderId, setSendingReminderId] = useState<string | null>(null);

  // Send single CRM reminder manually now
  const handleSendReminderNow = async (reminder: any) => {
    setSendingReminderId(reminder.id);
    try {
      const template = crmTemplate || `Halo Kak {customer_name},\n\nSemoga sehat selalu ya Kak. 🍯😊\n\nSekadar mengingatkan, Kakak terakhir kali memesan {honey_type} pada sekitar 45 hari yang lalu.`;
      
      const formatDateIndo = (dateStr: string): string => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const day = date.getDate();
        const monthIdx = date.getMonth();
        const year = date.getFullYear();
        const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
        return `${day} ${months[monthIdx]} ${year}`;
      };

      const formattedMessage = template
        .replace(/{customer_name}/g, reminder.customer_name || '')
        .replace(/{honey_type}/g, reminder.honey_type || 'Madu Araa')
        .replace(/{last_order_date}/g, formatDateIndo(reminder.orders?.created_at) || '');

      const success = await sendWhatsAppMessage(reminder.customer_phone, formattedMessage);

      if (success) {
        const { error } = await supabase
          .from("crm_reminders" as any)
          .update({ 
            status: "sent", 
            sent_at: new Date().toISOString(), 
            updated_at: new Date().toISOString() 
          })
          .eq("id", reminder.id);
        if (error) throw error;
        toast.success(`Pengingat CRM berhasil dikirim ke ${reminder.customer_name}!`);
        refetchActiveReminders();
        refetchCrmHistory();
      } else {
        throw new Error("Gagal mengirim dari gateway WAHA.");
      }
    } catch (err: any) {
      await supabase
        .from("crm_reminders" as any)
        .update({ 
          status: "failed", 
          error_message: err.message || "Gagal kirim dari gateway WAHA", 
          updated_at: new Date().toISOString() 
        })
        .eq("id", reminder.id);
      toast.error(err.message || "Gagal mengirim pengingat.");
      refetchActiveReminders();
      refetchCrmHistory();
    } finally {
      setSendingReminderId(null);
    }
  };

  // Cancel CRM reminder manually
  const handleCancelReminder = async (reminderId: string) => {
    if (!confirm("Apakah Anda yakin ingin membatalkan pengingat CRM ini?")) return;
    try {
      const { error } = await supabase
        .from("crm_reminders" as any)
        .update({ 
          status: "cancelled", 
          updated_at: new Date().toISOString() 
        })
        .eq("id", reminderId);
      if (error) throw error;
      toast.success("Pengingat berhasil dibatalkan.");
      refetchActiveReminders();
      refetchCrmHistory();
    } catch (err: any) {
      toast.error(err.message || "Gagal membatalkan pengingat.");
    }
  };

  // Fetch WAHA Config from Supabase database for multi-device sync
  const { data: wahaConfig, refetch: refetchConfig } = useQuery({
    queryKey: ["waha-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "waha_config")
        .maybeSingle();
      if (error) {
        console.error("Gagal mengambil waha config:", error);
        throw error;
      }
      return data?.value as any || null;
    }
  });

  // Sync Supabase settings to state on load
  useEffect(() => {
    if (wahaConfig) {
      if (wahaConfig.wahaUrl) {
        setWahaUrl(wahaConfig.wahaUrl);
        localStorage.setItem("waha_url", wahaConfig.wahaUrl);
      }
      if (wahaConfig.sessionName) {
        setSessionName(wahaConfig.sessionName);
        localStorage.setItem("waha_session", wahaConfig.sessionName);
      }
      if (wahaConfig.apiKey) {
        setApiKey(wahaConfig.apiKey);
        localStorage.setItem("waha_api_key", wahaConfig.apiKey);
      }
      if (wahaConfig.scheduleTime) {
        setScheduleTime(wahaConfig.scheduleTime);
        localStorage.setItem("waha_schedule_time", wahaConfig.scheduleTime);
      }
      if (wahaConfig.intervalVal) {
        setIntervalVal(wahaConfig.intervalVal);
        localStorage.setItem("waha_send_interval", wahaConfig.intervalVal);
      }
      if (wahaConfig.autoSchedule !== undefined) {
        setAutoSchedule(wahaConfig.autoSchedule);
        localStorage.setItem("waha_auto_schedule", String(wahaConfig.autoSchedule));
      }
      if (wahaConfig.messageTemplate) {
        setMessageTemplate(wahaConfig.messageTemplate);
        localStorage.setItem("waha_message_template", wahaConfig.messageTemplate);
      }
      if (wahaConfig.followUpTemplate) {
        setFollowUpTemplate(wahaConfig.followUpTemplate);
        localStorage.setItem("waha_followup_template", wahaConfig.followUpTemplate);
      }
    }
  }, [wahaConfig]);

  // UI States
  const [sessionStatus, setSessionStatus] = useState<string>("STOPPED"); // STOPPED, STARTING, SCAN_QR, WORKING, FAILED
  const [qrRefreshTrigger, setQrRefreshTrigger] = useState(0);
  const [qrImageUrl, setQrImageUrl] = useState<string>("");
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Queue Running States
  const [queueActive, setQueueActive] = useState(false);
  const [queueIndex, setQueueIndex] = useState(0);
  const [queueLogs, setQueueLogs] = useState<string[]>([]);
  const queueActiveRef = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch pending orders (have resi / tracking_number, sales channel is whatsapp, and not sent yet)
  const { data: pendingOrders, refetch: refetchPending, isLoading: loadingOrders } = useQuery({
    queryKey: ["pending-resi-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, customer_name, customer_phone, tracking_number, created_at, resi_shared_via_wa, channel, expedition")
        .eq("channel", "whatsapp")
        .not("tracking_number", "is", null)
        .eq("resi_shared_via_wa", false)
        .order("created_at", { ascending: true });
      if (error) {
        console.error("Gagal memuat antrean resi:", error);
        throw error;
      }
      return data || [];
    }
  });

  // Save config helper (Saves to both Supabase and LocalStorage)
  const handleSaveConfig = async () => {
    try {
      const { error } = await supabase
        .from("app_settings")
        .upsert({
          key: "waha_config",
          value: {
            wahaUrl: wahaUrl.trim(),
            sessionName: sessionName.trim(),
            apiKey: apiKey.trim(),
            scheduleTime,
            intervalVal,
            autoSchedule,
            messageTemplate,
            followUpTemplate
          }
        });
      if (error) throw error;

      localStorage.setItem("waha_url", wahaUrl.trim());
      localStorage.setItem("waha_session", sessionName.trim());
      localStorage.setItem("waha_api_key", apiKey.trim());
      localStorage.setItem("waha_schedule_time", scheduleTime);
      localStorage.setItem("waha_send_interval", intervalVal);
      localStorage.setItem("waha_auto_schedule", String(autoSchedule));
      localStorage.setItem("waha_message_template", messageTemplate);
      localStorage.setItem("waha_followup_template", followUpTemplate);
      
      toast.success("Pengaturan berhasil disimpan ke database!");
      refetchConfig();
    } catch (err: any) {
      toast.error(err.message || "Gagal menyimpan pengaturan.");
    }
  };

  // Immediate toggle save helper
  const handleToggleAutoSchedule = async (checked: boolean) => {
    setAutoSchedule(checked);
    localStorage.setItem("waha_auto_schedule", String(checked));
    try {
      const { error } = await supabase
        .from("app_settings")
        .upsert({
          key: "waha_config",
          value: {
            wahaUrl: wahaUrl.trim(),
            sessionName: sessionName.trim(),
            apiKey: apiKey.trim(),
            scheduleTime,
            intervalVal,
            autoSchedule: checked,
            messageTemplate,
            followUpTemplate
          }
        });
      if (error) throw error;
      toast.success(checked ? "Pengiriman otomatis diaktifkan!" : "Pengiriman otomatis dinonaktifkan!");
      refetchConfig();
    } catch (err: any) {
      toast.error(err.message || "Gagal memperbarui status pengiriman.");
      setAutoSchedule(!checked);
      localStorage.setItem("waha_auto_schedule", String(!checked));
    }
  };

  const insertPlaceholder = (ph: string) => {
    const el = textareaRef.current;
    if (!el) {
      if (activeTemplateTab === "resi") {
        setMessageTemplate(prev => prev + ph);
      } else {
        setFollowUpTemplate(prev => prev + ph);
      }
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const text = el.value;
    const before = text.substring(0, start);
    const after = text.substring(end, text.length);
    const newText = before + ph + after;
    
    if (activeTemplateTab === "resi") {
      setMessageTemplate(newText);
    } else {
      setFollowUpTemplate(newText);
    }
    
    // Focus back and place cursor after the placeholder
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + ph.length, start + ph.length);
    }, 0);
  };

  // Helper: Get headers for WAHA API
  const getWahaHeaders = () => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) {
      headers["X-Api-Key"] = apiKey;
    }
    return headers;
  };

  // Skip/Cancel an order from the WhatsApp queue
  const handleSkipOrder = async (orderId: string) => {
    if (!confirm("Apakah Anda yakin ingin mengeluarkan pesanan ini dari antrean pengiriman WhatsApp?")) return;
    try {
      const { data, error } = await supabase
        .from("orders")
        .update({ 
          resi_shared_via_wa: true, 
          wa_share_error: "Dilewati manual oleh pengguna" 
        })
        .eq("id", orderId)
        .select();

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Gagal memperbarui database. Baris tidak ditemukan atau diblokir oleh kebijakan keamanan (RLS).");
      }
      toast.success("Pesanan berhasil dikeluarkan dari antrean.");
      refetchPending();
    } catch (err: any) {
      toast.error(err.message || "Gagal melewatkan pesanan.");
    }
  };

  // Clear/Cancel all orders from the WhatsApp queue
  const handleClearAllQueue = async () => {
    if (!pendingOrders || pendingOrders.length === 0) return;
    const count = pendingOrders.length;
    if (!confirm(`Apakah Anda yakin ingin mengeluarkan SEMUA (${count}) pesanan dari antrean pengiriman WhatsApp?`)) return;
    
    try {
      const { error } = await supabase
        .from("orders")
        .update({ 
          resi_shared_via_wa: true, 
          wa_share_error: "Dibersihkan massal dari antrean" 
        })
        .eq("channel", "whatsapp")
        .not("tracking_number", "is", null)
        .eq("resi_shared_via_wa", false);

      if (error) throw error;
      
      toast.success(`Berhasil mengeluarkan ${count} pesanan dari antrean.`);
      refetchPending();
    } catch (err: any) {
      toast.error(err.message || "Gagal membersihkan antrean.");
    }
  };

  // Helper for safe JSON parsing to prevent "Unexpected end of JSON input" errors
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

  // Check Session Status from WAHA
  const checkSessionStatus = async (silent = false) => {
    if (!silent) setLoadingStatus(true);
    try {
      const res = await fetch("/api/waha-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: `${wahaUrl}/api/sessions/${sessionName}`,
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
      setSessionStatus(normalizedStatus); // e.g. STOPPED, STARTING, SCAN_QR, WORKING, FAILED
      if (normalizedStatus === "SCAN_QR") {
        // Force refresh QR image
        setQrRefreshTrigger(prev => prev + 1);
      }
    } catch (err: any) {
      setSessionStatus("DISCONNECTED"); // cannot reach WAHA server
      if (!silent) {
        console.error("Gagal terhubung ke server WAHA:", err);
      }
    } finally {
      if (!silent) setLoadingStatus(false);
    }
  };

  // Start WAHA Session
  const handleStartSession = async () => {
    setActionLoading(true);
    try {
      const res = await fetch("/api/waha-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: `${wahaUrl}/api/sessions/start`,
          method: "POST",
          headers: getWahaHeaders(),
          body: { name: sessionName }
        })
      });
      const data = await safeJson(res);
      
      if (!res.ok) {
        throw new Error(data.message || "Gagal menyalakan sesi WhatsApp.");
      }
      
      toast.success("Sesi WhatsApp sedang dimulai...");
      
      // Poll status for a bit
      setTimeout(() => checkSessionStatus(true), 2000);
      setTimeout(() => checkSessionStatus(true), 5000);
      setTimeout(() => checkSessionStatus(true), 10000);
    } catch (err: any) {
      toast.error(err.message || "Gagal menghubungkan server WAHA.");
    } finally {
      setActionLoading(false);
    }
  };

  // Stop & Logout WAHA Session (wipes session cache to force a fresh QR Code)
  const handleStopSession = async () => {
    if (!confirm("Apakah Anda yakin ingin mengeluarkan sesi WhatsApp ini? (Sesi akan di-logout total dan memerlukan scan QR baru)")) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/waha-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: `${wahaUrl}/api/sessions/${sessionName}/logout`,
          method: "POST",
          headers: getWahaHeaders()
        })
      });
      const data = await safeJson(res);
      if (!res.ok) {
        // Fallback to /api/sessions/logout
        await fetch("/api/waha-proxy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: `${wahaUrl}/api/sessions/logout`,
            method: "POST",
            headers: getWahaHeaders(),
            body: { name: sessionName }
          })
        });
      }
      toast.success("Sesi WhatsApp berhasil dikeluarkan. Silakan klik Mulai Sesi untuk scan QR baru.");
      setSessionStatus("STOPPED");
    } catch (err: any) {
      toast.error(err.message || "Gagal mengeluarkan sesi.");
    } finally {
      setActionLoading(false);
    }
  };

  // Poll status periodically
  useEffect(() => {
    checkSessionStatus(true);
    const interval = setInterval(() => {
      // Only poll status if url is configured
      if (wahaUrl) {
        checkSessionStatus(true);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [wahaUrl, sessionName]);

  // Fetch QR image with auth headers
  useEffect(() => {
    let active = true;
    if (sessionStatus !== "SCAN_QR") {
      setQrImageUrl("");
      return;
    }

    const fetchQrImage = async () => {
      try {
        const res = await fetch("/api/waha-proxy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: `${wahaUrl}/api/${sessionName}/auth/qr`,
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
    
    // Poll the QR image every 10 seconds while in SCAN_QR state
    const interval = setInterval(fetchQrImage, 10000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [sessionStatus, qrRefreshTrigger, wahaUrl, sessionName, apiKey]);

  // Clean phone number format for WhatsApp (62xxx@c.us)
  const formatPhoneNumber = (phone: string): string => {
    let clean = phone.replace(/[^0-9]/g, ""); // remove all non-digits
    if (clean.startsWith("0")) {
      clean = "62" + clean.slice(1);
    } else if (clean.startsWith("8")) {
      clean = "62" + clean;
    }
    return `${clean}@c.us`;
  };

  // Send Single WA Message via WAHA
  const sendWhatsAppMessage = async (to: string, message: string): Promise<boolean> => {
    const chatId = formatPhoneNumber(to);
    
    // WAHA v2 endpoint: POST /api/sendText or POST /api/messages/sendText
    // Let's try /api/sendText first as it is default
    try {
      const res = await fetch("/api/waha-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: `${wahaUrl}/api/sendText`,
          method: "POST",
          headers: getWahaHeaders(),
          body: {
            session: sessionName,
            chatId: chatId,
            text: message
          }
        })
      });
      if (res.ok) return true;

      // Fallback endpoint
      const fallbackRes = await fetch("/api/waha-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: `${wahaUrl}/api/messages/sendText`,
          method: "POST",
          headers: getWahaHeaders(),
          body: {
            session: sessionName,
            chatId: chatId,
            text: message
          }
        })
      });
      return fallbackRes.ok;
    } catch (err) {
      console.error("Error API WAHA:", err);
      return false;
    }
  };

  // Start/Pause Queue Runner
  const toggleQueue = () => {
    if (queueActive) {
      // Pause
      setQueueActive(false);
      queueActiveRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      addLog("⚠️ Pengiriman antrean dijeda oleh pengguna.");
      toast.message("Antrean pengiriman dijeda.");
    } else {
      // Start
      if (sessionStatus !== "WORKING") {
        toast.error("Hubungkan sesi WhatsApp Anda terlebih dahulu!");
        return;
      }
      if (!pendingOrders || pendingOrders.length === 0) {
        toast.error("Tidak ada resi baru dalam antrean untuk dikirim.");
        return;
      }
      setQueueActive(true);
      queueActiveRef.current = true;
      toast.success("Antrean pengiriman resi dimulai!");
      runQueueStep(queueIndex);
    }
  };

  // Core Queue Step runner
  const runQueueStep = async (index: number) => {
    if (!queueActiveRef.current) return;
    if (!pendingOrders || index >= pendingOrders.length) {
      // Finished
      setQueueActive(false);
      queueActiveRef.current = false;
      setQueueIndex(0);
      addLog("✅ Semua pesan resi dalam antrean berhasil diproses!");
      toast.success("Semua resi berhasil dikirim!");
      refetchPending();
      return;
    }

    const order = pendingOrders[index];
    setQueueIndex(index);

    if (!order.customer_phone || !order.tracking_number) {
      // Skip invalid order
      addLog(`❌ [Lewati] Order #${order.id} (${order.customer_name}): Phone atau resi kosong.`);
      // Move to next immediately
      setQueueIndex(index + 1);
      runQueueStep(index + 1);
      return;
    }

    addLog(`⏳ [Kirim] Mengirim resi ke ${order.customer_name} (${order.customer_phone})...`);
    
    // Construct message using customizable template
    const template = messageTemplate || `Halo Kak {customer_name},\n\nPaket madu Araa Honey pesanan Kakak telah dikirim menggunakan {expedition}.\n\n*Resi Pengiriman:* {tracking_number}\n\nKakak bisa melacak status pengiriman secara berkala di aplikasi pelacakan ekspedisi terkait. Terima kasih banyak telah berbelanja di Araa Honey! 🍯🐝`;
    
    const message = template
      .replace(/{customer_name}/g, order.customer_name || "")
      .replace(/{tracking_number}/g, order.tracking_number || "")
      .replace(/{expedition}/g, order.expedition || "");

    const success = await sendWhatsAppMessage(order.customer_phone, message);

    if (success) {
      // Update DB
      const { data, error } = await supabase
        .from("orders")
        .update({ resi_shared_via_wa: true })
        .eq("id", order.id)
        .select();

      if (error) {
        addLog(`⚠️ [Supabase Error] Pesan terkirim ke ${order.customer_name}, tetapi gagal mengupdate status di database: ${error.message}`);
      } else if (!data || data.length === 0) {
        addLog(`⚠️ [Supabase Error] Pesan terkirim ke ${order.customer_name}, tetapi gagal mengupdate database (0 baris terupdate, kemungkinan kebijakan RLS memblokir update).`);
      } else {
        addLog(`✅ [Sukses] Resi berhasil terkirim ke ${order.customer_name}!`);
      }
    } else {
      // Log Error to DB
      const { data, error } = await supabase
        .from("orders")
        .update({ wa_share_error: "Gagal terhubung atau terkirim dari gateway WAHA" })
        .eq("id", order.id)
        .select();

      if (error || !data || data.length === 0) {
        console.error("Gagal mencatat log error pengiriman WA ke database:", error);
      }

      addLog(`❌ [Gagal] Gagal mengirim pesan ke ${order.customer_name}. Periksa status WAHA Anda.`);
    }

    // Schedule next step
    const nextIndex = index + 1;
    if (nextIndex < pendingOrders.length && queueActiveRef.current) {
      const delaySec = Number(intervalVal);
      addLog(`💤 Menunggu selama ${delaySec} detik sebelum mengirim antrean berikutnya...`);
      timerRef.current = setTimeout(() => {
        setQueueIndex(nextIndex);
        runQueueStep(nextIndex);
      }, delaySec * 1000);
    } else {
      // Finish
      setQueueIndex(nextIndex);
      runQueueStep(nextIndex);
    }
  };

  const addLog = (log: string) => {
    const time = new Date().toLocaleTimeString("id-ID");
    setQueueLogs(prev => [`[${time}] ${log}`, ...prev.slice(0, 49)]); // keep last 50 logs
  };

  // Browser-based scheduler checker (Runs every minute)
  useEffect(() => {
    const checkSchedule = setInterval(() => {
      if (!autoSchedule || queueActiveRef.current || sessionStatus !== "WORKING") return;

      const now = new Date();
      const currentHrsMin = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

      if (currentHrsMin === scheduleTime && pendingOrders && pendingOrders.length > 0) {
        addLog("⏰ Waktu terjadwal tercapai (jam 7 malam). Memulai pengiriman otomatis...");
        setQueueActive(true);
        queueActiveRef.current = true;
        runQueueStep(0);
      }
    }, 60000); // Check every minute

    return () => clearInterval(checkSchedule);
  }, [autoSchedule, scheduleTime, pendingOrders, sessionStatus, intervalVal]);

  // Clean timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Integrasi WhatsApp (WAHA) & CRM</h2>
          <p className="text-sm text-muted-foreground">Kirim resi pengiriman otomatis dan pengingat repeat order ke pelanggan menggunakan WhatsApp Anda.</p>
        </div>
      </div>

      {/* Top Navigation Tabs */}
      <div className="flex bg-muted/60 p-1 rounded-xl border border-border/60 max-w-md">
        <button
          type="button"
          onClick={() => setActiveTab("waha")}
          className={`flex-1 text-center py-2 text-xs font-bold rounded-lg transition-all duration-200 ${
            activeTab === "waha"
              ? "bg-white dark:bg-slate-950 shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Kirim Resi & Sesi WA
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("crm")}
          className={`flex-1 text-center py-2 text-xs font-bold rounded-lg transition-all duration-200 ${
            activeTab === "crm"
              ? "bg-white dark:bg-slate-950 shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          CRM Auto-Reminders
        </button>
      </div>

      {activeTab === "waha" ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left column: Server Settings & Scheduler */}
        <div className="space-y-6 lg:col-span-1">
          {/* Server Settings Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Settings className="w-5 h-5 text-honey" /> Konfigurasi WAHA
              </CardTitle>
              <CardDescription>Atur koneksi ke API server WAHA lokal.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="waha-url">WAHA Server URL</Label>
                <Input 
                  id="waha-url"
                  placeholder="http://localhost:3000" 
                  value={wahaUrl} 
                  onChange={(e) => setWahaUrl(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="session-name">Nama Sesi</Label>
                  <Input 
                    id="session-name"
                    placeholder="default" 
                    value={sessionName} 
                    onChange={(e) => setSessionName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="api-key">API Key (Opsional)</Label>
                  <Input 
                    id="api-key"
                    type="password"
                    placeholder="Sandi API" 
                    value={apiKey} 
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                </div>
              </div>

              <Button onClick={handleSaveConfig} className="w-full bg-honey hover:bg-honey-dark text-honey-foreground">
                Simpan Pengaturan
              </Button>
            </CardContent>
          </Card>

          {/* Scheduler Settings Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-honey" /> Penjadwalan
              </CardTitle>
              <CardDescription>Atur jam pengiriman resi otomatis.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="auto-schedule" className="cursor-pointer font-medium">Kirim Otomatis</Label>
                  <p className="text-[10px] text-muted-foreground">Kirim resi terjadwal otomatis via cloud (24/7).</p>
                </div>
                <Switch 
                  id="auto-schedule" 
                  checked={autoSchedule} 
                  onCheckedChange={handleToggleAutoSchedule}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="schedule-time">Jam Kirim</Label>
                  <Input 
                    id="schedule-time"
                    type="time" 
                    value={scheduleTime} 
                    onChange={(e) => {
                      setScheduleTime(e.target.value);
                      localStorage.setItem("waha_schedule_time", e.target.value);
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="send-interval">Interval Jeda</Label>
                  <Select 
                    value={intervalVal} 
                    onValueChange={(val) => {
                      setIntervalVal(val);
                      localStorage.setItem("waha_send_interval", val);
                    }}
                  >
                    <SelectTrigger id="send-interval">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10 Detik (Tes)</SelectItem>
                      <SelectItem value="30">30 Detik</SelectItem>
                      <SelectItem value="60">1 Menit</SelectItem>
                      <SelectItem value="120">2 Menit</SelectItem>
                      <SelectItem value="300">5 Menit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="border-t pt-3 mt-3 space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground">Info Pemicu Otomatis (Cloud Cron):</Label>
                <div className="bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded border border-border/80 text-[10px] space-y-1 font-mono select-all">
                  <div className="text-slate-500 dark:text-slate-400 break-all font-semibold">GET https://app.araahoney.my.id/api/cron/send-resi</div>
                  <div className="text-slate-400 dark:text-slate-500 break-all">Header: Authorization: Bearer 5b8ab0ab88d7cbe1f85d7ca34e68a2ac</div>
                </div>
                <p className="text-[9px] text-muted-foreground leading-normal">
                  Cron bawaan Vercel telah diaktifkan otomatis (berjalan tiap jam 19:00 WIB). Jika ingin memicu lebih sering atau di jam kustom, salin URL & Header di atas ke layanan cron gratis seperti <a href="https://cron-job.org" target="_blank" rel="noopener noreferrer" className="text-honey hover:underline font-semibold">cron-job.org</a>.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Message Template Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-honey" /> Template Pesan
              </CardTitle>
              <CardDescription>Sesuaikan kata-kata pesan WhatsApp untuk berbagai notifikasi.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Tab Selector Buttons */}
              <div className="flex bg-muted/60 p-0.5 rounded-lg border border-border/60">
                <button
                  type="button"
                  onClick={() => setActiveTemplateTab("resi")}
                  className={`flex-1 text-center py-1.5 text-xs font-semibold rounded-md transition-all duration-200 ${
                    activeTemplateTab === "resi"
                      ? "bg-white dark:bg-slate-950 shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Kirim Resi
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTemplateTab("retur")}
                  className={`flex-1 text-center py-1.5 text-xs font-semibold rounded-md transition-all duration-200 ${
                    activeTemplateTab === "retur"
                      ? "bg-white dark:bg-slate-950 shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Follow-Up Retur
                </button>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="message-template">
                  {activeTemplateTab === "resi" ? "Format Pesan Kirim Resi" : "Format Pesan Follow-Up Retur"}
                </Label>
                <textarea
                  id="message-template"
                  ref={textareaRef}
                  rows={6}
                  className="flex min-h-[140px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  value={activeTemplateTab === "resi" ? messageTemplate : followUpTemplate}
                  onChange={(e) => {
                    if (activeTemplateTab === "resi") {
                      setMessageTemplate(e.target.value);
                    } else {
                      setFollowUpTemplate(e.target.value);
                    }
                  }}
                  placeholder="Masukkan format pesan..."
                />
              </div>

              <div className="space-y-1 text-xs">
                <Label className="text-muted-foreground font-semibold">Placeholder yang tersedia:</Label>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <Badge 
                    variant="outline" 
                    className="cursor-pointer hover:bg-accent select-none" 
                    onClick={() => insertPlaceholder("{customer_name}")}
                  >
                    {`{customer_name}`}
                  </Badge>
                  <Badge 
                    variant="outline" 
                    className="cursor-pointer hover:bg-accent select-none" 
                    onClick={() => insertPlaceholder("{expedition}")}
                  >
                    {`{expedition}`}
                  </Badge>
                  <Badge 
                    variant="outline" 
                    className="cursor-pointer hover:bg-accent select-none" 
                    onClick={() => insertPlaceholder("{tracking_number}")}
                  >
                    {`{tracking_number}`}
                  </Badge>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Klik tag di atas untuk menyisipkan ke dalam template.</p>
              </div>

              {/* Live Preview Box */}
              <div className="mt-3 p-3 bg-muted/30 rounded-lg border border-border/80 text-xs space-y-1.5">
                <span className="font-semibold text-muted-foreground">Pratinjau Pesan (Simulasi):</span>
                <div className="bg-white dark:bg-slate-950 p-2.5 rounded border border-border text-slate-800 dark:text-slate-200 whitespace-pre-wrap font-sans leading-relaxed">
                  {(activeTemplateTab === "resi" ? messageTemplate : followUpTemplate)
                    .replace(/{customer_name}/g, "Opa Fandra")
                    .replace(/{expedition}/g, "J&T Express")
                    .replace(/{tracking_number}/g, "IDE7002038084020")}
                </div>
              </div>

              <Button onClick={handleSaveConfig} className="w-full bg-honey hover:bg-honey-dark text-honey-foreground">
                Simpan Template
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Center column: WAHA QR / Session Management */}
        <div className="space-y-6 lg:col-span-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Session connection controller */}
            <Card className="flex flex-col">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center justify-between">
                  <span>Status WhatsApp</span>
                  <Badge 
                    variant={
                      sessionStatus === "WORKING" ? "success" : 
                      sessionStatus === "SCAN_QR" ? "warning" : 
                      sessionStatus === "STARTING" ? "secondary" :
                      "destructive"
                    }
                  >
                    {sessionStatus === "WORKING" ? "Terkoneksi (LIVE)" : 
                     sessionStatus === "SCAN_QR" ? "Perlu Scan QR" : 
                     sessionStatus === "STARTING" ? "Memulai..." : 
                     sessionStatus === "STOPPED" ? "Sesi Berhenti" : 
                     "Terputus"}
                  </Badge>
                </CardTitle>
                <CardDescription>Sandingkan HP Anda dengan memindai QR code.</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col justify-between space-y-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-accent/30 p-3 rounded-lg border border-border/80">
                  {sessionStatus === "WORKING" ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      <span>WhatsApp Anda aktif dan siap mengirim pesan resi ke pelanggan.</span>
                    </>
                  ) : sessionStatus === "SCAN_QR" ? (
                    <>
                      <QrCode className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      <span>Sesi berjalan. Silakan scan QR Code di samping menggunakan fitur 'Perangkat Tertaut' WA HP Anda.</span>
                    </>
                  ) : sessionStatus === "STARTING" ? (
                    <>
                      <RefreshCw className="w-4 h-4 text-amber-500 animate-spin flex-shrink-0" />
                      <span>Sesi WhatsApp sedang dimulai. Silakan tunggu beberapa detik hingga QR Code muncul...</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0" />
                      <span>Sesi WAHA berhenti atau tidak terhubung. Klik 'Mulai Sesi WhatsApp' di bawah untuk menyalakan.</span>
                    </>
                  )}
                </div>

                <div className="flex gap-2">
                  {sessionStatus === "WORKING" || sessionStatus === "SCAN_QR" ? (
                    <Button 
                      variant="destructive"
                      onClick={handleStopSession} 
                      disabled={actionLoading}
                      className="w-full"
                    >
                      {actionLoading ? "Mengeluarkan Sesi..." : "Putuskan Sesi WhatsApp"}
                    </Button>
                  ) : (
                    <Button 
                      onClick={handleStartSession} 
                      disabled={actionLoading || loadingStatus}
                      className="w-full bg-honey hover:bg-honey-dark text-honey-foreground font-bold"
                    >
                      {actionLoading ? "Menghubungkan..." : "Mulai Sesi WhatsApp (Munculkan QR Code)"}
                    </Button>
                  )}
                  
                  <Button 
                    variant="outline" 
                    size="icon" 
                    onClick={() => checkSessionStatus()}
                    disabled={loadingStatus}
                    title="Refresh Status"
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingStatus ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* QR Code display */}
            <Card className="flex flex-col items-center justify-center min-h-[220px]">
              <CardContent className="p-6 flex flex-col items-center justify-center text-center">
                {sessionStatus === "SCAN_QR" && qrImageUrl ? (
                  <div className="space-y-3 flex flex-col items-center">
                    <img 
                      src={qrImageUrl} 
                      alt="WhatsApp QR Code" 
                      className="w-44 h-44 border rounded-lg shadow-sm p-1.5 bg-white"
                    />
                    <p className="text-[11px] text-muted-foreground animate-pulse">Memuat ulang kode QR secara berkala...</p>
                  </div>
                ) : sessionStatus === "WORKING" ? (
                  <div className="space-y-3 flex flex-col items-center text-center py-6">
                    <div className="h-16 w-16 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 border border-emerald-200">
                      <CheckCircle className="w-8 h-8" />
                    </div>
                    <h3 className="font-semibold text-sm">WhatsApp Terhubung</h3>
                    <p className="text-xs text-muted-foreground max-w-xs">Perangkat Anda berhasil tertaut dengan WAHA.</p>
                  </div>
                ) : (
                  <div className="space-y-2 py-8 text-muted-foreground text-center">
                    <QrCode className="w-12 h-12 mx-auto opacity-30" />
                    <p className="text-xs">QR Code akan muncul di sini setelah sesi dimulai.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Queue & Logs Section */}
          <Card>
            <CardHeader className="pb-3 border-b flex flex-row items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-honey" /> Antrean Pengiriman Resi
                </CardTitle>
                <CardDescription>
                  Ada <strong>{pendingOrders?.length || 0}</strong> pesanan yang resinya siap dikirim.
                </CardDescription>
              </div>

              <div className="flex gap-2">
                {pendingOrders && pendingOrders.length > 0 && !queueActive && (
                  <Button 
                    onClick={handleClearAllQueue} 
                    variant="outline"
                    className="text-destructive border-destructive/20 hover:bg-destructive/10"
                  >
                    <Trash2 className="w-4 h-4 mr-2" /> Hapus Semua Antrean
                  </Button>
                )}
                <Button 
                  onClick={toggleQueue} 
                  disabled={!pendingOrders || pendingOrders.length === 0 || sessionStatus !== "WORKING"}
                  variant={queueActive ? "destructive" : "default"}
                  className={queueActive ? "" : "bg-honey hover:bg-honey-dark text-honey-foreground"}
                >
                  {queueActive ? (
                    <><Pause className="w-4 h-4 mr-2" /> Jeda Pengiriman</>
                  ) : (
                    <><Play className="w-4 h-4 mr-2" /> Mulai Kirim Sekarang</>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {/* Queue Progress Bar */}
              {queueActive && pendingOrders && pendingOrders.length > 0 && (
                <div className="px-6 py-4 bg-honey/5 border-b space-y-2">
                  <div className="flex justify-between text-xs font-semibold">
                    <span>Progres Pengiriman Antrean</span>
                    <span>{queueIndex} dari {pendingOrders.length} Pesanan</span>
                  </div>
                  <Progress value={(queueIndex / pendingOrders.length) * 100} className="h-2" />
                </div>
              )}

              {/* Table of pending orders */}
              <div className="max-h-60 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama Pelanggan</TableHead>
                      <TableHead>Nomor HP</TableHead>
                      <TableHead>No. Resi</TableHead>
                      <TableHead>Tanggal Order</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-16 text-center">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingOrders ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          Memuat data antrean...
                        </TableCell>
                      </TableRow>
                    ) : !pendingOrders || pendingOrders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          Tidak ada pesanan resi yang perlu dikirim (semua sudah terkirim atau belum diinput resi).
                        </TableCell>
                      </TableRow>
                    ) : (
                      pendingOrders.map((o, idx) => (
                        <TableRow 
                          key={o.id}
                          className={queueActive && idx === queueIndex ? "bg-honey/10 font-medium animate-pulse" : ""}
                        >
                          <TableCell>{o.customer_name || "—"}</TableCell>
                          <TableCell>{o.customer_phone || "—"}</TableCell>
                          <TableCell className="font-mono text-xs text-honey-dark font-bold">{o.tracking_number}</TableCell>
                          <TableCell>{new Date(o.created_at).toLocaleDateString("id-ID")}</TableCell>
                          <TableCell>
                            {queueActive && idx === queueIndex ? (
                              <Badge variant="warning">Mengirim...</Badge>
                            ) : queueActive && idx < queueIndex ? (
                              <Badge variant="success">Terkirim</Badge>
                            ) : (
                              <Badge variant="secondary">Antre</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              disabled={queueActive && idx === queueIndex}
                              onClick={() => handleSkipOrder(o.id)}
                              title="Hapus dari antrean"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Logs Console */}
              <div className="border-t p-4 bg-muted/40 font-mono text-xs">
                <div className="text-muted-foreground border-b pb-1.5 mb-2 font-semibold flex items-center justify-between">
                  <span>Konsol Log Pengiriman WAHA</span>
                  {queueLogs.length > 0 && (
                    <Button 
                      variant="ghost" 
                      className="h-5 text-[10px] px-1.5 py-0 text-muted-foreground hover:text-foreground"
                      onClick={() => setQueueLogs([])}
                    >
                      Bersihkan Log
                    </Button>
                  )}
                </div>
                <div className="max-h-36 overflow-y-auto space-y-1 text-slate-700 dark:text-slate-300">
                  {queueLogs.length === 0 ? (
                    <p className="text-muted-foreground italic text-center py-4">Konsol kosong. Mulai pengiriman untuk melihat log.</p>
                  ) : (
                    queueLogs.map((log, i) => <p key={i} className="whitespace-pre-wrap">{log}</p>)
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* CRM Left Column: Configurations */}
          <div className="space-y-6 lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Settings className="w-5 h-5 text-honey" /> Konfigurasi CRM
                </CardTitle>
                <CardDescription>Atur jeda waktu dan aktifkan pengingat.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="crm-enabled" className="cursor-pointer font-medium">CRM Auto-Reminder</Label>
                    <p className="text-[10px] text-muted-foreground">Kirim pesan WA otomatis setelah jeda waktu pembelian.</p>
                  </div>
                  <Switch 
                    id="crm-enabled" 
                    checked={crmEnabled} 
                    onCheckedChange={handleToggleCrmEnabled}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="crm-delay">Jeda Pengingat</Label>
                    <div className="flex items-center gap-1.5">
                      <Input 
                        id="crm-delay"
                        type="number"
                        placeholder="45" 
                        value={crmDelayDays} 
                        onChange={(e) => setCrmDelayDays(Number(e.target.value))}
                        className="w-full"
                      />
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">Hari</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="crm-limit">Batas Harian</Label>
                    <div className="flex items-center gap-1.5">
                      <Input 
                        id="crm-limit"
                        type="number"
                        placeholder="50" 
                        value={crmMaxDailyLimit} 
                        onChange={(e) => setCrmMaxDailyLimit(Number(e.target.value))}
                        className="w-full"
                      />
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">Pesan</span>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-3 mt-3 space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground">Info Cron Pengingat CRM:</Label>
                  <div className="bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded border border-border/80 text-[10px] space-y-1 font-mono select-all">
                    <div className="text-slate-500 dark:text-slate-400 break-all font-semibold">GET https://app.araahoney.my.id/api/cron/send-crm-reminders</div>
                    <div className="text-slate-400 dark:text-slate-500 break-all">Header: Authorization: Bearer 5b8ab0ab88d7cbe1f85d7ca34e68a2ac</div>
                  </div>
                  <p className="text-[9px] text-muted-foreground leading-normal">
                    Cron bawaan Vercel berjalan harian, namun karena batasan Vercel Hobby (10 detik), disarankan mendaftarkan URL & Header di atas ke **cron-job.org** dengan frekuensi **setiap 1 menit** (mengirim 1 pesan per menit secara bertahap hingga batas kuota harian tercapai) agar pengiriman aman dari spam & server tidak timeout.
                  </p>
                  
                  <div className="border-t pt-3 mt-1 space-y-2">
                    <Label className="text-xs font-semibold text-muted-foreground">Sinkronisasi Seluruh Data Penjualan Lama:</Label>
                    <p className="text-[9px] text-muted-foreground leading-normal">
                      Tarik data seluruh pesanan lama (dari WhatsApp & sukses) sejak transaksi paling awal tercatat di database ke dalam antrean CRM. Hanya mengambil pesanan terbaru untuk masing-masing konsumen.
                    </p>
                    <Button
                      onClick={handleBackfillCrm}
                      disabled={backfilling || !crmEnabled}
                      variant="outline"
                      className="w-full text-xs font-semibold border-honey/20 hover:bg-honey/10 text-honey-dark flex items-center justify-center gap-1.5"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${backfilling ? "animate-spin" : ""}`} />
                      {backfilling ? "Menyinkronkan..." : "Sinkronkan Semua Data Lama"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-honey" /> Template CRM
                </CardTitle>
                <CardDescription>Format pesan pengingat repeat order.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <textarea
                    id="crm-template"
                    ref={crmTextareaRef}
                    rows={8}
                    className="flex min-h-[160px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    value={crmTemplate}
                    onChange={(e) => setCrmTemplate(e.target.value)}
                    placeholder="Masukkan format pesan CRM..."
                  />
                </div>

                <div className="space-y-1 text-xs">
                  <Label className="text-muted-foreground font-semibold">Placeholder yang tersedia:</Label>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <Badge 
                      variant="outline" 
                      className="cursor-pointer hover:bg-accent select-none" 
                      onClick={() => insertCrmPlaceholder("{customer_name}")}
                    >
                      {`{customer_name}`}
                    </Badge>
                    <Badge 
                      variant="outline" 
                      className="cursor-pointer hover:bg-accent select-none" 
                      onClick={() => insertCrmPlaceholder("{honey_type}")}
                    >
                      {`{honey_type}`}
                    </Badge>
                    <Badge 
                      variant="outline" 
                      className="cursor-pointer hover:bg-accent select-none" 
                      onClick={() => insertCrmPlaceholder("{last_order_date}")}
                    >
                      {`{last_order_date}`}
                    </Badge>
                  </div>
                </div>

                <div className="mt-3 p-3 bg-muted/30 rounded-lg border border-border/80 text-xs space-y-1.5">
                  <span className="font-semibold text-muted-foreground">Pratinjau Pesan:</span>
                  <div className="bg-white dark:bg-slate-950 p-2.5 rounded border border-border text-slate-800 dark:text-slate-200 whitespace-pre-wrap font-sans leading-relaxed">
                    {crmTemplate
                      .replace(/{customer_name}/g, "Opa Fandra")
                      .replace(/{honey_type}/g, "Madu Akasia & Randu")
                      .replace(/{last_order_date}/g, "24 Mei 2026")}
                  </div>
                </div>

                <Button onClick={handleSaveCrmConfig} className="w-full bg-honey hover:bg-honey-dark text-honey-foreground">
                  Simpan Konfigurasi & Template
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* CRM Right Column: Queues and History */}
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Clock className="w-5 h-5 text-honey" /> Antrean CRM Aktif
                  </CardTitle>
                  <CardDescription>
                    Ada <strong>{activeReminders?.length || 0}</strong> antrean pengingat pending berikutnya.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[300px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nama Pelanggan</TableHead>
                        <TableHead>Nomor HP</TableHead>
                        <TableHead>Madu Dibeli</TableHead>
                        <TableHead>Jadwal Kirim</TableHead>
                        <TableHead className="w-28 text-center">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingActiveReminders ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                            Memuat data antrean CRM...
                          </TableCell>
                        </TableRow>
                      ) : !activeReminders || activeReminders.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                            Tidak ada antrean pengingat aktif (semua sudah terkirim atau dinonaktifkan).
                          </TableCell>
                        </TableRow>
                      ) : (
                        activeReminders.map((rem: any) => (
                          <TableRow key={rem.id}>
                            <TableCell className="font-medium">{rem.customer_name}</TableCell>
                            <TableCell>{rem.customer_phone}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="bg-honey/5 border-honey/20 text-honey-dark font-semibold">
                                {rem.honey_type}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-semibold text-xs">
                              {new Date(rem.scheduled_for).toLocaleDateString("id-ID", {
                                day: "numeric",
                                month: "short",
                                year: "numeric"
                              })}
                            </TableCell>
                            <TableCell className="text-center flex justify-center gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs border-honey/20 hover:bg-honey/10 text-honey-dark"
                                disabled={sendingReminderId === rem.id}
                                onClick={() => handleSendReminderNow(rem)}
                              >
                                {sendingReminderId === rem.id ? "..." : <Send className="w-3.5 h-3.5" />}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                disabled={sendingReminderId === rem.id}
                                onClick={() => handleCancelReminder(rem.id)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-honey" /> Riwayat Pengiriman CRM (50 Terakhir)
                </CardTitle>
                <CardDescription>Catatan pengiriman pengingat otomatis maupun manual.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[300px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nama Pelanggan</TableHead>
                        <TableHead>Nomor HP</TableHead>
                        <TableHead>Madu Dibeli</TableHead>
                        <TableHead>Tanggal Kirim</TableHead>
                        <TableHead className="w-24 text-center">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingCrmHistory ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                            Memuat data riwayat...
                          </TableCell>
                        </TableRow>
                      ) : !crmHistory || crmHistory.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                            Belum ada riwayat pengiriman CRM.
                          </TableCell>
                        </TableRow>
                      ) : (
                        crmHistory.map((h: any) => (
                          <TableRow key={h.id}>
                            <TableCell className="font-medium">{h.customer_name}</TableCell>
                            <TableCell>{h.customer_phone}</TableCell>
                            <TableCell>{h.honey_type}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {new Date(h.updated_at).toLocaleString("id-ID", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit"
                              })}
                            </TableCell>
                            <TableCell className="text-center">
                              {h.status === "sent" ? (
                                <Badge variant="success">Terkirim</Badge>
                              ) : h.status === "cancelled" ? (
                                <Badge variant="secondary">Batal</Badge>
                              ) : (
                                <Badge 
                                  variant="destructive" 
                                  title={h.error_message || "Gagal mengirim"} 
                                  className="cursor-help"
                                >
                                  Gagal
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

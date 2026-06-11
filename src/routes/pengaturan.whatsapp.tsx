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
  XCircle
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
  
  // WAHA Configurations (Persisted to localStorage)
  const [wahaUrl, setWahaUrl] = useState(() => localStorage.getItem("waha_url") || "http://localhost:3000");
  const [sessionName, setSessionName] = useState(() => localStorage.getItem("waha_session") || "default");
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("waha_api_key") || "");
  const [scheduleTime, setScheduleTime] = useState(() => localStorage.getItem("waha_schedule_time") || "19:00");
  const [intervalVal, setIntervalVal] = useState(() => localStorage.getItem("waha_send_interval") || "60"); // in seconds
  const [autoSchedule, setAutoSchedule] = useState(() => localStorage.getItem("waha_auto_schedule") === "true");

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
        .select("id, customer_name, customer_phone, tracking_number, created_at, resi_shared_via_wa, channel")
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

  // Save config helper
  const handleSaveConfig = () => {
    localStorage.setItem("waha_url", wahaUrl.trim());
    localStorage.setItem("waha_session", sessionName.trim());
    localStorage.setItem("waha_api_key", apiKey.trim());
    localStorage.setItem("waha_schedule_time", scheduleTime);
    localStorage.setItem("waha_send_interval", intervalVal);
    localStorage.setItem("waha_auto_schedule", String(autoSchedule));
    toast.success("Pengaturan berhasil disimpan!");
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
          url: `${wahaUrl}/api/sessions`,
          method: "POST",
          headers: getWahaHeaders(),
          body: { name: sessionName }
        })
      });
      const data = await safeJson(res);
      
      if (!res.ok) {
        // If session already exists, start it directly
        if (data.message && data.message.includes("already exists")) {
          const startRes = await fetch("/api/waha-proxy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url: `${wahaUrl}/api/sessions/${sessionName}/start`,
              method: "POST",
              headers: getWahaHeaders()
            })
          });
          const startData = await safeJson(startRes);
          if (!startRes.ok) {
            throw new Error(startData.message || "Gagal memulai sesi yang sudah ada.");
          }
          toast.success("Sesi yang sudah ada sedang dimulai...");
        } else {
          throw new Error(data.message || "Gagal menyalakan sesi.");
        }
      } else {
        // Sesi baru berhasil didaftarkan (201 Created), sekarang harus kita jalankan (start) secara eksplisit!
        const startRes = await fetch("/api/waha-proxy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: `${wahaUrl}/api/sessions/${sessionName}/start`,
            method: "POST",
            headers: getWahaHeaders()
          })
        });
        const startData = await safeJson(startRes);
        if (!startRes.ok) {
          throw new Error(startData.message || "Sesi baru didaftarkan, tetapi gagal dijalankan.");
        }
        toast.success("Sesi baru berhasil didaftarkan dan sedang dimulai...");
      }
      
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

  // Stop WAHA Session
  const handleStopSession = async () => {
    if (!confirm("Apakah Anda yakin ingin menghentikan sesi WhatsApp ini?")) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/waha-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: `${wahaUrl}/api/sessions/${sessionName}`,
          method: "DELETE",
          headers: getWahaHeaders()
        })
      });
      if (!res.ok) throw new Error("Gagal menghentikan sesi.");
      toast.success("Sesi dihentikan.");
      setSessionStatus("STOPPED");
    } catch (err: any) {
      toast.error(err.message || "Gagal menghentikan sesi.");
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
    
    // Construct message
    const message = `Halo Kak ${order.customer_name},\n\nPaket madu Araa Honey pesanan Kakak telah dikirim. \n\n*Resi Pengiriman:* ${order.tracking_number}\n\nKakak bisa melacak status pengiriman secara berkala di aplikasi pelacakan ekspedisi terkait. Terima kasih banyak telah berbelanja di Araa Honey! 🍯🐝`;

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
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Integrasi WhatsApp (WAHA)</h2>
        <p className="text-sm text-muted-foreground">Kirim resi pengiriman otomatis ke pelanggan menggunakan nomor WhatsApp Anda.</p>
      </div>

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
                  <p className="text-[10px] text-muted-foreground">Kirim resi saat jam terjadwal (browser harus terbuka).</p>
                </div>
                <Switch 
                  id="auto-schedule" 
                  checked={autoSchedule} 
                  onCheckedChange={(checked) => {
                    setAutoSchedule(checked);
                    localStorage.setItem("waha_auto_schedule", String(checked));
                  }}
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
                  ) : (
                    <>
                      <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0" />
                      <span>Sesi WAHA berhenti atau tidak terhubung. Jalankan sesi terlebih dahulu.</span>
                    </>
                  )}
                </div>

                <div className="flex gap-2">
                  {sessionStatus === "STOPPED" || sessionStatus === "DISCONNECTED" ? (
                    <Button 
                      onClick={handleStartSession} 
                      disabled={actionLoading || loadingStatus}
                      className="w-full bg-honey hover:bg-honey-dark text-honey-foreground"
                    >
                      {actionLoading ? "Menghubungkan..." : "Mulai Sesi WhatsApp"}
                    </Button>
                  ) : (
                    <Button 
                      variant="destructive"
                      onClick={handleStopSession} 
                      disabled={actionLoading}
                      className="w-full"
                    >
                      {actionLoading ? "Mematikan..." : "Putuskan Sesi WhatsApp"}
                    </Button>
                  )}
                  
                  <Button 
                    variant="outline" 
                    size="icon" 
                    onClick={() => checkSessionStatus()}
                    disabled={loadingStatus}
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
                              title="Lewatkan antrean"
                            >
                              <XCircle className="w-4 h-4" />
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
    </div>
  );
}

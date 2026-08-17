import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RequireAuth } from "@/components/require-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { formatIDR } from "@/lib/theme";
import { 
  Search, RotateCcw, AlertTriangle, CheckCircle2, HelpCircle, Trash2, 
  TrendingDown, TrendingUp, PackageCheck, PackageX, Truck, Calendar, DollarSign, Percent, ShieldCheck, ChevronDown, ChevronUp
} from "lucide-react";

export const Route = createFileRoute("/retur")({ component: () => <RequireAuth><Page /></RequireAuth> });

// Helper function to send follow-up WhatsApp message using WAHA proxy
const sendFollowUpMessage = async (order: any, config: any): Promise<boolean> => {
  if (!config || !config.wahaUrl || !config.sessionName) {
    console.warn("Konfigurasi WAHA tidak lengkap atau tidak ditemukan.");
    return false;
  }

  const phone = order.customer_phone;
  if (!phone) {
    console.warn("Nomor HP konsumen kosong.");
    return false;
  }

  // Format phone number
  const cleanPhone = phone.replace(/[^0-9]/g, ""); // remove all non-digits
  let wahaPhone = cleanPhone;
  if (cleanPhone.startsWith("0")) {
    wahaPhone = "62" + cleanPhone.slice(1);
  } else if (cleanPhone.startsWith("8")) {
    wahaPhone = "62" + cleanPhone;
  }
  const chatId = `${wahaPhone}@c.us`;

  const template = config.followUpTemplate || `Halo Kak {customer_name},\n\nKami mendapati paket madu Araa Honey Kakak dengan nomor resi {tracking_number} ({expedition}) dikembalikan oleh pihak ekspedisi (retur).\n\nBoleh kami tahu alasan paketnya diretur, Kak? Apakah kurir tidak datang ke alamat Kakak, atau ada kendala lain?\n\nJika memang ada kesalahan dari pihak kurir/ekspedisi, kami bersedia mengirimkan ulang paket yang baru secara gratis tanpa biaya tambahan untuk Kakak. 😊🍯\n\nTerima kasih banyak atas perhatiannya, Kak!`;

  const message = template
    .replace(/{customer_name}/g, order.customer_name || "")
    .replace(/{tracking_number}/g, order.tracking_number || "")
    .replace(/{expedition}/g, order.expedition || "");

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.apiKey) {
    headers["X-Api-Key"] = config.apiKey;
  }

  try {
    const res = await fetch("/api/waha-proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: `${config.wahaUrl}/api/sendText`,
        method: "POST",
        headers,
        body: {
          session: config.sessionName,
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
        url: `${config.wahaUrl}/api/messages/sendText`,
        method: "POST",
        headers,
        body: {
          session: config.sessionName,
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

function Page() {
  const qc = useQueryClient();
  const [resiSearch, setResiSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [activeOrder, setActiveOrder] = useState<any>(null);
  
  // State for return settings
  const [itemsCondition, setItemsCondition] = useState<Record<string, "aman" | "rusak">>({});
  const [returnShipping, setReturnShipping] = useState(0);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Cohort Return Analysis States
  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);
  const [showExpeditionDetails, setShowExpeditionDetails] = useState(false);

  const monthsIndo = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = `${monthsIndo[d.getMonth()]} ${d.getFullYear()}`;
    return { value: val, label };
  });

  const selectedMonthLabel = monthOptions.find((m) => m.value === selectedMonth)?.label || selectedMonth;

  // Cohort Return Statistics Query (Based on order created_at month)
  const { data: cohortStats, isLoading: loadingCohort } = useQuery({
    queryKey: ["cohort-return-stats", selectedMonth],
    queryFn: async () => {
      const [y, m] = selectedMonth.split("-").map(Number);
      const startDate = `${selectedMonth}-01T00:00:00.000Z`;
      const lastDay = new Date(y, m, 0).getDate();
      const endDate = `${selectedMonth}-${String(lastDay).padStart(2, "0")}T23:59:59.999Z`;

      const { data, error } = await supabase
        .from("orders")
        .select("id, returned, subtotal_gross, cogs_total, expedition")
        .gte("created_at", startDate)
        .lte("created_at", endDate);

      if (error) throw error;
      const orders = data || [];
      const totalOrders = orders.length;
      const returnedOrders = orders.filter((o: any) => o.returned).length;
      const deliveredOrders = totalOrders - returnedOrders;
      const returnRate = totalOrders > 0 ? (returnedOrders / totalOrders) * 100 : 0;
      const totalGross = orders.reduce((sum: number, o: any) => sum + (Number(o.subtotal_gross) || 0), 0);
      const returnedGross = orders.filter((o: any) => o.returned).reduce((sum: number, o: any) => sum + (Number(o.subtotal_gross) || 0), 0);
      const returnedCogs = orders.filter((o: any) => o.returned).reduce((sum: number, o: any) => sum + (Number(o.cogs_total) || 0), 0);

      // Group by courier / expedition
      const expMap: Record<string, { courier: string; total: number; returned: number }> = {};
      orders.forEach((o: any) => {
        const courier = (o.expedition || "").trim() || "Lainnya";
        if (!expMap[courier]) {
          expMap[courier] = { courier, total: 0, returned: 0 };
        }
        expMap[courier].total += 1;
        if (o.returned) {
          expMap[courier].returned += 1;
        }
      });

      const expeditionBreakdown = Object.values(expMap)
        .map((item) => ({
          ...item,
          returnRate: item.total > 0 ? (item.returned / item.total) * 100 : 0,
        }))
        .sort((a, b) => b.total - a.total);

      return {
        totalOrders,
        returnedOrders,
        deliveredOrders,
        returnRate,
        totalGross,
        returnedGross,
        returnedCogs,
        expeditionBreakdown,
      };
    },
  });

  // Fetch WAHA Config from Supabase database for follow-up message sending
  const { data: wahaConfig } = useQuery({
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
      return (data?.value as any) || null;
    }
  });

  const handleDeleteReturn = async (returnId: string) => {
    const isConfirmed = window.confirm(
      "Apakah Anda yakin ingin membatalkan retur ini? Stok madu & kemasan akan ditarik kembali, dan pengeluaran operasional terkait akan dihapus."
    );
    if (!isConfirmed) return;

    setDeletingId(returnId);
    try {
      const { error } = await supabase.rpc("delete_order_return" as any, {
        _return_id: returnId
      });

      if (error) {
        toast.error("Gagal menghapus retur: " + error.message);
      } else {
        toast.success("Retur berhasil dibatalkan dan dihapus!");
        qc.invalidateQueries();
      }
    } catch (err: any) {
      toast.error("Terjadi kesalahan saat menghapus retur");
    } finally {
      setDeletingId(null);
    }
  };

  // Fetch recent returns
  const { data: returns } = useQuery({
    queryKey: ["order-returns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_returns" as any)
        .select("*, orders(customer_name, channel)")
        .order("created_at", { ascending: false } as any)
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });

  const searchOrder = async () => {
    const term = resiSearch.trim();
    if (!term) return toast.error("Masukkan nomor resi terlebih dahulu");
    setSearching(true);
    setActiveOrder(null);
    try {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          *,
          order_items (
            *,
            product_sizes (
              name,
              weight_grams
            )
          )
        `)
        .ilike("tracking_number", term);

      setSearching(false);

      if (error) {
        toast.error("Error mencari pesanan: " + error.message);
        return;
      }

      if (!data || data.length === 0) {
        toast.error("Pesanan dengan resi tersebut tidak ditemukan");
        return;
      }

      const order = data[0];
      if (order.returned) {
        toast.warning("Pesanan ini sudah berstatus Retur sebelumnya");
      }

      setActiveOrder(order);
      
      // Initialize items condition to 'aman' for all items
      const initialConditions: Record<string, "aman" | "rusak"> = {};
      (order.order_items ?? []).forEach((item: any) => {
        const key = `${item.size_id}-${item.honey_type || "Lainnya"}`;
        initialConditions[key] = "aman";
      });
      setItemsCondition(initialConditions);
      setReturnShipping(0);
      setNotes("");

    } catch (err: any) {
      setSearching(false);
      toast.error("Terjadi kesalahan pencarian");
    }
  };

  const processReturn = async () => {
    if (!activeOrder) return;
    if (activeOrder.returned) {
      return toast.error("Pesanan ini sudah diproses retur sebelumnya.");
    }

    setSubmitting(true);
    try {
      // Map itemsCondition to JSONB array expected by the RPC function
      const conditionsArray = (activeOrder.order_items ?? []).map((item: any) => {
        const key = `${item.size_id}-${item.honey_type || "Lainnya"}`;
        return {
          size_id: item.size_id,
          honey_type: item.honey_type || "Lainnya",
          qty: item.qty,
          condition: itemsCondition[key] || "aman"
        };
      });

      const { error } = await supabase.rpc("process_order_return" as any, {
        _order_id: activeOrder.id,
        _items_condition: conditionsArray,
        _return_shipping_fee: returnShipping,
        _notes: notes.trim() || null
      });

      setSubmitting(false);

      if (error) {
        toast.error("Gagal memproses retur: " + error.message);
      } else {
        toast.success("Retur berhasil diproses! Stok disesuaikan & pengeluaran dicatat.");
        
        // Trigger follow-up WhatsApp message if phone number exists and WAHA configuration is present
        if (activeOrder.customer_phone && activeOrder.customer_phone.trim() && wahaConfig && wahaConfig.wahaUrl) {
          const promise = sendFollowUpMessage(activeOrder, wahaConfig).then((success) => {
            if (!success) throw new Error("Gagal mengirim pesan melalui gateway WhatsApp");
            return "Pesan follow-up retur berhasil terkirim ke WhatsApp konsumen!";
          });

          toast.promise(promise, {
            loading: "Mengirim pesan follow-up otomatis ke WhatsApp konsumen...",
            success: (data) => data,
            error: (err) => err.message || "Gagal mengirim pesan follow-up otomatis."
          });
        } else if (!activeOrder.customer_phone || !activeOrder.customer_phone.trim()) {
          console.log("Follow-up WhatsApp dilewati karena nomor HP kosong.");
        } else {
          console.log("Follow-up WhatsApp dilewati karena konfigurasi WAHA belum diset.");
        }

        setActiveOrder(null);
        setResiSearch("");
        qc.invalidateQueries();
      }
    } catch (err: any) {
      setSubmitting(false);
      toast.error("Terjadi kesalahan memproses retur");
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <RotateCcw className="h-6 w-6 text-rose-500" />
            Pencatatan & Analisis Retur
          </h2>
          <p className="text-sm text-muted-foreground">
            Pantau persentase retur bulanan (Metode Cohort) dan proses pesanan retur fisik masuk ke gudang.
          </p>
        </div>

        {/* Month Selector for Cohort Analysis */}
        <div className="flex items-center gap-2 bg-card p-1.5 rounded-xl border shadow-xs self-start sm:self-auto">
          <Calendar className="h-4 w-4 text-muted-foreground ml-2" />
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[180px] h-9 border-none shadow-none focus:ring-0">
              <SelectValue placeholder="Pilih Bulan" />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Widget Analisis Retur Bulanan (Metode Cohort) */}
      <Card className="border-muted/60 shadow-xs overflow-hidden bg-gradient-to-br from-card via-card to-rose-500/[0.02]">
        <CardHeader className="pb-3 border-b border-muted/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
                <Percent className="w-4 h-4" />
              </div>
              Statistik Retur Batch: {selectedMonthLabel}
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Metode Cohort: Dihitung berdasarkan tanggal order terbit di bulan {selectedMonthLabel} (bukan tanggal fisik retur sampai).
            </CardDescription>
          </div>

          {cohortStats && (
            <div className="flex items-center gap-2 self-start sm:self-auto">
              {cohortStats.returnRate < 8 ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Kondisi Sehat (&lt;8%)
                </span>
              ) : cohortStats.returnRate <= 15 ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Kondisi Normal (8-15%)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 animate-pulse">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Waspada: Retur Tinggi (&gt;15%)
                </span>
              )}
            </div>
          )}
        </CardHeader>

        <CardContent className="pt-5 space-y-5">
          {loadingCohort ? (
            <div className="py-8 text-center text-xs text-muted-foreground">Memuat statistik retur bulan {selectedMonthLabel}...</div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Total Order Dikirim */}
                <div className="p-4 rounded-xl bg-card border border-muted/50 space-y-1 shadow-2xs">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Total Order Dikirim</span>
                    <Truck className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="text-2xl font-bold">{cohortStats?.totalOrders.toLocaleString("id-ID") ?? 0}</div>
                  <div className="text-[11px] text-muted-foreground">
                    Omzet Terbit: {formatIDR(cohortStats?.totalGross ?? 0)}
                  </div>
                </div>

                {/* 2. Order Sukses Terkirim */}
                <div className="p-4 rounded-xl bg-card border border-muted/50 space-y-1 shadow-2xs">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Sukses Diterima (Delivered)</span>
                    <PackageCheck className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {cohortStats?.deliveredOrders.toLocaleString("id-ID") ?? 0}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Tingkat Sukses: {cohortStats && cohortStats.totalOrders > 0 ? ((cohortStats.deliveredOrders / cohortStats.totalOrders) * 100).toFixed(1) : 0}%
                  </div>
                </div>

                {/* 3. Total Retur & Persentase */}
                <div className="p-4 rounded-xl bg-gradient-to-br from-rose-500/10 via-rose-500/5 to-transparent border border-rose-500/20 space-y-1 shadow-2xs">
                  <div className="flex items-center justify-between text-xs font-semibold text-rose-600 dark:text-rose-400">
                    <span>Tingkat Retur (RTS Rate)</span>
                    <PackageX className="w-4 h-4 text-rose-500" />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-extrabold text-rose-600 dark:text-rose-400">
                      {cohortStats?.returnRate.toFixed(2) ?? 0}%
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({cohortStats?.returnedOrders ?? 0} paket)
                    </span>
                  </div>
                  {/* Progress bar visual */}
                  <div className="w-full bg-muted/60 h-1.5 rounded-full overflow-hidden mt-2">
                    <div 
                      className={`h-full rounded-full transition-all ${
                        (cohortStats?.returnRate ?? 0) < 8 
                          ? "bg-emerald-500" 
                          : (cohortStats?.returnRate ?? 0) <= 15 
                          ? "bg-amber-500" 
                          : "bg-rose-500"
                      }`}
                      style={{ width: `${Math.min(cohortStats?.returnRate ?? 0, 100)}%` }}
                    />
                  </div>
                </div>

                {/* 4. Dampak Finansial Retur */}
                <div className="p-4 rounded-xl bg-card border border-muted/50 space-y-1 shadow-2xs">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Omzet Retur (Batal)</span>
                    <DollarSign className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="text-xl font-bold text-foreground">
                    {formatIDR(cohortStats?.returnedGross ?? 0)}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Beban HPP Produk: {formatIDR(cohortStats?.returnedCogs ?? 0)}
                  </div>
                </div>
              </div>

              {/* Rincian per Ekspedisi (Collapsible) */}
              {cohortStats && cohortStats.expeditionBreakdown.length > 0 && (
                <div className="pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowExpeditionDetails(!showExpeditionDetails)}
                    className="w-full justify-between text-xs font-semibold text-muted-foreground hover:text-foreground border border-muted/40 h-8 px-3 rounded-lg"
                  >
                    <span className="flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5 text-muted-foreground" />
                      Rincian Persentase Retur per Ekspedisi / Kurir ({cohortStats.expeditionBreakdown.length} kurir)
                    </span>
                    {showExpeditionDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </Button>

                  {showExpeditionDetails && (
                    <div className="mt-3 rounded-xl border border-muted/50 overflow-hidden shadow-2xs bg-card">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/30 text-xs">
                            <TableHead className="py-2">Ekspedisi</TableHead>
                            <TableHead className="py-2 text-right">Total Kirim</TableHead>
                            <TableHead className="py-2 text-right">Sukses</TableHead>
                            <TableHead className="py-2 text-right">Retur</TableHead>
                            <TableHead className="py-2 text-right font-bold">% Retur</TableHead>
                            <TableHead className="py-2 text-center">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {cohortStats.expeditionBreakdown.map((exp: any) => (
                            <TableRow key={exp.courier} className="text-xs">
                              <TableCell className="font-semibold py-2.5">{exp.courier}</TableCell>
                              <TableCell className="text-right py-2.5">{exp.total.toLocaleString("id-ID")}</TableCell>
                              <TableCell className="text-right py-2.5 text-emerald-600 font-medium">{(exp.total - exp.returned).toLocaleString("id-ID")}</TableCell>
                              <TableCell className="text-right py-2.5 text-rose-600 font-medium">{exp.returned.toLocaleString("id-ID")}</TableCell>
                              <TableCell className="text-right py-2.5 font-bold">{exp.returnRate.toFixed(2)}%</TableCell>
                              <TableCell className="text-center py-2.5">
                                {exp.returnRate < 8 ? (
                                  <span className="text-[10px] bg-emerald-500/10 text-emerald-600 font-semibold px-2 py-0.5 rounded-full">Sehat</span>
                                ) : exp.returnRate <= 15 ? (
                                  <span className="text-[10px] bg-amber-500/10 text-amber-600 font-semibold px-2 py-0.5 rounded-full">Normal</span>
                                ) : (
                                  <span className="text-[10px] bg-rose-500/10 text-rose-600 font-semibold px-2 py-0.5 rounded-full">Tinggi</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: search and process form */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Cari Pesanan dari Nomor Resi</CardTitle>
              <CardDescription>Masukkan nomor resi pengiriman (Shopee, Tiktok, WA, dll) untuk memproses retur.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  value={resiSearch}
                  onChange={(e) => setResiSearch(e.target.value)}
                  placeholder="Masukkan nomor resi (contoh: JP83920192)"
                  onKeyDown={(e) => e.key === "Enter" && searchOrder()}
                />
                <Button onClick={searchOrder} disabled={searching} className="gap-2">
                  <Search className="h-4 w-4" />
                  Cari
                </Button>
              </div>
            </CardContent>
          </Card>

          {activeOrder && (
            <Card className="border-honey/40 bg-honey/5">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">Detail Pesanan Ditemukan</CardTitle>
                    <CardDescription>Resi: {activeOrder.tracking_number}</CardDescription>
                  </div>
                  {activeOrder.returned && (
                    <span className="bg-destructive text-destructive-foreground text-xs font-bold px-2 py-1 rounded">
                      SUDAH DIRETER
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Meta details */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-3 bg-background/80 rounded-xl text-xs border border-honey/20">
                  <div>
                    <div className="text-muted-foreground">Pelanggan</div>
                    <div className="font-semibold mt-0.5">{activeOrder.customer_name ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Saluran</div>
                    <div className="font-semibold capitalize mt-0.5">{activeOrder.channel}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Tanggal Pesanan</div>
                    <div className="font-semibold mt-0.5">{new Date(activeOrder.created_at).toLocaleDateString("id-ID")}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Nilai Bersih</div>
                    <div className="font-semibold mt-0.5">{formatIDR(activeOrder.net_revenue)}</div>
                  </div>
                </div>

                {/* Items selection */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold">Tentukan Kondisi Kemasan Per Item:</Label>
                  <Table className="bg-background border rounded-lg overflow-hidden">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Varian Madu</TableHead>
                        <TableHead>Ukuran</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead className="w-[220px]">Kondisi Kemasan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(activeOrder.order_items ?? []).map((item: any) => {
                        const key = `${item.size_id}-${item.honey_type || "Lainnya"}`;
                        const currentCond = itemsCondition[key] || "aman";
                        return (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.honey_type || "Lainnya"}</TableCell>
                            <TableCell>{item.product_sizes?.name ?? "—"}</TableCell>
                            <TableCell>{item.qty} pcs</TableCell>
                            <TableCell>
                              <Select
                                value={currentCond}
                                onValueChange={(v: "aman" | "rusak") => setItemsCondition({ ...itemsCondition, [key]: v })}
                              >
                                <SelectTrigger className="h-8">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="aman" className="text-xs">
                                    🟢 Aman (Kemas/Jual Lagi)
                                  </SelectItem>
                                  <SelectItem value="rusak" className="text-xs">
                                    🔴 Rusak (Madu Bergas/Dibuang)
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Additional inputs */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="shipping">Ongkir Retur yang Kita Bayar (Rp)</Label>
                    <Input
                      id="shipping"
                      type="number"
                      value={returnShipping}
                      onChange={(e) => setReturnShipping(+e.target.value)}
                      placeholder="0 (Isi jika WA/Offline membayar ongkir retur)"
                    />
                    <p className="text-[10px] text-muted-foreground">Untuk marketplace (Shopee/Tiktok) umumnya gratis (isi 0).</p>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="notes">Catatan Tambahan Retur</Label>
                    <Input
                      id="notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Contoh: Gagal kirim kurir, konsumen menolak"
                    />
                  </div>
                </div>

                {/* Submit button */}
                <div className="flex gap-2 justify-end pt-2">
                  <Button variant="outline" onClick={() => setActiveOrder(null)}>Batal</Button>
                  <Button
                    onClick={processReturn}
                    disabled={submitting || activeOrder.returned}
                    className="bg-honey hover:bg-honey/95 text-white"
                  >
                    {submitting ? "Memproses..." : "Proses Konfirmasi Retur"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column: rules & guide */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <HelpCircle className="h-4 w-4 text-honey" />
                Ketentuan Retur Araa Honey
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs space-y-3 text-muted-foreground leading-relaxed">
              <div className="flex gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                <p>
                  <strong>Madu Selalu Aman:</strong> Stok madu (dalam kg) dari semua item yang diretur akan otomatis ditambahkan kembali ke saldo Dandang masing-masing jenis madu.
                </p>
              </div>
              <div className="flex gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <p>
                  <strong>Bahan Packing Luar Rusak:</strong> Kardus, bubble wrap, dan lakban selalu dianggap rusak/terbuang. Biayanya dimasukkan sebagai kerugian operasional.
                </p>
              </div>
              <div className="flex gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                <p>
                  <strong>Kondisi Rusak (Madu Bergas):</strong> Jika dipilih kondisi ini, stok botol, stiker, dan segel tidak akan dikembalikan ke inventaris. Biaya kemasannya dimasukkan sebagai kerugian bersama ongkir retur.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Return history list */}
      <Card>
        <CardHeader>
          <CardTitle>Riwayat Transaksi Retur Terakhir</CardTitle>
          <CardDescription>Daftar pesanan retur yang telah berhasil diproses.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal Retur</TableHead>
                <TableHead>No. Resi</TableHead>
                <TableHead>Pelanggan</TableHead>
                <TableHead>Ongkir Retur</TableHead>
                <TableHead>Kerugian Kemasan</TableHead>
                <TableHead>Total Kerugian</TableHead>
                <TableHead>Catatan</TableHead>
                <TableHead className="w-[100px] text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(returns ?? []).map((ret: any) => (
                <TableRow key={ret.id}>
                  <TableCell>{new Date(ret.created_at).toLocaleString("id-ID")}</TableCell>
                  <TableCell className="font-mono text-xs">{ret.tracking_number ?? "—"}</TableCell>
                  <TableCell>
                    <span className="font-medium">{ret.orders?.customer_name ?? "—"}</span>
                    <span className="ml-1.5 text-[10px] text-muted-foreground capitalize">({ret.orders?.channel ?? "—"})</span>
                  </TableCell>
                  <TableCell>{formatIDR(ret.return_shipping_fee)}</TableCell>
                  <TableCell>{formatIDR(ret.packaging_loss)}</TableCell>
                  <TableCell className="font-semibold text-destructive">{formatIDR(ret.total_loss)}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{ret.notes ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleDeleteReturn(ret.id)}
                      disabled={deletingId === ret.id}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!returns?.length && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    Belum ada riwayat transaksi retur
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

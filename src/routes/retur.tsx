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
import { Search, RotateCcw, AlertTriangle, CheckCircle2, HelpCircle, Trash2 } from "lucide-react";

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
      <div>
        <h2 className="text-2xl font-semibold">Pencatatan Barang Retur</h2>
        <p className="text-sm text-muted-foreground">
          Proses pesanan retur (gagal COD/kirim) berdasarkan nomor resi. Stok madu akan dikembalikan ke dandang, dan kemasan luar (kardus/bubble) dianggap rusak otomatis.
        </p>
      </div>

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

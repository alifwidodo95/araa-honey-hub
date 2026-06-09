import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RequireAuth } from "@/components/require-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { formatIDR } from "@/lib/theme";

export const Route = createFileRoute("/penjualan")({ component: () => <RequireAuth><Page /></RequireAuth> });

type Channel = "shopee" | "tiktok" | "whatsapp" | "reseller" | "offline";

function Page() {
  const qc = useQueryClient();
  const { data: sizes } = useQuery({
    queryKey: ["sizes"], queryFn: async () => (await supabase.from("product_sizes").select("*").order("sort_order")).data ?? [],
  });
  const { data: retail } = useQuery({
    queryKey: ["retail"], queryFn: async () => (await supabase.from("retail_prices").select("*")).data ?? [],
  });
  const { data: tiers } = useQuery({
    queryKey: ["tiers"], queryFn: async () => (await supabase.from("reseller_tiers").select("*").eq("active", true)).data ?? [],
  });
  const { data: resellerPrices } = useQuery({
    queryKey: ["resellerPrices"], queryFn: async () => (await supabase.from("reseller_prices").select("*")).data ?? [],
  });
  const { data: fees } = useQuery({
    queryKey: ["fees"], queryFn: async () => (await supabase.from("marketplace_fees").select("*")).data ?? [],
  });
  const { data: orders } = useQuery({
    queryKey: ["orders-recent"], queryFn: async () => (await supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(15)).data ?? [],
  });

  const [channel, setChannel] = useState<Channel>("shopee");
  const [tierId, setTierId] = useState<string>("");
  const [shipping, setShipping] = useState(0);
  const [note, setNote] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [amountReceived, setAmountReceived] = useState<number | "">("");
  const [items, setItems] = useState<{ size_id: string; qty: number; unit_price: number; honey_type: string }[]>([]);

  const HONEY_TYPES = ["Akasia", "Randu", "Karet", "Lainnya"];
  const showPhone = channel === "whatsapp" || channel === "reseller" || channel === "offline";

  const priceFor = (size_id: string) => {
    if (channel === "reseller" && tierId) {
      return Number(resellerPrices?.find((r: any) => r.tier_id === tierId && r.size_id === size_id)?.price ?? 0);
    }
    return Number(retail?.find((r: any) => r.size_id === size_id)?.price ?? 0);
  };

  const addItem = () => {
    const firstSize: any = sizes?.[0];
    if (!firstSize?.id) return;
    setItems([...items, { size_id: firstSize.id as string, qty: 1, unit_price: priceFor(firstSize.id), honey_type: "Akasia" }]);
  };
  const updateItem = (i: number, patch: Partial<{ size_id: string; qty: number; unit_price: number; honey_type: string }>) => {
    setItems(items.map((it, idx) => (idx === i ? { ...it, ...patch, ...(patch.size_id ? { unit_price: priceFor(patch.size_id) } : {}) } : it)));
  };
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));

  const subtotal = useMemo(() => items.reduce((s, it) => s + it.qty * it.unit_price, 0), [items]);
  const feePct = Number(fees?.find((f: any) => f.channel === channel)?.fee_percent ?? 0);
  const mpFee = Math.round((subtotal * feePct) / 100);
  const received = amountReceived === "" ? 0 : Number(amountReceived);
  const net = received - shipping;

  const [submitting, setSubmitting] = useState(false);
  const submit = async () => {
    if (!customerName.trim()) return toast.error("Nama pelanggan wajib diisi");
    if (!items.length) return toast.error("Tambahkan item pesanan");
    if (channel === "reseller" && !tierId) return toast.error("Pilih tier reseller");
    setSubmitting(true);
    const { error } = await supabase.rpc("create_order", {
      _channel: channel,
      _tier_id: (channel === "reseller" ? tierId : null) as any,
      _items: items as any,
      _shipping_fee: channel === "whatsapp" ? shipping : 0,
      _customer_note: (note || null) as any,
      _customer_name: customerName.trim(),
      _customer_phone: (customerPhone.trim() || null) as any,
      _tracking_number: (trackingNumber.trim() || null) as any,
      _amount_received: (amountReceived === "" ? null : Number(amountReceived)) as any,
    });
    setSubmitting(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Pesanan diproses & stok dipotong otomatis");
      setItems([]); setShipping(0); setNote("");
      setCustomerName(""); setCustomerPhone(""); setTrackingNumber(""); setAmountReceived("");
      qc.invalidateQueries();
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h2 className="text-2xl font-semibold">Input Pesanan</h2>
        <p className="text-sm text-muted-foreground">Pilih saluran & ukuran — stok madu, botol, stiker, segel, dan packing dipotong otomatis.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Pesanan Baru</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label>Saluran Penjualan</Label>
              <Select value={channel} onValueChange={(v) => { setChannel(v as Channel); setItems(items.map(it => ({ ...it, unit_price: priceFor(it.size_id) }))); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="shopee">Shopee (fee 6%)</SelectItem>
                  <SelectItem value="tiktok">TikTok (fee 4%)</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp (Meta Ads)</SelectItem>
                  <SelectItem value="reseller">Reseller</SelectItem>
                  <SelectItem value="offline">Offline</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {channel === "reseller" && (
              <div className="space-y-1">
                <Label>Tier Reseller</Label>
                <Select value={tierId} onValueChange={setTierId}>
                  <SelectTrigger><SelectValue placeholder="Pilih tier" /></SelectTrigger>
                  <SelectContent>{(tiers ?? []).map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {channel === "whatsapp" && (
              <div className="space-y-1">
                <Label>Biaya Kirim / Agregator (Rp)</Label>
                <Input type="number" value={shipping} onChange={(e) => setShipping(+e.target.value)} />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Item Pesanan</Label>
              <Button size="sm" variant="outline" onClick={addItem}><Plus className="h-3 w-3 mr-1" /> Tambah</Button>
            </div>
            <Table>
              <TableHeader><TableRow><TableHead>Ukuran</TableHead><TableHead>Qty</TableHead><TableHead>Harga Satuan</TableHead><TableHead>Subtotal</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {items.map((it, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Select value={it.size_id} onValueChange={(v) => updateItem(i, { size_id: v })}>
                        <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>{(sizes ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell><Input type="number" min={1} className="w-20" value={it.qty} onChange={(e) => updateItem(i, { qty: +e.target.value })} /></TableCell>
                    <TableCell><Input type="number" className="w-32" value={it.unit_price} onChange={(e) => updateItem(i, { unit_price: +e.target.value })} /></TableCell>
                    <TableCell>{formatIDR(it.qty * it.unit_price)}</TableCell>
                    <TableCell><Button size="icon" variant="ghost" onClick={() => removeItem(i)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                  </TableRow>
                ))}
                {!items.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Belum ada item</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Nama Pelanggan *</Label>
              <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nama lengkap" />
            </div>
            <div className="space-y-1">
              <Label>No. HP</Label>
              <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="08xxxxxxxxxx" />
            </div>
            <div className="space-y-1">
              <Label>No. Resi</Label>
              <Input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} placeholder="Nomor resi pengiriman" />
            </div>
            <div className="space-y-1">
              <Label>Nominal Uang Diterima (Rp)</Label>
              <Input type="number" value={amountReceived} onChange={(e) => setAmountReceived(e.target.value === "" ? "" : +e.target.value)} placeholder="Contoh: 150000" />
            </div>
          </div>

          <div className="space-y-1"><Label>Catatan</Label><Input value={note} onChange={(e) => setNote(e.target.value)} /></div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-muted rounded-lg text-sm">
            <div><div className="text-muted-foreground">Subtotal</div><div className="font-semibold">{formatIDR(subtotal)}</div></div>
            <div><div className="text-muted-foreground">Fee Platform ({feePct}%)</div><div className="font-semibold">- {formatIDR(mpFee)}</div></div>
            <div><div className="text-muted-foreground">Ongkir/Agregator</div><div className="font-semibold">- {formatIDR(shipping)}</div></div>
            <div><div className="text-muted-foreground">Pendapatan Bersih</div><div className="font-bold text-honey">{formatIDR(net)}</div></div>
          </div>

          <Button onClick={submit} disabled={submitting || !items.length} className="w-full md:w-auto">Proses Pesanan</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Pesanan Terbaru</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Tanggal</TableHead><TableHead>Pelanggan</TableHead><TableHead>No. HP</TableHead><TableHead>Saluran</TableHead><TableHead>Resi</TableHead><TableHead>Subtotal</TableHead><TableHead>Bersih</TableHead></TableRow></TableHeader>
            <TableBody>
              {(orders ?? []).map((o: any) => (
                <TableRow key={o.id}>
                  <TableCell>{new Date(o.created_at).toLocaleString("id-ID")}</TableCell>
                  <TableCell>{o.customer_name ?? "-"}</TableCell>
                  <TableCell>{o.customer_phone ?? "-"}</TableCell>
                  <TableCell className="capitalize">{o.channel}</TableCell>
                  <TableCell className="font-mono text-xs">{o.tracking_number ?? "-"}</TableCell>
                  <TableCell>{formatIDR(o.subtotal_gross)}</TableCell>
                  <TableCell className="font-medium">{formatIDR(o.net_revenue)}</TableCell>
                </TableRow>
              ))}
              {!orders?.length && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Belum ada pesanan</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

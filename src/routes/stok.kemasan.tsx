import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RequireAuth } from "@/components/require-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { formatIDR } from "@/lib/theme";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/stok/kemasan")({ component: () => <RequireAuth><Page /></RequireAuth> });

const TYPES = ["botol", "stiker", "segel", "bubblewrap", "lakban", "kardus"] as const;

function Page() {
  const qc = useQueryClient();
  const { data: items } = useQuery({
    queryKey: ["pkg"],
    queryFn: async () => {
      const { data, error } = await supabase.from("packaging_items").select("*").order("type");
      if (error) {
        console.error("Error fetching packaging items:", error);
        toast.error("Gagal memuat item kemasan: " + error.message);
        throw error;
      }
      return data ?? [];
    },
  });
  const { data: sizes } = useQuery({
    queryKey: ["sizes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("product_sizes").select("*").order("weight_grams");
      if (error) {
        console.error("Error fetching product sizes:", error);
        toast.error("Gagal memuat ukuran produk: " + error.message);
        throw error;
      }
      return data ?? [];
    },
  });

  const [form, setForm] = useState({ item_id: "", qty: 0, total_price: 0, notes: "" });
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.item_id) return toast.error("Pilih item");
    setSubmitting(true);
    const { error } = await supabase.rpc("record_packaging_purchase", {
      _item_id: form.item_id, _qty: form.qty, _total: form.total_price,
      _date: new Date().toISOString().slice(0, 10), _note: form.notes || "",
    });
    setSubmitting(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Pembelian tercatat (stok & biaya diperbarui)");
      setForm({ item_id: "", qty: 0, total_price: 0, notes: "" });
      qc.invalidateQueries();
    }
  };

  // Add item dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [newItem, setNewItem] = useState({ type: "botol", name: "", unit: "pcs", size_id: "", min_stock: 10 });
  const addItem = async () => {
    if (!newItem.name.trim()) return toast.error("Nama item wajib diisi");
    const payload: any = {
      type: newItem.type,
      name: newItem.name.trim(),
      unit: newItem.unit || "pcs",
      size_id: newItem.size_id || null,
      min_stock: Number(newItem.min_stock) || 10,
    };
    const { error } = await supabase.from("packaging_items").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Item ditambahkan");
    setNewItem({ type: "botol", name: "", unit: "pcs", size_id: "", min_stock: 10 });
    setAddOpen(false);
    qc.invalidateQueries({ queryKey: ["pkg"] });
  };

  const deleteItem = async (id: string) => {
    const { error } = await supabase.from("packaging_items").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Item dihapus");
    qc.invalidateQueries({ queryKey: ["pkg"] });
  };

  const needsSize = newItem.type === "botol" || newItem.type === "stiker";

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h2 className="text-2xl font-semibold">Kemasan & Material Packing</h2>
        <p className="text-sm text-muted-foreground">Botol, stiker, segel, bubble wrap, kardus, lakban. Catat pembelian satu klik — stok bertambah, biaya tercatat otomatis.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Catat Pembelian Kemasan</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="md:col-span-2 space-y-1">
              <Label>Item</Label>
              <Select 
                value={form.item_id} 
                onValueChange={(v) => setForm({ ...form, item_id: v })}
                disabled={!items || items.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={items && items.length === 0 ? "Belum ada item, silakan tambah di bawah" : "Pilih item"} />
                </SelectTrigger>
                <SelectContent>
                  {(items ?? []).map((it: any) => (
                    <SelectItem key={it.id} value={it.id}>{it.name} ({it.unit})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Qty</Label><Input type="number" step="0.01" value={form.qty} onChange={(e) => setForm({ ...form, qty: +e.target.value })} required /></div>
            <div className="space-y-1"><Label>Total Harga (Rp)</Label><Input type="number" value={form.total_price} onChange={(e) => setForm({ ...form, total_price: +e.target.value })} required /></div>
            <div className="flex items-end"><Button type="submit" disabled={submitting} className="w-full">Simpan</Button></div>
            <div className="md:col-span-5 space-y-1"><Label>Catatan</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Stok Saat Ini</CardTitle>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-1" />Tambah Item</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Tambah Item Kemasan</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Tipe</Label>
                  <Select value={newItem.type} onValueChange={(v) => setNewItem({ ...newItem, type: v, size_id: "" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {needsSize && (
                  <div className="space-y-1">
                    <Label>Ukuran (opsional, untuk botol/stiker)</Label>
                    <Select value={newItem.size_id} onValueChange={(v) => setNewItem({ ...newItem, size_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Pilih ukuran" /></SelectTrigger>
                      <SelectContent>
                        {(sizes ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1"><Label>Nama Item</Label><Input value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} placeholder="contoh: Botol 300 gr" /></div>
                <div className="space-y-1"><Label>Unit</Label><Input value={newItem.unit} onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })} placeholder="pcs / meter / roll" /></div>
                <div className="space-y-1">
                  <Label>Batas Minimum Stok (Peringatan)</Label>
                  <Input type="number" value={newItem.min_stock} onChange={(e) => setNewItem({ ...newItem, min_stock: +e.target.value })} placeholder="10" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddOpen(false)}>Batal</Button>
                <Button onClick={addItem}>Simpan</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Tipe</TableHead><TableHead>Stok</TableHead><TableHead>Unit</TableHead><TableHead>HPP rata-rata</TableHead><TableHead>Batas Min.</TableHead><TableHead className="w-12"></TableHead></TableRow></TableHeader>
            <TableBody>
              {(items ?? []).map((it: any) => (
                <TableRow key={it.id} className={Number(it.current_stock) < Number(it.min_stock ?? 10) ? "bg-destructive/5" : ""}>
                  <TableCell className="font-medium">{it.name}</TableCell>
                  <TableCell className="capitalize">{it.type}</TableCell>
                  <TableCell className={Number(it.current_stock) < Number(it.min_stock ?? 10) ? "text-destructive font-bold" : ""}>
                    {Number(it.current_stock).toFixed(2)}
                  </TableCell>
                  <TableCell>{it.unit}</TableCell>
                  <TableCell>{formatIDR(it.avg_cost)}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      defaultValue={it.min_stock ?? 10}
                      onBlur={async (e) => {
                        const val = Number(e.target.value);
                        if (val === Number(it.min_stock)) return;
                        const { error } = await supabase
                          .from("packaging_items")
                          .update({ min_stock: val } as any)
                          .eq("id", it.id);
                        if (error) toast.error("Gagal memperbarui batas minimal: " + error.message);
                        else {
                          toast.success(`Batas minimal ${it.name} diperbarui ke ${val}`);
                          qc.invalidateQueries({ queryKey: ["pkg"] });
                        }
                      }}
                      className="w-20 h-8 text-center"
                    />
                  </TableCell>
                  <TableCell>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="w-4 h-4" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Hapus item "{it.name}"?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Riwayat pembelian item ini juga akan ikut terhapus. Tindakan tidak dapat dibatalkan.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Batal</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteItem(it.id)}>Hapus</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

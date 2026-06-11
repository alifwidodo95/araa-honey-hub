import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RequireAuth } from "@/components/require-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Pencil, Trash2 } from "lucide-react";
import { formatIDR } from "@/lib/theme";
import { toast } from "sonner";

export const Route = createFileRoute("/stok/bahan-baku")({ component: () => <RequireAuth><Page /></RequireAuth> });

type LotForm = {
  supplier: string;
  honey_type: string;
  jerigen_qty: number;
  grams_per_jerigen: number;
  price_total: number;
  notes: string;
};

const emptyForm: LotForm = { supplier: "", honey_type: "Akasia", jerigen_qty: 1, grams_per_jerigen: 50000, price_total: 0, notes: "" };

function Page() {
  const qc = useQueryClient();
  const { data: lots } = useQuery({
    queryKey: ["lots"],
    queryFn: async () => (await supabase.from("raw_material_lots").select("*").order("received_at", { ascending: false })).data ?? [],
  });
  const { data: variants } = useQuery({ 
    queryKey: ["variants"], 
    queryFn: async () => (await (supabase.from("honey_variants" as any) as any).select("*").eq("active", true).order("name")).data ?? [] 
  });

  const activeVariants = useMemo(() => {
    const list = (variants ?? []).map((v: any) => v.name);
    return list.length > 0 ? list : ["Akasia", "Randu", "Karet", "Lainnya"];
  }, [variants]);

  const [form, setForm] = useState<LotForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<LotForm>(emptyForm);

  const [isCustomVariant, setIsCustomVariant] = useState(false);
  const [customVariantName, setCustomVariantName] = useState("");
  const [isEditCustomVariant, setIsEditCustomVariant] = useState(false);
  const [editCustomVariantName, setEditCustomVariantName] = useState("");

  useEffect(() => {
    if (activeVariants.length > 0 && !activeVariants.includes(form.honey_type)) {
      setForm(prev => ({ ...prev, honey_type: activeVariants[0] }));
    }
  }, [activeVariants]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.grams_per_jerigen <= 0) return toast.error("Isi gram per jerigen");
    
    let activeHoneyType = form.honey_type;
    if (isCustomVariant) {
      const trimmed = customVariantName.trim();
      if (!trimmed) return toast.error("Tulis nama jenis madu baru");
      activeHoneyType = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
      
      // Insert custom variant if it does not exist
      if (!activeVariants.some((v: string) => v.toLowerCase() === activeHoneyType.toLowerCase())) {
        const { error: vError } = await supabase
          .from("honey_variants" as any)
          .insert({ name: activeHoneyType, active: true } as any);
        if (vError) return toast.error("Gagal mendaftarkan jenis madu: " + vError.message);
      }
    }

    setSubmitting(true);
    const { error } = await supabase.from("raw_material_lots").insert({
      supplier: form.supplier,
      jerigen_qty: form.jerigen_qty,
      kg_per_jerigen: form.grams_per_jerigen / 1000,
      grams_per_jerigen: form.grams_per_jerigen,
      honey_type: activeHoneyType,
      price_total: form.price_total,
      notes: form.notes,
      jerigen_remaining: form.jerigen_qty,
    } as any);
    setSubmitting(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Lot bahan baku tercatat");
      setForm(emptyForm);
      setCustomVariantName("");
      setIsCustomVariant(false);
      qc.invalidateQueries({ queryKey: ["lots"] });
      qc.invalidateQueries({ queryKey: ["variants"] });
    }
  };

  const openEdit = (l: any) => {
    if (l.jerigen_remaining !== l.jerigen_qty) {
      return toast.error("Lot sudah dipakai (sebagian dituang ke dandang). Tidak bisa diedit.");
    }
    setEditing(l);
    setIsEditCustomVariant(false);
    setEditCustomVariantName("");
    setEditForm({
      supplier: l.supplier ?? "",
      honey_type: l.honey_type ?? "Akasia",
      jerigen_qty: l.jerigen_qty,
      grams_per_jerigen: Number(l.grams_per_jerigen ?? l.kg_per_jerigen * 1000),
      price_total: Number(l.price_total),
      notes: l.notes ?? "",
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (editForm.grams_per_jerigen <= 0 || editForm.jerigen_qty <= 0) return toast.error("Input tidak valid");
    
    let activeHoneyType = editForm.honey_type;
    if (isEditCustomVariant) {
      const trimmed = editCustomVariantName.trim();
      if (!trimmed) return toast.error("Tulis nama jenis madu");
      activeHoneyType = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
      
      if (!activeVariants.some((v: string) => v.toLowerCase() === activeHoneyType.toLowerCase())) {
        const { error: vError } = await supabase
          .from("honey_variants" as any)
          .insert({ name: activeHoneyType, active: true } as any);
        if (vError) return toast.error("Gagal mendaftarkan jenis madu: " + vError.message);
      }
    }

    const { error } = await supabase.from("raw_material_lots").update({
      supplier: editForm.supplier,
      jerigen_qty: editForm.jerigen_qty,
      jerigen_remaining: editForm.jerigen_qty,
      kg_per_jerigen: editForm.grams_per_jerigen / 1000,
      grams_per_jerigen: editForm.grams_per_jerigen,
      honey_type: activeHoneyType,
      price_total: editForm.price_total,
      notes: editForm.notes,
    } as any).eq("id", editing.id);
    if (error) toast.error(error.message);
    else { 
      toast.success("Lot diperbarui"); 
      setEditing(null); 
      setEditCustomVariantName("");
      setIsEditCustomVariant(false);
      qc.invalidateQueries({ queryKey: ["lots"] }); 
      qc.invalidateQueries({ queryKey: ["variants"] });
    }
  };

  const handleDelete = async (l: any) => {
    if (l.jerigen_remaining !== l.jerigen_qty) {
      return toast.error("Lot sudah dipakai. Hapus dulu catatan pindah wadah terkait.");
    }
    if (!confirm("Hapus lot ini?")) return;
    const { error } = await supabase.from("raw_material_lots").delete().eq("id", l.id);
    if (error) toast.error(error.message);
    else { toast.success("Lot dihapus"); qc.invalidateQueries({ queryKey: ["lots"] }); }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h2 className="text-2xl font-semibold">Bahan Baku Madu (Jerigen)</h2>
        <p className="text-sm text-muted-foreground">Catat setiap pengiriman jerigen dari peternak — harga per lot dipakai untuk hitung HPP rata-rata.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Tambah Lot Pengiriman</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div className="md:col-span-2 space-y-1">
              <Label>Supplier / Peternak</Label>
              <Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
            </div>
            <div className="md:col-span-2 space-y-1">
              <div className="flex justify-between items-center">
                <Label>Jenis Madu</Label>
                <Button 
                  type="button" 
                  variant="link" 
                  className="h-auto p-0 text-xs text-honey font-semibold"
                  onClick={() => {
                    setIsCustomVariant(!isCustomVariant);
                    setCustomVariantName("");
                  }}
                >
                  {isCustomVariant ? "← Pilih Daftar" : "+ Tulis Jenis Baru"}
                </Button>
              </div>
              {isCustomVariant ? (
                <Input 
                  value={customVariantName} 
                  onChange={(e) => setCustomVariantName(e.target.value)} 
                  placeholder="Contoh: Madu Klanceng"
                  required
                />
              ) : (
                <Select value={form.honey_type} onValueChange={(v) => setForm({ ...form, honey_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {activeVariants.map((t: string) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1">
              <Label>Jumlah Jerigen</Label>
              <Input type="number" min={1} value={form.jerigen_qty} onChange={(e) => setForm({ ...form, jerigen_qty: +e.target.value })} required />
            </div>
            <div className="space-y-1">
              <Label>Gram / Jerigen</Label>
              <Input type="number" min={0} value={form.grams_per_jerigen} onChange={(e) => setForm({ ...form, grams_per_jerigen: +e.target.value })} required />
              <p className="text-xs text-muted-foreground">≈ {(form.grams_per_jerigen / 1000).toFixed(2)} kg</p>
            </div>
            <div className="md:col-span-2 space-y-1">
              <Label>Harga Total (Rp)</Label>
              <Input type="number" value={form.price_total} onChange={(e) => setForm({ ...form, price_total: +e.target.value })} required />
            </div>
            <div className="md:col-span-3 space-y-1">
              <Label>Catatan</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="md:col-span-1 flex items-end">
              <Button type="submit" disabled={submitting} className="w-full">Simpan Lot</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Riwayat Lot</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Tanggal</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Jenis</TableHead>
              <TableHead>Jerigen (sisa/total)</TableHead>
              <TableHead>Gram/Jerigen (kg)</TableHead>
              <TableHead>Total Berat</TableHead>
              <TableHead>Harga Total</TableHead>
              <TableHead>Harga/Kg</TableHead>
              <TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(lots ?? []).map((l: any) => {
                const grams = Number(l.grams_per_jerigen ?? (l.kg_per_jerigen * 1000));
                const kg = grams / 1000;
                const totalKg = kg * l.jerigen_qty;
                const untouched = l.jerigen_remaining === l.jerigen_qty;
                return (
                  <TableRow key={l.id}>
                    <TableCell>{l.received_at}</TableCell>
                    <TableCell>{l.supplier ?? "—"}</TableCell>
                    <TableCell>{l.honey_type ?? "—"}</TableCell>
                    <TableCell>{l.jerigen_remaining} / {l.jerigen_qty}</TableCell>
                    <TableCell>{grams.toLocaleString("id-ID")} g <span className="text-muted-foreground">({kg.toFixed(2)} kg)</span></TableCell>
                    <TableCell>{totalKg.toFixed(2)} kg</TableCell>
                    <TableCell>{formatIDR(l.price_total)}</TableCell>
                    <TableCell>{formatIDR(l.price_total / totalKg)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className={untouched ? "" : "opacity-45"}
                          title={untouched ? "Edit" : "Sudah dipakai - klik untuk info"}
                          onClick={() => {
                            if (!untouched) {
                              toast.error("Lot sudah dipakai (sebagian dituang ke dandang). Silakan hapus catatan di menu 'Pindah Wadah' terlebih dahulu untuk mengedit lot ini.");
                            } else {
                              openEdit(l);
                            }
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className={untouched ? "" : "opacity-45"}
                          title={untouched ? "Hapus" : "Sudah dipakai - klik untuk info"}
                          onClick={() => {
                            if (!untouched) {
                              toast.error("Lot sudah dipakai (sebagian dituang ke dandang). Silakan hapus catatan di menu 'Pindah Wadah' terlebih dahulu untuk menghapus lot ini.");
                            } else {
                              handleDelete(l);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!lots?.length && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Belum ada lot</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Lot</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1"><Label>Supplier</Label><Input value={editForm.supplier} onChange={(e) => setEditForm({ ...editForm, supplier: e.target.value })} /></div>
            <div className="col-span-2 space-y-1">
              <div className="flex justify-between items-center">
                <Label>Jenis Madu</Label>
                <Button 
                  type="button" 
                  variant="link" 
                  className="h-auto p-0 text-xs text-honey font-semibold"
                  onClick={() => {
                    setIsEditCustomVariant(!isEditCustomVariant);
                    setEditCustomVariantName("");
                  }}
                >
                  {isEditCustomVariant ? "← Pilih Daftar" : "+ Tulis Jenis Baru"}
                </Button>
              </div>
              {isEditCustomVariant ? (
                <Input 
                  value={editCustomVariantName} 
                  onChange={(e) => setEditCustomVariantName(e.target.value)} 
                  placeholder="Contoh: Madu Rambutan"
                  required
                />
              ) : (
                <Select value={editForm.honey_type} onValueChange={(v) => setEditForm({ ...editForm, honey_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{activeVariants.map((t: string) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1"><Label>Jumlah Jerigen</Label><Input type="number" min={1} value={editForm.jerigen_qty} onChange={(e) => setEditForm({ ...editForm, jerigen_qty: +e.target.value })} /></div>
            <div className="space-y-1">
              <Label>Gram / Jerigen</Label>
              <Input type="number" min={0} value={editForm.grams_per_jerigen} onChange={(e) => setEditForm({ ...editForm, grams_per_jerigen: +e.target.value })} />
              <p className="text-xs text-muted-foreground">≈ {(editForm.grams_per_jerigen / 1000).toFixed(2)} kg</p>
            </div>
            <div className="col-span-2 space-y-1"><Label>Harga Total</Label><Input type="number" value={editForm.price_total} onChange={(e) => setEditForm({ ...editForm, price_total: +e.target.value })} /></div>
            <div className="col-span-2 space-y-1"><Label>Catatan</Label><Input value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Batal</Button>
            <Button onClick={saveEdit}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

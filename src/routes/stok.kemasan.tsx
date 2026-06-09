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
import { toast } from "sonner";
import { formatIDR } from "@/lib/theme";

export const Route = createFileRoute("/stok/kemasan")({ component: () => <RequireAuth><Page /></RequireAuth> });

function Page() {
  const qc = useQueryClient();
  const { data: items } = useQuery({
    queryKey: ["pkg"],
    queryFn: async () => (await supabase.from("packaging_items").select("*").order("type")).data ?? [],
  });

  const [form, setForm] = useState({ item_id: "", qty: 0, total_price: 0, notes: "" });
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.item_id) return toast.error("Pilih item");
    setSubmitting(true);
    const { error } = await supabase.rpc("record_packaging_purchase", {
      _item_id: form.item_id, _qty: form.qty, _total: form.total_price,
      _date: new Date().toISOString().slice(0, 10), _note: form.notes || null,
    });
    setSubmitting(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Pembelian tercatat (stok & biaya diperbarui)");
      setForm({ item_id: "", qty: 0, total_price: 0, notes: "" });
      qc.invalidateQueries();
    }
  };

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
              <Select value={form.item_id} onValueChange={(v) => setForm({ ...form, item_id: v })}>
                <SelectTrigger><SelectValue placeholder="Pilih item" /></SelectTrigger>
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
        <CardHeader><CardTitle>Stok Saat Ini</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Tipe</TableHead><TableHead>Stok</TableHead><TableHead>Unit</TableHead><TableHead>HPP rata-rata</TableHead></TableRow></TableHeader>
            <TableBody>
              {(items ?? []).map((it: any) => (
                <TableRow key={it.id} className={Number(it.current_stock) < 20 ? "bg-destructive/5" : ""}>
                  <TableCell className="font-medium">{it.name}</TableCell>
                  <TableCell className="capitalize">{it.type}</TableCell>
                  <TableCell>{Number(it.current_stock).toFixed(2)}</TableCell>
                  <TableCell>{it.unit}</TableCell>
                  <TableCell>{formatIDR(it.avg_cost)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

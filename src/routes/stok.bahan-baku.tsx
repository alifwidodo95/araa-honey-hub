import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RequireAuth } from "@/components/require-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatIDR } from "@/lib/theme";
import { toast } from "sonner";

export const Route = createFileRoute("/stok/bahan-baku")({ component: () => <RequireAuth><Page /></RequireAuth> });

function Page() {
  const qc = useQueryClient();
  const { data: lots } = useQuery({
    queryKey: ["lots"],
    queryFn: async () => (await supabase.from("raw_material_lots").select("*").order("received_at", { ascending: false })).data ?? [],
  });

  const [form, setForm] = useState({ supplier: "", jerigen_qty: 1, kg_per_jerigen: 50, price_total: 0, notes: "" });
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.from("raw_material_lots").insert({
      ...form,
      kg_per_jerigen: 50,
      jerigen_remaining: form.jerigen_qty,
    });
    setSubmitting(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Lot bahan baku tercatat");
      setForm({ supplier: "", jerigen_qty: 1, kg_per_jerigen: 50, price_total: 0, notes: "" });
      qc.invalidateQueries({ queryKey: ["lots"] });
    }
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
          <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="md:col-span-2 space-y-1"><Label>Supplier / Peternak</Label><Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} /></div>
            <div className="space-y-1"><Label>Jumlah Jerigen</Label><Input type="number" min={1} value={form.jerigen_qty} onChange={(e) => setForm({ ...form, jerigen_qty: +e.target.value })} required /></div>
            <div className="space-y-1"><Label>Kg / Jerigen</Label><Input type="number" value={50} readOnly disabled /></div>
            <div className="space-y-1"><Label>Harga Total (Rp)</Label><Input type="number" value={form.price_total} onChange={(e) => setForm({ ...form, price_total: +e.target.value })} required /></div>
            <div className="md:col-span-4 space-y-1"><Label>Catatan</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <div className="md:col-span-1 flex items-end"><Button type="submit" disabled={submitting} className="w-full">Simpan Lot</Button></div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Riwayat Lot</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Tanggal</TableHead><TableHead>Supplier</TableHead>
              <TableHead>Jerigen (sisa/total)</TableHead><TableHead>Kg/Jerigen</TableHead>
              <TableHead>Harga Total</TableHead><TableHead>Harga/Kg</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(lots ?? []).map((l: any) => (
                <TableRow key={l.id}>
                  <TableCell>{l.received_at}</TableCell>
                  <TableCell>{l.supplier ?? "—"}</TableCell>
                  <TableCell>{l.jerigen_remaining} / {l.jerigen_qty}</TableCell>
                  <TableCell>{l.kg_per_jerigen}</TableCell>
                  <TableCell>{formatIDR(l.price_total)}</TableCell>
                  <TableCell>{formatIDR(l.price_total / (l.kg_per_jerigen * l.jerigen_qty))}</TableCell>
                </TableRow>
              ))}
              {!lots?.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Belum ada lot</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

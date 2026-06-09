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

export const Route = createFileRoute("/pengeluaran")({ component: () => <RequireAuth><Page /></RequireAuth> });

function Page() {
  const qc = useQueryClient();
  const { data: rows } = useQuery({
    queryKey: ["biz-expenses"],
    queryFn: async () => (await supabase.from("expenses_business").select("*").order("occurred_on", { ascending: false }).limit(50)).data ?? [],
  });

  const [form, setForm] = useState({ category: "meta_ads", amount: 0, note: "", occurred_on: new Date().toISOString().slice(0, 10) });
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.from("expenses_business").insert(form as any);
    setSubmitting(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Pengeluaran tercatat");
      setForm({ ...form, amount: 0, note: "" });
      qc.invalidateQueries({ queryKey: ["biz-expenses"] });
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-2xl font-semibold">Pengeluaran Operasional</h2>
        <p className="text-sm text-muted-foreground">Catat biaya Meta Ads harian, gaji, dan biaya lain. Dipakai untuk ROAS & laporan laba.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Tambah Pengeluaran</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="space-y-1">
              <Label>Kategori</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="meta_ads">Meta Ads</SelectItem>
                  <SelectItem value="gaji">Gaji Karyawan</SelectItem>
                  <SelectItem value="other">Lainnya</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Tanggal</Label><Input type="date" value={form.occurred_on} onChange={(e) => setForm({ ...form, occurred_on: e.target.value })} /></div>
            <div className="space-y-1"><Label>Nominal (Rp)</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: +e.target.value })} required /></div>
            <div className="md:col-span-2 space-y-1"><Label>Catatan</Label><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
            <div className="md:col-span-5"><Button type="submit" disabled={submitting}>Simpan</Button></div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Riwayat</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Tanggal</TableHead><TableHead>Kategori</TableHead><TableHead>Nominal</TableHead><TableHead>Catatan</TableHead></TableRow></TableHeader>
            <TableBody>
              {(rows ?? []).map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell>{r.occurred_on}</TableCell>
                  <TableCell className="capitalize">{String(r.category).replace("_", " ")}</TableCell>
                  <TableCell>{formatIDR(r.amount)}</TableCell>
                  <TableCell className="text-muted-foreground">{r.note}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

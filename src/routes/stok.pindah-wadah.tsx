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

export const Route = createFileRoute("/stok/pindah-wadah")({ component: () => <RequireAuth><Page /></RequireAuth> });

function Page() {
  const qc = useQueryClient();
  const { data: lots } = useQuery({
    queryKey: ["lots-avail"],
    queryFn: async () => (await supabase.from("raw_material_lots").select("*").gt("jerigen_remaining", 0).order("received_at")).data ?? [],
  });
  const { data: dandang } = useQuery({
    queryKey: ["dandang"],
    queryFn: async () => (await supabase.from("dandang_balance").select("*").single()).data,
  });
  const { data: transfers } = useQuery({
    queryKey: ["transfers"],
    queryFn: async () => (await supabase.from("dandang_transfers").select("*,raw_material_lots(supplier,received_at)").order("created_at", { ascending: false }).limit(20)).data ?? [],
  });

  const [lotId, setLotId] = useState("");
  const [jerigen, setJerigen] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lotId) return toast.error("Pilih lot");
    setSubmitting(true);
    const { error } = await supabase.rpc("open_jerigen", { _lot_id: lotId, _jerigen: jerigen });
    setSubmitting(false);
    if (error) toast.error(error.message);
    else {
      toast.success(`${jerigen} jerigen dituang ke dandang`);
      qc.invalidateQueries();
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-2xl font-semibold">Pindah Wadah ke Dandang</h2>
        <p className="text-sm text-muted-foreground">Buka jerigen dan tuang ke dandang filling — saldo otomatis tercatat.</p>
      </div>

      <Card className="bg-honey/5 border-honey/30">
        <CardContent className="p-5 flex justify-between items-center">
          <div>
            <div className="text-xs text-muted-foreground">Saldo Madu di Dandang</div>
            <div className="text-3xl font-bold">{Number(dandang?.kg_remaining ?? 0).toFixed(2)} kg</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">HPP rata-rata / kg</div>
            <div className="text-xl font-semibold">{formatIDR(dandang?.avg_cost_per_kg)}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Buka Jerigen</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2 space-y-1">
              <Label>Pilih Lot</Label>
              <Select value={lotId} onValueChange={setLotId}>
                <SelectTrigger><SelectValue placeholder="Pilih lot bahan baku" /></SelectTrigger>
                <SelectContent>
                  {(lots ?? []).map((l: any) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.received_at} — {l.supplier ?? "—"} (sisa {l.jerigen_remaining})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Jumlah Jerigen Dibuka</Label><Input type="number" min={1} value={jerigen} onChange={(e) => setJerigen(+e.target.value)} /></div>
            <div className="flex items-end"><Button type="submit" disabled={submitting} className="w-full">Tuang ke Dandang</Button></div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Riwayat Pindah Wadah</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Tanggal</TableHead><TableHead>Supplier</TableHead><TableHead>Jerigen</TableHead><TableHead>Kg</TableHead><TableHead>HPP/kg</TableHead></TableRow></TableHeader>
            <TableBody>
              {(transfers ?? []).map((t: any) => (
                <TableRow key={t.id}>
                  <TableCell>{new Date(t.created_at).toLocaleString("id-ID")}</TableCell>
                  <TableCell>{t.raw_material_lots?.supplier ?? "—"}</TableCell>
                  <TableCell>{t.jerigen_opened}</TableCell>
                  <TableCell>{Number(t.kg_added).toFixed(2)}</TableCell>
                  <TableCell>{formatIDR(t.cost_per_kg)}</TableCell>
                </TableRow>
              ))}
              {!transfers?.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Belum ada</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

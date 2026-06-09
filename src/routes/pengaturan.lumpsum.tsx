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
import { Switch } from "@/components/ui/switch";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatIDR } from "@/lib/theme";

export const Route = createFileRoute("/pengaturan/lumpsum")({ component: () => <RequireAuth ownerOnly><Page /></RequireAuth> });

function Page() {
  const qc = useQueryClient();
  const { data: rules } = useQuery({ queryKey: ["lumpsum"], queryFn: async () => (await supabase.from("lumpsum_rules").select("*").order("created_at")).data ?? [] });
  const [form, setForm] = useState({ label: "", monthly_amount: 0 });

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("lumpsum_rules").insert(form);
    if (error) toast.error(error.message);
    else { toast.success("Rule ditambah"); setForm({ label: "", monthly_amount: 0 }); qc.invalidateQueries({ queryKey: ["lumpsum"] }); }
  };
  const toggle = async (id: string, active: boolean) => {
    await supabase.from("lumpsum_rules").update({ active }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["lumpsum"] });
  };
  const remove = async (id: string) => {
    await supabase.from("lumpsum_rules").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["lumpsum"] });
  };
  const runNow = async () => {
    const { data, error } = await supabase.rpc("run_monthly_lumpsum");
    if (error) toast.error(error.message); else toast.success(`Lumpsum diproses: ${data} entri`);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-semibold">Lumpsum Bulanan (Utilitas)</h2>
        <p className="text-sm text-muted-foreground">Listrik, Air, Internet — auto-debit dari kas bisnis ke kas pribadi tiap awal bulan. Gunakan tombol di bawah untuk uji.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Tambah Rule</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={add} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2 space-y-1"><Label>Label</Label><Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} required placeholder="Listrik, Air, Internet" /></div>
            <div className="space-y-1"><Label>Nominal Bulanan</Label><Input type="number" value={form.monthly_amount} onChange={(e) => setForm({ ...form, monthly_amount: +e.target.value })} required /></div>
            <div className="flex items-end gap-2"><Button type="submit">Simpan</Button><Button type="button" variant="outline" onClick={runNow}>Run Sekarang</Button></div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Daftar Rule</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Label</TableHead><TableHead>Nominal</TableHead><TableHead>Aktif</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {(rules ?? []).map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell>{r.label}</TableCell>
                  <TableCell>{formatIDR(r.monthly_amount)}</TableCell>
                  <TableCell><Switch checked={r.active} onCheckedChange={(v) => toggle(r.id, v)} /></TableCell>
                  <TableCell><Button size="icon" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

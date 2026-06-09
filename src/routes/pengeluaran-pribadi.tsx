import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { RequireAuth } from "@/components/require-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { formatIDR } from "@/lib/theme";

export const Route = createFileRoute("/pengeluaran-pribadi")({ component: () => <RequireAuth ownerOnly><Page /></RequireAuth> });

function Page() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: rows } = useQuery({
    queryKey: ["personal-expenses"],
    queryFn: async () => (await supabase.from("expenses_personal").select("*").order("occurred_on", { ascending: false })).data ?? [],
  });
  const [form, setForm] = useState({ category: "", amount: 0, note: "", occurred_on: new Date().toISOString().slice(0, 10) });
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.from("expenses_personal").insert({ ...form, owner_id: user?.id });
    setSubmitting(false);
    if (error) toast.error(error.message);
    else { toast.success("Tercatat"); setForm({ ...form, amount: 0, note: "", category: "" }); qc.invalidateQueries({ queryKey: ["personal-expenses"] }); }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-2xl font-semibold">Pengeluaran Pribadi / Rumah Tangga</h2>
        <p className="text-sm text-muted-foreground">Hanya owner yang bisa melihat & menginput modul ini.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Tambah</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="space-y-1"><Label>Kategori</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required placeholder="Belanja, Sekolah, dll" /></div>
            <div className="space-y-1"><Label>Tanggal</Label><Input type="date" value={form.occurred_on} onChange={(e) => setForm({ ...form, occurred_on: e.target.value })} /></div>
            <div className="space-y-1"><Label>Nominal</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: +e.target.value })} required /></div>
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
                <TableRow key={r.id}><TableCell>{r.occurred_on}</TableCell><TableCell>{r.category}</TableCell><TableCell>{formatIDR(r.amount)}</TableCell><TableCell className="text-muted-foreground">{r.note}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

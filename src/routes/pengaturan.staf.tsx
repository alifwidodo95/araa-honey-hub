import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RequireAuth } from "@/components/require-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { createStaffAccount } from "@/lib/admin.functions";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/pengaturan/staf")({ component: () => <RequireAuth ownerOnly><Page /></RequireAuth> });

function Page() {
  const qc = useQueryClient();
  const createStaff = useServerFn(createStaffAccount);
  const { data: rows } = useQuery({
    queryKey: ["staff"],
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id,role");
      const { data: profiles } = await supabase.from("profiles").select("id,email,full_name");
      return (profiles ?? []).map((p: any) => ({
        ...p, role: roles?.find((r: any) => r.user_id === p.id)?.role ?? "—",
      }));
    },
  });

  const [form, setForm] = useState({ email: "", password: "", full_name: "", role: "staff" as "staff" | "owner" });
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createStaff({ data: form });
      toast.success("Akun dibuat");
      setForm({ email: "", password: "", full_name: "", role: "staff" });
      qc.invalidateQueries({ queryKey: ["staff"] });
    } catch (err: any) {
      toast.error(err.message ?? "Gagal");
    } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-2xl font-semibold">Manajemen Akun</h2>
        <p className="text-sm text-muted-foreground">Owner membuat akun staf di sini. Tidak ada signup publik.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Buat Akun Baru</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="md:col-span-2 space-y-1"><Label>Nama Lengkap</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required /></div>
            <div className="md:col-span-2 space-y-1"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
            <div className="space-y-1"><Label>Password</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} /></div>
            <div className="space-y-1"><Label>Role</Label>
              <select className="w-full h-9 px-3 rounded-md border bg-background" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as any })}>
                <option value="staff">Staff</option><option value="owner">Owner</option>
              </select>
            </div>
            <div className="flex items-end"><Button type="submit" disabled={submitting}>Buat Akun</Button></div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Daftar Pengguna</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Nama</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead></TableRow></TableHeader>
            <TableBody>
              {(rows ?? []).map((p: any) => (
                <TableRow key={p.id}><TableCell>{p.full_name || "—"}</TableCell><TableCell>{p.email}</TableCell><TableCell className="capitalize">{p.role}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

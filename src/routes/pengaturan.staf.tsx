import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RequireAuth } from "@/components/require-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { createStaffAccount, deleteStaffAccount } from "@/lib/admin.functions";
import { useAuth } from "@/lib/auth-context";
import { useServerFn } from "@tanstack/react-start";
import { Shield, ShieldAlert, Plus, Trash2, Key, Check } from "lucide-react";

export const Route = createFileRoute("/pengaturan/staf")({ component: () => <RequireAuth ownerOnly><Page /></RequireAuth> });

const ALL_PERMISSIONS = [
  { key: "dashboard", label: "Dashboard Utama" },
  { key: "penjualan", label: "Penjualan (Kasir)" },
  { key: "retur", label: "Retur Pesanan" },
  { key: "stok", label: "Manajemen Stok (Bahan Baku & Kemasan)" },
  { key: "pengeluaran", label: "Biaya Operasional Toko" },
  { key: "keuangan", label: "Keuangan (Laporan Laba/Rugi & Grafik)" },
  { key: "pengeluaran_pribadi", label: "Pengeluaran Pribadi Owner" },
  { key: "meta_ads", label: "Meta Ads Manager" },
  { key: "import_riwayat", label: "Impor Riwayat (Upload Massal)" },
  { key: "pengaturan_harga", label: "Pengaturan Harga Produk" },
  { key: "pengaturan_lumpsum", label: "Lumpsum Bulanan Staf" },
  { key: "pengaturan_whatsapp", label: "Integrasi WhatsApp (WAHA)" },
  { key: "pengaturan_staf", label: "Manajemen Akun Staf (Role & Akses)" },
];

function Page() {
  const qc = useQueryClient();
  const createStaff = useServerFn(createStaffAccount);
  const deleteStaff = useServerFn(deleteStaffAccount);
  const { user } = useAuth();

  // Fetch role permissions settings
  const { data: rolePermissionsSetting, refetch: refetchPermissions } = useQuery({
    queryKey: ["role-permissions-setting"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("*")
        .eq("key", "role_permissions")
        .maybeSingle();
      if (error) throw error;
      return (data?.value as Record<string, Record<string, boolean>>) ?? {
        owner: {
          dashboard: true,
          penjualan: true,
          retur: true,
          stok: true,
          pengeluaran: true,
          keuangan: true,
          pengeluaran_pribadi: true,
          meta_ads: true,
          import_riwayat: true,
          pengaturan_harga: true,
          pengaturan_lumpsum: true,
          pengaturan_whatsapp: true,
          pengaturan_staf: true,
        },
        staff: {
          dashboard: true,
          penjualan: true,
          retur: true,
          stok: true,
          pengeluaran: true,
        }
      };
    }
  });

  const availableRoles = Object.keys(rolePermissionsSetting ?? {});

  // Fetch users & roles
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

  const [form, setForm] = useState({ email: "", password: "", full_name: "", role: "staff" });
  const [submitting, setSubmitting] = useState(false);

  // Set default form role when availableRoles changes
  useEffect(() => {
    if (availableRoles.length > 0 && !availableRoles.includes(form.role)) {
      setForm((prev) => ({ ...prev, role: availableRoles[0] }));
    }
  }, [rolePermissionsSetting]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createStaff({ data: form as any });
      toast.success("Akun staf berhasil dibuat!");
      setForm({ email: "", password: "", full_name: "", role: "staff" });
      qc.invalidateQueries({ queryKey: ["staff"] });
    } catch (err: any) {
      toast.error(err.message ?? "Gagal membuat akun");
    } finally { setSubmitting(false); }
  };

  // RBAC Permission Builder State
  const [selectedRoleToEdit, setSelectedRoleToEdit] = useState("staff");
  const [newRoleName, setNewRoleName] = useState("");
  const [editingPermissions, setEditingPermissions] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (rolePermissionsSetting && rolePermissionsSetting[selectedRoleToEdit]) {
      setEditingPermissions(rolePermissionsSetting[selectedRoleToEdit]);
    }
  }, [selectedRoleToEdit, rolePermissionsSetting]);

  const handleAddRole = async () => {
    const name = newRoleName.trim().toLowerCase();
    if (!name) return toast.error("Nama role tidak boleh kosong");
    if (name === "owner") return toast.error("Role 'owner' sudah diproteksi sistem");
    if (rolePermissionsSetting && rolePermissionsSetting[name]) {
      return toast.error("Role sudah terdaftar");
    }

    const updated = {
      ...(rolePermissionsSetting ?? {}),
      [name]: {
        dashboard: true,
      }
    };

    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: "role_permissions", value: updated });

    if (error) {
      toast.error("Gagal menambah role: " + error.message);
    } else {
      toast.success(`Role '${name}' berhasil ditambahkan`);
      setNewRoleName("");
      setSelectedRoleToEdit(name);
      refetchPermissions();
    }
  };

  const handleSavePermissions = async () => {
    if (selectedRoleToEdit === "owner") {
      return toast.error("Role Owner selalu memiliki semua hak akses!");
    }

    const updated = {
      ...(rolePermissionsSetting ?? {}),
      [selectedRoleToEdit]: editingPermissions
    };

    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: "role_permissions", value: updated });

    if (error) {
      toast.error("Gagal menyimpan hak akses: " + error.message);
    } else {
      toast.success(`Hak akses untuk role '${selectedRoleToEdit}' berhasil disimpan`);
      refetchPermissions();
      qc.invalidateQueries();
    }
  };

  const handleDeleteRole = async () => {
    if (selectedRoleToEdit === "owner" || selectedRoleToEdit === "staff") {
      return toast.error("Role default (owner/staff) tidak bisa dihapus!");
    }

    // Check if role is currently assigned to users
    const hasAssignedUsers = rows?.some((r: any) => r.role === selectedRoleToEdit);
    if (hasAssignedUsers) {
      return toast.error(`Gagal menghapus! Role ini masih digunakan oleh pengguna aktif.`);
    }

    const updated = { ...(rolePermissionsSetting ?? {}) };
    delete updated[selectedRoleToEdit];

    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: "role_permissions", value: updated });

    if (error) {
      toast.error("Gagal menghapus role: " + error.message);
    } else {
      toast.success(`Role '${selectedRoleToEdit}' berhasil dihapus`);
      setSelectedRoleToEdit("staff");
      refetchPermissions();
    }
  };

  const togglePermission = (key: string) => {
    setEditingPermissions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h2 className="text-2xl font-semibold">Manajemen Akun & Hak Akses</h2>
        <p className="text-sm text-muted-foreground">Owner dapat membuat akun staf, mengubah peran, dan mencentang menu apa saja yang boleh diakses masing-masing peran.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Buat Akun Baru */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Buat Akun Baru</CardTitle>
            <CardDescription>Tambah kredensial masuk untuk staf operasional toko.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1">
                <Label>Nama Lengkap</Label>
                <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              </div>
              <div className="space-y-1">
                <Label>Password</Label>
                <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
              </div>
              <div className="space-y-1">
                <Label>Role</Label>
                <select 
                  className="w-full h-9 px-3 rounded-md border bg-background capitalize" 
                  value={form.role} 
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                >
                  {availableRoles.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <Button type="submit" disabled={submitting} className="w-full">Buat Akun</Button>
            </form>
          </CardContent>
        </Card>

        {/* Daftar Pengguna */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Daftar Pengguna</CardTitle>
            <CardDescription>Semua pengguna terdaftar dengan peran aktif mereka.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rows ?? []).map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.full_name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{p.email}</TableCell>
                    <TableCell>
                      {p.role === "owner" ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-honey border border-amber-500/25 capitalize">
                          <Shield className="w-3.5 h-3.5" />
                          {p.role}
                        </span>
                      ) : (
                        <select
                          value={p.role}
                          onChange={async (e) => {
                            const newRole = e.target.value;
                            if (p.role === "—") {
                              const { error } = await supabase
                                .from("user_roles")
                                .insert({ user_id: p.id, role: newRole });
                              if (error) {
                                toast.error("Gagal menyimpan role: " + error.message);
                              } else {
                                toast.success(`Role ${p.full_name || p.email} disimpan sebagai ${newRole}`);
                                qc.invalidateQueries({ queryKey: ["staff"] });
                              }
                            } else {
                              const { error } = await supabase
                                .from("user_roles")
                                .update({ role: newRole })
                                .eq("user_id", p.id);
                              if (error) {
                                toast.error("Gagal mengubah role: " + error.message);
                              } else {
                                toast.success(`Role ${p.full_name || p.email} diubah ke ${newRole}`);
                                qc.invalidateQueries({ queryKey: ["staff"] });
                              }
                            }
                          }}
                          className="h-8 px-2 rounded border bg-background capitalize text-sm focus:ring-1 focus:ring-honey"
                        >
                          <option value="—">Pilih Role</option>
                          {availableRoles.filter((r) => r !== "owner").map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {p.id === user?.id ? (
                        <span className="text-xs text-muted-foreground italic">Akun Anda</span>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={async () => {
                            if (confirm(`Apakah Anda yakin ingin menghapus akun ${p.email}? Tindakan ini akan menghapus akun secara permanen.`)) {
                              try {
                                await deleteStaff({ data: { userIdToDelete: p.id } });
                                toast.success(`Akun ${p.email} berhasil dihapus.`);
                                qc.invalidateQueries({ queryKey: ["staff"] });
                              } catch (err: any) {
                                toast.error(err.message ?? "Gagal menghapus akun");
                              }
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* RBAC Permission Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="w-5 h-5 text-honey-dark dark:text-honey" />
            Pengaturan Hak Akses Peran (RBAC)
          </CardTitle>
          <CardDescription>Centang menu/halaman yang boleh diakses untuk masing-masing peran di bawah ini.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b pb-4">
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
              <div className="space-y-1">
                <Label>Pilih Peran untuk Diedit</Label>
                <select
                  value={selectedRoleToEdit}
                  onChange={(e) => setSelectedRoleToEdit(e.target.value)}
                  className="w-48 h-9 px-3 rounded-md border bg-background capitalize focus:ring-1 focus:ring-honey"
                >
                  {availableRoles.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              {selectedRoleToEdit !== "owner" && selectedRoleToEdit !== "staff" && (
                <Button variant="destructive" size="sm" onClick={handleDeleteRole} className="mt-6">
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  Hapus Role
                </Button>
              )}
            </div>

            <div className="flex items-end gap-2">
              <div className="space-y-1">
                <Label>Buat Peran Baru</Label>
                <Input 
                  value={newRoleName} 
                  onChange={(e) => setNewRoleName(e.target.value)} 
                  placeholder="contoh: admin cs"
                  className="w-48 h-9"
                />
              </div>
              <Button onClick={handleAddRole} size="sm" variant="outline">
                <Plus className="w-4 h-4 mr-1.5" />
                Tambah Role
              </Button>
            </div>
          </div>

          {selectedRoleToEdit === "owner" ? (
            <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-honey flex items-start gap-2 text-sm">
              <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <strong>Role Owner Diproteksi:</strong> Owner memiliki kontrol penuh bypass atas seluruh halaman dan fitur operasional. Hak akses untuk Owner tidak dapat diedit atau dikurangi.
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {ALL_PERMISSIONS.map((perm) => {
                  const checked = !!editingPermissions[perm.key];
                  return (
                    <div 
                      key={perm.key} 
                      onClick={() => togglePermission(perm.key)}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                        checked 
                          ? "border-honey/60 bg-honey/5 hover:bg-honey/10" 
                          : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <input 
                        type="checkbox" 
                        checked={checked}
                        onChange={() => {}} // handled by div click
                        className="mt-1 h-4 w-4 rounded border-border text-honey focus:ring-honey"
                      />
                      <div>
                        <div className="text-sm font-medium">{perm.label}</div>
                        <div className="text-[10px] text-muted-foreground uppercase">{perm.key}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-end pt-4">
                <Button onClick={handleSavePermissions} className="flex items-center gap-1.5">
                  <Check className="w-4 h-4" />
                  Simpan Hak Akses
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

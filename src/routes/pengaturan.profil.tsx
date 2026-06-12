import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { RequireAuth } from "@/components/require-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { User, Lock, Trash2, Upload, Sparkles } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/pengaturan/profil")({
  component: () => (
    <RequireAuth>
      <Page />
    </RequireAuth>
  ),
});

function Page() {
  const { user, signOut } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  // Fetch profiles table
  const { data: profile, isLoading } = useQuery({
    queryKey: ["user-profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!user?.id,
  });

  const [fullName, setFullName] = useState("");
  const [avatarBase64, setAvatarBase64] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(false);

  // Sync profile details when loaded
  const [initialSync, setInitialSync] = useState(false);
  if (profile && !initialSync) {
    setFullName(profile.full_name || "");
    setAvatarBase64(profile.avatar_url || "");
    setInitialSync(true);
  }

  // Password fields
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loadingPassword, setLoadingPassword] = useState(false);

  // Delete Account dialog open/close
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Bee Cursor customization state
  const [beeCursorEnabled, setBeeCursorEnabled] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("bee-cursor-enabled") !== "false";
    }
    return true;
  });

  const handleToggleBeeCursor = (checked: boolean) => {
    setBeeCursorEnabled(checked);
    if (typeof window !== "undefined") {
      localStorage.setItem("bee-cursor-enabled", String(checked));
      window.dispatchEvent(new Event("bee-cursor-toggle"));
    }
    toast.success(checked ? "Kursor Lebah Madu diaktifkan! 🐝" : "Kursor kembali ke standar.");
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1024 * 1024) {
      toast.error("Ukuran foto maksimal adalah 1MB");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      setAvatarBase64(base64String);
    };
    reader.readAsDataURL(file);
  };

  const updateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;
    setLoadingProfile(true);

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        avatar_url: avatarBase64,
        updated_at: new Date().toISOString()
      } as any)
      .eq("id", user.id);

    setLoadingProfile(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Profil berhasil diperbarui!");
      qc.invalidateQueries({ queryKey: ["user-profile", user.id] });
    }
  };

  const updatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("Konfirmasi password baru tidak cocok!");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Password minimal 6 karakter!");
      return;
    }

    setLoadingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoadingPassword(false);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Password berhasil diperbarui!");
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  const deleteAccount = async () => {
    setDeletingAccount(true);
    try {
      const { error } = await supabase.rpc("delete_own_account");
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Akun Anda berhasil dihapus.");
        await signOut();
        navigate({ to: "/auth", replace: true });
      }
    } catch (err: any) {
      toast.error(err.message || "Gagal menghapus akun");
    } finally {
      setDeletingAccount(false);
      setDeleteConfirmOpen(false);
    }
  };

  if (isLoading) {
    return <div className="p-6 text-center text-muted-foreground">Memuat profil...</div>;
  }

  const displayNameLetter = (fullName || user?.email || "A").charAt(0).toUpperCase();

  return (
    <div className="space-y-6 max-w-3xl animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Pengaturan Profil</h2>
        <p className="text-sm text-muted-foreground">Kelola informasi profil, kata sandi, dan privasi akun Anda.</p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* SECTION 1: EDIT PROFILE */}
        <Card className="border-none shadow-md bg-card">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <User className="h-5 w-5 text-indigo-500" />
              Informasi Profil
            </CardTitle>
            <CardDescription>Perbarui nama lengkap dan foto profil Anda.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={updateProfile} className="space-y-6">
              {/* Photo Upload Row */}
              <div className="flex flex-col sm:flex-row items-center gap-4 bg-muted/20 p-4 rounded-xl border border-muted-foreground/10">
                <div className="relative">
                  {avatarBase64 ? (
                    <img 
                      src={avatarBase64} 
                      alt="Avatar Preview" 
                      className="h-20 w-20 rounded-2xl object-cover border border-muted-foreground/20 shadow-sm"
                    />
                  ) : (
                    <div className="h-20 w-20 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center justify-center font-extrabold text-2xl">
                      {displayNameLetter}
                    </div>
                  )}
                </div>
                <div className="space-y-2 text-center sm:text-left flex-1">
                  <h4 className="text-sm font-semibold">Foto Profil</h4>
                  <p className="text-xs text-muted-foreground">Gunakan foto berukuran maksimal 1MB.</p>
                  <div className="flex justify-center sm:justify-start gap-2">
                    <Label className="cursor-pointer">
                      <Input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={handlePhotoUpload}
                      />
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/70 transition-colors">
                        <Upload className="h-3.5 w-3.5" /> Unggah Foto
                      </span>
                    </Label>
                    {avatarBase64 && (
                      <Button 
                        type="button" 
                        variant="ghost" 
                        className="text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 px-3 py-1.5 h-auto rounded-lg"
                        onClick={() => setAvatarBase64("")}
                      >
                        Hapus Foto
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Name and Email Input Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Email</Label>
                  <Input 
                    type="email" 
                    value={user?.email || ""} 
                    disabled 
                    className="bg-muted text-muted-foreground cursor-not-allowed"
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5">Email tidak dapat diubah.</p>
                </div>
                <div className="space-y-1">
                  <Label>Nama Lengkap</Label>
                  <Input 
                    type="text" 
                    value={fullName} 
                    onChange={(e) => setFullName(e.target.value)} 
                    placeholder="Nama Lengkap Anda"
                    required
                  />
                </div>
              </div>

              <Button type="submit" disabled={loadingProfile} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                Simpan Perubahan
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* SECTION 2: CHANGE PASSWORD */}
        <Card className="border-none shadow-md bg-card">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Lock className="h-5 w-5 text-emerald-500" />
              Kata Sandi
            </CardTitle>
            <CardDescription>Ganti kata sandi akun Anda secara berkala.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={updatePassword} className="space-y-4 max-w-md">
              <div className="space-y-1">
                <Label>Password Baru</Label>
                <Input 
                  type="password" 
                  value={newPassword} 
                  onChange={(e) => setNewPassword(e.target.value)} 
                  placeholder="Min. 6 karakter"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label>Konfirmasi Password Baru</Label>
                <Input 
                  type="password" 
                  value={confirmPassword} 
                  onChange={(e) => setConfirmPassword(e.target.value)} 
                  placeholder="Ketik ulang password baru"
                  required
                />
              </div>
              <Button type="submit" disabled={loadingPassword} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                Perbarui Password
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* SECTION: CUSTOMIZATION */}
        <Card className="border-none shadow-md bg-card animate-fade-in">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-500" />
              Kustomisasi Tampilan
            </CardTitle>
            <CardDescription>Sesuaikan preferensi visual untuk kenyamanan Anda bekerja.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-xl border border-muted-foreground/10 bg-muted/5">
              <div className="space-y-1 pr-4">
                <Label className="text-sm font-semibold flex items-center gap-1.5 cursor-pointer" htmlFor="bee-cursor-toggle">
                  Kursor Lebah Madu 🐝
                </Label>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Mengaktifkan efek lebah terbang yang manis mengikuti gerakan mouse di seluruh website, serta meninggalkan jejak madu berkilau.
                </p>
              </div>
              <Switch 
                id="bee-cursor-toggle"
                checked={beeCursorEnabled} 
                onCheckedChange={handleToggleBeeCursor} 
              />
            </div>
          </CardContent>
        </Card>

        {/* SECTION 3: DANGER ZONE (DELETE ACCOUNT) */}
        <Card className="border border-red-200 dark:border-red-950/40 bg-red-50/10 dark:bg-red-950/5 shadow-md">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-red-600 dark:text-red-400 flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-500" />
              Danger Zone
            </CardTitle>
            <CardDescription className="text-red-600/80 dark:text-red-400/80">Hapus akun secara permanen.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Menghapus akun akan menghapus profil Anda, hak akses staf/owner, serta seluruh data personal yang terhubung dengan akun ini. Tindakan ini bersifat permanen dan **tidak dapat dibatalkan**.
            </p>
            
            <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="bg-red-600 hover:bg-red-700 text-white">
                  Hapus Akun Saya
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-red-600 flex items-center gap-2">
                    <Trash2 className="h-5 w-5 text-red-500" />
                    Hapus Akun Secara Permanen?
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-slate-500 dark:text-slate-400">
                    Apakah Anda benar-benar yakin ingin menghapus akun Anda? Seluruh hak akses dan profil Anda akan terhapus selamanya dari sistem. Tindakan ini tidak dapat dibatalkan.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={deletingAccount}>Batal</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={(e) => { e.preventDefault(); deleteAccount(); }} 
                    disabled={deletingAccount}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    {deletingAccount ? "Menghapus..." : "Ya, Hapus Akun"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

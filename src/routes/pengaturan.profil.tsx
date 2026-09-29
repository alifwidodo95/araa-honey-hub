import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { RequireAuth } from "@/components/require-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  User,
  Lock,
  Trash2,
  Upload,
  Sparkles,
  Bot,
  Key,
  Copy,
  Check,
  Eye,
  EyeOff,
  RefreshCw,
  Send,
  ShieldCheck,
  Terminal,
  HelpCircle,
  ExternalLink,
  ChevronRight,
  Zap,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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

  // Hermes Agent Configuration state
  const { data: hermesSetting } = useQuery({
    queryKey: ["app-settings", "hermes_config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "hermes_config")
        .maybeSingle();
      if (error) {
        console.warn("Could not fetch hermes_config:", error);
        return null;
      }
      return (data?.value as { api_key?: string; enabled?: boolean; webhook_url?: string }) || null;
    },
  });

  const [hermesApiKey, setHermesApiKey] = useState("");
  const [hermesEnabled, setHermesEnabled] = useState(true);
  const [hermesWebhookUrl, setHermesWebhookUrl] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedEndpoint, setCopiedEndpoint] = useState(false);
  const [savingHermes, setSavingHermes] = useState(false);
  const [hermesSynced, setHermesSynced] = useState(false);

  useEffect(() => {
    if (hermesSetting && !hermesSynced) {
      setHermesApiKey(hermesSetting.api_key || "");
      setHermesEnabled(hermesSetting.enabled !== false);
      setHermesWebhookUrl(hermesSetting.webhook_url || "");
      setHermesSynced(true);
    }
  }, [hermesSetting, hermesSynced]);

  const generateNewApiKey = () => {
    const bytes = new Uint8Array(20);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const newKey = `hrm_live_${hex}`;
    setHermesApiKey(newKey);
    setShowApiKey(true);
    toast.success("API Key baru berhasil digenerate! Klik 'Simpan Pengaturan Hermes' untuk menyimpannya.");
  };

  const copyToClipboard = async (text: string, type: "key" | "endpoint") => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === "key") {
        setCopiedKey(true);
        setTimeout(() => setCopiedKey(false), 2000);
        toast.success("API Key berhasil disalin!");
      } else {
        setCopiedEndpoint(true);
        setTimeout(() => setCopiedEndpoint(false), 2000);
        toast.success("Endpoint URL berhasil disalin!");
      }
    } catch {
      toast.error("Gagal menyalin teks ke clipboard");
    }
  };

  const handleSaveHermes = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSavingHermes(true);
    try {
      const payload = {
        api_key: hermesApiKey.trim(),
        enabled: hermesEnabled,
        webhook_url: hermesWebhookUrl.trim(),
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("app_settings").upsert({
        key: "hermes_config",
        value: payload,
        updated_at: new Date().toISOString(),
      });

      if (error) {
        toast.error(`Gagal menyimpan pengaturan: ${error.message}`);
      } else {
        toast.success("Pengaturan Integrasi Hermes Agent berhasil disimpan!");
        qc.invalidateQueries({ queryKey: ["app-settings", "hermes_config"] });
      }
    } catch (err: any) {
      toast.error(err.message || "Gagal menyimpan konfigurasi");
    } finally {
      setSavingHermes(false);
    }
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

        {/* SECTION: HERMES AGENT & EXTERNAL VPS INTEGRATION */}
        <Card className="border border-violet-200 dark:border-violet-900/50 bg-gradient-to-br from-violet-50/30 via-background to-purple-50/20 dark:from-violet-950/10 dark:via-background dark:to-purple-950/10 shadow-md">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-violet-600 text-white shadow-sm">
                    <Bot className="h-5 w-5" />
                  </div>
                  Integrasi Hermes Agent (External VPS & Telegram)
                </CardTitle>
                <CardDescription>
                  Hubungkan Hermes AI Agent di VPS external Anda ke Araa Honey Hub untuk kendali Telegram 24/7.
                </CardDescription>
              </div>
              <div>
                {hermesEnabled && hermesApiKey ? (
                  <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 flex items-center gap-1.5 py-1 px-2.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    API Gateway Aktif
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground border-dashed py-1 px-2.5">
                    Non-aktif / Belum Terhubung
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Status Switch */}
            <div className="flex items-center justify-between p-4 rounded-xl border border-violet-100 dark:border-violet-900/30 bg-violet-50/40 dark:bg-violet-950/20">
              <div className="space-y-1 pr-4">
                <Label className="text-sm font-semibold flex items-center gap-1.5 cursor-pointer" htmlFor="hermes-toggle">
                  <ShieldCheck className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                  Akses Hermes API Gateway
                </Label>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Izinkan bot Hermes eksternal di VPS Anda untuk memanggil endpoint API Araa Honey Hub menggunakan Bearer Token.
                </p>
              </div>
              <Switch
                id="hermes-toggle"
                checked={hermesEnabled}
                onCheckedChange={setHermesEnabled}
              />
            </div>

            {/* API Endpoint Box */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-amber-500" />
                Gateway Endpoint URL
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value="https://app.araahoney.my.id/api/hermes"
                  className="bg-muted/50 font-mono text-xs select-all text-foreground"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard("https://app.araahoney.my.id/api/hermes", "endpoint")}
                  className="shrink-0 flex items-center gap-1.5"
                >
                  {copiedEndpoint ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                  {copiedEndpoint ? "Disalin!" : "Salin URL"}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Gunakan URL ini di Hermes VPS sebagai target request (mendukung HTTP GET & POST).
              </p>
            </div>

            {/* API Key (Bearer Token) Box */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Key className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                  Hermes Bearer API Key
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={generateNewApiKey}
                  className="h-7 text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 hover:bg-violet-50 dark:hover:bg-violet-950/40 gap-1 px-2"
                >
                  <RefreshCw className="h-3 w-3" />
                  {hermesApiKey ? "Reset Token Baru" : "Generate Token"}
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showApiKey ? "text" : "password"}
                    value={hermesApiKey}
                    onChange={(e) => setHermesApiKey(e.target.value)}
                    placeholder="Klik 'Generate Token' untuk membuat kunci"
                    className="font-mono text-xs pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!hermesApiKey}
                  onClick={() => copyToClipboard(hermesApiKey, "key")}
                  className="shrink-0 flex items-center gap-1.5"
                >
                  {copiedKey ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                  {copiedKey ? "Disalin!" : "Salin Token"}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Sertakan token ini pada header HTTP: <code className="bg-muted px-1.5 py-0.5 rounded text-[10px]">Authorization: Bearer &lt;API_KEY&gt;</code>. Rahasiakan token ini!
              </p>
            </div>

            {/* Optional External Webhook URL */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Terminal className="h-3.5 w-3.5 text-slate-500" />
                Webhook URL Hermes VPS (Opsional)
              </Label>
              <Input
                type="url"
                value={hermesWebhookUrl}
                onChange={(e) => setHermesWebhookUrl(e.target.value)}
                placeholder="http://<IP-VPS-ANDA>:8000/webhook atau https://hermes.domainanda.com/webhook"
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Diisi jika Anda ingin Araa Honey Hub mengirim payload event secara proaktif ke server Hermes Anda.
              </p>
            </div>

            {/* Save Settings Button */}
            <div className="pt-2 flex justify-end">
              <Button
                type="button"
                onClick={() => handleSaveHermes()}
                disabled={savingHermes}
                className="bg-violet-600 hover:bg-violet-700 text-white font-medium flex items-center gap-2 shadow-sm"
              >
                {savingHermes ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" />
                    Simpan Pengaturan Hermes
                  </>
                )}
              </Button>
            </div>

            {/* Quick Command Cheatsheet / Reference */}
            <div className="mt-4 rounded-xl border border-muted-foreground/10 bg-muted/20 p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                <Bot className="h-4 w-4 text-violet-500" />
                Panduan Perintah Telegram untuk Hermes Agent Big Bos:
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <div className="p-2.5 rounded-lg bg-card border border-muted-foreground/10 space-y-1">
                  <div className="font-semibold text-violet-600 dark:text-violet-400 flex items-center gap-1.5">
                    📊 <code className="bg-muted px-1 rounded text-[11px]">/summary</code> atau "Omzet hari ini"
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Cek omzet hari ini, total penjualan, tag order pending, order selesai, chat belum dibaca, & lead Scalev.
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-card border border-muted-foreground/10 space-y-1">
                  <div className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    📦 <code className="bg-muted px-1 rounded text-[11px]">/orders</code> atau "Cek order pending"
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Menampilkan daftar kontak WhatsApp yang berlabel 'order' yang siap diproses/dikemas.
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-card border border-muted-foreground/10 space-y-1">
                  <div className="font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                    🍯 <code className="bg-muted px-1 rounded text-[11px]">/stock</code> atau "Cek stok gudang"
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Melihat sisa drum madu mentah (Akasia/Multiflora) & stok packaging (botol, kardus, segel).
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-card border border-muted-foreground/10 space-y-1">
                  <div className="font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                    ✅ <code className="bg-muted px-1 rounded text-[11px]">/selesai &lt;no_wa&gt;</code>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Memindahkan status order konsumen dari 'order' menjadi 'selesai' ('done') langsung dari Telegram.
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-card border border-muted-foreground/10 space-y-1">
                  <div className="font-semibold text-pink-600 dark:text-pink-400 flex items-center gap-1.5">
                    💬 <code className="bg-muted px-1 rounded text-[11px]">/kirim &lt;no_wa&gt; &lt;pesan&gt;</code>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Kirim pesan WhatsApp resmi Araa Honey ke nomor pelanggan tanpa buka dashboard.
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-card border border-muted-foreground/10 space-y-1">
                  <div className="font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                    ℹ️ <code className="bg-muted px-1 rounded text-[11px]">/info</code> atau "Bantuan API"
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Mengambil format dokumentasi JSON live untuk sistem LLM Hermes agar prompt otomatis paham schema API.
                  </p>
                </div>
              </div>
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

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { bootstrapFirstOwner } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { logoBase64 } from "@/lib/logo-base64";

export const Route = createFileRoute("/auth")({ component: AuthPage });

function AuthPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!loading && session) navigate({ to: "/dashboard", replace: true });
  }, [loading, session, navigate]);

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) toast.error(error.message);
    else navigate({ to: "/dashboard", replace: true });
  };

  const onRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${window.location.origin}/auth`,
        },
      });
      if (error) throw error;
      if (!data.session) {
        toast.success("Akun dibuat. Cek email untuk verifikasi, lalu login.");
        return;
      }
      // Try to promote as first owner (only succeeds if no owner exists yet)
      const res = await bootstrapFirstOwner();
      if ((res as any)?.promoted) {
        toast.success("Owner pertama berhasil didaftarkan.");
      } else {
        toast.message("Akun dibuat. Owner sudah ada — minta owner untuk memberi peran.");
      }
      navigate({ to: "/dashboard", replace: true });
    } catch (err: any) {
      toast.error(err?.message ?? "Gagal mendaftar");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center login-honeycomb-bg px-4 relative">
      {/* Glowing Amber Light Spots */}
      <div className="honey-glow-spot top-[-100px] left-[-100px]" />
      <div className="honey-glow-spot bottom-[-150px] right-[-100px] [animation-delay:-4s]" />

      {/* Falling Honey Drips */}
      <div className="falling-honey-drip left-[8%] [animation-delay:0s] [animation-duration:14s]" />
      <div className="falling-honey-drip left-[24%] [animation-delay:4s] [animation-duration:18s]" />
      <div className="falling-honey-drip left-[48%] [animation-delay:2s] [animation-duration:12s]" />
      <div className="falling-honey-drip left-[72%] [animation-delay:7s] [animation-duration:15s]" />
      <div className="falling-honey-drip left-[88%] [animation-delay:5s] [animation-duration:19s]" />

      {/* Floating Animated Bees */}
      <div className="floating-bee top-[15%] left-[12%] [animation-delay:0s]" style={{ fontSize: '32px' }}>🐝</div>
      <div className="floating-bee top-[70%] left-[82%] [animation-delay:1.5s]" style={{ fontSize: '28px' }}>🐝</div>
      <div className="floating-bee top-[28%] left-[84%] [animation-delay:3.2s] opacity-60" style={{ fontSize: '24px' }}>🐝</div>
      <div className="floating-bee top-[78%] left-[10%] [animation-delay:0.8s] opacity-50" style={{ fontSize: '22px' }}>🐝</div>

      {/* Glassmorphism Login Card */}
      <Card className="w-full max-w-md backdrop-blur-xl bg-stone-900/65 border border-amber-500/25 shadow-[0_0_60px_rgba(245,158,11,0.2)] text-stone-100 relative z-10">
        <CardHeader className="text-center space-y-3 pb-4">
          <div className="relative mx-auto w-20 h-20 flex items-center justify-center">
            {/* Soft pulsing gold backglow behind the logo */}
            <div className="absolute inset-0 bg-amber-500/20 rounded-full blur-lg animate-pulse" />
            <img 
              src={logoBase64} 
              alt="Araa Honey Logo" 
              className="relative w-18 h-18 object-contain drop-shadow-[0_4px_12px_rgba(245,158,11,0.4)] rounded-full border border-amber-500/30 bg-stone-950/40 p-1" 
            />
          </div>
          <CardTitle className="text-3xl font-extrabold tracking-wide bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200 bg-clip-text text-transparent drop-shadow-sm">
            Araa Honey
          </CardTitle>
          <CardDescription className="text-stone-300 font-medium text-xs tracking-wider uppercase">
            Manajemen Bisnis Terintegrasi
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-stone-950/80 border border-stone-800/80 p-1 rounded-lg">
              <TabsTrigger 
                value="login" 
                className="text-stone-400 font-bold tracking-wide data-[state=active]:bg-amber-500 data-[state=active]:text-amber-950 transition-all duration-300 rounded-md"
              >
                Masuk
              </TabsTrigger>
              <TabsTrigger 
                value="register" 
                className="text-stone-400 font-bold tracking-wide data-[state=active]:bg-amber-500 data-[state=active]:text-amber-950 transition-all duration-300 rounded-md"
              >
                Daftar
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="login">
              <form onSubmit={onLogin} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email" className="text-stone-300 font-bold text-xs tracking-wide">
                    Email
                  </Label>
                  <Input 
                    id="login-email" 
                    type="email" 
                    required 
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)} 
                    autoComplete="email" 
                    className="bg-stone-950/60 border-stone-800 text-stone-100 placeholder-stone-500 focus-visible:ring-amber-500/40 focus-visible:border-amber-500/50 h-10 transition-all duration-200"
                    placeholder="nama@email.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password" className="text-stone-300 font-bold text-xs tracking-wide">
                    Kata Sandi
                  </Label>
                  <div className="relative">
                    <Input 
                      id="login-password" 
                      type={showPassword ? "text" : "password"} 
                      required 
                      value={password} 
                      onChange={(e) => setPassword(e.target.value)} 
                      autoComplete="current-password" 
                      className="bg-stone-950/60 border-stone-800 text-stone-100 placeholder-stone-500 focus-visible:ring-amber-500/40 focus-visible:border-amber-500/50 pr-10 h-10 transition-all duration-200"
                      placeholder="••••••••"
                    />
                    <button 
                      type="button" 
                      onClick={() => setShowPassword(!showPassword)} 
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-amber-400 transition-colors duration-200"
                    >
                      {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                    </button>
                  </div>
                </div>
                <Button 
                  type="submit" 
                  disabled={submitting} 
                  className="w-full bg-amber-500 hover:bg-amber-600 text-amber-950 font-black h-10 shadow-[0_4px_20px_rgba(245,158,11,0.3)] hover:shadow-[0_4px_25px_rgba(245,158,11,0.45)] transition-all duration-300 border-none cursor-pointer"
                >
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin text-amber-950" />}
                  Masuk
                </Button>
              </form>
            </TabsContent>
            
            <TabsContent value="register">
              <form onSubmit={onRegister} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="reg-name" className="text-stone-300 font-bold text-xs tracking-wide">
                    Nama Lengkap
                  </Label>
                  <Input 
                    id="reg-name" 
                    required 
                    value={fullName} 
                    onChange={(e) => setFullName(e.target.value)} 
                    autoComplete="name" 
                    className="bg-stone-950/60 border-stone-800 text-stone-100 placeholder-stone-500 focus-visible:ring-amber-500/40 focus-visible:border-amber-500/50 h-10 transition-all duration-200"
                    placeholder="Nama Lengkap Anda"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-email" className="text-stone-300 font-bold text-xs tracking-wide">
                    Email
                  </Label>
                  <Input 
                    id="reg-email" 
                    type="email" 
                    required 
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)} 
                    autoComplete="email" 
                    className="bg-stone-950/60 border-stone-800 text-stone-100 placeholder-stone-500 focus-visible:ring-amber-500/40 focus-visible:border-amber-500/50 h-10 transition-all duration-200"
                    placeholder="nama@email.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-password" className="text-stone-300 font-bold text-xs tracking-wide">
                    Kata Sandi
                  </Label>
                  <div className="relative">
                    <Input 
                      id="reg-password" 
                      type={showPassword ? "text" : "password"} 
                      minLength={8} 
                      required 
                      value={password} 
                      onChange={(e) => setPassword(e.target.value)} 
                      autoComplete="new-password" 
                      className="bg-stone-950/60 border-stone-800 text-stone-100 placeholder-stone-500 focus-visible:ring-amber-500/40 focus-visible:border-amber-500/50 pr-10 h-10 transition-all duration-200"
                      placeholder="Minimal 8 karakter"
                    />
                    <button 
                      type="button" 
                      onClick={() => setShowPassword(!showPassword)} 
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-amber-400 transition-colors duration-200"
                    >
                      {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                    </button>
                  </div>
                </div>
                <Button 
                  type="submit" 
                  disabled={submitting} 
                  className="w-full bg-amber-500 hover:bg-amber-600 text-amber-950 font-black h-10 shadow-[0_4px_20px_rgba(245,158,11,0.3)] hover:shadow-[0_4px_25px_rgba(245,158,11,0.45)] transition-all duration-300 border-none cursor-pointer"
                >
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin text-amber-950" />}
                  Daftar
                </Button>
                <p className="text-[10px] text-center text-stone-400 mt-2 leading-relaxed bg-stone-950/30 p-2 rounded border border-stone-800/40">
                  ⚠️ Pendaftar pertama otomatis menjadi Owner. Akun staf berikutnya dibuat oleh Owner di Pengaturan.
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

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
import { ParticleBackground } from "@/components/particle-background";

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
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 relative overflow-hidden select-none">
      {/* Interactive Canvas Background */}
      <ParticleBackground />

      {/* Decorative Warm Accent Light Spots */}
      <div className="absolute top-[-200px] left-[-200px] w-[500px] h-[500px] rounded-full bg-amber-500/5 blur-[120px] pointer-events-none z-0" />
      <div className="absolute bottom-[-200px] right-[-200px] w-[500px] h-[500px] rounded-full bg-blue-500/5 blur-[120px] pointer-events-none z-0" />

      {/* Glassmorphism Light Login Card */}
      <Card className="w-full max-w-md bg-white/75 backdrop-blur-md border border-slate-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.05)] text-slate-800 relative z-10 transition-all duration-300 hover:shadow-[0_20px_60px_rgba(245,158,11,0.06)]">
        <CardHeader className="text-center space-y-2 pb-4">
          <div className="relative mx-auto w-20 h-20 flex items-center justify-center">
            {/* Soft pulsing gold backglow behind the logo */}
            <div className="absolute inset-0 bg-amber-500/15 rounded-full blur-lg animate-pulse" />
            <img 
              src={logoBase64} 
              alt="Araa Honey Logo" 
              className="relative w-18 h-18 object-contain drop-shadow-[0_4px_10px_rgba(245,158,11,0.25)] rounded-full border border-amber-500/10 bg-white p-1" 
            />
          </div>
          <CardTitle className="text-3xl font-extrabold tracking-wide bg-gradient-to-r from-slate-800 via-amber-600 to-slate-800 bg-clip-text text-transparent drop-shadow-xs">
            Araa Honey
          </CardTitle>
          <CardDescription className="text-slate-500 font-bold text-xs tracking-wider uppercase">
            Manajemen Bisnis Terintegrasi
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-slate-100 border border-slate-200/60 p-1 rounded-lg">
              <TabsTrigger 
                value="login" 
                className="text-slate-500 font-bold tracking-wide data-[state=active]:bg-white data-[state=active]:text-amber-600 data-[state=active]:shadow-xs transition-all duration-300 rounded-md"
              >
                Masuk
              </TabsTrigger>
              <TabsTrigger 
                value="register" 
                className="text-slate-500 font-bold tracking-wide data-[state=active]:bg-white data-[state=active]:text-amber-600 data-[state=active]:shadow-xs transition-all duration-300 rounded-md"
              >
                Daftar
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="login">
              <form onSubmit={onLogin} className="space-y-4 pt-3">
                <div className="space-y-1.5">
                  <Label htmlFor="login-email" className="text-slate-600 font-bold text-xs tracking-wide">
                    Email
                  </Label>
                  <Input 
                    id="login-email" 
                    type="email" 
                    required 
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)} 
                    autoComplete="email" 
                    className="bg-white/90 border-slate-200 text-slate-800 placeholder-slate-400 focus-visible:ring-amber-500/20 focus-visible:border-amber-500/50 h-10 transition-all duration-200"
                    placeholder="nama@email.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="login-password" className="text-slate-600 font-bold text-xs tracking-wide">
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
                      className="bg-white/90 border-slate-200 text-slate-800 placeholder-slate-400 focus-visible:ring-amber-500/20 focus-visible:border-amber-500/50 pr-10 h-10 transition-all duration-200"
                      placeholder="••••••••"
                    />
                    <button 
                      type="button" 
                      onClick={() => setShowPassword(!showPassword)} 
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-amber-500 transition-colors duration-200"
                    >
                      {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                    </button>
                  </div>
                </div>
                <Button 
                  type="submit" 
                  disabled={submitting} 
                  className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold h-10 shadow-[0_4px_12px_rgba(245,158,11,0.25)] hover:shadow-[0_4px_18px_rgba(245,158,11,0.35)] transition-all duration-300 border-none cursor-pointer rounded-lg"
                >
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin text-white" />}
                  Masuk
                </Button>
              </form>
            </TabsContent>
            
            <TabsContent value="register">
              <form onSubmit={onRegister} className="space-y-4 pt-3">
                <div className="space-y-1.5">
                  <Label htmlFor="reg-name" className="text-slate-600 font-bold text-xs tracking-wide">
                    Nama Lengkap
                  </Label>
                  <Input 
                    id="reg-name" 
                    required 
                    value={fullName} 
                    onChange={(e) => setFullName(e.target.value)} 
                    autoComplete="name" 
                    className="bg-white/90 border-slate-200 text-slate-800 placeholder-slate-400 focus-visible:ring-amber-500/20 focus-visible:border-amber-500/50 h-10 transition-all duration-200"
                    placeholder="Nama Lengkap Anda"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reg-email" className="text-slate-600 font-bold text-xs tracking-wide">
                    Email
                  </Label>
                  <Input 
                    id="reg-email" 
                    type="email" 
                    required 
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)} 
                    autoComplete="email" 
                    className="bg-white/90 border-slate-200 text-slate-800 placeholder-slate-400 focus-visible:ring-amber-500/20 focus-visible:border-amber-500/50 h-10 transition-all duration-200"
                    placeholder="nama@email.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reg-password" className="text-slate-600 font-bold text-xs tracking-wide">
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
                      className="bg-white/90 border-slate-200 text-slate-800 placeholder-slate-400 focus-visible:ring-amber-500/20 focus-visible:border-amber-500/50 pr-10 h-10 transition-all duration-200"
                      placeholder="Minimal 8 karakter"
                    />
                    <button 
                      type="button" 
                      onClick={() => setShowPassword(!showPassword)} 
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-amber-500 transition-colors duration-200"
                    >
                      {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                    </button>
                  </div>
                </div>
                <Button 
                  type="submit" 
                  disabled={submitting} 
                  className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold h-10 shadow-[0_4px_12px_rgba(245,158,11,0.25)] hover:shadow-[0_4px_18px_rgba(245,158,11,0.35)] transition-all duration-300 border-none cursor-pointer rounded-lg"
                >
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin text-white" />}
                  Daftar
                </Button>
                <p className="text-[10px] text-center text-slate-500 mt-2 leading-relaxed bg-slate-50 p-2 rounded border border-slate-200/60">
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

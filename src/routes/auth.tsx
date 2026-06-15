import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
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
  
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!loading && session) navigate({ to: "/dashboard", replace: true });
  }, [loading, session, navigate]);

  // Antigravity Canvas Particle Animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const mouse = { x: -1000, y: -1000, radius: 150 };

    const handleMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };

    const handleMouseLeave = () => {
      mouse.x = -1000;
      mouse.y = -1000;
    };

    // Color bands matching the Google Antigravity visual spectrum (Blue -> Purple -> Red -> Orange -> Yellow)
    const bandsCount = 20;
    const bandColors = Array.from({ length: bandsCount }, (_, idx) => {
      const ratio = idx / (bandsCount - 1);
      let hue = 0;
      if (ratio < 0.25) {
        // Indigo / Blue
        hue = 225 + (ratio / 0.25) * 35;
      } else if (ratio < 0.55) {
        // Purple / Magenta / Pink
        hue = 260 + ((ratio - 0.25) / 0.3) * 85;
      } else if (ratio < 0.8) {
        // Red / Orange
        hue = (345 + ((ratio - 0.55) / 0.25) * 45) % 360;
      } else {
        // Gold / Yellow
        hue = 30 + ((ratio - 0.8) / 0.2) * 22;
      }
      // Bright colors on light background
      return `hsla(${hue}, 86%, 56%, 0.75)`;
    });

    interface Particle {
      x: number;
      y: number;
      ox: number; // original grid coordinate
      oy: number;
      vx: number;
      vy: number;
      size: number;
    }

    let particleBands: Particle[][] = [];

    const populateGrid = () => {
      particleBands = Array.from({ length: bandsCount }, () => []);
      const gap = 24; // Spacing of the grid dashes
      const cols = Math.ceil(width / gap);
      const rows = Math.ceil(height / gap);

      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          // Add organic offset to grid to look natural and not overly rigid
          const ox = c * gap + (Math.random() - 0.5) * 6;
          const oy = r * gap + (Math.random() - 0.5) * 6;

          const ratio = ox / width;
          const bandIndex = Math.min(bandsCount - 1, Math.floor(ratio * bandsCount));

          particleBands[bandIndex].push({
            x: ox,
            y: oy,
            ox,
            oy,
            vx: 0,
            vy: 0,
            size: Math.random() * 4 + 7 // Length of each dash (7px to 11px)
          });
        }
      }
    };

    populateGrid();

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      populateGrid();
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseleave", handleMouseLeave);
    window.addEventListener("resize", handleResize);

    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      // Draw subtle technical grid (faint look)
      ctx.strokeStyle = "rgba(226, 232, 240, 0.2)";
      ctx.lineWidth = 1;
      const gridSize = 120;
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Render the particles with custom line style
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";

      for (let b = 0; b < bandsCount; b++) {
        ctx.strokeStyle = bandColors[b];
        ctx.beginPath();
        
        const bandParticles = particleBands[b];
        const len = bandParticles.length;

        for (let i = 0; i < len; i++) {
          const p = bandParticles[i];

          // 1. Mouse Attraction/Repulsion (Push away fluidly)
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < mouse.radius) {
            const force = (mouse.radius - dist) / mouse.radius;
            // Bending force away from cursor
            const push = force * force * 3.8;
            p.vx += (dx / dist) * push;
            p.vy += (dy / dist) * push;
          }

          // 2. Spring-mass return physics to keep grid alignment
          const homeDx = p.ox - p.x;
          const homeDy = p.oy - p.y;
          p.vx += homeDx * 0.045; // Spring force coefficient
          p.vy += homeDy * 0.045;

          // 3. Apply damping (friction) for smooth sliding
          p.vx *= 0.83;
          p.vy *= 0.83;

          // 4. Update coordinates
          p.x += p.vx;
          p.y += p.vy;

          // 5. Draw the tilted dash (pointing bottom-left to top-right at 45 degrees)
          const baseLength = p.size;
          // Apply velocity stretching effect
          const stretchX = p.vx * 0.65;
          const stretchY = p.vy * 0.65;

          // Rotated vector dx/dy (cos 45 = 0.707, sin 45 = 0.707)
          const halfLen = baseLength * 0.5;
          const rx = halfLen * 0.707;
          const ry = halfLen * 0.707;

          // Bottom-left to top-right
          ctx.moveTo(p.x - rx - stretchX, p.y + ry - stretchY);
          ctx.lineTo(p.x + rx + stretchX, p.y - ry + stretchY);
        }

        ctx.stroke();
      }

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationId);
    };
  }, []);

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
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-0" />

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

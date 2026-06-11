import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
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
import { Pencil, Trash2, Wallet, Calendar, TrendingUp } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  Cell 
} from "recharts";

export const Route = createFileRoute("/pengeluaran-pribadi")({ component: () => <RequireAuth ownerOnly><Page /></RequireAuth> });

const colorPalette = [
  { bg: "bg-indigo-500", fill: "#6366f1" },
  { bg: "bg-emerald-500", fill: "#10b981" },
  { bg: "bg-amber-500", fill: "#f59e0b" },
  { bg: "bg-rose-500", fill: "#f43f5e" },
  { bg: "bg-sky-500", fill: "#0ea5e9" },
  { bg: "bg-violet-500", fill: "#8b5cf6" },
  { bg: "bg-pink-500", fill: "#ec4899" },
];

function Page() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: rows } = useQuery({
    queryKey: ["personal-expenses"],
    queryFn: async () => (await supabase.from("expenses_personal").select("*").order("occurred_on", { ascending: false })).data ?? [],
  });
  const [form, setForm] = useState({ category: "", amount: 0, note: "", occurred_on: new Date().toISOString().slice(0, 10) });
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // --- 1. Data Aggregation for Summary ---
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthIdx = now.getMonth(); // 0-indexed
  const currentYearStr = String(currentYear);
  const currentMonthStr = String(currentMonthIdx + 1).padStart(2, "0");
  const currentMonthPrefix = `${currentYearStr}-${currentMonthStr}`; // "YYYY-MM"

  // Filter current month's rows
  const currentMonthRows = (rows ?? []).filter(r => r.occurred_on && String(r.occurred_on).startsWith(currentMonthPrefix));
  const totalThisMonth = currentMonthRows.reduce((sum, r) => sum + Number(r.amount), 0);

  // Daily Average
  const daysPassed = now.getDate();
  const dailyAverage = daysPassed > 0 ? totalThisMonth / daysPassed : 0;

  // Max Expense this month
  const maxExpenseRow = currentMonthRows.reduce((max, r) => Number(r.amount) > Number(max.amount || 0) ? r : max, {} as any);
  const maxExpenseAmount = maxExpenseRow.amount ? Number(maxExpenseRow.amount) : 0;
  const maxExpenseLabel = maxExpenseRow.category ? `${maxExpenseRow.category} (${maxExpenseRow.note || "—"})` : "—";

  // Category Breakdown
  const categoryMap: { [key: string]: number } = {};
  currentMonthRows.forEach(r => {
    const cat = r.category || "Lainnya";
    categoryMap[cat] = (categoryMap[cat] || 0) + Number(r.amount);
  });

  const categoryData = Object.entries(categoryMap)
    .map(([name, value]) => ({
      name,
      value,
      percentage: totalThisMonth > 0 ? (value / totalThisMonth) * 100 : 0
    }))
    .sort((a, b) => b.value - a.value);

  // 30-Day trend chart sequence
  const trendData = [];
  for (let i = 29; i >= 0; i--) {
    const dObj = new Date();
    dObj.setDate(dObj.getDate() - i);
    const year = dObj.getFullYear();
    const monthNum = String(dObj.getMonth() + 1).padStart(2, "0");
    const dayNum = String(dObj.getDate()).padStart(2, "0");
    const dateStr = `${year}-${monthNum}-${dayNum}`;
    
    const dayAmount = (rows ?? [])
      .filter((r: any) => r.occurred_on === dateStr)
      .reduce((sum: number, r: any) => sum + Number(r.amount), 0);
      
    const day = parseInt(dayNum, 10);
    const monthIdx = parseInt(monthNum, 10) - 1;
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];
    const month = monthNames[monthIdx];
    
    trendData.push({
      dateStr,
      label: `${day} ${month}`,
      amount: dayAmount
    });
  }

  // --- 2. Action Handlers ---
  const startEdit = (r: any) => {
    setEditingId(r.id);
    setForm({
      category: r.category,
      amount: Number(r.amount),
      note: r.note || "",
      occurred_on: r.occurred_on,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    let error;
    if (editingId) {
      const res = await supabase
        .from("expenses_personal")
        .update({
          category: form.category,
          amount: form.amount,
          note: form.note,
          occurred_on: form.occurred_on,
        })
        .eq("id", editingId);
      error = res.error;
    } else {
      const res = await supabase
        .from("expenses_personal")
        .insert({ ...form, owner_id: user?.id });
      error = res.error;
    }
    setSubmitting(false);
    if (error) toast.error(error.message);
    else {
      toast.success(editingId ? "Pengeluaran diperbarui" : "Tercatat");
      setForm({ category: "", amount: 0, note: "", occurred_on: new Date().toISOString().slice(0, 10) });
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ["personal-expenses"] });
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    const { error } = await supabase.from("expenses_personal").delete().eq("id", deletingId);
    if (error) toast.error(error.message);
    else {
      toast.success("Pengeluaran dihapus");
      qc.invalidateQueries({ queryKey: ["personal-expenses"] });
    }
    setDeletingId(null);
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-2xl font-semibold">Pengeluaran Pribadi / Rumah Tangga</h2>
        <p className="text-sm text-muted-foreground">Hanya owner yang bisa melihat & menginput modul ini.</p>
      </div>

      {/* Ringkasan Dashboard (Colorful KPI Cards) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* KPI Card 1: Total Pengeluaran */}
        <div className="p-6 rounded-2xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-purple-700 text-white shadow-md flex justify-between items-center relative overflow-hidden transition-all hover:scale-[1.01] duration-300">
          <div className="absolute right-0 bottom-0 opacity-10 translate-x-4 translate-y-4">
            <Wallet className="h-32 w-32" />
          </div>
          <div className="space-y-2 relative z-10">
            <p className="text-indigo-100 text-sm font-medium">Pengeluaran Bulan Ini</p>
            <h3 className="text-2xl font-bold">{formatIDR(totalThisMonth)}</h3>
            <p className="text-xs text-indigo-200">Bulan {now.toLocaleDateString("id-ID", { month: "long", year: "numeric" })}</p>
          </div>
          <div className="p-3 bg-white/10 rounded-xl relative z-10">
            <Wallet className="h-6 w-6 text-white" />
          </div>
        </div>

        {/* KPI Card 2: Rata-Rata Harian */}
        <div className="p-6 rounded-2xl bg-gradient-to-br from-emerald-400 via-teal-500 to-emerald-600 text-white shadow-md flex justify-between items-center relative overflow-hidden transition-all hover:scale-[1.01] duration-300">
          <div className="absolute right-0 bottom-0 opacity-10 translate-x-4 translate-y-4">
            <Calendar className="h-32 w-32" />
          </div>
          <div className="space-y-2 relative z-10">
            <p className="text-emerald-100 text-sm font-medium">Rata-Rata Harian</p>
            <h3 className="text-2xl font-bold">{formatIDR(dailyAverage)}</h3>
            <p className="text-xs text-emerald-200">Dihitung selama {daysPassed} hari aktif</p>
          </div>
          <div className="p-3 bg-white/10 rounded-xl relative z-10">
            <Calendar className="h-6 w-6 text-white" />
          </div>
        </div>

        {/* KPI Card 3: Terbesar Bulan Ini */}
        <div className="p-6 rounded-2xl bg-gradient-to-br from-pink-500 via-rose-500 to-pink-700 text-white shadow-md flex justify-between items-center relative overflow-hidden transition-all hover:scale-[1.01] duration-300">
          <div className="absolute right-0 bottom-0 opacity-10 translate-x-4 translate-y-4">
            <TrendingUp className="h-32 w-32" />
          </div>
          <div className="space-y-2 relative z-10">
            <p className="text-pink-100 text-sm font-medium">Terbesar Bulan Ini</p>
            <h3 className="text-2xl font-bold">{formatIDR(maxExpenseAmount)}</h3>
            <p className="text-xs text-pink-200 truncate max-w-[200px]" title={maxExpenseLabel}>{maxExpenseLabel}</p>
          </div>
          <div className="p-3 bg-white/10 rounded-xl relative z-10">
            <TrendingUp className="h-6 w-6 text-white" />
          </div>
        </div>
      </div>

      {/* Two column charts/breakdown layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Category breakdown */}
        <Card className="border-none shadow-md overflow-hidden bg-white dark:bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold flex items-center gap-2 text-foreground">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block" />
              Kategori Pengeluaran Bulan Ini
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-2">
            {categoryData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Belum ada pengeluaran di bulan ini.</p>
            ) : (
              categoryData.map((cat, idx) => {
                const color = colorPalette[idx % colorPalette.length];
                return (
                  <div key={cat.name} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium text-foreground">{cat.name}</span>
                      <div className="space-x-1.5 text-right">
                        <span className="text-foreground font-semibold">{formatIDR(cat.value)}</span>
                        <span className="text-xs text-muted-foreground">({cat.percentage.toFixed(1)}%)</span>
                      </div>
                    </div>
                    {/* Progress Bar */}
                    <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${color.bg} rounded-full transition-all duration-500`}
                        style={{ width: `${cat.percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* 30 Day Trend Chart */}
        <Card className="border-none shadow-md overflow-hidden bg-white dark:bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold flex items-center gap-2 text-foreground">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
              Tren Pengeluaran 30 Hari Terakhir
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2 h-[260px]">
            {mounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <XAxis 
                    dataKey="label" 
                    tick={{ fontSize: 10, fill: "#888888" }} 
                    axisLine={false} 
                    tickLine={false} 
                  />
                  <YAxis 
                    tick={{ fontSize: 10, fill: "#888888" }} 
                    axisLine={false} 
                    tickLine={false} 
                    tickFormatter={(val) => val >= 1000000 ? `${(val/1000000).toFixed(1)}M` : val >= 1000 ? `${(val/1000)}k` : val}
                  />
                  <Tooltip 
                    formatter={(value: any) => [formatIDR(value), "Pengeluaran"]}
                    labelStyle={{ color: "#64748b", fontWeight: "bold" }}
                    contentStyle={{ 
                      borderRadius: "8px", 
                      border: "none", 
                      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)", 
                      backgroundColor: "#ffffff",
                      color: "#0f172a"
                    }}
                  />
                  <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                    {trendData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill="url(#colorAmount)"
                      />
                    ))}
                  </Bar>
                  <defs>
                    <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.8}/>
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
                Memuat diagram...
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Input Form */}
      <Card>
        <CardHeader><CardTitle>{editingId ? "Edit Pengeluaran" : "Tambah"}</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="space-y-1"><Label>Kategori</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required placeholder="Belanja, Sekolah, dll" /></div>
            <div className="space-y-1"><Label>Tanggal</Label><Input type="date" value={form.occurred_on} onChange={(e) => setForm({ ...form, occurred_on: e.target.value })} /></div>
            <div className="space-y-1"><Label>Nominal</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: +e.target.value })} required /></div>
            <div className="md:col-span-2 space-y-1"><Label>Catatan</Label><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
            <div className="md:col-span-5 flex gap-2">
              <Button type="submit" disabled={submitting}>
                {editingId ? "Update" : "Simpan"}
              </Button>
              {editingId && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingId(null);
                    setForm({ category: "", amount: 0, note: "", occurred_on: new Date().toISOString().slice(0, 10) });
                  }}
                >
                  Batal
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* History Table */}
      <Card>
        <CardHeader><CardTitle>Riwayat</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead>Nominal</TableHead>
                <TableHead>Catatan</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rows ?? []).map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell>{r.occurred_on}</TableCell>
                  <TableCell>{r.category}</TableCell>
                  <TableCell>{formatIDR(r.amount)}</TableCell>
                  <TableCell className="text-muted-foreground">{r.note}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(r)}>
                      <Pencil className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30" onClick={() => setDeletingId(r.id)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={deletingId !== null} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Pengeluaran?</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus catatan pengeluaran ini? Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white">
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

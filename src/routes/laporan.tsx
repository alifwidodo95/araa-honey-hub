import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RequireAuth } from "@/components/require-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend
} from "recharts";
import { BarChart3, Droplets, TrendingUp, Package } from "lucide-react";

export const Route = createFileRoute("/laporan")({
  component: () => (
    <RequireAuth requiredPermission="laporan">
      <Page />
    </RequireAuth>
  ),
});

const MONTHS_INDO = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

const VARIANT_COLORS: Record<string, string> = {
  Akasia: "#f59e0b",
  Randu: "#10b981",
  Karet: "#3b82f6",
  Lainnya: "#8b5cf6",
};
const DEFAULT_COLORS = ["#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

function getVariantColor(name: string, idx: number) {
  return VARIANT_COLORS[name] ?? DEFAULT_COLORS[idx % DEFAULT_COLORS.length];
}

/** Convert grams to kg with 3 decimal places */
function gramsToKg(grams: number) {
  return grams / 1000;
}

function formatKg(kg: number) {
  return kg % 1 === 0 ? `${kg} kg` : `${kg.toFixed(3)} kg`;
}

/** Build YYYY-MM period options for the last N months */
function buildPeriodOptions(n = 12) {
  const now = new Date();
  const opts: { label: string; value: string }[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = `${MONTHS_INDO[d.getMonth()]} ${d.getFullYear()}`;
    opts.push({ value, label });
  }
  return opts;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-background/95 backdrop-blur border border-border rounded-xl shadow-xl p-3 text-sm space-y-1">
        <p className="font-semibold text-foreground">{label}</p>
        {payload.map((entry: any) => (
          <p key={entry.dataKey} style={{ color: entry.color }} className="flex items-center gap-1.5">
            <span className="font-medium">{entry.name}:</span>
            <span>{formatKg(entry.value)}</span>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

function Page() {
  const periodOptions = useMemo(() => buildPeriodOptions(24), []);
  const [selectedPeriod, setSelectedPeriod] = useState(periodOptions[0].value);

  const [year, month] = selectedPeriod.split("-").map(Number);
  const startDate = new Date(year, month - 1, 1).toISOString();
  const endDate = new Date(year, month, 1).toISOString();

  // 1. Query: orders in the selected period, with their items & product sizes
  const { data: orderItems, isLoading } = useQuery({
    queryKey: ["laporan-konsumsi-madu", selectedPeriod],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          `
          id,
          order_date,
          order_items (
            id,
            quantity,
            honey_type,
            size_grams,
            product_sizes (
              size_grams,
              honey_type
            )
          )
        `
        )
        .gte("order_date", startDate)
        .lt("order_date", endDate)
        .not("status", "eq", "cancelled");

      if (error) throw error;
      return data ?? [];
    },
  });

  // 2. Query: all variants for color mapping
  const { data: variants } = useQuery({
    queryKey: ["variants"],
    queryFn: async () =>
      ((await (supabase.from("honey_variants" as any) as any).select("name").eq("active", true)).data ?? []).map(
        (v: any) => v.name
      ),
  });

  // 3. Aggregate: total kg per honey variant for selected month
  const consumptionByVariant = useMemo(() => {
    if (!orderItems) return [];
    const map: Record<string, number> = {};

    for (const order of orderItems) {
      for (const item of (order.order_items as any[]) ?? []) {
        const variantName: string =
          item.honey_type ||
          (item.product_sizes as any)?.honey_type ||
          "Lainnya";
        const sizeGrams: number =
          item.size_grams ||
          (item.product_sizes as any)?.size_grams ||
          0;
        const qty: number = item.quantity || 1;
        const totalGrams = sizeGrams * qty;

        map[variantName] = (map[variantName] ?? 0) + totalGrams;
      }
    }

    return Object.entries(map)
      .map(([variant, grams]) => ({ variant, grams, kg: gramsToKg(grams) }))
      .sort((a, b) => b.grams - a.grams);
  }, [orderItems]);

  // 4. Total
  const totalKg = useMemo(
    () => consumptionByVariant.reduce((sum, v) => sum + v.kg, 0),
    [consumptionByVariant]
  );
  const totalOrders = orderItems?.length ?? 0;

  // 5. Last 6 months trend data
  const { data: trendData, isLoading: trendLoading } = useQuery({
    queryKey: ["laporan-tren-6bulan"],
    queryFn: async () => {
      const now = new Date();
      const results = [];

      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString();
        const label = MONTHS_INDO[d.getMonth()];

        const { data } = await supabase
          .from("orders")
          .select(`order_items(quantity, size_grams, honey_type, product_sizes(size_grams, honey_type))`)
          .gte("order_date", start)
          .lt("order_date", end)
          .not("status", "eq", "cancelled");

        const byVariant: Record<string, number> = {};
        for (const order of data ?? []) {
          for (const item of (order.order_items as any[]) ?? []) {
            const v =
              item.honey_type || (item.product_sizes as any)?.honey_type || "Lainnya";
            const g = (item.size_grams || (item.product_sizes as any)?.size_grams || 0) * (item.quantity || 1);
            byVariant[v] = (byVariant[v] ?? 0) + g;
          }
        }

        const row: Record<string, any> = { bulan: label };
        for (const [v, g] of Object.entries(byVariant)) {
          row[v] = gramsToKg(g);
        }
        results.push(row);
      }

      return results;
    },
    staleTime: 1000 * 60 * 5,
  });

  // 6. Collect all variant keys from trend data
  const trendVariants = useMemo(() => {
    if (!trendData) return [];
    const keys = new Set<string>();
    trendData.forEach((row) => Object.keys(row).forEach((k) => k !== "bulan" && keys.add(k)));
    return Array.from(keys);
  }, [trendData]);

  const selectedLabel = periodOptions.find((o) => o.value === selectedPeriod)?.label ?? selectedPeriod;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-amber-500" />
            Laporan Konsumsi Madu
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Berapa kg madu terjual per varian setiap bulannya
          </p>
        </div>
        <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {periodOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg">
                <Droplets className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total Madu Terjual</p>
                <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                  {isLoading ? "—" : formatKg(totalKg)}
                </p>
                <p className="text-xs text-muted-foreground">{selectedLabel}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-muted rounded-lg">
                <Package className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total Order</p>
                <p className="text-2xl font-bold">{isLoading ? "—" : totalOrders}</p>
                <p className="text-xs text-muted-foreground">pesanan selesai</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-muted rounded-lg">
                <TrendingUp className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Varian Terlaris</p>
                <p className="text-2xl font-bold">
                  {isLoading || consumptionByVariant.length === 0
                    ? "—"
                    : consumptionByVariant[0].variant}
                </p>
                <p className="text-xs text-muted-foreground">
                  {consumptionByVariant[0] ? formatKg(consumptionByVariant[0].kg) : ""}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bar Chart: Konsumsi per Varian bulan ini */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            Konsumsi per Varian — {selectedLabel}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-52 flex items-center justify-center text-muted-foreground text-sm">
              Memuat data...
            </div>
          ) : consumptionByVariant.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-muted-foreground text-sm">
              Tidak ada data penjualan pada periode ini.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={consumptionByVariant} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                <XAxis dataKey="variant" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v} kg`} width={60} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-background border border-border rounded-xl shadow-xl p-3 text-sm">
                          <p className="font-semibold">{label}</p>
                          <p className="text-amber-600 font-medium">{formatKg(payload[0].value as number)}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="kg" radius={[6, 6, 0, 0]}>
                  {consumptionByVariant.map((entry, idx) => (
                    <Cell key={entry.variant} fill={getVariantColor(entry.variant, idx)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Tabel Rincian */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Rincian Konsumsi — {selectedLabel}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Memuat data...</div>
          ) : consumptionByVariant.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Tidak ada data.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Varian Madu</TableHead>
                  <TableHead className="text-right">Total (gram)</TableHead>
                  <TableHead className="text-right">Total (kg)</TableHead>
                  <TableHead className="text-right">% dari Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {consumptionByVariant.map((row, idx) => {
                  const pct = totalKg > 0 ? ((row.kg / totalKg) * 100).toFixed(1) : "0.0";
                  return (
                    <TableRow key={row.variant}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full inline-block"
                            style={{ background: getVariantColor(row.variant, idx) }}
                          />
                          <span className="font-medium">{row.variant}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.grams.toLocaleString("id-ID")} gr
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {formatKg(row.kg)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary">{pct}%</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="font-bold bg-muted/40">
                  <TableCell>TOTAL</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {(totalKg * 1000).toLocaleString("id-ID")} gr
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatKg(totalKg)}</TableCell>
                  <TableCell className="text-right">100%</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Tren 6 Bulan */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Tren Konsumsi 6 Bulan Terakhir</CardTitle>
        </CardHeader>
        <CardContent>
          {trendLoading ? (
            <div className="h-60 flex items-center justify-center text-muted-foreground text-sm">
              Memuat tren...
            </div>
          ) : !trendData || trendVariants.length === 0 ? (
            <div className="h-60 flex items-center justify-center text-muted-foreground text-sm">
              Belum cukup data untuk menampilkan tren.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={trendData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                <XAxis dataKey="bulan" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v} kg`} width={60} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                {trendVariants.map((v, idx) => (
                  <Bar
                    key={v}
                    dataKey={v}
                    name={v}
                    stackId="a"
                    fill={getVariantColor(v, idx)}
                    radius={idx === trendVariants.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { RequireAuth } from "@/components/require-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

export const Route = createFileRoute("/pengaturan/harga")({ component: () => <RequireAuth ownerOnly><Page /></RequireAuth> });

function Page() {
  const qc = useQueryClient();
  const { data: sizes } = useQuery({ queryKey: ["sizes"], queryFn: async () => (await supabase.from("product_sizes").select("*").order("sort_order")).data ?? [] });
  const { data: retail } = useQuery({ queryKey: ["retail"], queryFn: async () => (await supabase.from("retail_prices").select("*")).data ?? [] });
  const { data: tiers } = useQuery({ queryKey: ["tiers"], queryFn: async () => (await supabase.from("reseller_tiers").select("*").order("sort_order")).data ?? [] });
  const { data: rp } = useQuery({ queryKey: ["rp"], queryFn: async () => (await supabase.from("reseller_prices").select("*")).data ?? [] });
  const { data: fees } = useQuery({ queryKey: ["fees"], queryFn: async () => (await supabase.from("marketplace_fees").select("*")).data ?? [] });

  const updateRetail = async (size_id: string, price: number) => {
    const { error } = await supabase.from("retail_prices").update({ price }).eq("size_id", size_id);
    if (error) toast.error(error.message); else { toast.success("Harga retail diperbarui"); qc.invalidateQueries({ queryKey: ["retail"] }); }
  };
  const updateReseller = async (tier_id: string, size_id: string, price: number) => {
    const { error } = await supabase.from("reseller_prices").update({ price }).eq("tier_id", tier_id).eq("size_id", size_id);
    if (error) toast.error(error.message); else { toast.success("Harga reseller diperbarui"); qc.invalidateQueries({ queryKey: ["rp"] }); }
  };
  const updateFee = async (channel: string, fee_percent: number) => {
    const { error } = await supabase.from("marketplace_fees").update({ fee_percent }).eq("channel", channel as any);
    if (error) toast.error(error.message); else { toast.success("Fee diperbarui"); qc.invalidateQueries({ queryKey: ["fees"] }); }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h2 className="text-2xl font-semibold">Pengaturan Harga & Fee</h2>
        <p className="text-sm text-muted-foreground">Atur harga retail, harga per tier reseller, dan persentase fee marketplace.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Harga Retail</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Ukuran</TableHead><TableHead>Harga (Rp)</TableHead></TableRow></TableHeader>
            <TableBody>
              {(sizes ?? []).map((s: any) => {
                const p = retail?.find((r: any) => r.size_id === s.id)?.price ?? 0;
                return <TableRow key={s.id}><TableCell>{s.name}</TableCell><TableCell><Input type="number" defaultValue={p} onBlur={(e) => updateRetail(s.id, +e.target.value)} className="w-40" /></TableCell></TableRow>;
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Harga Reseller per Tier</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Ukuran</TableHead>{(tiers ?? []).map((t: any) => <TableHead key={t.id}>{t.name}</TableHead>)}</TableRow></TableHeader>
            <TableBody>
              {(sizes ?? []).map((s: any) => (
                <TableRow key={s.id}>
                  <TableCell>{s.name}</TableCell>
                  {(tiers ?? []).map((t: any) => {
                    const p = rp?.find((r: any) => r.tier_id === t.id && r.size_id === s.id)?.price ?? 0;
                    return <TableCell key={t.id}><Input type="number" defaultValue={p} onBlur={(e) => updateReseller(t.id, s.id, +e.target.value)} className="w-32" /></TableCell>;
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Fee Marketplace (%)</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Channel</TableHead><TableHead>Fee %</TableHead></TableRow></TableHeader>
            <TableBody>
              {(fees ?? []).map((f: any) => (
                <TableRow key={f.channel}><TableCell className="capitalize">{f.channel}</TableCell><TableCell><Input type="number" step="0.1" defaultValue={f.fee_percent} onBlur={(e) => updateFee(f.channel, +e.target.value)} className="w-32" /></TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

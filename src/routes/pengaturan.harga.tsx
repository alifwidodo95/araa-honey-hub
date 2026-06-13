import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RequireAuth } from "@/components/require-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

export const Route = createFileRoute("/pengaturan/harga")({ component: () => <RequireAuth requiredPermission="pengaturan_harga"><Page /></RequireAuth> });

function Page() {
  const qc = useQueryClient();
  const [selectedVariant, setSelectedVariant] = useState("Akasia");
  const [newVariantName, setNewVariantName] = useState("");
  const [addingVariant, setAddingVariant] = useState(false);

  // Queries
  const { data: sizes } = useQuery({ queryKey: ["sizes"], queryFn: async () => (await supabase.from("product_sizes").select("*").order("sort_order")).data ?? [] });
  const { data: retail } = useQuery({ queryKey: ["retail"], queryFn: async () => (await supabase.from("retail_prices").select("*")).data ?? [] });
  const { data: tiers } = useQuery({ queryKey: ["tiers"], queryFn: async () => (await supabase.from("reseller_tiers").select("*").order("sort_order")).data ?? [] });
  const { data: rp } = useQuery({ queryKey: ["rp"], queryFn: async () => (await supabase.from("reseller_prices").select("*")).data ?? [] });
  const { data: fees } = useQuery({ queryKey: ["fees"], queryFn: async () => (await supabase.from("marketplace_fees").select("*")).data ?? [] });
  const { data: variants } = useQuery({ 
    queryKey: ["variants"], 
    queryFn: async () => (await (supabase.from("honey_variants" as any) as any).select("*").order("name")).data ?? [] 
  });

  const activeVariants = (variants ?? []).filter((v: any) => v.active);

  // Set default selected variant once variants are loaded
  useEffect(() => {
    if (activeVariants.length > 0 && !activeVariants.some((v: any) => v.name === selectedVariant)) {
      setSelectedVariant(activeVariants[0].name);
    }
  }, [variants]);

  // Mutations/Updates
  const updateRetail = async (size_id: string, honey_type: string, price: number) => {
    const { error } = await (supabase.from("retail_prices") as any)
      .update({ price })
      .eq("size_id", size_id)
      .eq("honey_type", honey_type);
    
    if (error) toast.error(error.message); 
    else { 
      toast.success(`Harga retail ${honey_type} diperbarui`); 
      qc.invalidateQueries({ queryKey: ["retail"] }); 
    }
  };

  const updateReseller = async (tier_id: string, size_id: string, honey_type: string, price: number) => {
    const { error } = await (supabase.from("reseller_prices") as any)
      .update({ price })
      .eq("tier_id", tier_id)
      .eq("size_id", size_id)
      .eq("honey_type", honey_type);
    
    if (error) toast.error(error.message); 
    else { 
      toast.success(`Harga reseller ${honey_type} diperbarui`); 
      qc.invalidateQueries({ queryKey: ["rp"] }); 
    }
  };

  const updateFee = async (channel: string, fee_percent: number) => {
    const { error } = await supabase.from("marketplace_fees").update({ fee_percent }).eq("channel", channel as any);
    if (error) toast.error(error.message); else { toast.success("Fee diperbarui"); qc.invalidateQueries({ queryKey: ["fees"] }); }
  };

  const handleAddVariant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVariantName.trim()) return;
    const name = newVariantName.trim();
    setAddingVariant(true);
    const { error } = await supabase.from("honey_variants" as any).insert({ name });
    setAddingVariant(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`Varian ${name} berhasil ditambahkan!`);
      setNewVariantName("");
      qc.invalidateQueries();
    }
  };

  const toggleVariantActive = async (id: string, currentActive: boolean) => {
    const { error } = await supabase
      .from("honey_variants" as any)
      .update({ active: !currentActive })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`Status varian diperbarui`);
      qc.invalidateQueries();
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Pengaturan Harga & Fee</h2>
          <p className="text-sm text-muted-foreground">Atur harga retail, harga per tier reseller, dan persentase fee marketplace.</p>
        </div>
        <div className="flex items-center gap-2 bg-muted/50 p-2 rounded-lg border">
          <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">Pilih Jenis Madu:</label>
          <select 
            value={selectedVariant} 
            onChange={(e) => setSelectedVariant(e.target.value)}
            className="flex h-9 w-44 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            {activeVariants.map((v: any) => (
              <option key={v.id} value={v.name}>{v.name}</option>
            ))}
          </select>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Harga Retail — Madu {selectedVariant}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Ukuran</TableHead><TableHead>Harga (Rp)</TableHead></TableRow></TableHeader>
            <TableBody>
              {(sizes ?? []).map((s: any) => {
                const p = retail?.find((r: any) => r.size_id === s.id && r.honey_type === selectedVariant)?.price ?? 0;
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>
                      <Input 
                        type="number" 
                        key={`${s.id}-${selectedVariant}-${p}`}
                        defaultValue={p} 
                        onBlur={(e) => updateRetail(s.id, selectedVariant, +e.target.value)} 
                        className="w-40" 
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Harga Reseller per Tier — Madu {selectedVariant}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ukuran</TableHead>
                {(tiers ?? []).map((t: any) => <TableHead key={t.id}>{t.name}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(sizes ?? []).map((s: any) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  {(tiers ?? []).map((t: any) => {
                    const p = rp?.find((r: any) => r.tier_id === t.id && r.size_id === s.id && r.honey_type === selectedVariant)?.price ?? 0;
                    return (
                      <TableCell key={t.id}>
                        <Input 
                          type="number" 
                          key={`${t.id}-${s.id}-${selectedVariant}-${p}`}
                          defaultValue={p} 
                          onBlur={(e) => updateReseller(t.id, s.id, selectedVariant, +e.target.value)} 
                          className="w-32" 
                        />
                      </TableCell>
                    );
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
                <TableRow key={f.channel}>
                  <TableCell className="capitalize font-medium">{f.channel}</TableCell>
                  <TableCell>
                    <Input 
                      type="number" 
                      step="0.1" 
                      defaultValue={f.fee_percent} 
                      onBlur={(e) => updateFee(f.channel, +e.target.value)} 
                      className="w-32" 
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kelola Varian Madu</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleAddVariant} className="flex gap-2 max-w-md">
            <Input 
              placeholder="Nama varian baru (misal: Klanceng)" 
              value={newVariantName} 
              onChange={(e) => setNewVariantName(e.target.value)} 
              required
            />
            <Button type="submit" disabled={addingVariant} className="bg-honey hover:bg-honey-dark text-honey-foreground">
              Tambah Varian
            </Button>
          </form>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama Varian</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-32 text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(variants ?? []).map((v: any) => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium">{v.name}</TableCell>
                  <TableCell>
                    {v.active ? (
                      <span className="inline-flex items-center rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">Aktif</span>
                    ) : (
                      <span className="inline-flex items-center rounded-md bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-inset ring-slate-500/10">Tidak Aktif</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => toggleVariantActive(v.id, v.active)}
                      className={v.active ? "text-amber-600 hover:text-amber-700 hover:bg-amber-50" : "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"}
                    >
                      {v.active ? "Nonaktifkan" : "Aktifkan"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!variants?.length && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-6">Belum ada varian madu</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

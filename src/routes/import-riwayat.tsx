import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RequireAuth } from "@/components/require-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { formatIDR } from "@/lib/theme";
import { 
  FileSpreadsheet, Upload, CheckCircle2, AlertCircle, Loader2,
  Calendar, RefreshCw, ShoppingBag, CreditCard, ChevronRight, Settings
} from "lucide-react";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/import-riwayat")({
  component: () => (
    <RequireAuth ownerOnly>
      <Page />
    </RequireAuth>
  )
});

interface RawRow {
  rowNumber: number;
  originalDate: string;
  parsedDate: string;
  trackingNumber: string;
  shippingFee: number;
  customerName: string;
  customerPhone: string;
  customerNote: string;
  productName: string;
  qty: number;
  amountReceived: number | null;
}

// Indonesian word date parser (e.g. "Kamis, 11 Jun 2026") or numeric dates (e.g. "11-06-2026")
const parseExcelDate = (str: string): string => {
  if (!str) return new Date().toISOString().slice(0, 10);
  
  const clean = str.trim();

  // Try standard YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(clean)) {
    return clean.slice(0, 10);
  }

  // Try DD-MM-YYYY HH:mm or DD-MM-YYYY
  const dmyMatch = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, "0");
    const month = dmyMatch[2].padStart(2, "0");
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }

  // Try Indonesian word dates like "Kamis, 11 Jun 2026" or "11 Juni 2026"
  const cleanWords = clean.replace(/^(senin|selasa|rabu|kamis|jumat|sabtu|minggu|kemarin|hari ini),\s*/i, "");
  
  const idMonthMap: Record<string, string> = {
    jan: "01", januari: "01",
    feb: "02", februari: "02",
    mar: "03", maret: "03",
    apr: "04", april: "04",
    mei: "05",
    jun: "06", juni: "06",
    jul: "07", juli: "07",
    ags: "08", agustus: "08", agust: "08",
    sep: "09", september: "09",
    okt: "10", oktober: "10",
    nov: "11", november: "11",
    des: "12", desember: "12"
  };

  const words = cleanWords.split(/\s+/);
  if (words.length >= 3) {
    const day = words[0].padStart(2, "0");
    const monthWord = words[1].toLowerCase().replace(/[^a-z]/g, "");
    const year = words[2].replace(/[^0-9]/g, "");
    const month = idMonthMap[monthWord] || "01";
    if (year.length === 4 && !isNaN(Number(day))) {
      return `${year}-${month}-${day}`;
    }
  }

  // Fallback to standard JS Date parser
  try {
    const parsed = new Date(clean);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  } catch (e) {}

  return new Date().toISOString().slice(0, 10);
};

// Helper for robustly finding headers (exact matches have preference over partial matches)
const detectColumnHeader = (headers: string[], keywords: string[]): string => {
  if (!headers || !Array.isArray(headers)) return "";
  
  // 1. Try exact match (case insensitive)
  for (const kw of keywords) {
    const match = headers.find(h => {
      if (h === undefined || h === null) return false;
      const cleanHeader = String(h).trim().toLowerCase();
      return cleanHeader === kw.toLowerCase();
    });
    if (match) return match;
  }
  // 2. Try partial match
  for (const kw of keywords) {
    const match = headers.find(h => {
      if (h === undefined || h === null) return false;
      const cleanHeader = String(h).trim().toLowerCase();
      return cleanHeader.includes(kw.toLowerCase());
    });
    if (match) return match;
  }
  return "";
};

function Page() {
  const qc = useQueryClient();
  const [headers, setHeaders] = useState<string[]>([]);
  const [sheetRows, setSheetRows] = useState<any[][]>([]);
  const [colMapping, setColMapping] = useState({
    date: "none",
    tracking: "none",
    shipping: "none",
    name: "none",
    phone: "none",
    note: "none",
    product: "none",
    qty: "none",
    amount: "none"
  });

  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, successes: 0, failures: 0 });
  const [logs, setLogs] = useState<string[]>([]);
  const [defaultChannel, setDefaultChannel] = useState<string>("whatsapp");
  const [defaultTierId, setDefaultTierId] = useState<string>("");

  const { data: productSizes } = useQuery({
    queryKey: ["product-sizes"],
    queryFn: async () => (await supabase.from("product_sizes").select("*")).data ?? [],
  });

  const { data: tiers } = useQuery({
    queryKey: ["reseller-tiers"],
    queryFn: async () => (await supabase.from("reseller_tiers").select("*").order("level")).data ?? [],
  });

  // Parse Excel raw rows reactively based on sheetRows and current colMapping
  const parsedRows = useMemo<RawRow[]>(() => {
    if (sheetRows.length === 0) return [];

    const colIndexMap: Record<string, number> = {};
    headers.forEach((h, idx) => {
      if (h) colIndexMap[h] = idx;
    });

    const getVal = (row: any, headerName: string): any => {
      if (!headerName || headerName === "none") return undefined;
      // If row is an array, get by index
      if (Array.isArray(row)) {
        const idx = colIndexMap[headerName];
        return idx !== undefined ? row[idx] : undefined;
      }
      // If row is an object, get by key
      if (row && typeof row === "object") {
        return row[headerName];
      }
      return undefined;
    };

    return sheetRows.map((row, rowIdx) => {
      const dateStr = colMapping.date && colMapping.date !== "none" ? String(getVal(row, colMapping.date) ?? "").trim() : "";
      const trackingNumber = colMapping.tracking && colMapping.tracking !== "none" ? String(getVal(row, colMapping.tracking) ?? "").trim() : "";
      const shippingFee = colMapping.shipping && colMapping.shipping !== "none" ? Number(getVal(row, colMapping.shipping) || 0) : 0;
      const customerName = colMapping.name && colMapping.name !== "none" ? String(getVal(row, colMapping.name) ?? "").trim() : "";
      let customerPhone = colMapping.phone && colMapping.phone !== "none" ? String(getVal(row, colMapping.phone) ?? "").trim() : "";
      const customerNote = colMapping.note && colMapping.note !== "none" ? String(getVal(row, colMapping.note) ?? "").trim() : "";
      const productName = colMapping.product && colMapping.product !== "none" ? String(getVal(row, colMapping.product) ?? "").trim() : "";
      const qty = colMapping.qty && colMapping.qty !== "none" ? Number(getVal(row, colMapping.qty) || 1) : 1;
      const amountReceived = colMapping.amount && colMapping.amount !== "none" ? Number(getVal(row, colMapping.amount) || 0) : null;

      const cleanDate = parseExcelDate(dateStr);
      
      // Normalize Indonesian/local phone formats to prefix "0" if starting with "8"
      if (customerPhone && !customerPhone.startsWith("0") && !customerPhone.startsWith("62") && customerPhone.startsWith("8")) {
        customerPhone = "0" + customerPhone;
      }

      return {
        rowNumber: rowIdx + 2,
        originalDate: dateStr,
        parsedDate: cleanDate,
        trackingNumber: trackingNumber,
        shippingFee,
        customerName: customerName,
        customerPhone: customerPhone,
        customerNote: customerNote,
        productName: productName,
        qty,
        amountReceived
      };
    });
  }, [sheetRows, headers, colMapping]);

  // Smart matching logic (Excel product text -> size_id)
  const mappedData = useMemo(() => {
    if (!parsedRows || !productSizes) return [];

    return parsedRows.map((row) => {
      const nameLower = row.productName.toLowerCase();
      let matchedSize: any = null;

      // 1. Weight matching
      if (nameLower.includes("1kg") || nameLower.includes("1 kg") || nameLower.includes("1.000") || nameLower.includes("1000")) {
        matchedSize = productSizes.find(s => s.weight_grams === 1000 || s.name.toLowerCase().includes("1kg") || s.name.toLowerCase().includes("1 kg"));
      } else if (nameLower.includes("500") || nameLower.includes("0.5") || nameLower.includes("1/2")) {
        matchedSize = productSizes.find(s => s.weight_grams === 500 || s.name.toLowerCase().includes("500"));
      } else if (nameLower.includes("350") || nameLower.includes("325")) {
        matchedSize = productSizes.find(s => s.weight_grams === 350 || s.name.toLowerCase().includes("350"));
      }

      // 2. Substring matching
      if (!matchedSize) {
        matchedSize = productSizes.find(s => nameLower.includes(s.name.toLowerCase()));
      }

      // 3. Ultimate fallback
      if (!matchedSize && productSizes.length > 0) {
        matchedSize = productSizes[0];
      }

      return {
        ...row,
        sizeId: matchedSize?.id || null,
        sizeName: matchedSize?.name || "Tidak Terpetakan",
        unitPrice: matchedSize ? Number(matchedSize.default_retail_price || 150000) : 150000
      };
    });
  }, [parsedRows, productSizes]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[][];
        
        if (data.length < 2) {
          toast.error("File Excel kosong atau tidak valid.");
          return;
        }

        // 1. Scan first 5 rows to find the actual header row (resilient to report metadata headers)
        let headerRowIdx = 0;
        for (let i = 0; i < Math.min(data.length, 5); i++) {
          const row = data[i];
          if (!row || !Array.isArray(row)) continue;
          const rowText = row.map(c => String(c || "").trim().toLowerCase());
          const hasDate = rowText.some(c => c.includes("tanggal") || c.includes("time") || c.includes("date"));
          const hasTracking = rowText.some(c => c.includes("resi") || c.includes("tracking") || c.includes("customer") || c.includes("barang"));
          if (hasDate || hasTracking) {
            headerRowIdx = i;
            break;
          }
        }

        const parsedHeaders = data[headerRowIdx].map((h: any) => String(h || "").trim());
        const dataRows = data.slice(headerRowIdx + 1);

        setHeaders(parsedHeaders);
        setSheetRows(dataRows);

        // 2. Auto-detect and pre-map columns
        const detected = {
          date: detectColumnHeader(parsedHeaders, ["tanggal dibuat", "create time", "created time", "tanggal", "create_time", "date", "created"]) || "none",
          tracking: detectColumnHeader(parsedHeaders, ["resi", "tracking no.", "tracking no", "tracking", "no_resi", "awb", "connote"]) || "none",
          shipping: detectColumnHeader(parsedHeaders, ["ongkos kirim", "ongkir", "estimated shipping fee", "shipping fee", "shipping_fee", "biaya kirim"]) || "none",
          name: detectColumnHeader(parsedHeaders, ["penerima", "nama penerima", "recipient name", "customer name", "nama adr", "customer", "nama"]) || "none",
          phone: detectColumnHeader(parsedHeaders, ["no. hp penerima", "no. hp", "no hp", "nomor penerima", "recipient phone", "customer phone", "no telp", "telepon", "phone", "hp", "telp", "nomor", "contact"]) || "none",
          note: detectColumnHeader(parsedHeaders, ["catatan", "note", "keterangan"]) || "none",
          product: detectColumnHeader(parsedHeaders, ["produk", "item in parcel", "nama barang", "nama produk", "deskripsi produk", "deskripsi barang", "product name", "product_name", "item name", "barang", "item", "konten"]) || "none",
          qty: detectColumnHeader(parsedHeaders, ["jumlah", "quantity", "qty", "pcs", "pack"]) || "none",
          amount: detectColumnHeader(parsedHeaders, ["nilai cod", "cod amount", "harga produk", "amount received", "total cod", "nilai_cod", "cod", "amount", "total", "harga", "nominal"]) || "none"
        };
        
        setColMapping(detected);
        toast.success(`Berhasil memuat data. Header terdeteksi di baris ${headerRowIdx + 1}.`);
      } catch (err: any) {
        console.error(err);
        toast.error("Gagal membaca file Excel: " + err.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleStartImport = async () => {
    if (mappedData.length === 0) return;
    
    setImporting(true);
    setLogs([]);
    const total = mappedData.length;
    setProgress({ current: 0, total, successes: 0, failures: 0 });

    let tierId = defaultTierId;
    if (!tierId && tiers && tiers.length > 0) {
      const retailTier = tiers.find(t => t.name.toLowerCase().includes("retail") || t.name.toLowerCase().includes("ecer") || t.level === 1) || tiers[0];
      tierId = retailTier.id;
    }

    let successes = 0;
    let failures = 0;

    for (let i = 0; i < total; i++) {
      const row = mappedData[i];
      setProgress(p => ({ ...p, current: i + 1 }));

      try {
        if (!row.sizeId) {
          throw new Error("Ukuran produk tidak terpetakan.");
        }

        const orderItems = [{
          size_id: row.sizeId,
          qty: row.qty,
          unit_price: row.unitPrice
        }];

        const { data: orderId, error } = await supabase.rpc("import_historical_order", {
          _channel: defaultChannel,
          _tier_id: tierId,
          _items: orderItems,
          _shipping_fee: row.shippingFee || 0,
          _customer_note: row.customerNote || "",
          _customer_name: row.customerName || "Pelanggan Historis",
          _customer_phone: row.customerPhone || "",
          _tracking_number: row.trackingNumber || "",
          _amount_received: row.amountReceived || null,
          _created_at: row.parsedDate + "T12:00:00Z" // Prevent date shifts
        });

        if (error) throw error;
        
        successes++;
        setLogs(l => [`Row ${row.rowNumber} (${row.customerName || "No Name"}): Sukses`, ...l]);
      } catch (err: any) {
        console.error(err);
        failures++;
        setLogs(l => [`⚠️ Row ${row.rowNumber} (${row.customerName || "No Name"}): Gagal (${err.message})`, ...l]);
      }

      setProgress(p => ({ ...p, successes, failures }));
    }

    setImporting(false);
    toast.success(`Proses Impor Selesai! ${successes} Sukses, ${failures} Gagal.`);
    qc.invalidateQueries({ queryKey: ["biz-expenses"] });
    qc.invalidateQueries({ queryKey: ["fin-biz"] });
    qc.invalidateQueries({ queryKey: ["orders"] });
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
          <FileSpreadsheet className="w-6 h-6 text-honey" /> Impor Penjualan Historis
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Unggah file Excel hasil ekspor dari Lincah atau SPX untuk memasukkan data penjualan masa lalu tanpa memotong stok fisik Anda saat ini.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Mapping Controls Card */}
        <Card className="md:col-span-1 border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-honey" /> Konfigurasi Impor
            </CardTitle>
            <CardDescription>Sesuaikan parameter bawaan untuk seluruh pesanan yang akan diimpor.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Default Channel Penjualan</Label>
              <Select value={defaultChannel} onValueChange={setDefaultChannel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="shopee">Shopee</SelectItem>
                  <SelectItem value="tiktok">TikTok</SelectItem>
                  <SelectItem value="reseller">Reseller</SelectItem>
                  <SelectItem value="offline">Offline</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Default Kategori Reseller Tier</Label>
              <Select value={defaultTierId} onValueChange={setDefaultTierId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih tier reseller" />
                </SelectTrigger>
                <SelectContent>
                  {tiers?.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="border-t pt-4 space-y-3">
              <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 p-3 rounded-lg border border-amber-500/20">
                <AlertCircle className="w-4 h-4 inline-block mr-1.5 -translate-y-0.5" />
                <strong>Pemberitahuan:</strong> Impor ini tidak akan mengurangi sisa madu di dandang atau stok botol/kemasan di gudang. Hanya mencatat omset dan HPP di laporan.
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Upload Card */}
        <Card className="md:col-span-2 border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Upload className="w-5 h-5 text-honey" /> Unggah Spreadsheet
            </CardTitle>
            <CardDescription>Pilih file Excel (.xlsx / .xls) hasil ekspor Lincah atau SPX Anda.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center border-2 border-dashed border-muted-foreground/25 rounded-xl p-8 bg-muted/20 hover:bg-muted/30 transition-colors">
            <input 
              type="file" 
              accept=".xlsx,.xls" 
              onChange={handleFileUpload} 
              id="excel-file-input" 
              className="hidden" 
              disabled={importing}
            />
            <label htmlFor="excel-file-input" className="cursor-pointer flex flex-col items-center gap-2 text-center">
              <div className="p-4 bg-honey/10 rounded-full border border-honey/20">
                <FileSpreadsheet className="w-8 h-8 text-honey" />
              </div>
              <span className="font-semibold text-sm">Klik untuk memilih file</span>
              <span className="text-xs text-muted-foreground">Mendukung format kolom Tanggal Dibuat (Lincah) & Create Time (SPX)</span>
            </label>
          </CardContent>
        </Card>
      </div>

      {/* Manual Column Mapping Configurator */}
      {headers.length > 0 && (
        <Card className="border-none shadow-sm animate-in fade-in duration-200">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Settings className="w-5 h-5 text-honey" /> Pemetaan Kolom Excel
            </CardTitle>
            <CardDescription>
              Sesuaikan kolom mana dari file Excel Anda yang berisi informasi berikut (Sistem telah mencoba menebak secara otomatis).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label>Tanggal Pesanan</Label>
                <Select value={colMapping.date} onValueChange={(v) => setColMapping(p => ({ ...p, date: v }))}>
                  <SelectTrigger><SelectValue placeholder="Pilih kolom" /></SelectTrigger>
                  <SelectContent>
                    {headers.filter(h => h && h.trim() !== "").map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>No. Resi (Tracking)</Label>
                <Select value={colMapping.tracking} onValueChange={(v) => setColMapping(p => ({ ...p, tracking: v }))}>
                  <SelectTrigger><SelectValue placeholder="Pilih kolom" /></SelectTrigger>
                  <SelectContent>
                    {headers.filter(h => h && h.trim() !== "").map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Nama Pembeli</Label>
                <Select value={colMapping.name} onValueChange={(v) => setColMapping(p => ({ ...p, name: v }))}>
                  <SelectTrigger><SelectValue placeholder="Pilih kolom" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">-- Kosongkan / Default --</SelectItem>
                    {headers.filter(h => h && h.trim() !== "").map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>No. HP Pembeli</Label>
                <Select value={colMapping.phone} onValueChange={(v) => setColMapping(p => ({ ...p, phone: v }))}>
                  <SelectTrigger><SelectValue placeholder="Pilih kolom" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">-- Kosongkan / Default --</SelectItem>
                    {headers.filter(h => h && h.trim() !== "").map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Nama Barang/Produk</Label>
                <Select value={colMapping.product} onValueChange={(v) => setColMapping(p => ({ ...p, product: v }))}>
                  <SelectTrigger><SelectValue placeholder="Pilih kolom" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">-- Kosongkan / Default --</SelectItem>
                    {headers.filter(h => h && h.trim() !== "").map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Kuantitas (Qty)</Label>
                <Select value={colMapping.qty} onValueChange={(v) => setColMapping(p => ({ ...p, qty: v }))}>
                  <SelectTrigger><SelectValue placeholder="Pilih kolom" /></SelectTrigger>
                  <SelectContent>
                    {headers.filter(h => h && h.trim() !== "").map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Total Harga / COD</Label>
                <Select value={colMapping.amount} onValueChange={(v) => setColMapping(p => ({ ...p, amount: v }))}>
                  <SelectTrigger><SelectValue placeholder="Pilih kolom" /></SelectTrigger>
                  <SelectContent>
                    {headers.filter(h => h && h.trim() !== "").map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Ongkos Kirim</Label>
                <Select value={colMapping.shipping} onValueChange={(v) => setColMapping(p => ({ ...p, shipping: v }))}>
                  <SelectTrigger><SelectValue placeholder="Pilih kolom" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">-- Set Rp 0 --</SelectItem>
                    {headers.filter(h => h && h.trim() !== "").map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Progress & Log Card (when importing) */}
      {(importing || progress.current > 0) && (
        <Card className="border-none shadow-sm animate-in fade-in zoom-in-95 duration-200">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              {importing ? <Loader2 className="w-5 h-5 animate-spin text-honey" /> : <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
              {importing ? "Sedang Mengimpor Data..." : "Proses Impor Selesai"}
            </CardTitle>
            <CardDescription>
              Kemajuan: {progress.current} dari {progress.total} transaksi ({progress.successes} sukses, {progress.failures} gagal)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Progress Bar */}
            <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border">
              <div 
                className="h-full bg-honey rounded-full transition-all duration-300"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>

            {/* Logs Area */}
            <div className="h-[150px] overflow-y-auto border bg-slate-50 dark:bg-slate-900 rounded-lg p-3 font-mono text-xs space-y-1">
              {logs.map((log, idx) => (
                <div key={idx} className={log.includes("Gagal") ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}>
                  {log}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview Table Card */}
      {mappedData.length > 0 && (
        <Card className="border-none shadow-sm animate-in fade-in duration-200">
          <CardHeader className="flex flex-row items-center justify-between pb-3 flex-wrap gap-2">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-honey" /> Pratinjau Pesanan ({mappedData.length})
              </CardTitle>
              <CardDescription>Periksa dan pastikan pemetaan produk dan tanggal sudah tepat sebelum mengimpor.</CardDescription>
            </div>
            <Button 
              onClick={handleStartImport} 
              disabled={importing}
              className="bg-honey hover:bg-honey/95 text-honey-foreground font-bold"
            >
              {importing ? "Mengimpor..." : `Mulai Impor ${mappedData.length} Pesanan`}
            </Button>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">Baris</TableHead>
                  <TableHead>Tanggal Impor</TableHead>
                  <TableHead>Nama Pembeli</TableHead>
                  <TableHead>No HP</TableHead>
                  <TableHead>Resi / Kurir</TableHead>
                  <TableHead>Barang di Excel</TableHead>
                  <TableHead>Ukuran Terpetakan</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Total COD/Harga</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mappedData.map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{row.rowNumber}</TableCell>
                    <TableCell className="font-semibold">{row.parsedDate}</TableCell>
                    <TableCell>{row.customerName || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{row.customerPhone || "—"}</TableCell>
                    <TableCell>
                      <div className="text-xs font-mono">{row.trackingNumber || "—"}</div>
                      {row.shippingFee > 0 && <div className="text-[10px] text-muted-foreground">Ongkir: {formatIDR(row.shippingFee)}</div>}
                    </TableCell>
                    <TableCell className="text-xs max-w-[150px] truncate" title={row.productName}>
                      {row.productName || "—"}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${row.sizeId ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-red-500/10 text-red-600 border border-red-500/20'}`}>
                        {row.sizeName}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-semibold">{row.qty} pcs</TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {row.amountReceived !== null ? formatIDR(row.amountReceived) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

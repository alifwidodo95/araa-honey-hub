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
  ShoppingBag, CreditCard
} from "lucide-react";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/import-riwayat")({
  component: () => (
    <RequireAuth ownerOnly>
      <Page />
    </RequireAuth>
  )
});

interface ParsedItem {
  size_id: string;
  qty: number;
  unit_price: number;
  honey_type: string;
  size_name: string;
}

interface RawRow {
  rowNumber: number;
  originalDate: string;
  parsedDate: string;
  customerName: string;
  customerPhone: string;
  trackingNumber: string;
  expedition: string;
  paymentMethod: string;
  shippingFee: number;
  amountReceived: number;
  productString: string;
  packageQty: number;
  items: ParsedItem[];
  rawRow: any;
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

const detectCourier = (resi: string): string | null => {
  if (!resi) return null;
  const cleaned = resi.trim().toUpperCase();
  if (cleaned.startsWith("SPX")) {
    return "SPX";
  }
  if (cleaned.startsWith("ID")) {
    return "ID EXPRESS";
  }
  return null;
};

const getRowValue = (row: any, keysToTry: string[], fallbackColIdx?: number) => {
  const rowKeys = Object.keys(row).filter(k => k !== "__rowNumber");
  if (rowKeys.length === 0) return undefined;
  
  for (const key of keysToTry) {
    const foundKey = rowKeys.find(k => k.trim().toLowerCase() === key.toLowerCase());
    if (foundKey !== undefined) return row[foundKey];
  }
  
  for (const key of keysToTry) {
    const foundKey = rowKeys.find(k => k.trim().toLowerCase().includes(key.toLowerCase()));
    if (foundKey !== undefined) return row[foundKey];
  }
  
  if (fallbackColIdx !== undefined && fallbackColIdx < rowKeys.length) {
    return row[rowKeys[fallbackColIdx]];
  }
  return undefined;
};

const parseProductString = (
  productStr: string,
  activeVariants: string[],
  sizes: any[],
  packageQty: number,
  retailPrices: any[]
): ParsedItem[] => {
  if (!productStr) return [];
  
  const parts = productStr.split("+").map((p) => p.trim());
  const parsedItems: ParsedItem[] = [];
  let currentVariant = "";

  for (const part of parts) {
    const partUpper = part.toUpperCase();
    
    // 1. Detect variant
    let detectedVariant = "";
    for (const v of activeVariants) {
      const vUpper = v.toUpperCase();
      const cleanV = vUpper.replace("MADU", "").trim();
      if (partUpper.includes(vUpper) || (cleanV && partUpper.includes(cleanV))) {
        detectedVariant = v;
        break;
      }
    }
    
    if (detectedVariant) {
      currentVariant = detectedVariant;
    } else if (!currentVariant) {
      currentVariant = activeVariants.find((v) => v.toUpperCase() !== "LAINNYA") || activeVariants[0] || "Akasia";
    }
    
    // 2. Detect size
    let detectedSize: any = null;
    
    for (const s of sizes) {
      const sName = s.name.toUpperCase().trim();
      const sNameNoSpace = sName.replace(/\s+/g, "");
      const weightGr = s.weight_grams;
      const weightGrPattern = new RegExp(`\\b${weightGr}\\s*(g|gr|gram|grams)?\\b`, "i");
      
      if (
        partUpper.includes(sName) || 
        partUpper.includes(sNameNoSpace) ||
        (sName.endsWith("KG") && partUpper.includes(sName.replace("KG", " KG"))) ||
        (sName.endsWith("GR") && partUpper.includes(sName.replace("GR", " GR"))) ||
        partUpper.match(weightGrPattern)
      ) {
        detectedSize = s;
        break;
      }
    }
    
    if (!detectedSize) {
      if (partUpper.includes("1KG") || partUpper.includes("1 KG") || partUpper.includes("1000G")) {
        detectedSize = sizes.find((s) => s.name.includes("1 kg")) || sizes[0];
      } else if (partUpper.includes("500") || partUpper.includes("500G")) {
        detectedSize = sizes.find((s) => s.name.includes("500 gr")) || sizes[0];
      } else if (partUpper.includes("250") || partUpper.includes("250G")) {
        detectedSize = sizes.find((s) => s.name.includes("250 gr")) || sizes[0];
      } else if (partUpper.includes("130") || partUpper.includes("130G")) {
        detectedSize = sizes.find((s) => s.name.includes("130 gr")) || sizes[0];
      } else if (partUpper.includes("100") || partUpper.includes("100G")) {
        detectedSize = sizes.find((s) => s.name.includes("100 gr")) || sizes[0];
      } else {
        detectedSize = sizes[0];
      }
    }
    
    if (detectedSize) {
      const sizeId = detectedSize.id;
      const unitPrice = Number(retailPrices?.find((r) => r.size_id === sizeId && r.honey_type === currentVariant)?.price ?? 150000);
      
      parsedItems.push({
        size_id: sizeId,
        qty: packageQty,
        unit_price: unitPrice === 0 ? 150000 : unitPrice,
        honey_type: currentVariant,
        size_name: detectedSize.name
      });
    }
  }
  
  return parsedItems;
};

function Page() {
  const qc = useQueryClient();
  const [parsedOrders, setParsedOrders] = useState<RawRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, successes: 0, failures: 0 });
  const [logs, setLogs] = useState<string[]>([]);
  const [defaultChannel, setDefaultChannel] = useState<string>("whatsapp");
  const [defaultTierId, setDefaultTierId] = useState<string>("");

  const { data: productSizes } = useQuery({
    queryKey: ["product-sizes"],
    queryFn: async () => (await supabase.from("product_sizes").select("*").order("sort_order")).data ?? [],
  });

  const { data: retailPrices } = useQuery({
    queryKey: ["retail-prices"],
    queryFn: async () => (await supabase.from("retail_prices").select("*")).data ?? [],
  });

  const { data: variants } = useQuery({ 
    queryKey: ["honey-variants"], 
    queryFn: async () => (await supabase.from("honey_variants").select("*").eq("active", true).order("name")).data ?? [] 
  });

  const activeVariants = useMemo(() => {
    const list = (variants ?? []).map((v: any) => v.name);
    return list.length > 0 ? list : ["Akasia", "Randu", "Karet", "Lainnya"];
  }, [variants]);

  const { data: tiers } = useQuery({
    queryKey: ["reseller-tiers"],
    queryFn: async () => (await supabase.from("reseller_tiers").select("*").eq("active", true).order("level")).data ?? [],
  });

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

        // 1. Scan first 10 rows to find the actual header row
        let headerRowIdx = -1;
        for (let i = 0; i < Math.min(data.length, 10); i++) {
          const row = data[i];
          if (row && row.some(cell => {
            const cellStr = String(cell || "").toLowerCase();
            return (
              cellStr.includes("tracking no") || 
              cellStr.includes("no. resi") || 
              cellStr.includes("resi") || 
              cellStr.includes("recipient name") ||
              cellStr.includes("penerima") ||
              cellStr.includes("item in parcel")
            );
          })) {
            headerRowIdx = i;
            break;
          }
        }

        if (headerRowIdx === -1) {
          toast.error("Gagal mendeteksi header tabel data di Excel. Pastikan terdapat kolom 'Tracking No', 'No. Resi' atau 'Recipient Name'.");
          return;
        }

        const headers = data[headerRowIdx].map((h: any) => String(h || "").trim());
        const rawRows: any[] = [];
        
        for (let i = headerRowIdx + 1; i < data.length; i++) {
          const row = data[i];
          if (!row || row.length === 0 || row.every(cell => cell === "")) continue;
          
          const obj: any = {};
          headers.forEach((header, colIdx) => {
            if (header) {
              obj[header] = colIdx < row.length ? row[colIdx] : "";
            }
          });
          obj.__rowNumber = i + 1; // Store original row number (1-based)
          rawRows.push(obj);
        }

        if (rawRows.length === 0) {
          toast.error("Tidak ada baris data pesanan setelah header");
          return;
        }

        processExcelRows(rawRows);
        toast.success(`Berhasil memuat data. Header terdeteksi di baris ${headerRowIdx + 1}.`);
      } catch (err: any) {
        console.error(err);
        toast.error("Gagal membaca file Excel: " + err.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  const processExcelRows = (rows: any[]) => {
    const list: RawRow[] = [];

    const parseExcelNumber = (val: any) => {
      if (val === undefined || val === null || val === "") return 0;
      if (typeof val === "number") return Math.floor(val);
      const str = String(val).trim();
      const parts = str.split(".");
      const intPart = parts[0].replace(/[^0-9-]/g, "");
      const num = Number(intPart);
      return isNaN(num) ? 0 : num;
    };

    for (const row of rows) {
      const rowKeys = Object.keys(row).filter(k => k !== "__rowNumber");
      if (rowKeys.length < 3) continue;

      const getVal = (keys: string[], colIdx?: number) => getRowValue(row, keys, colIdx);

      const paymentMethodRaw = String(getVal(["Pengiriman", "Sistem Pengiriman", "Metode Pembayaran", "Payment", "Tipe Bayar", "Metode Bayar"], 0) || "").trim();
      const codCollectionRaw = String(getVal(["COD Collection(Y/N)", "COD Collection", "Is COD", "COD Collection Status"], 8) || "").trim();

      let trackingNumber = String(getVal(["Tracking No.", "Resi", "No. Resi", "Nomor Resi", "Airwaybill", "Tracking", "AWB", "No. AWB"], 1) || "").trim();
      if (trackingNumber.includes("?")) {
        trackingNumber = trackingNumber.split("?").pop() || trackingNumber;
      } else if (trackingNumber.includes("/")) {
        trackingNumber = trackingNumber.split("/").pop() || trackingNumber;
      }

      const customerName = String(getVal(["Recipient Name", "Penerima", "Nama Penerima", "Nama", "Customer", "Nama Lengkap"], 2) || "").trim();
      
      let customerPhone = String(getVal(["No. HP", "No HP", "Telepon", "No. Telepon", "Phone", "Handphone", "No. Handphone", "Recipient Phone Number", "Recipient Phone"], 3) || "").trim();
      if (customerPhone && !customerPhone.startsWith("0") && !customerPhone.startsWith("62") && customerPhone.startsWith("8")) {
        customerPhone = "0" + customerPhone;
      }

      const productString = String(getVal(["Item in Parcel", "Produk", "Nama Produk", "Nama Barang", "Item", "Varian", "Nama Varian", "Item Name"], 4) || "").trim();
      const qtyRaw = getVal(["Jumlah", "Qty", "Jumlah Produk", "Quantity", "Kuantitas", "No. of Items", "No of Items"], 5);
      const packageQty = isNaN(Number(qtyRaw)) || !qtyRaw ? 1 : Number(qtyRaw);

      const shippingRaw = getVal(["Estimated Shipping Fee", "Ongkos Kirim", "Ongkir", "Biaya Kirim", "Shipping", "Biaya Pengiriman"], 6);
      const estimatedShipping = parseExcelNumber(shippingRaw);

      const courierRaw = String(getVal(["Kurir", "Ekspedisi", "Courier", "Jasa Kirim", "Jasa Pengiriman", "Seller Courier", "Courier Name"], 7) || "").trim();

      const codFeeRaw = getVal(["Biaya COD", "Fee COD", "COD Fee"], 8);
      const biayaCod = parseExcelNumber(codFeeRaw);

      const parcelValueRaw = getVal(["Parcel Value", "Harga Produk", "Harga", "Amount", "Price", "Total Harga", "Subtotal"], 9);
      const parcelValue = parseExcelNumber(parcelValueRaw);

      const codValueRaw = getVal(["COD Amount", "Nilai COD", "Total COD", "COD Value"], 10);
      const codAmount = parseExcelNumber(codValueRaw);

      const dateStr = String(getVal(["Tanggal Dibuat", "Create Time", "Created Time", "Tanggal", "Create_time", "Date", "Created"], 11) || "").trim();

      if (!customerName && !trackingNumber && !productString) {
        continue;
      }

      const isCOD = codCollectionRaw.toUpperCase() === "Y" || codCollectionRaw.toUpperCase() === "YES" || paymentMethodRaw.toUpperCase().includes("COD");
      const paymentMethod = isCOD ? "COD" : "TRANSFER";

      let expedition = detectCourier(trackingNumber);
      if (!expedition) {
        const cUpper = courierRaw.toUpperCase();
        if (cUpper.includes("SPX") || cUpper.includes("SHOPEE EXPRESS")) expedition = "SPX";
        else if (cUpper.includes("ID EXPRESS") || cUpper.startsWith("ID")) expedition = "ID EXPRESS";
        else if (cUpper.includes("JNE")) expedition = "JNE";
        else if (cUpper.includes("J&T") || cUpper.includes("J AND T")) expedition = "J&T";
        else if (cUpper.includes("LION")) expedition = "LION PARCEL";
        else if (cUpper.includes("SICEPAT")) expedition = "SICEPAT";
        else if (cUpper.includes("ANTERAJA")) expedition = "ANTERAJA";
        else if (cUpper.includes("SAP")) expedition = "SAP EXPRESS";
        else expedition = courierRaw || "-";
      }

      const shippingFee = isCOD ? (estimatedShipping + biayaCod) : estimatedShipping;
      
      const parsedItems = parseProductString(productString, activeVariants, productSizes || [], packageQty, retailPrices || []);
      const defaultSubtotal = parsedItems.reduce((sum: number, it: any) => sum + (it.unit_price * it.qty), 0);

      let amountReceived = 0;
      if (isCOD) {
        amountReceived = codAmount;
      } else {
        amountReceived = parcelValue > 0 ? parcelValue : defaultSubtotal;
      }

      const cleanDate = parseExcelDate(dateStr);

      list.push({
        rowNumber: row.__rowNumber,
        originalDate: dateStr,
        parsedDate: cleanDate,
        customerName,
        customerPhone,
        trackingNumber,
        expedition,
        paymentMethod,
        shippingFee,
        amountReceived,
        productString,
        packageQty,
        items: parsedItems,
        rawRow: row
      });
    }

    setParsedOrders(list);
  };

  const handleStartImport = async () => {
    if (parsedOrders.length === 0) return;
    
    setImporting(true);
    setLogs([]);
    const total = parsedOrders.length;
    setProgress({ current: 0, total, successes: 0, failures: 0 });

    let tierId = defaultTierId;
    if (!tierId && tiers && tiers.length > 0) {
      const retailTier = tiers.find(t => t.name.toLowerCase().includes("retail") || t.name.toLowerCase().includes("ecer") || t.level === 1) || tiers[0];
      tierId = retailTier.id;
    }

    let successes = 0;
    let failures = 0;

    for (let i = 0; i < total; i++) {
      const row = parsedOrders[i];
      setProgress(p => ({ ...p, current: i + 1 }));

      if (row.items.length === 0) {
        failures++;
        setLogs(l => [`⚠️ Baris ${row.rowNumber} (${row.customerName || "No Name"}): Gagal (Produk tidak terdeteksi dari string: "${row.productString}")`, ...l]);
        continue;
      }

      try {
        const { error } = await supabase.rpc("import_historical_order", {
          _channel: defaultChannel,
          _tier_id: tierId || null,
          _items: row.items.map(it => ({
            size_id: it.size_id,
            qty: it.qty,
            unit_price: it.unit_price,
            honey_type: it.honey_type
          })),
          _shipping_fee: row.shippingFee || 0,
          _customer_note: `Impor Historis: ${row.productString}`,
          _customer_name: row.customerName || "Pelanggan Historis",
          _customer_phone: row.customerPhone || "",
          _tracking_number: row.trackingNumber || "",
          _amount_received: row.amountReceived || null,
          _created_at: row.parsedDate + "T12:00:00Z", // Prevent date shifts
          _expedition: row.expedition !== "-" ? row.expedition : null,
          _payment_method: row.paymentMethod,
          _transfer_bank: null
        });

        if (error) throw error;
        
        successes++;
        setLogs(l => [`Baris ${row.rowNumber} (${row.customerName || "No Name"}): Sukses`, ...l]);
      } catch (err: any) {
        console.error(err);
        failures++;
        setLogs(l => [`⚠️ Baris ${row.rowNumber} (${row.customerName || "No Name"}): Gagal (${err.message})`, ...l]);
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
            <CardDescription>Pilih file Excel (.xlsx / .xls / .csv) hasil ekspor Lincah atau SPX Anda.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center border-2 border-dashed border-muted-foreground/25 rounded-xl p-8 bg-muted/20 hover:bg-muted/30 transition-colors">
            <input 
              type="file" 
              accept=".xlsx,.xls,.csv" 
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
              <span className="text-xs text-muted-foreground">Mendukung format kolom otomatis Lincah & SPX</span>
            </label>
          </CardContent>
        </Card>
      </div>

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
      {parsedOrders.length > 0 && (
        <Card className="border-none shadow-sm animate-in fade-in duration-200">
          <CardHeader className="flex flex-row items-center justify-between pb-3 flex-wrap gap-2">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-honey" /> Pratinjau Pesanan ({parsedOrders.length})
              </CardTitle>
              <CardDescription>Periksa dan pastikan pemetaan produk dan tanggal sudah tepat sebelum mengimpor.</CardDescription>
            </div>
            <Button 
              onClick={handleStartImport} 
              disabled={importing}
              className="bg-honey hover:bg-honey/95 text-honey-foreground font-bold"
            >
              {importing ? "Mengimpor..." : `Mulai Impor ${parsedOrders.length} Pesanan`}
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
                  <TableHead>Bayar</TableHead>
                  <TableHead>Barang di Excel</TableHead>
                  <TableHead>Ukuran Terpetakan</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Total COD/Harga</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsedOrders.map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{row.rowNumber}</TableCell>
                    <TableCell className="font-semibold">{row.parsedDate}</TableCell>
                    <TableCell>{row.customerName || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{row.customerPhone || "—"}</TableCell>
                    <TableCell>
                      <div className="text-xs font-mono">{row.trackingNumber || "—"}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {row.expedition && row.expedition !== "-" ? row.expedition : ""}
                        {row.shippingFee > 0 ? ` (Ongkir: ${formatIDR(row.shippingFee)})` : ""}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${row.paymentMethod === 'COD' ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-blue-100 text-blue-800 border border-blue-200'}`}>
                        {row.paymentMethod}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs max-w-[150px] truncate" title={row.productString}>
                      {row.productString || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {row.items.map((item, itemIdx) => (
                          <div key={itemIdx} className="flex gap-1.5 items-center text-[10px] leading-tight">
                            <span className="bg-honey/15 text-honey-dark dark:text-honey px-1 py-0.5 rounded text-[9px] font-bold border border-honey/20">
                              {item.qty}x
                            </span>
                            <span className="truncate text-slate-700 dark:text-slate-300 font-medium">
                              {item.honey_type} {item.size_name || ""}
                            </span>
                          </div>
                        ))}
                        {row.items.length === 0 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-600 border border-red-500/20">
                            Tidak Terpetakan
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {row.items.reduce((sum, it) => sum + it.qty, 0)} pcs
                    </TableCell>
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

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RequireAuth } from "@/components/require-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Plus, Pencil, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { formatIDR } from "@/lib/theme";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/penjualan")({ component: () => <RequireAuth><Page /></RequireAuth> });

type Channel = "shopee" | "tiktok" | "whatsapp" | "reseller" | "offline";

const detectCourier = (resi: string) => {
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
  const rowKeys = Object.keys(row);
  if (rowKeys.length === 0) return undefined;
  
  // 1. Try exact case-insensitive match
  for (const key of keysToTry) {
    const foundKey = rowKeys.find(k => k.trim().toLowerCase() === key.toLowerCase());
    if (foundKey !== undefined) return row[foundKey];
  }
  
  // 2. Try partial match
  for (const key of keysToTry) {
    const foundKey = rowKeys.find(k => k.trim().toLowerCase().includes(key.toLowerCase()));
    if (foundKey !== undefined) return row[foundKey];
  }
  
  // 3. Fallback to column index if provided
  if (fallbackColIdx !== undefined && fallbackColIdx < rowKeys.length) {
    return row[rowKeys[fallbackColIdx]];
  }
  return undefined;
};

interface ParsedItem {
  size_id: string;
  qty: number;
  unit_price: number;
  honey_type: string;
  size_name: string;
}

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
      const unitPrice = Number(retailPrices?.find((r) => r.size_id === sizeId && r.honey_type === currentVariant)?.price ?? 0);
      
      parsedItems.push({
        size_id: sizeId,
        qty: packageQty,
        unit_price: unitPrice,
        honey_type: currentVariant,
        size_name: detectedSize.name
      });
    }
  }
  
  return parsedItems;
};

const getPageNumbers = (current: number, total: number) => {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  
  const pages: (number | string)[] = [];
  pages.push(1);
  
  if (current > 3) {
    pages.push("...");
  }
  
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }
  
  if (current < total - 2) {
    pages.push("...");
  }
  
  pages.push(total);
  return pages;
};

function Page() {
  const qc = useQueryClient();
  const { data: sizes } = useQuery({
    queryKey: ["sizes"], queryFn: async () => (await supabase.from("product_sizes").select("*").order("sort_order")).data ?? [],
  });
  const { data: retail } = useQuery({
    queryKey: ["retail"], queryFn: async () => (await supabase.from("retail_prices").select("*")).data ?? [],
  });
  const { data: tiers } = useQuery({
    queryKey: ["tiers"], queryFn: async () => (await supabase.from("reseller_tiers").select("*").eq("active", true)).data ?? [],
  });
  const { data: resellerPrices } = useQuery({
    queryKey: ["resellerPrices"], queryFn: async () => (await supabase.from("reseller_prices").select("*")).data ?? [],
  });
  const { data: fees } = useQuery({
    queryKey: ["fees"], queryFn: async () => (await supabase.from("marketplace_fees").select("*")).data ?? [],
  });
  const { data: variants } = useQuery({ 
    queryKey: ["variants"], 
    queryFn: async () => (await (supabase.from("honey_variants" as any) as any).select("*").eq("active", true).order("name")).data ?? [] 
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data: ordersData } = useQuery({
    queryKey: ["orders-recent", currentPage, pageSize],
    queryFn: async () => {
      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;
      const { data, count, error } = await supabase
        .from("orders")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw error;
      return { data: data ?? [], count: count ?? 0 };
    },
  });

  const orders = ordersData?.data ?? [];
  const totalOrders = ordersData?.count ?? 0;
  const totalPages = Math.ceil(totalOrders / pageSize);

  const [channel, setChannel] = useState<Channel>("shopee");
  const [tierId, setTierId] = useState<string>("");
  const [shipping, setShipping] = useState(0);
  const [note, setNote] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [expedition, setExpedition] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [transferBank, setTransferBank] = useState("");
  const [amountReceived, setAmountReceived] = useState<number | "">("");
  const [items, setItems] = useState<{ size_id: string; qty: number; unit_price: number; honey_type: string }[]>([]);

  // BULK IMPORT STATES
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importedOrders, setImportedOrders] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [importResults, setImportResults] = useState<{ success: number; failed: { name: string; tracking: string; msg: string }[] } | null>(null);

  const [editingOrder, setEditingOrder] = useState<any>(null);
  
  // BULK DELETE STATES
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [deletingBulk, setDeletingBulk] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editResi, setEditResi] = useState("");
  const [editExpedition, setEditExpedition] = useState("");
  const [editPaymentMethod, setEditPaymentMethod] = useState("");
  const [editTransferBank, setEditTransferBank] = useState("");
  const [editShipping, setEditShipping] = useState<number | "">("");
  const [editAmount, setEditAmount] = useState<number | "">("");
  const [editNote, setEditNote] = useState("");
  const [saving, setSaving] = useState(false);

  const startEdit = (o: any) => {
    setEditingOrder(o);
    setEditName(o.customer_name ?? "");
    setEditPhone(o.customer_phone ?? "");
    setEditResi(o.tracking_number ?? "");
    setEditExpedition(o.expedition ?? "");
    setEditPaymentMethod(o.payment_method ?? "");
    setEditTransferBank(o.transfer_bank ?? "");
    setEditShipping(o.shipping_fee ?? 0);
    setEditAmount(o.amount_received ?? "");
    setEditNote(o.customer_note ?? "");
  };

  const handleDeleteClick = async (orderId: string) => {
    if (!confirm("Apakah Anda yakin ingin menghapus pesanan ini? Seluruh stok madu dan kemasan akan dikembalikan secara otomatis.")) return;
    try {
      const { error } = await (supabase.rpc as any)("delete_order", { _order_id: orderId });
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Pesanan berhasil dihapus dan stok telah dikembalikan");
        qc.invalidateQueries();
      }
    } catch (err: any) {
      toast.error("Gagal menghapus pesanan");
    }
  };

  const handleBulkDelete = async () => {
    if (selectedOrderIds.length === 0) return;
    if (!confirm(`Apakah Anda yakin ingin menghapus ${selectedOrderIds.length} pesanan yang terpilih? Seluruh stok madu dan kemasan akan dikembalikan secara otomatis.`)) return;
    
    setDeletingBulk(true);
    let successCount = 0;
    let failCount = 0;

    for (const id of selectedOrderIds) {
      try {
        const { error } = await (supabase.rpc as any)("delete_order", { _order_id: id });
        if (error) {
          failCount++;
        } else {
          successCount++;
        }
      } catch (err) {
        failCount++;
      }
    }

    setDeletingBulk(false);
    setSelectedOrderIds([]);
    qc.invalidateQueries();
    
    if (failCount === 0) {
      toast.success(`${successCount} pesanan berhasil dihapus dan stok telah dikembalikan`);
    } else {
      toast.success(`${successCount} pesanan berhasil dihapus. ${failCount} pesanan gagal dihapus.`);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingOrder) return;
    setSaving(true);
    try {
      const subtotalGross = Number(editingOrder.subtotal_gross);
      const marketplaceFee = Number(editingOrder.marketplace_fee);
      const finalAmount = editAmount === "" ? null : Number(editAmount);
      const finalShipping = editShipping === "" ? 0 : Number(editShipping);
      const netRevenue = (finalAmount !== null ? finalAmount : (subtotalGross - marketplaceFee)) - finalShipping;

      const { error } = await supabase
        .from("orders")
        .update({
          customer_name: editName,
          customer_phone: editPhone,
          tracking_number: editResi,
          expedition: editExpedition || null,
          payment_method: editPaymentMethod || null,
          transfer_bank: editPaymentMethod === "TRANSFER" ? (editTransferBank || null) : null,
          shipping_fee: finalShipping,
          amount_received: finalAmount,
          net_revenue: netRevenue,
          customer_note: editNote,
        })
        .eq("id", editingOrder.id);
      
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Pesanan berhasil diperbarui");
        setEditingOrder(null);
        qc.invalidateQueries();
      }
    } catch (err: any) {
      toast.error("Gagal menyimpan perubahan");
    } finally {
      setSaving(false);
    }
  };

  const activeVariants = useMemo(() => {
    const list = (variants ?? []).map((v: any) => v.name);
    return list.length > 0 ? list : ["Akasia", "Randu", "Karet", "Lainnya"];
  }, [variants]);

  const showPhone = channel === "whatsapp" || channel === "reseller" || channel === "offline";

  const priceFor = (size_id: string, honey_type: string) => {
    if (channel === "reseller" && tierId) {
      return Number(resellerPrices?.find((r: any) => r.tier_id === tierId && r.size_id === size_id && r.honey_type === honey_type)?.price ?? 0);
    }
    return Number(retail?.find((r: any) => r.size_id === size_id && r.honey_type === honey_type)?.price ?? 0);
  };

  const addItem = () => {
    const firstSize: any = sizes?.[0];
    const firstVariant = activeVariants[0] || "Akasia";
    if (!firstSize?.id) return;
    setItems([...items, { size_id: firstSize.id as string, qty: 1, unit_price: priceFor(firstSize.id, firstVariant), honey_type: firstVariant }]);
  };
  const updateItem = (i: number, patch: Partial<{ size_id: string; qty: number; unit_price: number; honey_type: string }>) => {
    setItems(items.map((it, idx) => {
      if (idx !== i) return it;
      const nextIt = { ...it, ...patch };
      if (patch.size_id || patch.honey_type) {
        nextIt.unit_price = priceFor(nextIt.size_id, nextIt.honey_type);
      }
      return nextIt;
    }));
  };
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));

  const subtotal = useMemo(() => items.reduce((s, it) => s + it.qty * it.unit_price, 0), [items]);
  const feePct = Number(fees?.find((f: any) => f.channel === channel)?.fee_percent ?? 0);
  const mpFee = Math.round((subtotal * feePct) / 100);
  const received = amountReceived === "" ? 0 : Number(amountReceived);
  const net = received - shipping;

  const [submitting, setSubmitting] = useState(false);
  const submit = async () => {
    if (!customerName.trim()) return toast.error("Nama pelanggan wajib diisi");
    if (!items.length) return toast.error("Tambahkan item pesanan");
    if (channel === "reseller" && !tierId) return toast.error("Pilih tier reseller");
    setSubmitting(true);
    const { error } = await supabase.rpc("create_order", {
      _channel: channel,
      _tier_id: (channel === "reseller" ? tierId : null) as any,
      _items: items as any,
      _shipping_fee: channel === "whatsapp" ? shipping : 0,
      _customer_note: (note || null) as any,
      _customer_name: customerName.trim(),
      _customer_phone: (customerPhone.trim() || null) as any,
      _tracking_number: (trackingNumber.trim() || null) as any,
      _amount_received: (amountReceived === "" ? null : Number(amountReceived)) as any,
      _expedition: (expedition && expedition !== "-" ? expedition : null) as any,
      _payment_method: (paymentMethod && paymentMethod !== "-" ? paymentMethod : null) as any,
      _transfer_bank: (paymentMethod === "TRANSFER" && transferBank && transferBank !== "-" ? transferBank : null) as any,
    });
    setSubmitting(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Pesanan diproses & stok dipotong otomatis");
      setItems([]); setShipping(0); setNote("");
      setCustomerName(""); setCustomerPhone(""); setTrackingNumber(""); setAmountReceived("");
      setExpedition(""); setPaymentMethod(""); setTransferBank("");
      qc.invalidateQueries();
    }
  };

  const uniqueItems = useMemo(() => {
    const map = new Map<string, { honey_type: string; size_id: string; size_name: string; default_price: number }>();
    for (const o of importedOrders) {
      for (const it of o.items) {
        const key = `${it.honey_type}-${it.size_id}`;
        if (!map.has(key)) {
          map.set(key, {
            honey_type: it.honey_type,
            size_id: it.size_id,
            size_name: it.size_name,
            default_price: it.unit_price
          });
        }
      }
    }
    return Array.from(map.values());
  }, [importedOrders]);

  const applyBulkPrice = (honeyType: string, sizeId: string, price: number) => {
    let matchName = "";
    const updated = importedOrders.map(order => {
      const nextItems = order.items.map((it: any) => {
        if (it.honey_type === honeyType && it.size_id === sizeId) {
          matchName = `${it.honey_type} ${it.size_name}`;
          return { ...it, unit_price: price };
        }
        return it;
      });
      return { ...order, items: nextItems };
    });
    setImportedOrders(updated);
    toast.success(`Harga ${matchName || honeyType} berhasil diubah menjadi ${formatIDR(price)} untuk seluruh baris.`);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        
        // Parse sheet as 2D array first to scan for header row
        const rawSheets2D = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];
        
        if (rawSheets2D.length === 0) {
          toast.error("File Excel kosong");
          return;
        }

        // Find the actual header row index (containing tracking no, recipient name, etc.)
        let headerRowIdx = -1;
        for (let i = 0; i < Math.min(rawSheets2D.length, 10); i++) {
          const row = rawSheets2D[i];
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

        // Extract header names and convert subsequent rows to objects
        const headers = rawSheets2D[headerRowIdx].map(h => String(h || "").trim());
        const rawRows: any[] = [];
        
        for (let i = headerRowIdx + 1; i < rawSheets2D.length; i++) {
          const row = rawSheets2D[i];
          if (!row || row.length === 0 || row.every(cell => cell === "")) continue;
          
          const obj: any = {};
          headers.forEach((header, colIdx) => {
            if (header) {
              obj[header] = colIdx < row.length ? row[colIdx] : "";
            }
          });
          rawRows.push(obj);
        }

        if (rawRows.length === 0) {
          toast.error("Tidak ada baris data pesanan setelah header");
          return;
        }
        
        processExcelData(rawRows);
      } catch (err: any) {
        toast.error("Gagal membaca file: " + err.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  const processExcelData = (rows: any[]) => {
    const list: any[] = [];
    
    // Helper function to parse numbers safely and truncate decimal points
    const parseExcelNumber = (val: any) => {
      if (val === undefined || val === null || val === "") return 0;
      if (typeof val === "number") return Math.floor(val);
      const str = String(val).trim();
      const parts = str.split(".");
      const intPart = parts[0].replace(/[^0-9-]/g, ""); // keep digits and minus
      const num = Number(intPart);
      return isNaN(num) ? 0 : num;
    };

    for (const row of rows) {
      const rowKeys = Object.keys(row);
      if (rowKeys.length < 3) continue; // skip header or empty rows
      
      const getVal = (keys: string[], colIdx?: number) => getRowValue(row, keys, colIdx);
      
      const paymentMethodRaw = String(getVal(["Pengiriman", "Sistem Pengiriman", "Metode Pembayaran", "Payment", "Tipe Bayar", "Metode Bayar"], 0) || "").trim();
      const codCollectionRaw = String(getVal(["COD Collection(Y/N)", "COD Collection", "Is COD", "COD Collection Status"], 8) || "").trim();
      
      let trackingNumber = String(getVal(["Tracking No.", "Resi", "No. Resi", "Nomor Resi", "Airwaybill", "Tracking", "AWB", "No. AWB"], 1) || "").trim();
      // Clean link if it's a URL (e.g., https://spx.co.id/track?SPXID062240584946 -> SPXID062240584946)
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
      const parsedItems = parseProductString(productString, activeVariants, sizes || [], packageQty, retail || []);
      const defaultSubtotal = parsedItems.reduce((sum: number, it: any) => sum + (it.unit_price * it.qty), 0);
      
      // Set amountReceived as raw COD Amount or Parcel Value (with default subtotal fallback)
      let amountReceived = 0;
      if (isCOD) {
        amountReceived = codAmount;
      } else {
        amountReceived = parcelValue > 0 ? parcelValue : defaultSubtotal;
      }

      list.push({
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

    setImportedOrders(list);
  };

  const handleConfirmImport = async () => {
    if (importedOrders.length === 0) return;
    setImporting(true);
    setImportProgress({ current: 0, total: importedOrders.length });
    
    let successCount = 0;
    const failures: { name: string; tracking: string; msg: string }[] = [];

    for (let i = 0; i < importedOrders.length; i++) {
      const order = importedOrders[i];
      setImportProgress({ current: i + 1, total: importedOrders.length });

      if (order.items.length === 0) {
        failures.push({
          name: order.customerName || "Tanpa Nama",
          tracking: order.trackingNumber || "Tanpa Resi",
          msg: "Gagal mendeteksi varian/ukuran produk dari teks: '" + order.productString + "'"
        });
        continue;
      }

      try {
        const { error } = await supabase.rpc("create_order", {
          _channel: "whatsapp",
          _tier_id: null,
          _items: order.items.map((it: any) => ({
            size_id: it.size_id,
            qty: it.qty,
            unit_price: it.unit_price,
            honey_type: it.honey_type
          })),
          _shipping_fee: order.shippingFee,
          _customer_note: `Impor Massal: ${order.productString}`,
          _customer_name: order.customerName,
          _customer_phone: order.customerPhone || null,
          _tracking_number: order.trackingNumber || null,
          _amount_received: order.amountReceived,
          _expedition: order.expedition !== "-" ? order.expedition : null,
          _payment_method: order.paymentMethod,
          _transfer_bank: null,
        });

        if (error) {
          failures.push({
            name: order.customerName || "Tanpa Nama",
            tracking: order.trackingNumber || "Tanpa Resi",
            msg: error.message
          });
        } else {
          successCount++;
        }
      } catch (err: any) {
        failures.push({
          name: order.customerName || "Tanpa Nama",
          tracking: order.trackingNumber || "Tanpa Resi",
          msg: err.message || "Unknown error"
        });
      }
    }

    setImportResults({
      success: successCount,
      failed: failures
    });
    setImporting(false);
    qc.invalidateQueries();
  };

  const resetImportState = () => {
    setImportedOrders([]);
    setImportProgress(null);
    setImportResults(null);
    setIsImportOpen(false);
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h2 className="text-2xl font-semibold">Input Pesanan</h2>
        <p className="text-sm text-muted-foreground">Pilih saluran & ukuran — stok madu, botol, stiker, segel, dan packing dipotong otomatis.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 flex-wrap gap-2">
          <CardTitle>Pesanan Baru</CardTitle>
          <Button 
            size="sm" 
            variant="outline" 
            onClick={() => setIsImportOpen(true)}
            className="gap-2 border-honey hover:bg-honey/10 text-honey hover:text-honey-hover transition-all duration-300"
          >
            <Upload className="h-4 w-4" />
            Impor Massal Excel
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label>Saluran Penjualan</Label>
              <Select 
                value={channel} 
                onValueChange={(v) => { 
                  const nextChannel = v as Channel;
                  setChannel(nextChannel); 
                  setItems(items.map(it => ({ 
                    ...it, 
                    unit_price: nextChannel === "reseller" && tierId
                      ? Number(resellerPrices?.find((r: any) => r.tier_id === tierId && r.size_id === it.size_id && r.honey_type === it.honey_type)?.price ?? 0)
                      : Number(retail?.find((r: any) => r.size_id === it.size_id && r.honey_type === it.honey_type)?.price ?? 0)
                  }))); 
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="shopee">Shopee (fee 6%)</SelectItem>
                  <SelectItem value="tiktok">TikTok (fee 4%)</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp (Meta Ads)</SelectItem>
                  <SelectItem value="reseller">Reseller</SelectItem>
                  <SelectItem value="offline">Offline</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {channel === "reseller" && (
              <div className="space-y-1">
                <Label>Tier Reseller</Label>
                <Select 
                  value={tierId} 
                  onValueChange={(val) => {
                    setTierId(val);
                    setItems(items.map(it => ({ 
                      ...it, 
                      unit_price: Number(resellerPrices?.find((r: any) => r.tier_id === val && r.size_id === it.size_id && r.honey_type === it.honey_type)?.price ?? 0)
                    })));
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Pilih tier" /></SelectTrigger>
                  <SelectContent>{(tiers ?? []).map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {channel === "whatsapp" && (
              <div className="space-y-1">
                <Label>Biaya Kirim / Agregator (Rp)</Label>
                <Input type="number" value={shipping} onChange={(e) => setShipping(+e.target.value)} />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Item Pesanan</Label>
              <Button size="sm" variant="outline" onClick={addItem}><Plus className="h-3 w-3 mr-1" /> Tambah</Button>
            </div>
            <Table>
              <TableHeader><TableRow><TableHead>Ukuran</TableHead><TableHead>Jenis Madu</TableHead><TableHead>Qty</TableHead><TableHead>Harga Satuan</TableHead><TableHead>Subtotal</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {items.map((it, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Select value={it.size_id} onValueChange={(v) => updateItem(i, { size_id: v })}>
                        <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>{(sizes ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select value={it.honey_type} onValueChange={(v) => updateItem(i, { honey_type: v })}>
                        <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>{activeVariants.map((h: string) => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell><Input type="number" min={1} className="w-20" value={it.qty} onChange={(e) => updateItem(i, { qty: +e.target.value })} /></TableCell>
                    <TableCell><Input type="number" className="w-32" value={it.unit_price} onChange={(e) => updateItem(i, { unit_price: +e.target.value })} /></TableCell>
                    <TableCell>{formatIDR(it.qty * it.unit_price)}</TableCell>
                    <TableCell><Button size="icon" variant="ghost" onClick={() => removeItem(i)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                  </TableRow>
                ))}
                {!items.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Belum ada item</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label>Nama Pelanggan *</Label>
              <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nama lengkap" />
            </div>
            {showPhone && (
              <div className="space-y-1">
                <Label>No. HP</Label>
                <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="08xxxxxxxxxx" />
              </div>
            )}
            <div className="space-y-1">
              <Label>No. Resi</Label>
              <Input 
                value={trackingNumber} 
                onChange={(e) => {
                  const val = e.target.value;
                  setTrackingNumber(val);
                  const detected = detectCourier(val);
                  if (detected) {
                    setExpedition(detected);
                  }
                }} 
                placeholder="Nomor resi pengiriman" 
              />
            </div>
            <div className="space-y-1">
              <Label>Ekspedisi</Label>
              <Select value={expedition} onValueChange={setExpedition}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih Ekspedisi" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="-">— Tidak Ada / Lainnya —</SelectItem>
                  <SelectItem value="ID EXPRESS">ID EXPRESS</SelectItem>
                  <SelectItem value="SPX">SPX</SelectItem>
                  <SelectItem value="JNE">JNE</SelectItem>
                  <SelectItem value="J&T">J&T</SelectItem>
                  <SelectItem value="LION PARCEL">LION PARCEL</SelectItem>
                  <SelectItem value="SICEPAT">SICEPAT</SelectItem>
                  <SelectItem value="ANTERAJA">ANTERAJA</SelectItem>
                  <SelectItem value="SAP EXPRESS">SAP EXPRESS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Metode Pembayaran</Label>
              <Select 
                value={paymentMethod} 
                onValueChange={(val) => {
                  setPaymentMethod(val);
                  if (val !== "TRANSFER") {
                    setTransferBank("");
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih Metode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="-">— Tidak Ada —</SelectItem>
                  <SelectItem value="COD">COD</SelectItem>
                  <SelectItem value="TRANSFER">TRANSFER</SelectItem>
                  <SelectItem value="CASH">CASH</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {paymentMethod === "TRANSFER" && (
              <div className="space-y-1">
                <Label>Rekening Bank</Label>
                <Select value={transferBank} onValueChange={setTransferBank}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih Bank" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="-">— Pilih Bank —</SelectItem>
                    <SelectItem value="BRI">BRI</SelectItem>
                    <SelectItem value="BCA">BCA</SelectItem>
                    <SelectItem value="MANDIRI">MANDIRI</SelectItem>
                    <SelectItem value="BNI">BNI</SelectItem>
                    <SelectItem value="BSI">BSI</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label>Nominal Uang Diterima (Rp)</Label>
              <Input type="number" value={amountReceived} onChange={(e) => setAmountReceived(e.target.value === "" ? "" : +e.target.value)} placeholder="Contoh: 150000" />
            </div>
          </div>

          <div className="space-y-1"><Label>Catatan</Label><Input value={note} onChange={(e) => setNote(e.target.value)} /></div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-muted rounded-lg text-sm">
            <div><div className="text-muted-foreground">Subtotal</div><div className="font-semibold">{formatIDR(subtotal)}</div></div>
            <div><div className="text-muted-foreground">Fee Platform ({feePct}%)</div><div className="font-semibold">- {formatIDR(mpFee)}</div></div>
            <div><div className="text-muted-foreground">Ongkir/Agregator</div><div className="font-semibold">- {formatIDR(shipping)}</div></div>
            <div><div className="text-muted-foreground">Pendapatan Bersih</div><div className="font-bold text-honey">{formatIDR(net)}</div></div>
          </div>

          <Button onClick={submit} disabled={submitting || !items.length} className="w-full md:w-auto">Proses Pesanan</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 flex-wrap gap-2">
          <CardTitle>Pesanan Terbaru</CardTitle>
          {selectedOrderIds.length > 0 && (
            <Button
              size="sm"
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={deletingBulk}
              className="gap-2 bg-destructive hover:bg-destructive/90 text-white font-bold transition-all duration-300 animate-in fade-in slide-in-from-top-1"
            >
              {deletingBulk ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Hapus Terpilih ({selectedOrderIds.length})
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px] text-center">
                  <input
                    type="checkbox"
                    checked={
                      orders && orders.length > 0 &&
                      orders.filter((o: any) => !o.returned).length > 0 &&
                      orders.filter((o: any) => !o.returned).every((o: any) => selectedOrderIds.includes(o.id))
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        const nonReturnedIds = (orders ?? [])
                          .filter((o: any) => !o.returned)
                          .map((o: any) => o.id);
                        setSelectedOrderIds(nonReturnedIds);
                      } else {
                        setSelectedOrderIds([]);
                      }
                    }}
                    className="rounded border-slate-300 text-honey focus:ring-honey h-4 w-4 accent-honey cursor-pointer"
                  />
                </TableHead>
                <TableHead>Tanggal</TableHead>
                <TableHead>Pelanggan</TableHead>
                <TableHead>No. HP</TableHead>
                <TableHead>Saluran</TableHead>
                <TableHead>Resi</TableHead>
                <TableHead>Subtotal</TableHead>
                <TableHead>Bersih</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(orders ?? []).map((o: any) => (
                <TableRow key={o.id} className={o.returned ? "opacity-60 bg-muted/30" : ""}>
                  <TableCell className="text-center">
                    {!o.returned && (
                      <input
                        type="checkbox"
                        checked={selectedOrderIds.includes(o.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedOrderIds([...selectedOrderIds, o.id]);
                          } else {
                            setSelectedOrderIds(selectedOrderIds.filter(id => id !== o.id));
                          }
                        }}
                        className="rounded border-slate-300 text-honey focus:ring-honey h-4 w-4 accent-honey cursor-pointer"
                      />
                    )}
                  </TableCell>
                  <TableCell>{new Date(o.created_at).toLocaleString("id-ID")}</TableCell>
                  <TableCell>
                    <span className="font-medium">{o.customer_name ?? "-"}</span>
                    {o.returned && (
                      <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-destructive/15 text-destructive border border-destructive/20 uppercase">
                        Retur
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{o.customer_phone ?? "-"}</TableCell>
                  <TableCell className="capitalize">
                    <div>{o.channel}</div>
                    {(o.payment_method || o.expedition) && (
                      <div className="text-[10px] text-muted-foreground mt-0.5 flex gap-1 items-center flex-wrap">
                        {o.payment_method && (
                          <span className="bg-honey/10 text-honey px-1 rounded font-semibold text-[9px]">
                            {o.payment_method}
                            {o.payment_method === "TRANSFER" && o.transfer_bank && ` (${o.transfer_bank})`}
                          </span>
                        )}
                        {o.expedition && (
                          <span className="text-slate-500">
                            • {o.expedition}
                          </span>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{o.tracking_number ?? "-"}</TableCell>
                  <TableCell>{formatIDR(o.subtotal_gross)}</TableCell>
                  <TableCell className="font-medium">{formatIDR(o.net_revenue)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {!o.returned ? (
                        <>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-primary hover:text-primary/80" onClick={() => startEdit(o)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive/80" onClick={() => handleDeleteClick(o.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground italic px-2 select-none">Selesai Diretur</span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!orders?.length && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">Belum ada pesanan</TableCell></TableRow>}
            </TableBody>
          </Table>

          {/* DYNAMIC PAGINATION CONTROLS */}
          {totalOrders > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 pt-4 border-t text-sm font-medium">
              <div className="text-muted-foreground text-xs">
                Total <span className="font-bold text-foreground">{totalOrders}</span>
              </div>
              
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                  >
                    &lt;
                  </Button>
                  {getPageNumbers(currentPage, totalPages).map((p, idx) => {
                    if (p === "...") {
                      return (
                        <span key={idx} className="px-2 text-muted-foreground select-none">
                          ...
                        </span>
                      );
                    }
                    const isActive = currentPage === p;
                    return (
                      <Button
                        key={idx}
                        variant="ghost"
                        className={`h-8 min-w-[32px] px-1 text-xs font-semibold rounded ${
                          isActive 
                            ? "border border-honey text-honey bg-transparent hover:bg-honey/10 font-bold" 
                            : "text-muted-foreground hover:text-foreground hover:bg-slate-100"
                        }`}
                        onClick={() => setCurrentPage(p as number)}
                      >
                        {p}
                      </Button>
                    );
                  })}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                  >
                    &gt;
                  </Button>
                </div>

                <Select
                  value={String(pageSize)}
                  onValueChange={(val) => {
                    setPageSize(Number(val));
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="w-32 h-8 text-xs border-muted-foreground/30 font-semibold focus:ring-honey">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10 / page</SelectItem>
                    <SelectItem value="20">20 / page</SelectItem>
                    <SelectItem value="50">50 / page</SelectItem>
                    <SelectItem value="100">100 / page</SelectItem>
                    <SelectItem value="250">250 / page</SelectItem>
                    <SelectItem value="500">500 / page</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editingOrder} onOpenChange={(open) => !open && setEditingOrder(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Detail Pesanan</DialogTitle>
            <DialogDescription>
              Ubah data pengiriman dan penerimaan uang. Untuk mengubah varian/jumlah item, silakan hapus pesanan ini dan input ulang agar stok dandang & packaging disesuaikan dengan benar.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-name" className="text-right text-xs font-semibold">Pelanggan</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="col-span-3 h-9"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-phone" className="text-right text-xs font-semibold">No. HP</Label>
              <Input
                id="edit-phone"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                className="col-span-3 h-9"
                placeholder="08xxxxxxxxxx"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-resi" className="text-right text-xs font-semibold">No. Resi</Label>
              <Input
                id="edit-resi"
                value={editResi}
                onChange={(e) => {
                  const val = e.target.value;
                  setEditResi(val);
                  const detected = detectCourier(val);
                  if (detected) {
                    setEditExpedition(detected);
                  }
                }}
                className="col-span-3 h-9"
                placeholder="Nomor resi pengiriman"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-expedition" className="text-right text-xs font-semibold">Ekspedisi</Label>
              <div className="col-span-3">
                <Select value={editExpedition || "-"} onValueChange={(val) => setEditExpedition(val === "-" ? "" : val)}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Pilih Ekspedisi" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="-">— Tidak Ada / Lainnya —</SelectItem>
                    <SelectItem value="ID EXPRESS">ID EXPRESS</SelectItem>
                    <SelectItem value="SPX">SPX</SelectItem>
                    <SelectItem value="JNE">JNE</SelectItem>
                    <SelectItem value="J&T">J&T</SelectItem>
                    <SelectItem value="LION PARCEL">LION PARCEL</SelectItem>
                    <SelectItem value="SICEPAT">SICEPAT</SelectItem>
                    <SelectItem value="ANTERAJA">ANTERAJA</SelectItem>
                    <SelectItem value="SAP EXPRESS">SAP EXPRESS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-payment" className="text-right text-xs font-semibold">Pembayaran</Label>
              <div className="col-span-3">
                <Select 
                  value={editPaymentMethod || "-"} 
                  onValueChange={(val) => {
                    const nextVal = val === "-" ? "" : val;
                    setEditPaymentMethod(nextVal);
                    if (nextVal !== "TRANSFER") {
                      setEditTransferBank("");
                    }
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Pilih Metode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="-">— Tidak Ada —</SelectItem>
                    <SelectItem value="COD">COD</SelectItem>
                    <SelectItem value="TRANSFER">TRANSFER</SelectItem>
                    <SelectItem value="CASH">CASH</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {editPaymentMethod === "TRANSFER" && (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-bank" className="text-right text-xs font-semibold">Rekening Bank</Label>
                <div className="col-span-3">
                  <Select value={editTransferBank || "-"} onValueChange={(val) => setEditTransferBank(val === "-" ? "" : val)}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Pilih Bank" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="-">— Pilih Bank —</SelectItem>
                      <SelectItem value="BRI">BRI</SelectItem>
                      <SelectItem value="BCA">BCA</SelectItem>
                      <SelectItem value="MANDIRI">MANDIRI</SelectItem>
                      <SelectItem value="BNI">BNI</SelectItem>
                      <SelectItem value="BSI">BSI</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-shipping" className="text-right text-xs font-semibold">Ongkir (Rp)</Label>
              <Input
                id="edit-shipping"
                type="number"
                value={editShipping}
                onChange={(e) => setEditShipping(e.target.value === "" ? "" : Number(e.target.value))}
                className="col-span-3 h-9"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-amount" className="text-right text-xs font-semibold">Uang Diterima</Label>
              <Input
                id="edit-amount"
                type="number"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value === "" ? "" : Number(e.target.value))}
                className="col-span-3 h-9"
                placeholder="Kosongkan jika sesuai subtotal"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-note" className="text-right text-xs font-semibold">Catatan</Label>
              <Input
                id="edit-note"
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                className="col-span-3 h-9"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingOrder(null)} disabled={saving} className="h-9 text-xs">
              Batal
            </Button>
            <Button onClick={handleSaveEdit} disabled={saving} className="h-9 text-xs gap-2">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Simpan Perubahan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG IMPOR MASSAL */}
      <Dialog open={isImportOpen} onOpenChange={(open) => !open && !importing && resetImportState()}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <Upload className="h-5.5 w-5.5 text-honey" />
              Impor Massal Pesanan Agregator
            </DialogTitle>
            <DialogDescription>
              Unggah file Excel ekspor dari aggregator Lincah atau SPX VIP Dashboard. Pesanan akan otomatis dikelompokkan ke saluran WhatsApp dengan kurir, ongkir, nominal, dan detail pembayaran yang sesuai.
            </DialogDescription>
          </DialogHeader>

          {/* STATE 1: UPLOAD FILE */}
          {importedOrders.length === 0 && !importing && !importResults && (
            <div className="flex flex-col items-center justify-center border-2 border-dashed border-muted-foreground/25 hover:border-honey/40 rounded-xl p-10 my-4 bg-muted/10 transition-all duration-300 gap-4">
              <div className="p-4 bg-honey/10 text-honey rounded-full border border-honey/20 shadow-inner">
                <Upload className="h-8 w-8" />
              </div>
              <div className="text-center space-y-1.5">
                <p className="font-semibold text-sm">Pilih berkas Excel (.xlsx / .xls / .csv)</p>
                <p className="text-xs text-muted-foreground">Pastikan berisi kolom-kolom data pesanan aggregator</p>
              </div>
              <Input
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileUpload}
                className="max-w-xs cursor-pointer hover:bg-muted/30 file:text-honey file:font-semibold"
              />
            </div>
          )}

          {/* STATE 2: PREVIEW PARSED ORDERS */}
          {importedOrders.length > 0 && !importing && !importResults && (
            <div className="flex-1 flex flex-col min-h-0 space-y-4 my-2">
              <div className="flex justify-between items-center bg-muted/30 p-3 rounded-lg border border-border/60 text-xs">
                <div className="flex gap-4">
                  <div>Total Ditemukan: <span className="font-bold">{importedOrders.length} baris</span></div>
                  <div>Valid: <span className="font-bold text-emerald-600">{importedOrders.filter(o => o.items.length > 0).length}</span></div>
                  <div>Gagal Deteksi: <span className="font-bold text-destructive">{importedOrders.filter(o => o.items.length === 0).length}</span></div>
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Saluran: WhatsApp</div>
              </div>

              {/* ATUR HARGA SERENTAK (BULK APPLY) PANEL */}
              {uniqueItems.length > 0 && (
                <div className="bg-honey/5 border border-honey/15 rounded-lg p-3 space-y-2 text-xs">
                  <div className="font-bold text-honey flex items-center gap-1.5">
                    <span className="bg-honey/15 px-1.5 py-0.5 rounded text-[10px]">⚡ Bulk Edit</span>
                    <span>Atur Harga Serentak</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Ubah harga produk yang sama pada seluruh baris pesanan sekaligus. Ketik nominal lalu klik Terapkan.
                  </p>
                  <div className="flex flex-wrap gap-2.5 pt-1">
                    {uniqueItems.map((ui, uiIdx) => (
                      <div key={uiIdx} className="flex items-center gap-2 bg-background border border-border/80 rounded-md p-1.5 shadow-xs">
                        <span className="font-semibold text-foreground/80">{ui.honey_type} {ui.size_name}</span>
                        <span className="text-muted-foreground/50">: Rp</span>
                        <Input
                          type="number"
                          placeholder="Harga"
                          className="w-20 h-7 text-xs px-1 text-right font-bold"
                          id={`bulk-price-${ui.honey_type}-${ui.size_id}`}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const val = (e.target as HTMLInputElement).value;
                              if (val !== "") {
                                applyBulkPrice(ui.honey_type, ui.size_id, Number(val));
                              }
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[10px] border-honey hover:bg-honey/10 text-honey font-bold transition-all"
                          onClick={() => {
                            const inputEl = document.getElementById(`bulk-price-${ui.honey_type}-${ui.size_id}`) as HTMLInputElement;
                            const val = inputEl?.value;
                            if (val !== "") {
                              applyBulkPrice(ui.honey_type, ui.size_id, Number(val));
                            } else {
                              toast.error("Masukkan nominal harga terlebih dahulu");
                            }
                          }}
                        >
                          Terapkan
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex-1 overflow-y-auto border rounded-lg max-h-[45vh]">
                <Table>
                  <TableHeader className="bg-muted/40 sticky top-0 z-10">
                    <TableRow>
                      <TableHead className="w-[180px]">Pelanggan</TableHead>
                      <TableHead className="w-[140px]">Resi / Kurir</TableHead>
                      <TableHead>Produk (Hasil Deteksi)</TableHead>
                      <TableHead className="w-[120px] text-right">Pembayaran</TableHead>
                      <TableHead className="w-[110px] text-right">Ongkir/Agreg</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importedOrders.map((o, idx) => (
                      <TableRow key={idx} className={o.items.length === 0 ? "bg-destructive/5 hover:bg-destructive/10" : ""}>
                        <TableCell>
                          <div className="font-medium text-xs truncate max-w-[170px]">{o.customerName || "—"}</div>
                          <div className="text-[10px] text-muted-foreground">{o.customerPhone || "—"}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-mono text-[10px] truncate max-w-[130px]" title={o.trackingNumber}>{o.trackingNumber || "—"}</div>
                          <div className="text-[10px] bg-slate-100 text-slate-700 font-semibold px-1 rounded w-fit mt-0.5">{o.expedition}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-[10px] text-muted-foreground italic truncate max-w-[280px]" title={o.productString}>"{o.productString}"</div>
                          <div className="mt-1.5 space-y-1.5">
                            {o.items.length > 0 ? (
                              o.items.map((it: any, iKey: number) => (
                                <div key={iKey} className="flex items-center gap-1.5 text-[10px] bg-background border border-border/80 rounded-md px-2 py-1 w-fit shadow-xs">
                                  <span className="font-semibold text-honey/90">{it.honey_type} {it.size_name} (x{it.qty})</span>
                                  <span className="text-muted-foreground/60">• Rp</span>
                                  <Input
                                    type="number"
                                    value={it.unit_price}
                                    onChange={(e) => {
                                      const nextVal = e.target.value === "" ? 0 : Number(e.target.value);
                                      const updated = [...importedOrders];
                                      updated[idx].items[iKey].unit_price = nextVal;
                                      setImportedOrders(updated);
                                    }}
                                    className="w-18 h-6 text-[10px] px-1 py-0.5 border-muted-foreground/20 text-right font-extrabold focus-visible:ring-1 focus-visible:ring-honey"
                                  />
                                </div>
                              ))
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-destructive/15 text-destructive border border-destructive/20 uppercase">
                                ⚠️ Gagal Deteksi Produk
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`inline-block px-1 rounded text-[9px] font-bold ${o.paymentMethod === "COD" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}`}>
                            {o.paymentMethod}
                          </span>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            Subtotal: <span className="font-semibold">{formatIDR(o.items.reduce((sum: number, it: any) => sum + (it.unit_price * it.qty), 0))}</span>
                          </div>
                          <div className="text-xs font-bold text-foreground mt-0.5">
                            Bayar: {formatIDR(o.amountReceived)}
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-xs font-semibold">
                          {formatIDR(o.shippingFee)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t font-sans">
                <Button variant="outline" size="sm" onClick={() => setImportedOrders([])} className="h-9 text-xs">
                  Batal / Upload Ulang
                </Button>
                <Button 
                  onClick={handleConfirmImport} 
                  disabled={importedOrders.filter(o => o.items.length > 0).length === 0} 
                  className="h-9 text-xs bg-honey hover:bg-honey-hover text-white gap-2 font-bold transition-all duration-300"
                >
                  <Upload className="h-4.5 w-4.5" />
                  Proses Impor ({importedOrders.filter(o => o.items.length > 0).length} Pesanan)
                </Button>
              </div>
            </div>
          )}

          {/* STATE 3: IMPORTING PROGRESS */}
          {importing && importProgress && (
            <div className="flex flex-col items-center justify-center p-10 my-4 space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-honey" />
              <div className="text-center space-y-1.5">
                <p className="font-semibold text-sm">Mengimpor Pesanan ke Database...</p>
                <p className="text-xs text-muted-foreground">
                  Progres: {importProgress.current} dari {importProgress.total} pesanan ({Math.round((importProgress.current / importProgress.total) * 100)}%)
                </p>
              </div>
              <div className="w-full max-w-md bg-muted h-2.5 rounded-full overflow-hidden border">
                <div 
                  className="bg-honey h-full rounded-full transition-all duration-300" 
                  style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* STATE 4: IMPORT RESULTS REPORT */}
          {importResults && (
            <div className="flex-1 flex flex-col min-h-0 space-y-4 my-2">
              <div className="flex flex-col items-center justify-center p-6 bg-emerald-500/5 border border-emerald-500/10 rounded-xl gap-2">
                <div className="w-10 h-10 bg-emerald-500/15 border border-emerald-500/30 rounded-full flex items-center justify-center text-emerald-600 font-bold text-lg">✓</div>
                <div className="text-center">
                  <h3 className="font-extrabold text-sm text-emerald-800">Impor Selesai Diproses</h3>
                  <p className="text-xs text-emerald-700/80 mt-1">
                    <span className="font-bold text-emerald-950">{importResults.success} pesanan</span> berhasil dimasukkan ke database dan stok dikurangi secara otomatis.
                  </p>
                </div>
              </div>

              {importResults.failed.length > 0 && (
                <div className="flex-1 flex flex-col min-h-0 space-y-2">
                  <h4 className="text-xs font-bold text-destructive uppercase tracking-wide">Daftar Baris Gagal ({importResults.failed.length}):</h4>
                  <div className="flex-1 overflow-y-auto border border-destructive/20 rounded-lg p-2 max-h-[35vh] bg-destructive/5 space-y-1.5">
                    {importResults.failed.map((f, i) => (
                      <div key={i} className="text-[11px] p-2 bg-background border border-destructive/10 rounded-md space-y-0.5">
                        <div className="flex justify-between font-semibold text-slate-800">
                          <span>{f.name} (Resi: {f.tracking})</span>
                          <span className="text-destructive uppercase text-[9px] font-bold">Gagal</span>
                        </div>
                        <div className="text-muted-foreground font-mono leading-tight">{f.msg}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-2 border-t">
                <Button onClick={resetImportState} className="h-9 text-xs font-bold bg-honey hover:bg-honey-hover text-white">
                  Selesai & Tutup
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

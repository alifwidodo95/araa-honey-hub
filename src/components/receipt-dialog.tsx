import React, { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { 
  Printer, 
  Download, 
  Copy, 
  Check, 
  RefreshCw, 
  Building2, 
  User, 
  MapPin, 
  Phone, 
  Calendar, 
  Receipt,
  FileCheck2,
  Sparkles,
  Loader2
} from "lucide-react";
import { toast } from "sonner";
import { toPng } from "html-to-image";
import { supabase } from "@/integrations/supabase/client";
import { ARAA_RECEIPT_LOGO_BASE64 } from "@/lib/receipt-logo";

export interface ReceiptItem {
  id: string;
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface ReceiptOrderData {
  id?: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  tracking_number?: string | null;
  created_at?: string | null;
  subtotal_gross?: number | string | null;
  shipping_fee?: number | string | null;
  amount_received?: number | string | null;
  payment_method?: string | null;
  order_items?: any[] | null;
  channel?: string | null;
}

interface ReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: ReceiptOrderData | null;
  onOrderUpdated?: (orderId: string, updatedAddress: string) => void;
}

export function ReceiptDialog({
  open,
  onOpenChange,
  order,
  onOrderUpdated,
}: ReceiptDialogProps) {
  const receiptRef = useRef<HTMLDivElement>(null);

  // Store & CS Settings
  const [storeName, setStoreName] = useState(() => localStorage.getItem("receipt_store_name") || "Madu Araa");
  const [storeAddress, setStoreAddress] = useState(() => localStorage.getItem("receipt_store_address") || "Surabaya, Jawa Timur");
  const [storePhone, setStorePhone] = useState(() => localStorage.getItem("receipt_store_phone") || "0813-3732-4522");
  const [cashierName, setCashierName] = useState(() => localStorage.getItem("receipt_cashier_name") || "Sheila");

  // Customer & Transaction Information
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [orderBarcodeId, setOrderBarcodeId] = useState("");
  const [receiptDate, setReceiptDate] = useState("");
  const [receiptTime, setReceiptTime] = useState("");

  // Items & Amounts
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [shippingFee, setShippingFee] = useState<number>(0);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<string>("COD");
  const [amountPaid, setAmountPaid] = useState<number>(0);

  // Paper & UI States
  const [paperWidth, setPaperWidth] = useState<"58mm" | "80mm">("58mm");
  const [saveAddressToDb, setSaveAddressToDb] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);

  // Synchronize state when order opens
  useEffect(() => {
    if (!open) return;

    if (order) {
      setCustomerName(order.customer_name || "Pelanggan");
      setCustomerPhone(order.customer_phone || "");
      setCustomerAddress(order.customer_address || "");

      // Date & Time formatting
      const dateObj = order.created_at ? new Date(order.created_at) : new Date();
      const yyyy = dateObj.getFullYear();
      const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
      const dd = String(dateObj.getDate()).padStart(2, "0");
      const hh = String(dateObj.getHours()).padStart(2, "0");
      const min = String(dateObj.getMinutes()).padStart(2, "0");
      const ss = String(dateObj.getSeconds()).padStart(2, "0");

      setReceiptDate(`${yyyy}-${mm}-${dd}`);
      setReceiptTime(`${hh}:${min}:${ss}`);

      // Receipt number & barcode
      const cleanId = order.id ? order.id.slice(0, 8).toUpperCase() : "0-1";
      setReceiptNumber(order.tracking_number ? order.tracking_number : `0-${cleanId}`);
      setOrderBarcodeId(
        order.tracking_number ||
          `${yyyy}${mm}${dd}${String(Math.floor(1000000000 + Math.random() * 9000000000))}`
      );

      // Shipping & payment
      const ship = Number(order.shipping_fee) || 0;
      setShippingFee(ship);
      setDiscountAmount(0);

      const payMethod = order.payment_method ? order.payment_method.toUpperCase() : "COD";
      setPaymentMethod(payMethod);

      // Parse order items
      if (order.order_items && Array.isArray(order.order_items) && order.order_items.length > 0) {
        const parsed: ReceiptItem[] = order.order_items.map((oi: any, idx: number) => {
          const honey = oi.honey_type ? `Madu ${oi.honey_type}` : "Madu Araa";
          const sizeName = oi.product_sizes?.name || "";
          const name = `${honey} ${sizeName}`.trim();
          const qty = Number(oi.qty) || 1;
          const unitPrice = Number(oi.unit_price) || 0;
          const lineTotal = Number(oi.line_total) || qty * unitPrice;
          return {
            id: String(oi.id || idx),
            name,
            qty,
            unitPrice,
            lineTotal,
          };
        });
        setItems(parsed);
      } else {
        // Fallback default single item
        const gross = Number(order.subtotal_gross) || 97000;
        setItems([
          {
            id: "1",
            name: "Madu Araa Murni",
            qty: 1,
            unitPrice: gross,
            lineTotal: gross,
          },
        ]);
      }

      // Paid Amount
      const initialGross = Number(order.subtotal_gross) || 0;
      const initialTotal = initialGross + ship;
      setAmountPaid(order.amount_received ? Number(order.amount_received) : initialTotal);
    } else {
      // Manual empty receipt
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      const hh = String(now.getHours()).padStart(2, "0");
      const min = String(now.getMinutes()).padStart(2, "0");
      const ss = String(now.getSeconds()).padStart(2, "0");

      setReceiptDate(`${yyyy}-${mm}-${dd}`);
      setReceiptTime(`${hh}:${min}:${ss}`);
      setReceiptNumber("0-1");
      setOrderBarcodeId(`${yyyy}${mm}${dd}${Math.floor(1000000000 + Math.random() * 9000000000)}`);
      setCustomerName("");
      setCustomerPhone("");
      setCustomerAddress("");
      setShippingFee(0);
      setDiscountAmount(0);
      setPaymentMethod("Cash");
      setItems([
        {
          id: "1",
          name: "Madu Akasia 1 kg",
          qty: 1,
          unitPrice: 97000,
          lineTotal: 97000,
        },
      ]);
      setAmountPaid(97000);
    }
  }, [open, order]);

  // Calculations
  const subtotal = items.reduce((acc, it) => acc + (Number(it.lineTotal) || 0), 0);
  const totalQty = items.reduce((acc, it) => acc + (Number(it.qty) || 0), 0);
  const grandTotal = Math.max(0, subtotal + shippingFee - discountAmount);
  const changeAmount = Math.max(0, amountPaid - grandTotal);

  // Save settings locally
  const handleSaveSettings = () => {
    localStorage.setItem("receipt_store_name", storeName);
    localStorage.setItem("receipt_store_address", storeAddress);
    localStorage.setItem("receipt_store_phone", storePhone);
    localStorage.setItem("receipt_cashier_name", cashierName);
  };

  // 1. Direct Print Function (Thermal 58mm / 80mm)
  const handlePrint = async () => {
    handleSaveSettings();

    // Auto save address to DB if enabled
    if (order?.id && saveAddressToDb && customerAddress !== (order.customer_address || "")) {
      try {
        await supabase
          .from("orders")
          .update({ customer_address: customerAddress })
          .eq("id", order.id);
        if (onOrderUpdated) {
          onOrderUpdated(order.id, customerAddress);
        }
      } catch (e) {
        console.error("Gagal simpan alamat:", e);
      }
    }

    if (!receiptRef.current) return;

    // Use hidden iframe printing for 100% clean thermal output
    const printContent = receiptRef.current.innerHTML;
    const printFrame = document.createElement("iframe");
    printFrame.style.position = "fixed";
    printFrame.style.right = "0";
    printFrame.style.bottom = "0";
    printFrame.style.width = "0";
    printFrame.style.height = "0";
    printFrame.style.border = "0";
    document.body.appendChild(printFrame);

    const frameDoc = printFrame.contentWindow?.document;
    if (!frameDoc) {
      window.print();
      return;
    }

    const widthMm = paperWidth === "58mm" ? "48mm" : "72mm";

    frameDoc.open();
    frameDoc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Struk Pembelian - ${customerName || "Konsumen"}</title>
          <style>
            @page {
              size: ${paperWidth === "58mm" ? "58mm auto" : "80mm auto"};
              margin: 0;
            }
            body {
              margin: 0;
              padding: 6px 4px;
              font-family: 'Courier New', Courier, monospace, monospace;
              color: #000000;
              background-color: #ffffff;
              width: ${widthMm};
              font-size: 11px;
              line-height: 1.25;
            }
            img {
              max-width: 80px;
              height: auto;
              display: block;
              margin: 0 auto;
              filter: grayscale(100%) contrast(150%);
            }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .font-bold { font-weight: bold; }
            .flex { display: flex; }
            .justify-between { justify-content: space-between; }
            .dashed-line {
              border-top: 1px dashed #000;
              margin: 5px 0;
              width: 100%;
            }
          </style>
        </head>
        <body>
          ${printContent}
        </body>
      </html>
    `);
    frameDoc.close();

    setTimeout(() => {
      printFrame.contentWindow?.focus();
      printFrame.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(printFrame);
      }, 1000);
    }, 300);
  };

  // 2. Download Image as PNG (Perfect for WhatsApp sharing)
  const handleDownloadImage = async () => {
    if (!receiptRef.current) return;
    setIsExporting(true);
    handleSaveSettings();

    // Auto save address to DB if enabled
    if (order?.id && saveAddressToDb && customerAddress !== (order.customer_address || "")) {
      try {
        await supabase
          .from("orders")
          .update({ customer_address: customerAddress })
          .eq("id", order.id);
        if (onOrderUpdated) {
          onOrderUpdated(order.id, customerAddress);
        }
      } catch (e) {
        console.error("Gagal simpan alamat:", e);
      }
    }

    try {
      const dataUrl = await toPng(receiptRef.current, {
        quality: 1,
        pixelRatio: 2.5,
        backgroundColor: "#ffffff",
      });

      const safeName = (customerName || "Konsumen").replace(/[^a-zA-Z0-9]/g, "_");
      const safeDate = receiptDate.replace(/[^0-9]/g, "");
      const link = document.createElement("a");
      link.download = `Struk_Madu_Araa_${safeName}_${safeDate}.png`;
      link.href = dataUrl;
      link.click();
      toast.success("✅ Gambar struk berhasil didownload!");
    } catch (err: any) {
      console.error(err);
      toast.error("Gagal membuat gambar struk: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  // 3. Copy Image to Clipboard (Single click to Paste directly in WhatsApp Web!)
  const handleCopyImage = async () => {
    if (!receiptRef.current) return;
    setIsExporting(true);
    handleSaveSettings();

    try {
      const dataUrl = await toPng(receiptRef.current, {
        quality: 1,
        pixelRatio: 2.5,
        backgroundColor: "#ffffff",
      });

      const res = await fetch(dataUrl);
      const blob = await res.blob();

      if (navigator.clipboard && (window as any).ClipboardItem) {
        await navigator.clipboard.write([
          new (window as any).ClipboardItem({
            "image/png": blob,
          }),
        ]);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 3000);
        toast.success("📋 Gambar struk berhasil disalin! Silakan langsung tekan Ctrl+V di chat WhatsApp.");
      } else {
        // Fallback to regular download
        handleDownloadImage();
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Gagal menyalin gambar struk ke clipboard.");
    } finally {
      setIsExporting(false);
    }
  };

  // Save manual address to database directly
  const handleSaveAddressOnly = async () => {
    if (!order?.id) {
      toast.info("Ini adalah struk manual baru (belum tersimpan di database).");
      return;
    }
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("orders")
        .update({ customer_address: customerAddress })
        .eq("id", order.id);

      if (error) throw error;

      if (onOrderUpdated) {
        onOrderUpdated(order.id, customerAddress);
      }
      toast.success("✅ Alamat konsumen berhasil disimpan ke database pesanan!");
    } catch (err: any) {
      toast.error("Gagal menyimpan alamat: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[92vh] flex flex-col p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="p-4 px-6 border-b border-border/60 bg-muted/20">
          <div className="flex items-center justify-between pr-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <Receipt className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
                  <span>Cetak Struk Resmi Pembelian Konsumen</span>
                  <Badge variant="outline" className="text-[10px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                    Madu Araa Official
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Struk resmi standar kasir thermal (58mm/80mm) & gambar digital untuk bukti pembelian konsumen.
                </DialogDescription>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2">
              <Select value={paperWidth} onValueChange={(val: "58mm" | "80mm") => setPaperWidth(val)}>
                <SelectTrigger className="h-8 text-xs font-semibold w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="58mm">58 mm</SelectItem>
                  <SelectItem value="80mm">80 mm</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </DialogHeader>

        {/* Modal Body: Split into Form (Left) and Live Preview (Right) */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-12 gap-0 divide-y md:divide-y-0 md:divide-x divide-border/60">
          
          {/* SISI KIRI: Form Input Alamat Manual & Kustomisasi Struk */}
          <div className="md:col-span-6 p-5 space-y-4 overflow-y-auto max-h-[70vh]">
            
            {/* 1. INPUT ALAMAT MANUAL (FITUR UTAMA PERMINTAAN BIG BOS) */}
            <div className="p-3.5 rounded-xl border border-emerald-500/40 bg-emerald-500/[0.04] space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-emerald-800 dark:text-emerald-200 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                  Alamat Pengiriman Konsumen (Manual):
                </Label>
                {order?.id && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleSaveAddressOnly}
                    disabled={isSaving}
                    className="h-6 text-[11px] px-2 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 font-semibold gap-1"
                  >
                    {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileCheck2 className="w-3 h-3" />}
                    Simpan ke DB
                  </Button>
                )}
              </div>
              <Textarea
                rows={2}
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                placeholder="Contoh: Jl. Diponegoro 1, Surabaya (Ketik atau paste alamat di sini)"
                className="text-xs bg-background border-emerald-500/30 focus-visible:ring-emerald-500"
              />
              <div className="flex items-center justify-between pt-0.5">
                <span className="text-[10px] text-muted-foreground">
                  Alamat ini akan langsung muncul di struk di bawah nama kasir.
                </span>
                {order?.id && (
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <Checkbox
                      id="save-db"
                      checked={saveAddressToDb}
                      onCheckedChange={(c) => setSaveAddressToDb(!!c)}
                    />
                    <label htmlFor="save-db" className="text-[11px] text-muted-foreground cursor-pointer select-none">
                      Simpan permanen
                    </label>
                  </div>
                )}
              </div>
            </div>

            {/* 2. Informasi Konsumen & Petugas Kasir */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-muted-foreground">Nama Konsumen:</Label>
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Nama Pembeli"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-muted-foreground">No. WhatsApp Konsumen:</Label>
                <Input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="08xxxxxxxxxx"
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-muted-foreground">Nama Kasir / CS:</Label>
                <Input
                  value={cashierName}
                  onChange={(e) => setCashierName(e.target.value)}
                  placeholder="Sheila / CS Araa"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-muted-foreground">No. Struk / Resi:</Label>
                <Input
                  value={receiptNumber}
                  onChange={(e) => setReceiptNumber(e.target.value)}
                  placeholder="0-3 atau SPXID..."
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>

            {/* 3. Tanggal & Waktu Struk */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-muted-foreground">Tanggal Transaksi:</Label>
                <Input
                  type="date"
                  value={receiptDate}
                  onChange={(e) => setReceiptDate(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-muted-foreground">Jam Transaksi:</Label>
                <Input
                  type="text"
                  value={receiptTime}
                  onChange={(e) => setReceiptTime(e.target.value)}
                  placeholder="08:46:36"
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>

            {/* 4. Rincian Pembayaran & Ongkir */}
            <div className="grid grid-cols-3 gap-2.5 pt-1">
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-muted-foreground">Metode Bayar:</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger className="h-8 text-xs font-semibold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="COD">COD</SelectItem>
                    <SelectItem value="Cash">Cash (Tunai)</SelectItem>
                    <SelectItem value="Transfer">Transfer Bank</SelectItem>
                    <SelectItem value="QRIS">QRIS</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-muted-foreground">Ongkos Kirim (Rp):</Label>
                <Input
                  type="number"
                  value={shippingFee || ""}
                  onChange={(e) => setShippingFee(Number(e.target.value) || 0)}
                  placeholder="0"
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-muted-foreground">Bayar Diterima (Rp):</Label>
                <Input
                  type="number"
                  value={amountPaid || ""}
                  onChange={(e) => setAmountPaid(Number(e.target.value) || 0)}
                  placeholder="0"
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>

            {/* 5. Pengaturan Identitas Toko */}
            <div className="border border-border/60 rounded-xl p-3 bg-muted/10 space-y-2">
              <div className="text-[11px] font-bold text-foreground flex items-center justify-between">
                <span>Header Toko di Struk:</span>
                <span className="text-[10px] text-muted-foreground font-normal">Tersimpan otomatis</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="Nama Toko"
                  className="h-7 text-xs"
                />
                <Input
                  value={storePhone}
                  onChange={(e) => setStorePhone(e.target.value)}
                  placeholder="No. Telp Toko"
                  className="h-7 text-xs font-mono"
                />
              </div>
              <Input
                value={storeAddress}
                onChange={(e) => setStoreAddress(e.target.value)}
                placeholder="Alamat Toko / Gudang"
                className="h-7 text-xs"
              />
            </div>
          </div>

          {/* SISI KANAN: Real-time Live Receipt Preview */}
          <div className="md:col-span-6 p-5 bg-slate-100 dark:bg-slate-900/50 flex flex-col items-center justify-start overflow-y-auto max-h-[70vh]">
            <div className="text-[11px] font-semibold text-muted-foreground mb-2 flex items-center gap-1.5 self-start">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Pratinjau Struk Kasir ({paperWidth}):</span>
            </div>

            {/* LEMBAR KERTAS STRUK THERMAL RESMI */}
            <div
              ref={receiptRef}
              style={{
                fontFamily: "'Courier New', Courier, monospace, monospace",
                lineHeight: "1.25",
              }}
              className={`bg-white text-black p-4 sm:p-5 rounded-sm shadow-md border border-slate-300 select-text ${
                paperWidth === "58mm" ? "w-[300px] max-w-[300px]" : "w-[380px] max-w-[380px]"
              }`}
            >
              {/* LOGO RESMI MADU ARAA (GAMBAR KANAN) */}
              <div className="text-center mb-1">
                <img
                  src={ARAA_RECEIPT_LOGO_BASE64}
                  alt="Logo Madu Araa"
                  className="w-20 h-20 mx-auto object-contain"
                />
              </div>

              {/* NAMA & ALAMAT TOKO */}
              <div className="text-center">
                <div className="font-bold text-sm tracking-wide">{storeName}</div>
                <div className="text-[10px] text-gray-800 leading-tight">{storeAddress}</div>
                <div className="text-[10px] text-gray-800">No. Telp {storePhone}</div>
                <div className="text-[9px] font-mono text-gray-600 mt-0.5 tracking-wider">
                  {orderBarcodeId}
                </div>
              </div>

              {/* GARIS PEMISAH PUTUS-PUTUS */}
              <div className="border-t border-dashed border-black/80 my-2" />

              {/* TANGGAL, JAM, KASIR & ALAMAT MANUAL */}
              <div className="flex justify-between items-start text-[10px] text-gray-900">
                <div>
                  <div>{receiptDate}</div>
                  <div>{receiptTime}</div>
                </div>
                <div className="text-right">
                  <div className="font-medium lowercase">{storeName.replace(/\s+/g, "")}</div>
                  <div className="font-semibold">{cashierName}</div>
                  {/* ALAMAT KONSUMEN MANUAL (KOTAK HIJAU) */}
                  {customerAddress && (
                    <div className="font-bold text-black mt-0.5 max-w-[150px] leading-tight break-words">
                      {customerAddress}
                    </div>
                  )}
                </div>
              </div>

              {/* NOMOR STRUK */}
              <div className="text-[10px] text-gray-900 mt-1">
                No.{receiptNumber}
              </div>

              {/* GARIS PEMISAH PUTUS-PUTUS */}
              <div className="border-t border-dashed border-black/80 my-2" />

              {/* DAFTAR ITEM PEMBELIAN */}
              <div className="space-y-1.5 my-1 text-[10.5px]">
                {items.map((it, idx) => (
                  <div key={it.id || idx}>
                    <div className="font-bold text-black">
                      {idx + 1}. {it.name}
                    </div>
                    <div className="flex justify-between pl-3 text-gray-900">
                      <span>
                        {it.qty} x {it.unitPrice.toLocaleString("id-ID")}
                      </span>
                      <span className="font-semibold">
                        Rp {it.lineTotal.toLocaleString("id-ID")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* GARIS PEMISAH PUTUS-PUTUS */}
              <div className="border-t border-dashed border-black/80 my-2" />

              {/* RINGKASAN TOTAL & PEMBAYARAN */}
              <div className="space-y-0.5 text-[10.5px] text-gray-900">
                <div className="flex justify-between">
                  <span>Total QTY : {totalQty}</span>
                </div>
                <div className="flex justify-between">
                  <span>Sub Total</span>
                  <span>Rp {subtotal.toLocaleString("id-ID")}</span>
                </div>
                {shippingFee > 0 && (
                  <div className="flex justify-between">
                    <span>Ongkos Kirim</span>
                    <span>Rp {shippingFee.toLocaleString("id-ID")}</span>
                  </div>
                )}
                {discountAmount > 0 && (
                  <div className="flex justify-between">
                    <span>Diskon</span>
                    <span>-Rp {discountAmount.toLocaleString("id-ID")}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-[12px] pt-1 text-black">
                  <span>Total</span>
                  <span>Rp {grandTotal.toLocaleString("id-ID")}</span>
                </div>
                <div className="flex justify-between pt-0.5">
                  <span>Bayar ({paymentMethod})</span>
                  <span>Rp {amountPaid.toLocaleString("id-ID")}</span>
                </div>
                <div className="flex justify-between">
                  <span>Kembali</span>
                  <span>Rp {changeAmount.toLocaleString("id-ID")}</span>
                </div>
              </div>

              {/* GARIS PEMISAH PUTUS-PUTUS */}
              <div className="border-t border-dashed border-black/80 my-2.5" />

              {/* FOOTER UCAPAN TERIMAKASIH */}
              <div className="text-center text-[10px] space-y-0.5 text-gray-800">
                <div className="font-semibold">Terimakasih Telah Berbelanja</div>
                <div className="text-[9px] text-gray-600">
                  Madu Murni 100% Asli & Alami
                </div>
                <div className="text-[9px] text-gray-600 italic">
                  Solusi Manis Sehat Untuk Keluarga
                </div>
                <div className="text-[8.5px] text-gray-500 pt-1 font-mono">
                  CS WA: {storePhone}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <DialogFooter className="p-3 px-6 border-t border-border/60 bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground w-full sm:w-auto">
            <span>Ukuran: <b>{paperWidth}</b></span>
            <span>•</span>
            <span>Kasir: <b>{cashierName}</b></span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs h-8"
            >
              Tutup
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyImage}
              disabled={isExporting}
              className="text-xs h-8 gap-1.5 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10"
              title="Salin gambar struk untuk langsung di-paste ke WhatsApp Web"
            >
              {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              {isCopied ? "Tersalin!" : "Salin Gambar (WA)"}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadImage}
              disabled={isExporting}
              className="text-xs h-8 gap-1.5"
            >
              {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Download Gambar
            </Button>

            <Button
              size="sm"
              onClick={handlePrint}
              className="text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5 shadow-2xs"
            >
              <Printer className="w-3.5 h-3.5" />
              Cetak Struk (Print)
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

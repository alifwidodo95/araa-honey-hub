import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useRef } from "react";
import { RequireAuth } from "@/components/require-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { formatIDR } from "@/lib/theme";
import { toast } from "sonner";
import {
  Users, Sparkles, Send, CheckCircle2, AlertCircle, RefreshCw, Settings2,
  Upload, FileSpreadsheet, Search, Filter, Clock, Calendar, CheckSquare,
  ShieldAlert, ArrowUpDown, Loader2, Trash2, PartyPopper, Check, X,
  Phone, Smartphone, AlertTriangle
} from "lucide-react";
import * as XLSX from "xlsx";
import {
  getReaktivasiData,
  importReaktivasiContacts,
  sendDirectReaktivasiWhatsApp,
  getReaktivasiTemplate,
  saveReaktivasiTemplate,
  clearReaktivasiContacts,
  deleteSelectedReaktivasiContacts,
  getWahaSessionsInfo,
} from "@/lib/reaktivasi.functions";

export const Route = createFileRoute("/reaktivasi-2025")({
  component: () => (
    <RequireAuth>
      <ReaktivasiPage />
    </RequireAuth>
  ),
});

function formatDateIndo(dateStr?: string | null) {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return dateStr;
  }
}

function ReaktivasiPage() {
  const queryClient = useQueryClient();

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "uncontacted" | "sent" | "converted">("all");
  const [productFilter, setProductFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  // Bulk Selection State
  const [selectedPhones, setSelectedPhones] = useState<string[]>([]);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [isBulkRunning, setIsBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{
    current: number;
    total: number;
    currentName: string;
    countdown: number;
    successCount: number;
    failedCount: number;
  }>({ current: 0, total: 0, currentName: "", countdown: 0, successCount: 0, failedCount: 0 });
  const bulkAbortRef = useRef(false);

  // Template Settings Dialog State
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateText, setTemplateText] = useState("");
  const [templateImageUrl, setTemplateImageUrl] = useState("");

  // Upload Excel Dialog State
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSummary, setUploadSummary] = useState<any | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Send Confirmation / Preview Dialog State
  const [previewDialogCustomer, setPreviewDialogCustomer] = useState<any | null>(null);
  const [previewMessage, setPreviewMessage] = useState("");
  const [previewImageUrl, setPreviewImageUrl] = useState("");

  // Local state to track sent phones in current session
  const [sessionSentMap, setSessionSentMap] = useState<Record<string, boolean>>({});

  // Sender WhatsApp Session State (Slot 2 Campaign vs Slot 1 CS Utama)
  const [selectedSenderSession, setSelectedSenderSession] = useState<string>("campaign");

  // Fetch WAHA Sessions Info (Slot 1 & Slot 2)
  const { data: wahaSessionsData, refetch: refetchWahaSessions } = useQuery({
    queryKey: ["crm-waha-sessions-info"],
    queryFn: async () => {
      return await getWahaSessionsInfo();
    },
    staleTime: 15 * 1000,
    refetchInterval: 15 * 1000,
  });

  // 1. Fetch Reaktivasi Data & Stats
  const { data: apiResponse, isLoading, refetch } = useQuery({
    queryKey: ["crm-reaktivasi-2025-stats"],
    queryFn: async () => {
      return await getReaktivasiData();
    },
    staleTime: 60 * 1000,
  });

  const contacts = useMemo(() => apiResponse?.contacts || [], [apiResponse]);
  const summary = useMemo(
    () =>
      apiResponse?.summary || {
        totalTarget: 0,
        uncontactedCount: 0,
        sentCount: 0,
        convertedCount: 0,
        convertedRevenue: 0,
        conversionRate: 0,
      },
    [apiResponse]
  );
  const availableProducts = useMemo(() => apiResponse?.products || [], [apiResponse]);

  // 2. Fetch Reaktivasi Template
  const { data: templateData } = useQuery({
    queryKey: ["crm-reaktivasi-2025-template"],
    queryFn: async () => {
      return await getReaktivasiTemplate();
    },
  });

  useMemo(() => {
    if (templateData) {
      setTemplateText(templateData.template || "");
      setTemplateImageUrl(templateData.imageUrl || "");
    }
  }, [templateData]);

  // Template Save Mutation
  const saveTemplateMutation = useMutation({
    mutationFn: async ({ template, imageUrl }: { template: string; imageUrl: string }) => {
      return await saveReaktivasiTemplate({ data: { template, imageUrl } });
    },
    onSuccess: () => {
      toast.success("✅ Template pesan Reaktivasi 2025 berhasil disimpan!");
      queryClient.invalidateQueries({ queryKey: ["crm-reaktivasi-2025-template"] });
      setTemplateDialogOpen(false);
    },
    onError: (err: any) => {
      toast.error(`❌ Gagal menyimpan template: ${err.message}`);
    },
  });

  // Direct Send Single WhatsApp Mutation
  const sendWhatsAppMutation = useMutation({
    mutationFn: async ({
      phone,
      customerName,
      message,
      product,
      imageUrl,
      senderSession,
    }: {
      phone: string;
      customerName: string;
      message: string;
      product?: string;
      imageUrl?: string;
      senderSession?: string;
    }) => {
      return await sendDirectReaktivasiWhatsApp({
        data: {
          phone,
          customerName,
          message,
          product,
          imageUrl,
          senderSession: senderSession || selectedSenderSession,
        },
      });
    },
    onSuccess: (_, variables) => {
      toast.success(`✅ Pesan Reaktivasi berhasil terkirim ke ${variables.customerName} (${variables.phone})!`);
      setSessionSentMap((prev) => ({ ...prev, [variables.phone]: true }));
      queryClient.invalidateQueries({ queryKey: ["crm-reaktivasi-2025-stats"] });
      setPreviewDialogCustomer(null);
    },
    onError: (err: any) => {
      toast.error(`❌ Gagal mengirim WhatsApp: ${err.message}`);
    },
  });

  // Format message for a specific customer
  const formatCustomerMessage = (c: any) => {
    let tpl = templateText || "";
    return tpl
      .replace(/{nama}/g, c.name || "Pelanggan")
      .replace(/{produk}/g, c.product_2025 || "Madu Araa")
      .replace(/{tanggal_order}/g, c.order_date_2025 || "Tahun 2025")
      .replace(/{resi}/g, c.resi_2025 || "-");
  };

  // Open Preview & Direct Send Dialog
  const handleOpenSendDialog = (c: any) => {
    const formatted = formatCustomerMessage(c);
    setPreviewMessage(formatted);
    setPreviewImageUrl(templateImageUrl || "");
    setPreviewDialogCustomer(c);
  };

  // Toggle selection for a single contact
  const handleToggleSelectPhone = (phone: string) => {
    setSelectedPhones((prev) =>
      prev.includes(phone) ? prev.filter((p) => p !== phone) : [...prev, phone]
    );
  };

  // Filtered Contacts based on Search, Status, and Product
  const filteredContacts = useMemo(() => {
    let list = contacts;

    // Status filter
    if (statusFilter === "uncontacted") {
      list = list.filter((c: any) => c.status === "uncontacted" && !sessionSentMap[c.phone]);
    } else if (statusFilter === "sent") {
      list = list.filter((c: any) => c.status === "sent" || sessionSentMap[c.phone]);
    } else if (statusFilter === "converted") {
      list = list.filter((c: any) => c.has_converted === true);
    }

    // Product filter
    if (productFilter !== "all") {
      list = list.filter((c: any) => c.product_2025 === productFilter);
    }

    // Search query
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (c: any) =>
          c.name.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          (c.product_2025 && c.product_2025.toLowerCase().includes(q)) ||
          (c.resi_2025 && c.resi_2025.toLowerCase().includes(q))
      );
    }

    return list;
  }, [contacts, statusFilter, productFilter, searchTerm, sessionSentMap]);

  // Pagination
  const totalPages = Math.ceil(filteredContacts.length / itemsPerPage) || 1;
  const paginatedContacts = filteredContacts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Toggle selection for all contacts on current page
  const handleToggleSelectAllPage = () => {
    const pagePhones = paginatedContacts
      .filter((c: any) => !sessionSentMap[c.phone] && c.status === "uncontacted")
      .map((c: any) => c.phone);

    if (pagePhones.length === 0) return;

    const allSelected = pagePhones.every((p: string) => selectedPhones.includes(p));

    if (allSelected) {
      setSelectedPhones((prev) => prev.filter((p) => !pagePhones.includes(p)));
    } else {
      setSelectedPhones((prev) => Array.from(new Set([...prev, ...pagePhones])));
    }
  };

  // Quick Select Next 50 Uncontacted
  const handleQuickSelectNext50 = () => {
    const uncontacted = contacts
      .filter((c: any) => c.status === "uncontacted" && !sessionSentMap[c.phone])
      .slice(0, 50)
      .map((c: any) => c.phone);

    if (uncontacted.length === 0) {
      toast.info("Semua kontak sudah dihubungi!");
      return;
    }

    setSelectedPhones(uncontacted);
    setBulkModalOpen(true);
  };

  // Execute Bulk Send with Random Delay (10-14s)
  const handleExecuteBulkSend = async () => {
    if (selectedPhones.length === 0) return;
    setIsBulkRunning(true);
    bulkAbortRef.current = false;

    const targets = contacts.filter((c: any) => selectedPhones.includes(c.phone));
    const total = targets.length;
    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < total; i++) {
      if (bulkAbortRef.current) break;

      const c = targets[i];
      setBulkProgress({
        current: i + 1,
        total,
        currentName: c.name,
        countdown: 0,
        successCount,
        failedCount,
      });

      const formatted = formatCustomerMessage(c);

      try {
        await sendDirectReaktivasiWhatsApp({
          data: {
            phone: c.phone,
            customerName: c.name,
            message: formatted,
            product: c.product_2025,
            imageUrl: templateImageUrl || "",
            senderSession: selectedSenderSession,
          },
        });
        setSessionSentMap((prev) => ({ ...prev, [c.phone]: true }));
        successCount++;
      } catch (err: any) {
        console.warn(`Reaktivasi bulk send error to ${c.phone}:`, err);
        failedCount++;
      }

      setBulkProgress((prev) => ({
        ...prev,
        successCount,
        failedCount,
      }));

      // Randomized safety delay (10-14 sec)
      if (i < total - 1 && !bulkAbortRef.current) {
        const delay = Math.floor(Math.random() * 5) + 10;
        for (let cd = delay; cd > 0; cd--) {
          if (bulkAbortRef.current) break;
          setBulkProgress((prev) => ({ ...prev, countdown: cd }));
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }

    setIsBulkRunning(false);
    queryClient.invalidateQueries({ queryKey: ["crm-reaktivasi-2025-stats"] });
    toast.success(`🎉 Pengiriman massal selesai! Berhasil: ${successCount}, Gagal: ${failedCount}`);
  };

  const handleStopBulkSend = () => {
    bulkAbortRef.current = true;
    setIsBulkRunning(false);
    toast.info("Pengiriman massal dihentikan.");
  };

  // Handle Excel File Parsing & Upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadSummary(null);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[][];

        if (data.length < 2) {
          toast.error("File Excel kosong atau tidak valid.");
          setIsUploading(false);
          return;
        }

        // Scan header row
        let headerRowIdx = -1;
        for (let i = 0; i < Math.min(data.length, 10); i++) {
          const row = data[i];
          if (
            row &&
            row.some((cell) => {
              const s = String(cell || "").toLowerCase();
              return s.includes("hp") || s.includes("telepon") || s.includes("penerima") || s.includes("produk");
            })
          ) {
            headerRowIdx = i;
            break;
          }
        }

        if (headerRowIdx === -1) {
          toast.error("Header tabel tidak ditemukan. Pastikan kolom berisi: 'No. HP Penerima', 'Penerima', 'Produk'.");
          setIsUploading(false);
          return;
        }

        const headers = data[headerRowIdx].map((h) => String(h || "").toLowerCase().trim());
        
        // 1. Resi index
        const resiIdx = headers.findIndex((h) => h.includes("resi") || h.includes("tracking") || h.includes("awb") || h.includes("waybill"));

        // 2. Product index
        const productIdx = headers.findIndex((h) => h.includes("produk") || h.includes("product") || h.includes("item") || h.includes("madu") || h.includes("barang") || h.includes("sku") || h.includes("varian"));

        // 3. Date index
        const dateIdx = headers.findIndex((h) => h.includes("tanggal") || h.includes("tgl") || h.includes("date") || h.includes("waktu") || h.includes("dibuat") || h.includes("created"));

        // 4. Phone index (must contain hp, telepon, telp, phone, wa, whatsapp, kontak)
        const phoneIdx = headers.findIndex((h) => 
          h.includes("hp") || 
          h.includes("telepon") || 
          h.includes("telp") || 
          h.includes("phone") || 
          h.includes("whatsapp") || 
          h.includes("wa") ||
          h.includes("kontak")
        );

        // 5. Name index:
        // CRITICAL: MUST NOT be the phone column! Exclude headers that contain phone/telepon/telp/phone/wa words.
        let nameIdx = headers.findIndex((h, idx) => {
          if (idx === phoneIdx || idx === resiIdx || idx === productIdx || idx === dateIdx) return false;
          const isPhoneWord = h.includes("hp") || h.includes("telepon") || h.includes("telp") || h.includes("phone") || h.includes("wa");
          if (isPhoneWord) return false;
          return (
            h === "penerima" || 
            h === "nama penerima" || 
            h === "nama" || 
            h === "customer" || 
            h === "nama customer" || 
            h === "pelanggan" || 
            h === "nama pelanggan" || 
            h === "nama konsumen" || 
            h === "konsumen" || 
            h === "buyer" || 
            h === "recipient"
          );
        });

        // Fallback for name index if exact match not found
        if (nameIdx === -1) {
          nameIdx = headers.findIndex((h, idx) => {
            if (idx === phoneIdx || idx === resiIdx || idx === productIdx || idx === dateIdx) return false;
            const isPhoneWord = h.includes("hp") || h.includes("telepon") || h.includes("telp") || h.includes("phone") || h.includes("wa");
            if (isPhoneWord) return false;
            return h.includes("penerima") || h.includes("nama") || h.includes("customer") || h.includes("pelanggan") || h.includes("konsumen");
          });
        }

        if (phoneIdx === -1) {
          toast.error("Kolom nomor HP tidak ditemukan!");
          setIsUploading(false);
          return;
        }

        const parsedContacts: Array<{
          phone: string;
          name: string;
          product?: string;
          orderDate?: string;
          resi?: string;
        }> = [];

        for (let i = headerRowIdx + 1; i < data.length; i++) {
          const row = data[i];
          if (!row || row.length === 0) continue;

          const phone = String(row[phoneIdx] || "").trim();
          if (!phone) continue;

          let name = nameIdx !== -1 ? String(row[nameIdx] || "").trim() : "";
          // If name looks like a phone number (mostly digits >= 8 chars) or is empty, fallback
          if (!name || /^[0-9+-\s]{8,}$/.test(name)) {
            name = "Pelanggan";
          }

          const product = productIdx !== -1 ? String(row[productIdx] || "").trim() : "Madu Araa";
          const orderDate = dateIdx !== -1 ? String(row[dateIdx] || "").trim() : "2025";
          const resi = resiIdx !== -1 ? String(row[resiIdx] || "").trim() : "";

          parsedContacts.push({ phone, name, product, orderDate, resi });
        }

        if (parsedContacts.length === 0) {
          toast.error("Tidak ada baris data kontak yang valid ditemukan.");
          setIsUploading(false);
          return;
        }

        // Send to server function
        const res = await importReaktivasiContacts({ data: { contacts: parsedContacts } });
        setUploadSummary(res);
        queryClient.invalidateQueries({ queryKey: ["crm-reaktivasi-2025-stats"] });
        toast.success(`🎉 Berhasil memproses ${res.totalUploaded} baris!`);
      } catch (err: any) {
        console.error("Excel import error:", err);
        toast.error(`❌ Gagal membaca file: ${err.message}`);
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsBinaryString(file);
  };

  // Reset contacts confirmation
  const handleClearContacts = async () => {
    if (!confirm("⚠️ Apakah Big Bos yakin ingin mengosongkan seluruh data target Reaktivasi 2025? Tindakan ini tidak dapat dibatalkan.")) {
      return;
    }
    try {
      await clearReaktivasiContacts();
      queryClient.invalidateQueries({ queryKey: ["crm-reaktivasi-2025-stats"] });
      toast.success("Daftar target 2025 berhasil dikosongkan.");
      setSelectedPhones([]);
    } catch (err: any) {
      toast.error(`Gagal: ${err.message}`);
    }
  };

  // Delete selected contacts
  const handleDeleteSelected = async () => {
    if (selectedPhones.length === 0) return;
    if (!confirm(`⚠️ Hapus ${selectedPhones.length} kontak terpilih dari daftar Reaktivasi 2025?`)) {
      return;
    }
    try {
      await deleteSelectedReaktivasiContacts({ data: { phones: selectedPhones } });
      queryClient.invalidateQueries({ queryKey: ["crm-reaktivasi-2025-stats"] });
      toast.success(`${selectedPhones.length} kontak terpilih berhasil dihapus.`);
      setSelectedPhones([]);
    } catch (err: any) {
      toast.error(`Gagal menghapus kontak: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2.5">
            <Sparkles className="w-6 h-6 text-amber-500" />
            Reaktivasi Pelanggan 2025 (CRM Win-Back)
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Menyapa kembali pembeli lama tahun 2025 yang belum pernah order di tahun 2026. Otomatis disaring anti-dobel & anti-salah kirim.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setTemplateDialogOpen(true)}
            className="h-9 text-xs gap-1.5 shadow-2xs font-semibold"
          >
            <Settings2 className="w-4 h-4 text-amber-500" />
            Atur Template Win-Back
          </Button>

          <Button
            size="sm"
            onClick={() => setUploadDialogOpen(true)}
            className="h-9 text-xs gap-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-2xs"
          >
            <Upload className="w-4 h-4" />
            Unggah File Excel 2025
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => refetch()}
            className="h-9 text-xs gap-1 text-muted-foreground"
            title="Muat ulang data"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-amber-500" : ""}`} />
          </Button>
        </div>
      </div>

      {/* WhatsApp Sender Session Controller */}
      <div className="bg-card border border-muted/70 p-3.5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-foreground flex items-center gap-2">
              <span>Nomor WhatsApp Pengirim:</span>
              <span className="text-[11px] font-normal text-muted-foreground">
                (Pilih nomor pengirim pesan win-back 2025)
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
              <span>
                Status Sesi Aktif:{" "}
                <strong className={
                  (selectedSenderSession === "campaign"
                    ? wahaSessionsData?.campaignSession?.status === "WORKING"
                    : wahaSessionsData?.mainSession?.status === "WORKING")
                    ? "text-emerald-600 dark:text-emerald-400 font-bold"
                    : "text-amber-600 dark:text-amber-400 font-bold"
                }>
                  {selectedSenderSession === "campaign"
                    ? (wahaSessionsData?.campaignSession?.status || "STOPPED")
                    : (wahaSessionsData?.mainSession?.status || "STOPPED")}
                </strong>
              </span>

              {selectedSenderSession === "campaign" && wahaSessionsData?.campaignSession?.status !== "WORKING" && (
                <span className="text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Belum scan QR! Klik "Kelola Sesi" untuk scan QR nomor kampanye.
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <Select value={selectedSenderSession} onValueChange={setSelectedSenderSession}>
            <SelectTrigger className="h-9 text-xs font-semibold min-w-[280px] bg-background border-muted/80 shadow-2xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="campaign" className="text-xs">
                <div className="flex items-center justify-between gap-3 w-full">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${wahaSessionsData?.campaignSession?.status === "WORKING" ? "bg-emerald-500" : "bg-amber-500"}`} />
                    <span className="font-bold">Slot 2: Nomor Kampanye (Outreach)</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-mono ml-1 py-0 border-emerald-500/30 text-emerald-700 dark:text-emerald-300">
                    {wahaSessionsData?.campaignSession?.status === "WORKING"
                      ? (wahaSessionsData.campaignSession.me?.id?.split("@")[0] || "Online")
                      : (wahaSessionsData?.campaignSession?.status || "Perlu QR")}
                  </Badge>
                </div>
              </SelectItem>
              <SelectItem value="default" className="text-xs">
                <div className="flex items-center justify-between gap-3 w-full">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${wahaSessionsData?.mainSession?.status === "WORKING" ? "bg-emerald-500" : "bg-rose-500"}`} />
                    <span className="font-bold">Slot 1: Nomor Utama CS</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-mono ml-1 py-0">
                    {wahaSessionsData?.mainSession?.me?.id?.split("@")[0] || "6281337324522"}
                  </Badge>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>

          <Link to="/pengaturan/whatsapp">
            <Button size="sm" variant="outline" className="h-9 text-xs gap-1.5 font-semibold" title="Buka Pengaturan WhatsApp">
              <Settings2 className="w-3.5 h-3.5 text-muted-foreground" />
              Kelola Sesi & QR
            </Button>
          </Link>
        </div>
      </div>

      {/* 5 Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <Card className="border-muted/60 shadow-2xs">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Target 2025 (Dormant)</span>
              <Users className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-2xl font-extrabold text-foreground">
              {summary.totalTarget.toLocaleString("id-ID")}
            </div>
            <p className="text-[10px] text-muted-foreground">Murni pembeli 2025 tanpa order di 2026</p>
          </CardContent>
        </Card>

        <Card className="border-muted/60 shadow-2xs">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Belum Dihubungi</span>
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-2xl font-extrabold text-amber-600 dark:text-amber-400">
              {summary.uncontactedCount.toLocaleString("id-ID")}
            </div>
            <p className="text-[10px] text-muted-foreground">Antrean siap di-follow up CS</p>
          </CardContent>
        </Card>

        <Card className="border-emerald-500/30 bg-emerald-500/[0.02] shadow-2xs">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Sudah Di-WA (Terkirim)</span>
              <Send className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
              {summary.sentCount.toLocaleString("id-ID")}
            </div>
            <p className="text-[10px] text-muted-foreground">Pesan sapaan reaktivasi terkirim</p>
          </CardContent>
        </Card>

        <Card className="border-purple-500/30 bg-purple-500/[0.02] shadow-2xs">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Berhasil Comeback!</span>
              <PartyPopper className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="text-2xl font-extrabold text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
              {summary.convertedCount.toLocaleString("id-ID")}
              <span className="text-xs px-1.5 py-0.5 rounded-md bg-purple-500/15 font-bold">
                {summary.conversionRate}%
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">Beli lagi di 2026 pasca sapaan</p>
          </CardContent>
        </Card>

        <Card className="border-blue-500/30 bg-blue-500/[0.02] shadow-2xs col-span-2 sm:col-span-1">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Omzet Terselamatkan</span>
              <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="text-xl font-extrabold text-blue-600 dark:text-blue-400 truncate">
              {formatIDR(summary.convertedRevenue)}
            </div>
            <p className="text-[10px] text-muted-foreground">Penjualan baru dari konsumen 2025</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Campaign Management Card */}
      <Card className="border-muted/60 shadow-xs">
        <CardHeader className="pb-3 border-b border-muted/30 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-500" />
              Daftar Target Audiens Reaktivasi 2025
            </CardTitle>
            <CardDescription className="text-xs">
              Pilih target konsumen lama, filter berdasarkan produk yang pernah dibeli, dan kirim pesan win-back via WAHA.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              onClick={handleQuickSelectNext50}
              className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-2xs"
            >
              <Send className="w-3.5 h-3.5" />
              Kirim Batch 50 Kontak Berikutnya
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => setUploadDialogOpen(true)}
              className="h-8 text-xs gap-1.5 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 font-semibold shadow-2xs"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload Ulang Excel
            </Button>

            {contacts.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleClearContacts}
                className="h-8 text-xs text-rose-600 hover:text-rose-700 border-rose-200 bg-rose-50/60 hover:bg-rose-100 dark:bg-rose-950/20 dark:border-rose-900/40 gap-1.5 font-bold shadow-2xs"
                title="Kosongkan seluruh target 2025"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Kosongkan Semua Data ({contacts.length.toLocaleString("id-ID")})
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="pt-4 space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Status Pills */}
            <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-xl border border-muted/60 overflow-x-auto text-xs">
              <Button
                size="sm"
                variant={statusFilter === "all" ? "default" : "ghost"}
                onClick={() => { setStatusFilter("all"); setCurrentPage(1); }}
                className={`h-7 text-xs px-2.5 rounded-lg ${statusFilter === "all" ? "bg-amber-600 text-white font-bold" : "text-muted-foreground"}`}
              >
                Semua ({summary.totalTarget})
              </Button>
              <Button
                size="sm"
                variant={statusFilter === "uncontacted" ? "default" : "ghost"}
                onClick={() => { setStatusFilter("uncontacted"); setCurrentPage(1); }}
                className={`h-7 text-xs px-2.5 rounded-lg ${statusFilter === "uncontacted" ? "bg-amber-600 text-white font-bold" : "text-muted-foreground"}`}
              >
                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block mr-1" />
                Belum Di-WA ({summary.uncontactedCount})
              </Button>
              <Button
                size="sm"
                variant={statusFilter === "sent" ? "default" : "ghost"}
                onClick={() => { setStatusFilter("sent"); setCurrentPage(1); }}
                className={`h-7 text-xs px-2.5 rounded-lg ${statusFilter === "sent" ? "bg-amber-600 text-white font-bold" : "text-muted-foreground"}`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block mr-1" />
                Sudah Di-WA ({summary.sentCount})
              </Button>
              <Button
                size="sm"
                variant={statusFilter === "converted" ? "default" : "ghost"}
                onClick={() => { setStatusFilter("converted"); setCurrentPage(1); }}
                className={`h-7 text-xs px-2.5 rounded-lg ${statusFilter === "converted" ? "bg-purple-600 text-white font-bold" : "text-muted-foreground"}`}
              >
                <PartyPopper className="w-3 h-3 text-purple-400 mr-1" />
                Comeback ({summary.convertedCount})
              </Button>
            </div>

            {/* Product & Search Filters */}
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              {availableProducts.length > 0 && (
                <div className="w-full sm:w-56">
                  <Select value={productFilter} onValueChange={(v) => { setProductFilter(v); setCurrentPage(1); }}>
                    <SelectTrigger className="h-8 text-xs">
                      <Filter className="w-3.5 h-3.5 mr-1 text-muted-foreground" />
                      <SelectValue placeholder="Semua Produk" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Produk 2025</SelectItem>
                      {availableProducts.map((p) => (
                        <SelectItem key={p} value={p} className="text-xs">
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                <Input
                  placeholder="Cari nama / no HP / resi..."
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                  className="pl-8 h-8 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Floating Action Banner for Selection */}
          {selectedPhones.length > 0 && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-200">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
                <CheckSquare className="w-4 h-4 text-amber-600" />
                <span>
                  <strong className="text-foreground">{selectedPhones.length}</strong> kontak terpilih dari daftar
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDeleteSelected}
                  className="h-8 text-xs text-rose-600 border-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 gap-1.5 font-semibold"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Hapus Terpilih ({selectedPhones.length})
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedPhones([])}
                  className="h-8 text-xs border-amber-500/30 hover:bg-amber-500/10"
                >
                  Batal Pilih
                </Button>
                <Button
                  size="sm"
                  onClick={() => setBulkModalOpen(true)}
                  className="h-8 text-xs gap-1.5 font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                >
                  <Send className="w-3.5 h-3.5" />
                  Kirim WA Massal ({selectedPhones.length})
                </Button>
              </div>
            </div>
          )}

          {/* Table */}
          {isLoading ? (
            <div className="py-16 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-amber-500" />
              Memuat data target reaktivasi 2025...
            </div>
          ) : contacts.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center mx-auto">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-foreground">Belum Ada Data Target 2025</h3>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  Silakan unggah file Excel data penjualan tahun 2025 Anda. Sistem akan otomatis menyaring dan memisahkan nomor yang sudah pernah order di 2026.
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => setUploadDialogOpen(true)}
                className="bg-amber-600 hover:bg-amber-700 text-white text-xs gap-1.5 font-bold"
              >
                <Upload className="w-3.5 h-3.5" />
                Unggah File Excel 2025 Sekarang
              </Button>
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              Tidak ada kontak yang sesuai dengan filter pencarian ini.
            </div>
          ) : (
            <div className="rounded-xl border border-muted/50 overflow-hidden shadow-2xs">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 text-xs">
                    <TableHead className="w-10 text-center py-2.5">
                      <Checkbox
                        checked={
                          paginatedContacts.filter((c: any) => c.status === "uncontacted" && !sessionSentMap[c.phone]).length > 0 &&
                          paginatedContacts
                            .filter((c: any) => c.status === "uncontacted" && !sessionSentMap[c.phone])
                            .every((c: any) => selectedPhones.includes(c.phone))
                        }
                        onCheckedChange={handleToggleSelectAllPage}
                        title="Pilih semua yang belum di-WA di halaman ini"
                      />
                    </TableHead>
                    <TableHead className="py-2.5">Nama & Kontak</TableHead>
                    <TableHead className="py-2.5">Produk Pernah Dibeli (2025)</TableHead>
                    <TableHead className="py-2.5">Tgl Order & Resi</TableHead>
                    <TableHead className="py-2.5 text-center">Status Reaktivasi</TableHead>
                    <TableHead className="py-2.5 text-center">Aksi WAHA</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedContacts.map((c: any) => {
                    const isSelected = selectedPhones.includes(c.phone);
                    const isSent = c.status === "sent" || sessionSentMap[c.phone];
                    const isConverted = c.has_converted === true;

                    return (
                      <TableRow key={c.phone} className={`text-xs hover:bg-muted/20 ${isSelected ? "bg-amber-500/[0.04]" : ""}`}>
                        <TableCell className="text-center py-2.5">
                          <Checkbox
                            checked={isSelected}
                            disabled={isSent || isConverted}
                            onCheckedChange={() => handleToggleSelectPhone(c.phone)}
                          />
                        </TableCell>
                        <TableCell className="py-2.5 font-medium">
                          <div className="font-semibold text-foreground">{c.name}</div>
                          <div className="text-[11px] text-muted-foreground">{c.phone}</div>
                        </TableCell>
                        <TableCell className="py-2.5">
                          <span className="font-medium text-amber-700 dark:text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-md text-[11px] border border-amber-500/20">
                            {c.product_2025 || "Madu Araa"}
                          </span>
                        </TableCell>
                        <TableCell className="py-2.5 text-muted-foreground">
                          <div>{c.order_date_2025 || "2025"}</div>
                          {c.resi_2025 && (
                            <div className="text-[10px] font-mono opacity-80">{c.resi_2025}</div>
                          )}
                        </TableCell>
                        <TableCell className="py-2.5 text-center">
                          {isConverted ? (
                            <div className="inline-flex flex-col items-center">
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-600 dark:text-purple-400 bg-purple-500/15 px-2 py-0.5 rounded-full">
                                <PartyPopper className="w-3 h-3" />
                                Comeback di 2026!
                              </span>
                              <span className="text-[10px] text-muted-foreground mt-0.5">
                                Belanja: {formatIDR(c.total_2026_spent)}
                              </span>
                            </div>
                          ) : isSent ? (
                            <div className="inline-flex flex-col items-center">
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                                <CheckCircle2 className="w-3 h-3" />
                                Terkirim
                              </span>
                              {c.sent_at && (
                                <span className="text-[10px] text-muted-foreground mt-0.5">
                                  {formatDateIndo(c.sent_at)}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground bg-muted/80 px-2 py-0.5 rounded-full">
                              <Clock className="w-3 h-3 text-amber-500" />
                              Belum Di-WA
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="py-2.5 text-center">
                          {isSent ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleOpenSendDialog(c)}
                              className="h-6 text-[10px] px-2 text-muted-foreground hover:text-emerald-600 hover:bg-emerald-500/10"
                              title="Kirim sapaan ulang jika diperlukan"
                            >
                              Kirim Ulang
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenSendDialog(c)}
                              className="h-7 text-[11px] gap-1.5 font-semibold text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-700 shadow-2xs"
                              title="Kirim sapaan win-back via WAHA"
                            >
                              <Send className="w-3 h-3" />
                              Kirim WA
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination Controls */}
          {filteredContacts.length > 0 && (
            <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
              <div>
                Menampilkan {(currentPage - 1) * itemsPerPage + 1} -{" "}
                {Math.min(currentPage * itemsPerPage, filteredContacts.length)} dari{" "}
                {filteredContacts.length.toLocaleString("id-ID")} kontak
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="h-8 px-2.5"
                >
                  Sebelumnya
                </Button>
                <span className="px-2 font-medium">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="h-8 px-2.5"
                >
                  Selanjutnya
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 1. Modal Dialog: Unggah File Excel 2025 */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Upload className="w-5 h-5 text-amber-500" />
              Unggah Data Penjualan 2025 (Excel / CSV)
            </DialogTitle>
            <DialogDescription className="text-xs">
              Sistem akan otomatis menormalisasi nomor HP dan mencocokkannya dengan data penjualan 2026. Konsumen yang sudah beli lagi di 2026 akan di-skip otomatis.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Template Column Guide */}
            <div className="p-3 bg-muted/40 rounded-xl border border-muted/60 text-xs space-y-1.5">
              <span className="font-semibold text-foreground">Pastikan file memiliki header kolom seperti ini:</span>
              <div className="flex flex-wrap gap-1 pt-1 font-mono text-[11px]">
                <span className="bg-amber-500/15 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/20">No. HP Penerima</span>
                <span className="bg-muted px-1.5 py-0.5 rounded">Resi</span>
                <span className="bg-amber-500/15 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/20">Penerima</span>
                <span className="bg-muted px-1.5 py-0.5 rounded">Tanggal Dibuat</span>
                <span className="bg-amber-500/15 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/20">Produk</span>
              </div>
            </div>

            {/* Drop Zone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-amber-500/40 hover:border-amber-500 rounded-2xl p-8 text-center cursor-pointer transition-all hover:bg-amber-500/[0.02] flex flex-col items-center justify-center gap-2.5"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-600">
                <FileSpreadsheet className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-foreground">
                  {isUploading ? "Sedang Membaca & Menyaring Data..." : "Klik untuk Memilih File Excel (.xlsx / .csv)"}
                </p>
                <p className="text-[11px] text-muted-foreground">Mendukung ribuan kontak sekaligus</p>
              </div>
              {isUploading && <Loader2 className="w-5 h-5 animate-spin text-amber-500" />}
            </div>

            {/* Upload Summary Feedback */}
            {uploadSummary && (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs space-y-2 animate-in fade-in">
                <div className="font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Penyaringan Data Berhasil Selesai!
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-emerald-500/20">
                  <div>Total baris di file: <strong>{uploadSummary.totalUploaded}</strong></div>
                  <div>Kontak valid unik: <strong>{uploadSummary.uniqueValid}</strong></div>
                  <div className="text-amber-600">Sudah beli di 2026 (Di-skip): <strong>{uploadSummary.alreadyBought2026Count}</strong></div>
                  <div className="text-emerald-600 font-bold">Target baru ditambahkan: <strong>{uploadSummary.insertedCount}</strong></div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setUploadDialogOpen(false); setUploadSummary(null); }}
              className="text-xs"
            >
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2. Modal Dialog: Atur Template Pesan Win-Back */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Settings2 className="w-5 h-5 text-amber-500" />
              Template Pesan Reaktivasi 2025
            </DialogTitle>
            <DialogDescription className="text-xs">
              Atur pesan sapaan hangat untuk konsumen 2025. Gunakan variabel dinamis untuk personalisasi otomatis.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Variable Pills */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-muted-foreground">Klik untuk menyisipkan variabel:</span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { tag: "{nama}", desc: "Nama Pelanggan" },
                  { tag: "{produk}", desc: "Nama Produk 2025 yang Pernah Dibeli" },
                  { tag: "{tanggal_order}", desc: "Tanggal Pesanan 2025" },
                ].map((v) => (
                  <button
                    key={v.tag}
                    type="button"
                    onClick={() => setTemplateText((prev) => prev + " " + v.tag)}
                    className="inline-flex items-center gap-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-300 font-mono text-[11px] px-2 py-0.5 rounded-md border border-amber-500/20 transition-colors"
                  >
                    {v.tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Flyer Image URL */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground">URL Gambar Flyer Promo (Opsional):</label>
              <Input
                value={templateImageUrl}
                onChange={(e) => setTemplateImageUrl(e.target.value)}
                placeholder="https://.../flyer-promo-reaktivasi.jpg"
                className="h-8 text-xs font-mono"
              />
              {templateImageUrl && (
                <div className="flex items-center gap-2 p-2 bg-muted/40 rounded-lg border text-xs text-muted-foreground">
                  <img
                    src={templateImageUrl}
                    alt="Flyer"
                    className="h-10 w-10 object-cover rounded"
                    onError={(e) => ((e.target as any).style.display = "none")}
                  />
                  <span>Flyer akan ikut dikirim bersama teks caption di bawah.</span>
                </div>
              )}
            </div>

            {/* Textarea */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground">Teks Pesan WhatsApp:</label>
              <Textarea
                rows={8}
                value={templateText}
                onChange={(e) => setTemplateText(e.target.value)}
                placeholder="Tulis pesan sapaan hangat..."
                className="text-xs font-sans leading-relaxed"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setTemplateDialogOpen(false)} className="text-xs">
              Batal
            </Button>
            <Button
              size="sm"
              onClick={() => saveTemplateMutation.mutate({ template: templateText, imageUrl: templateImageUrl })}
              disabled={saveTemplateMutation.isPending}
              className="text-xs bg-amber-600 hover:bg-amber-700 text-white font-bold gap-1.5"
            >
              {saveTemplateMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Simpan Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 3. Modal Dialog: Preview & Kirim Langsung 1 Kontak */}
      <Dialog open={!!previewDialogCustomer} onOpenChange={(open) => !open && setPreviewDialogCustomer(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Send className="w-5 h-5 text-emerald-500" />
              Kirim Pesan Reaktivasi (WAHA)
            </DialogTitle>
            <DialogDescription className="text-xs">
              Pesan akan langsung dikirimkan ke nomor penerima via server WAHA Araa Honey.
            </DialogDescription>
          </DialogHeader>

          {previewDialogCustomer && (
            <div className="space-y-3 py-2">
              <div className="bg-muted/40 p-3 rounded-xl space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Penerima:</span>
                  <span className="font-bold text-foreground">
                    {previewDialogCustomer.name} ({previewDialogCustomer.phone})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Produk 2025:</span>
                  <span className="font-medium text-amber-600 dark:text-amber-400">
                    {previewDialogCustomer.product_2025}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tgl Order 2025:</span>
                  <span>{previewDialogCustomer.order_date_2025 || "-"}</span>
                </div>
                <div className="flex justify-between items-center pt-1.5 border-t border-muted/50">
                  <span className="text-muted-foreground">Nomor Pengirim:</span>
                  <div className="flex items-center gap-1.5 font-bold">
                    <span className={`w-2 h-2 rounded-full ${
                      (selectedSenderSession === "campaign"
                        ? wahaSessionsData?.campaignSession?.status === "WORKING"
                        : wahaSessionsData?.mainSession?.status === "WORKING")
                        ? "bg-emerald-500"
                        : "bg-amber-500"
                    }`} />
                    <span>
                      {selectedSenderSession === "campaign"
                        ? `Slot 2 (Kampanye - ${wahaSessionsData?.campaignSession?.me?.id?.split("@")[0] || wahaSessionsData?.campaignSession?.status || "Outreach"})`
                        : `Slot 1 (CS Utama - ${wahaSessionsData?.mainSession?.me?.id?.split("@")[0] || "6281337324522"})`}
                    </span>
                  </div>
                </div>
              </div>

              {previewImageUrl && (
                <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2 text-xs">
                  <img
                    src={previewImageUrl}
                    alt="Promo"
                    className="w-10 h-10 object-cover rounded"
                    onError={(e) => ((e.target as any).style.display = "none")}
                  />
                  <span>Flyer bergambar akan ikut dikirim bersama teks di bawah.</span>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-muted-foreground">Isi Caption Teks (Dapat Diedit):</label>
                <Textarea
                  rows={6}
                  value={previewMessage}
                  onChange={(e) => setPreviewMessage(e.target.value)}
                  className="text-xs font-sans leading-relaxed"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setPreviewDialogCustomer(null)}>
              Batal
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (!previewDialogCustomer) return;
                sendWhatsAppMutation.mutate({
                  phone: previewDialogCustomer.phone,
                  customerName: previewDialogCustomer.name,
                  message: previewMessage,
                  product: previewDialogCustomer.product_2025,
                  imageUrl: previewImageUrl,
                });
              }}
              disabled={sendWhatsAppMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5"
            >
              {sendWhatsAppMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Kirim Sekarang
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 4. Modal Dialog: Bulk Send Progress & Runner */}
      <Dialog open={bulkModalOpen} onOpenChange={(open) => !isBulkRunning && setBulkModalOpen(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Send className="w-5 h-5 text-emerald-500" />
              Kirim Reaktivasi Massal via WAHA
            </DialogTitle>
            <DialogDescription className="text-xs">
              Pesan sapaan hangat akan dikirimkan satu per satu dengan jeda aman agar nomor WA tetap terlindungi.
            </DialogDescription>
          </DialogHeader>

          <div className="py-3">
            {!isBulkRunning ? (
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-muted/40 border border-muted/60 text-xs space-y-1.5">
                  <div className="flex justify-between font-semibold">
                    <span>Jumlah Kontak Terpilih:</span>
                    <span className="text-emerald-600 font-bold">{selectedPhones.length} Kontak</span>
                  </div>
                  <div className="flex justify-between items-center text-muted-foreground">
                    <span>Nomor Pengirim:</span>
                    <span className="font-bold text-foreground flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${
                        (selectedSenderSession === "campaign"
                          ? wahaSessionsData?.campaignSession?.status === "WORKING"
                          : wahaSessionsData?.mainSession?.status === "WORKING")
                          ? "bg-emerald-500"
                          : "bg-amber-500"
                      }`} />
                      {selectedSenderSession === "campaign"
                        ? `Slot 2 (Kampanye - ${wahaSessionsData?.campaignSession?.me?.id?.split("@")[0] || "Outreach"})`
                        : `Slot 1 (CS Utama - ${wahaSessionsData?.mainSession?.me?.id?.split("@")[0] || "6281337324522"})`}
                    </span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Estimasi Waktu:</span>
                    <span>~{Math.ceil((selectedPhones.length * 12) / 60)} menit</span>
                  </div>
                </div>

                {selectedSenderSession === "campaign" && wahaSessionsData?.campaignSession?.status !== "WORKING" && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-700 dark:text-rose-300 space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      Nomor Kampanye Belum Aktif / Scan QR
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Status sesi: <strong>{wahaSessionsData?.campaignSession?.status || "SCAN_QR_CODE"}</strong>. Silakan scan QR di menu <strong>Pengaturan WhatsApp &gt; Slot 2</strong>, atau ubah pengirim ke Slot 1 di atas.
                    </p>
                  </div>
                )}

                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-200">
                  🛡️ <strong>Proteksi Nomor Bisnis:</strong> Setiap pesan diberi jeda acak manusiawi (10–14 detik) agar nomor WhatsApp toko aman dari banned.
                </div>
              </div>
            ) : (
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold">
                    <span>Progres Pengiriman:</span>
                    <span>{bulkProgress.current} / {bulkProgress.total}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-emerald-600 h-2.5 transition-all duration-300 rounded-full"
                      style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-muted/40 border border-muted/60 text-xs space-y-1">
                  <p className="font-semibold text-foreground truncate">
                    Sedang memproses: <span className="text-emerald-600">{bulkProgress.currentName}</span>
                  </p>
                  {bulkProgress.countdown > 0 ? (
                    <p className="text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-amber-500" />
                      Jeda aman berikutnya: <strong className="text-amber-600">{bulkProgress.countdown} detik</strong>
                    </p>
                  ) : (
                    <p className="text-emerald-600 font-medium flex items-center gap-1">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Mengirim via gateway WAHA...
                    </p>
                  )}
                </div>

                <div className="flex justify-between text-[11px] text-muted-foreground px-1">
                  <span>✅ Berhasil: {bulkProgress.successCount}</span>
                  <span>❌ Gagal: {bulkProgress.failedCount}</span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            {!isBulkRunning ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setBulkModalOpen(false)}>
                  Batal
                </Button>
                <Button size="sm" onClick={handleExecuteBulkSend} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
                  Mulai Kirim Sekarang
                </Button>
              </>
            ) : (
              <Button variant="destructive" size="sm" onClick={handleStopBulkSend} className="w-full">
                Hentikan Pengiriman
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

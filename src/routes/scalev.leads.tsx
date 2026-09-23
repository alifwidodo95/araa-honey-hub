import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import React, { useState, useMemo, useEffect, useRef } from "react";
import { RequireAuth } from "@/components/require-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { formatIDR } from "@/lib/theme";
import { toast } from "sonner";
import {
  Users, CheckCircle2, AlertCircle, RefreshCw, Settings2,
  Search, Filter, Clock, Calendar, CheckSquare,
  ShieldCheck, Loader2, PartyPopper, Copy, Image, Video, Film, Sparkles, Check,
  Phone, Smartphone, ExternalLink, Send, ArrowUpDown, ChevronLeft, ChevronRight, Zap,
  Pencil, Trash2, Plus, Tag, FileText
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  getScalevMetrics,
  getScalevLeads,
  runAutoMatchScalev,
  syncScalevHistory,
  sendScalevFollowUpWhatsApp,
  getScalevConfig,
  saveScalevConfig,
  manualToggleScalevClosing,
  searchOrdersForLinking,
  updateScalevLeadPhone,
  deleteScalevLeads,
  updateScalevLeadNotes
} from "@/lib/scalev.functions";
import { getWahaSessionsInfo } from "@/lib/reaktivasi.functions";
import { getMetaMessageTemplates } from "@/lib/waba-templates.functions";

export const Route = createFileRoute("/scalev/leads")({
  component: () => (
    <RequireAuth>
      <ScalevLeadsPage />
    </RequireAuth>
  ),
});

function formatDateIndo(dateStr?: string | null) {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${hours}:${minutes} WIB`;
  } catch {
    return dateStr;
  }
}

function getLocalDateString(d: Date = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodayString() {
  return getLocalDateString(new Date());
}

function getNDaysAgoString(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return getLocalDateString(d);
}

const COMMON_UNCLOSED_REASONS = [
  "Kemahalan",
  "Minta COD",
  "Tanya Pasangan",
  "Checkout Shopee",
  "Nunggu Gajian",
  "No WA Salah / Centang 1",
  "Ragu Keaslian",
];

function LeadNotesCell({ leadId, initialNotes }: { leadId: string; initialNotes?: string | null }) {
  const [notes, setNotes] = useState(initialNotes || "");
  const [isOpen, setIsOpen] = useState(false);
  const [tempNotes, setTempNotes] = useState(initialNotes || "");
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    setNotes(initialNotes || "");
    setTempNotes(initialNotes || "");
  }, [initialNotes]);

  const handleSave = async (valueToSave: string) => {
    const trimmed = valueToSave.trim();
    setIsSaving(true);
    try {
      await updateScalevLeadNotes({
        data: { leadId, notes: trimmed },
      });
      setNotes(trimmed);
      setTempNotes(trimmed);
      setIsOpen(false);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
    } catch (err: any) {
      toast.error(err.message || "Gagal menyimpan catatan lead");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectPreset = (reason: string) => {
    let newNotes = reason;
    if (tempNotes && !tempNotes.includes(reason)) {
      newNotes = `${tempNotes}, ${reason}`;
    }
    setTempNotes(newNotes);
  };

  return (
    <div className="flex items-center justify-center">
      <Popover open={isOpen} onOpenChange={(open) => {
        setIsOpen(open);
        if (open) setTempNotes(notes);
      }}>
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="cursor-pointer transition-transform active:scale-95 outline-none select-none inline-flex items-center"
                >
                  {notes ? (
                    <Badge
                      variant="outline"
                      className={`text-[11px] font-medium px-2 py-0.5 gap-1.5 transition-all shadow-2xs whitespace-nowrap ${
                        justSaved
                          ? "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 font-semibold"
                          : "bg-amber-50 hover:bg-amber-100/90 text-amber-800 border-amber-300/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800 font-medium"
                      }`}
                    >
                      <FileText className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                      <span>{justSaved ? "Tersimpan" : "Ada Catatan"}</span>
                    </Badge>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/60 hover:text-primary transition-colors py-0.5 px-2 rounded-full hover:bg-muted/70 border border-transparent hover:border-border/60">
                      <Plus className="w-3 h-3" />
                      <span>Catatan</span>
                    </span>
                  )}
                </button>
              </PopoverTrigger>
            </TooltipTrigger>

            {/* Hover Tooltip: Show full content when cursor is moved over */}
            {notes && !isOpen && (
              <TooltipContent
                side="top"
                align="center"
                className="max-w-[280px] p-2.5 bg-slate-900 text-slate-100 rounded-lg shadow-xl border border-slate-800 text-xs z-50 animate-in fade-in zoom-in-95 text-left"
              >
                <div className="flex items-center gap-1 text-[10px] font-semibold text-amber-400 mb-1">
                  <FileText className="w-3 h-3" />
                  <span>Catatan Lead / Alasan:</span>
                </div>
                <p className="text-xs leading-relaxed text-slate-200 break-words whitespace-pre-wrap">
                  {notes}
                </p>
                <div className="mt-1.5 pt-1 border-t border-slate-800 text-[9px] text-slate-400 flex items-center justify-between">
                  <span>Klik untuk mengedit</span>
                </div>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>

        {/* Popover Content (Edit Box) */}
        <PopoverContent
          side="bottom"
          align="center"
          className="w-80 p-3.5 shadow-xl rounded-xl border border-border bg-background z-50 text-left"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b pb-1.5">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-primary" />
                Catatan / Alasan Belum Closing
              </span>
              {notes && (
                <button
                  type="button"
                  onClick={() => handleSave("")}
                  className="text-[10px] text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                  title="Hapus catatan"
                >
                  Hapus
                </button>
              )}
            </div>

            <Textarea
              autoFocus
              value={tempNotes}
              onChange={(e) => setTempNotes(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSave(tempNotes);
                }
              }}
              placeholder="Tulis alasan belum closing (misal: Kemahalan, Tanya Suami, dsb)..."
              className="text-xs min-h-[70px] resize-none focus-visible:ring-1"
              disabled={isSaving}
            />

            {/* Quick Presets Chips */}
            <div className="space-y-1">
              <span className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
                <Tag className="w-2.5 h-2.5" /> Pilihan Alasan Cepat:
              </span>
              <div className="flex flex-wrap gap-1">
                {COMMON_UNCLOSED_REASONS.map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => handleSelectPreset(reason)}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-muted/80 hover:bg-primary/10 hover:text-primary hover:border-primary/40 border border-border/60 transition-colors cursor-pointer text-muted-foreground whitespace-nowrap"
                  >
                    {reason}
                  </button>
                ))}
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-2 pt-1 border-t">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs px-2.5"
                onClick={() => setIsOpen(false)}
                disabled={isSaving}
              >
                Batal
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs px-3 gap-1"
                onClick={() => handleSave(tempNotes)}
                disabled={isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <Check className="w-3 h-3" />
                    Simpan
                  </>
                )}
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function ScalevLeadsPage() {
  const queryClient = useQueryClient();

  // Filter States
  const [dateFilterMode, setDateFilterMode] = useState<"all" | "today" | "yesterday" | "7days" | "30days" | "custom">("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [statusTab, setStatusTab] = useState<"all" | "unclosed" | "closed">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  // Dialog States
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncMaxOrders, setSyncMaxOrders] = useState<number>(100);
  const [followUpModalOpen, setFollowUpModalOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<any | null>(null);
  const [activeStep, setActiveStep] = useState<number>(1);
  const [customMessage, setCustomMessage] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [selectedFollowUpSession, setSelectedFollowUpSession] = useState<string>("waba");
  const [followUpMode, setFollowUpMode] = useState<"custom" | "meta_template">("custom");
  const [selectedMetaTemplateName, setSelectedMetaTemplateName] = useState<string>("");
  const [metaParam1, setMetaParam1] = useState<string>("");
  const [metaParam2, setMetaParam2] = useState<string>("");

  // Manual Closing Modal State
  const [manualClosingLead, setManualClosingLead] = useState<any | null>(null);
  const [searchOrderQuery, setSearchOrderQuery] = useState("");
  const [selectedOrderToLink, setSelectedOrderToLink] = useState<any | null>(null);

  // Delete & Bulk Selection States
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [leadToDelete, setLeadToDelete] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Config Form State
  const [configForm, setConfigForm] = useState({
    apiKey: "",
    clientId: "",
    signingSecret: "",
    senderSession: "waba",
    followUpTemplate: "",
    fu1Template: "",
    fu1MediaUrl: "",
    fu2Template: "",
    fu2MediaUrl: "",
    fu3Template: "",
    fu3MediaUrl: "",
  });
  const [configTemplateTab, setConfigTemplateTab] = useState<"fu1" | "fu2" | "fu3">("fu1");

  // Calculate effective date bounds
  const { startDate, endDate } = useMemo(() => {
    const today = getTodayString();
    if (dateFilterMode === "today") {
      return { startDate: today, endDate: today };
    }
    if (dateFilterMode === "yesterday") {
      const yest = getNDaysAgoString(1);
      return { startDate: yest, endDate: yest };
    }
    if (dateFilterMode === "7days") {
      return { startDate: getNDaysAgoString(7), endDate: today };
    }
    if (dateFilterMode === "30days") {
      return { startDate: getNDaysAgoString(30), endDate: today };
    }
    if (dateFilterMode === "custom") {
      return { startDate: customStartDate || undefined, endDate: customEndDate || undefined };
    }
    return { startDate: undefined, endDate: undefined };
  }, [dateFilterMode, customStartDate, customEndDate]);

  // Query: Metrics
  const { data: metrics, isLoading: isMetricsLoading, refetch: refetchMetrics } = useQuery({
    queryKey: ["scalev-metrics", startDate, endDate],
    queryFn: () => getScalevMetrics({ data: { startDate, endDate } }),
    refetchInterval: 15000,
  });

  // Query: Leads List
  const { data: leadsData, isLoading: isLeadsLoading, refetch: refetchLeads } = useQuery({
    queryKey: ["scalev-leads", statusTab, searchQuery, startDate, endDate, currentPage],
    queryFn: () =>
      getScalevLeads({
        data: {
          status: statusTab,
          search: searchQuery,
          startDate,
          endDate,
          limit: pageSize,
          offset: (currentPage - 1) * pageSize,
        },
      }),
    refetchInterval: 15000,
  });

  // Bulk Selection Helpers & Computed States
  const currentLeads = useMemo(() => leadsData?.leads || [], [leadsData]);
  const currentLeadIds = useMemo(() => currentLeads.map((l: any) => l.id), [currentLeads]);
  const isAllSelected = currentLeadIds.length > 0 && currentLeadIds.every((id: string) => selectedLeadIds.includes(id));
  const isSomeSelected = currentLeadIds.some((id: string) => selectedLeadIds.includes(id));

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedLeadIds(prev => prev.filter(id => !currentLeadIds.includes(id)));
    } else {
      setSelectedLeadIds(prev => Array.from(new Set([...prev, ...currentLeadIds])));
    }
  };

  const handleToggleSelectLead = (id: string) => {
    setSelectedLeadIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleOpenDeleteOne = (lead: any) => {
    setLeadToDelete(lead);
    setDeleteModalOpen(true);
  };

  const handleOpenBulkDelete = () => {
    setLeadToDelete(null);
    setDeleteModalOpen(true);
  };

  const handleExecuteDelete = async () => {
    const idsToDelete = leadToDelete ? [leadToDelete.id] : selectedLeadIds;
    if (idsToDelete.length === 0) return;

    setIsDeleting(true);
    try {
      const res = await deleteScalevLeads({ data: { leadIds: idsToDelete } });
      toast.success(`Berhasil menghapus ${res.deletedCount} lead`);
      setSelectedLeadIds(prev => prev.filter(id => !idsToDelete.includes(id)));
      setDeleteModalOpen(false);
      setLeadToDelete(null);
      queryClient.invalidateQueries({ queryKey: ["scalev-leads"] });
      queryClient.invalidateQueries({ queryKey: ["scalev-metrics"] });
    } catch (err: any) {
      toast.error(err.message || "Gagal menghapus data lead Scalev");
    } finally {
      setIsDeleting(false);
    }
  };

  // Query: WAHA Sessions Info (Check Slot 2: Admin Ayumi status)
  const { data: wahaInfo } = useQuery({
    queryKey: ["waha-sessions-info"],
    queryFn: () => getWahaSessionsInfo(),
    refetchInterval: 12000,
  });

  // Query: Scalev Config
  const { data: currentConfig, refetch: refetchConfig } = useQuery({
    queryKey: ["scalev-config"],
    queryFn: () => getScalevConfig(),
  });

  // Query: Meta Message Templates (Official HSM)
  const {
    data: metaTemplatesData,
    isLoading: isTemplatesLoading,
    refetch: refetchMetaTemplates,
  } = useQuery({
    queryKey: ["meta-message-templates"],
    queryFn: () => getMetaMessageTemplates(),
  });

  const approvedMetaTemplates = useMemo(() => {
    return (metaTemplatesData?.templates || []).filter((t: any) => t.status === "APPROVED");
  }, [metaTemplatesData]);

  const activeMetaTemplate = useMemo(() => {
    if (!approvedMetaTemplates.length) return null;
    return (
      approvedMetaTemplates.find((t: any) => t.name === selectedMetaTemplateName) ||
      approvedMetaTemplates[0]
    );
  }, [approvedMetaTemplates, selectedMetaTemplateName]);

  // Keep form in sync when currentConfig loads
  useMemo(() => {
    if (currentConfig) {
      const sess = currentConfig.senderSession || "waba";
      setConfigForm({
        apiKey: currentConfig.apiKey || "",
        clientId: currentConfig.clientId || "",
        signingSecret: currentConfig.signingSecret || "",
        senderSession: sess,
        followUpTemplate: currentConfig.followUpTemplate || "",
        fu1Template: currentConfig.fu1Template || currentConfig.followUpTemplate || "",
        fu1MediaUrl: currentConfig.fu1MediaUrl || "",
        fu2Template: currentConfig.fu2Template || "",
        fu2MediaUrl: currentConfig.fu2MediaUrl || "",
        fu3Template: currentConfig.fu3Template || "",
        fu3MediaUrl: currentConfig.fu3MediaUrl || "",
      });
      setSelectedFollowUpSession(sess);
    }
  }, [currentConfig]);

  // Mutation: Auto Match CS Orders
  const autoMatchMutation = useMutation({
    mutationFn: () => runAutoMatchScalev(),
    onSuccess: (res) => {
      toast.success(
        `Pencocokan selesai! ${res.newlyClosedCount} lead berhasil dicocokkan menjadi Closing dari ${res.totalChecked} lead yang diperiksa.`
      );
      refetchMetrics();
      refetchLeads();
      queryClient.invalidateQueries({ queryKey: ["scalev-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["scalev-leads"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Gagal melakukan pencocokan CS.");
    },
  });

  // Mutation: Sync Scalev History
  const syncMutation = useMutation({
    mutationFn: (maxOrders: number) => syncScalevHistory({ data: { maxOrders } }),
    onSuccess: (res) => {
      toast.success(
        `Sinkronisasi berhasil! ${res.totalSynced} order ditarik, ${res.newlyInserted} lead baru masuk, ${res.newlyClosed} otomatis closing.`
      );
      setSyncModalOpen(false);
      refetchMetrics();
      refetchLeads();
      queryClient.invalidateQueries({ queryKey: ["scalev-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["scalev-leads"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Gagal menyinkronkan data dari Scalev.");
    },
  });

  // Mutation: Send WhatsApp Follow-Up
  const followUpMutation = useMutation({
    mutationFn: (payload: {
      leadId: string;
      phone: string;
      customerName: string;
      productName?: string;
      customMessage?: string;
      senderSession?: string;
      step?: number;
      mediaUrl?: string;
      template?: {
        name: string;
        language?: string;
        bodyParameters?: string[];
        headerImageUrl?: string;
        headerVideoUrl?: string;
      };
    }) => sendScalevFollowUpWhatsApp({ data: payload }),
    onSuccess: (_, variables) => {
      if (variables.template) {
        toast.success(`Template Meta "${variables.template.name}" berhasil terkirim via WABA Resmi Meta!`);
      } else {
        const channelLabel =
          variables.senderSession === "waba"
            ? "WABA Resmi Meta (+62 856-4540-6949)"
            : variables.senderSession === "default"
            ? "Slot 1 (CS Utama)"
            : `Slot 2 (${wahaInfo?.campaignSession?.me?.id ? "0878-3703-5470" : "ADMIN AYUMI"})`;
        toast.success(`Follow-Up ${variables.step || 1} terkirim via ${channelLabel}!`);
      }
      setFollowUpModalOpen(false);
      setSelectedLead(null);
      refetchMetrics();
      refetchLeads();
      queryClient.invalidateQueries({ queryKey: ["scalev-leads"] });
      queryClient.invalidateQueries({ queryKey: ["scalev-metrics"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Gagal mengirim WhatsApp follow-up.");
    },
  });

  // Mutation: Save Config
  const saveConfigMutation = useMutation({
    mutationFn: (cfg: typeof configForm) => saveScalevConfig({ data: cfg }),
    onSuccess: () => {
      toast.success("Pengaturan Scalev berhasil disimpan!");
      setConfigModalOpen(false);
      refetchConfig();
    },
    onError: (err: any) => {
      toast.error(err.message || "Gagal menyimpan konfigurasi.");
    },
  });

  // Query: Search Orders for Linking
  const { data: searchOrderResults, isLoading: isSearchingOrders } = useQuery({
    queryKey: ["search-orders-linking", searchOrderQuery],
    queryFn: () => searchOrdersForLinking({ data: { query: searchOrderQuery } }),
    enabled: !!manualClosingLead,
  });

  // Mutation: Manual Closing Toggle
  const manualClosingMutation = useMutation({
    mutationFn: (payload: { leadId: string; isClosed: boolean; orderId?: string | null }) =>
      manualToggleScalevClosing({ data: payload }),
    onSuccess: (_, variables) => {
      toast.success(
        variables.isClosed
          ? "✅ Lead berhasil ditandai Closing (Won)!"
          : "Status lead dikembalikan ke Belum Closing."
      );
      setManualClosingLead(null);
      setSelectedOrderToLink(null);
      refetchMetrics();
      refetchLeads();
      queryClient.invalidateQueries({ queryKey: ["scalev-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["scalev-leads"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Gagal mengubah status closing lead.");
    },
  });

  const handleOpenManualClosing = (lead: any) => {
    setManualClosingLead(lead);
    setSearchOrderQuery(lead.customer_name || "");
    setSelectedOrderToLink(null);
  };

  const handleQuickMarkWon = () => {
    if (!manualClosingLead) return;
    manualClosingMutation.mutate({
      leadId: manualClosingLead.id,
      isClosed: true,
      orderId: null,
    });
  };

  const handleLinkOrderAndMarkWon = () => {
    if (!manualClosingLead || !selectedOrderToLink) return;
    manualClosingMutation.mutate({
      leadId: manualClosingLead.id,
      isClosed: true,
      orderId: selectedOrderToLink.id,
    });
  };

  const handleCancelClosing = () => {
    if (!manualClosingLead) return;
    manualClosingMutation.mutate({
      leadId: manualClosingLead.id,
      isClosed: false,
    });
  };

  // State: Edit Customer Phone Modal
  const [editPhoneModalOpen, setEditPhoneModalOpen] = useState(false);
  const [leadToEditPhone, setLeadToEditPhone] = useState<any>(null);
  const [newPhoneInput, setNewPhoneInput] = useState("");

  const handleOpenEditPhone = (lead: any) => {
    setLeadToEditPhone(lead);
    setNewPhoneInput(lead.customer_phone || lead.customer_raw_phone || "");
    setEditPhoneModalOpen(true);
  };

  // Mutation: Update Lead Phone Number
  const updatePhoneMutation = useMutation({
    mutationFn: (payload: { leadId: string; newPhone: string }) =>
      updateScalevLeadPhone({ data: payload }),
    onSuccess: (res) => {
      if (res.matchedOrder) {
        toast.success(
          `✅ Nomor HP berhasil diperbarui ke ${res.customerPhone} dan otomatis tercocokkan dengan pesanan di Penjualan (Closing Won)!`
        );
      } else {
        toast.success(`✅ Nomor HP berhasil diperbarui ke ${res.customerPhone}!`);
      }
      setEditPhoneModalOpen(false);
      setLeadToEditPhone(null);
      refetchMetrics();
      refetchLeads();
      queryClient.invalidateQueries({ queryKey: ["scalev-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["scalev-leads"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Gagal memperbarui nomor HP pelanggan.");
    },
  });

  const getTemplateForStep = (step: number, lead: any) => {
    let tpl = "";
    if (step === 1) {
      tpl =
        currentConfig?.fu1Template ||
        currentConfig?.followUpTemplate ||
        `Halo Kak {nama}, salam hangat dari Araa Honey! 🍯🐝\n\nKami mendapati Kakak baru saja mengisi data pemesanan untuk *{produk}* di website kami.\n\nApakah ada kendala saat proses konfirmasi atau ada yang ingin ditanyakan terkait pengiriman dan cara pembayarannya Kak? Boleh kami bantu yaa. 😊🙏`;
    } else if (step === 2) {
      tpl =
        currentConfig?.fu2Template ||
        `Halo Kak {nama}, pesanan *{produk}* Kakak saat ini masih kami simpankan di antrean khusus yaa. 🍯✨\n\nMadu Araa dipanen murni langsung dari nektar bunga alami tanpa campuran, kaya enzim & antioksidan untuk menjaga daya tahan tubuh keluarga.\n\nApakah pesanannya mau kami proses kirim hari ini Kak? Stok untuk batch panen ini sangat terbatas lho. 😊📦`;
    } else {
      tpl =
        currentConfig?.fu3Template ||
        `Pemberitahuan Terakhir untuk Kak {nama} 🙏\n\nMengenai pesanan *{produk}* yang Kakak ajukan sebelumnya, mohon maaf batas waktu reservasi paket akan segera berakhir sore ini.\n\nJika Kakak masih berminat, silakan konfirmasi sekarang agar langsung kami kirimkan. Namun jika berhalangan, slot ini akan kami alihkan ke antrean berikutnya ya Kak. Terima kasih! 🍯🐝`;
    }

    return tpl
      .replace(/{nama}/g, lead?.customer_name || "Kak")
      .replace(/{produk}/g, lead?.product_name || "Madu Araa Murni")
      .replace(/{order_id}/g, lead?.scalev_order_id || "");
  };

  const getMediaForStep = (step: number) => {
    if (step === 1) return currentConfig?.fu1MediaUrl || "";
    if (step === 2) return currentConfig?.fu2MediaUrl || "";
    return currentConfig?.fu3MediaUrl || "";
  };

  // Open Follow-up modal with auto-advancing step
  const handleOpenFollowUp = (lead: any, forcedStep?: number) => {
    setSelectedLead(lead);
    const currentStep = Number(lead.follow_up_step ?? lead.follow_up_count ?? 0);
    // If not forced: 0 -> 1, 1 -> 2, 2 -> 3, >=3 -> 3
    const targetStep = forcedStep ?? (currentStep === 0 ? 1 : currentStep === 1 ? 2 : 3);
    setActiveStep(targetStep);
    setCustomMessage(getTemplateForStep(targetStep, lead));
    setMediaUrl(getMediaForStep(targetStep));
    setFollowUpMode("custom");
    setMetaParam1(lead?.customer_name || "");
    setMetaParam2(lead?.product_name || "Madu Araa");
    if (approvedMetaTemplates.length > 0 && !selectedMetaTemplateName) {
      setSelectedMetaTemplateName(approvedMetaTemplates[0].name);
    }
    setFollowUpModalOpen(true);
  };

  const handleSwitchStepInModal = (newStep: number) => {
    if (!selectedLead) return;
    setActiveStep(newStep);
    setCustomMessage(getTemplateForStep(newStep, selectedLead));
    setMediaUrl(getMediaForStep(newStep));
  };

  const handleCopyWebhookUrl = () => {
    const url = "https://app.araahoney.my.id/api/scalev-webhook";
    navigator.clipboard.writeText(url);
    toast.success("URL Webhook berhasil disalin ke clipboard!");
  };

  // Pagination details
  const totalItems = leadsData?.total || 0;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;

  // WA Session Slot 2 Status indicator
  const isSlot2Online = wahaInfo?.campaignSession?.status === "WORKING";
  const slot2Phone = "0878-3703-5470 (ADMIN AYUMI)";

  return (
    <div className="space-y-6 p-4 md:p-8 max-w-7xl mx-auto pb-24">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-card/60 backdrop-blur-md p-6 rounded-2xl border border-border/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <Zap className="w-3.5 h-3.5" />
              Sinkronisasi Short Form Scalev
            </span>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                isSlot2Online
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                  : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              Slot 2 Follow-Up: {isSlot2Online ? "Online (ADMIN AYUMI)" : "Perlu Disambung"}
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            Leads Ads & Closing Hub
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pantau lead masuk dari landing page Scalev, hitung Closing Rate harian CS, dan follow-up lead tercecer via WhatsApp.
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (currentConfig) {
                setConfigForm({
                  apiKey: currentConfig.apiKey || "",
                  clientId: currentConfig.clientId || "",
                  signingSecret: currentConfig.signingSecret || "",
                  followUpTemplate: currentConfig.followUpTemplate || "",
                  senderSession: currentConfig.senderSession || "campaign",
                });
              }
              setConfigModalOpen(true);
            }}
            className="border-border hover:bg-muted/80 gap-1.5"
          >
            <Settings2 className="w-4 h-4 text-muted-foreground" />
            <span>Pengaturan Webhook</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setSyncModalOpen(true)}
            className="border-border hover:bg-muted/80 gap-1.5"
          >
            <RefreshCw className="w-4 h-4 text-primary" />
            <span>Tarik Data Scalev</span>
          </Button>

          <Button
            size="sm"
            onClick={() => autoMatchMutation.mutate()}
            disabled={autoMatchMutation.isPending}
            className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm gap-1.5 font-medium"
          >
            {autoMatchMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckSquare className="w-4 h-4" />
            )}
            <span>Pencocokan CS</span>
          </Button>
        </div>
      </div>

      {/* KPI Cards: Closing Rate & Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Leads */}
        <Card className="border-border/80 shadow-sm relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Lead Masuk
            </CardTitle>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl md:text-3xl font-bold text-foreground">
              {isMetricsLoading ? "..." : (metrics?.totalLeads || 0).toLocaleString("id-ID")}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Potensi Omzet:{" "}
              <span className="font-medium text-foreground">
                {formatIDR(metrics?.totalRevenue || 0)}
              </span>
            </p>
          </CardContent>
        </Card>

        {/* Card 2: Closing di CS */}
        <Card className="border-border/80 shadow-sm relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Closing di CS (Won)
            </CardTitle>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl md:text-3xl font-bold text-emerald-600 dark:text-emerald-400">
              {isMetricsLoading ? "..." : (metrics?.closedCount || 0).toLocaleString("id-ID")}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Omzet Closing:{" "}
              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                {formatIDR(metrics?.closedRevenue || 0)}
              </span>
            </p>
          </CardContent>
        </Card>

        {/* Card 3: Belum Closing */}
        <Card className="border-border/80 shadow-sm relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Belum Closing (Leads Tercecer)
            </CardTitle>
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <AlertCircle className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl md:text-3xl font-bold text-rose-600 dark:text-rose-400">
              {isMetricsLoading ? "..." : (metrics?.unclosedCount || 0).toLocaleString("id-ID")}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
              <span>Potensi: {formatIDR(metrics?.unclosedRevenue || 0)}</span>
              <span className="text-blue-500 font-medium">
                {metrics?.followedUpCount || 0} di-FU
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Closing Rate (%) */}
        <Card className="border-border/80 shadow-sm relative overflow-hidden bg-gradient-to-br from-card to-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Closing Rate (%)
            </CardTitle>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <PartyPopper className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <div
                className={`text-2xl md:text-3xl font-extrabold ${
                  (metrics?.closingRate || 0) >= 60
                    ? "text-emerald-600 dark:text-emerald-400"
                    : (metrics?.closingRate || 0) >= 30
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {isMetricsLoading ? "..." : `${metrics?.closingRate || 0}%`}
              </div>
              <span className="text-xs text-muted-foreground">
                ({metrics?.closedCount || 0}/{metrics?.totalLeads || 0} order)
              </span>
            </div>
            <div className="mt-2.5">
              <Progress
                value={metrics?.closingRate || 0}
                className="h-2 bg-muted rounded-full"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card className="border-border/80 shadow-sm">
        {/* Controls: Date Filter, Status Tabs, Search */}
        <CardHeader className="p-4 md:p-6 pb-4 border-b border-border/60">
          <div className="flex flex-col gap-4">
            {/* Row 1: Date Filter Pills */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mr-1">
                <Calendar className="w-3.5 h-3.5" /> Rentang:
              </span>
              {[
                { id: "all", label: "Semua Waktu" },
                { id: "today", label: "Hari Ini" },
                { id: "yesterday", label: "Kemarin" },
                { id: "7days", label: "7 Hari Terakhir" },
                { id: "30days", label: "30 Hari Terakhir" },
                { id: "custom", label: "Kustom" },
              ].map((pill) => (
                <Button
                  key={pill.id}
                  variant={dateFilterMode === pill.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setDateFilterMode(pill.id as any);
                    setCurrentPage(1);
                  }}
                  className="h-8 text-xs px-3"
                >
                  {pill.label}
                </Button>
              ))}

              {dateFilterMode === "custom" && (
                <div className="flex items-center gap-2 ml-auto">
                  <Input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="h-8 text-xs w-36"
                  />
                  <span className="text-xs text-muted-foreground">s/d</span>
                  <Input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="h-8 text-xs w-36"
                  />
                </div>
              )}
            </div>

            {/* Row 2: Status Tabs & Search Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
              {/* Status Tabs */}
              <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-xl w-fit">
                <Button
                  variant={statusTab === "all" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => {
                    setStatusTab("all");
                    setCurrentPage(1);
                  }}
                  className="h-8 text-xs px-3 rounded-lg"
                >
                  Semua Lead ({metrics?.totalLeads || 0})
                </Button>
                <Button
                  variant={statusTab === "unclosed" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => {
                    setStatusTab("unclosed");
                    setCurrentPage(1);
                  }}
                  className={`h-8 text-xs px-3 rounded-lg ${
                    statusTab === "unclosed" ? "bg-rose-600 hover:bg-rose-700 text-white" : "text-rose-600 dark:text-rose-400"
                  }`}
                >
                  <AlertCircle className="w-3.5 h-3.5 mr-1" />
                  Belum Closing ({metrics?.unclosedCount || 0})
                </Button>
                <Button
                  variant={statusTab === "closed" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => {
                    setStatusTab("closed");
                    setCurrentPage(1);
                  }}
                  className={`h-8 text-xs px-3 rounded-lg ${
                    statusTab === "closed" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "text-emerald-600 dark:text-emerald-400"
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                  Sudah Closing ({metrics?.closedCount || 0})
                </Button>
              </div>

              {/* Search Bar */}
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
                <Input
                  placeholder="Cari nama, no HP, order ID..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-9 h-9 text-xs"
                />
              </div>
            </div>
          </div>
        </CardHeader>

        {/* Table Content */}
        <CardContent className="p-0">
          {/* Bulk Action Floating Bar */}
          {selectedLeadIds.length > 0 && (
            <div className="bg-amber-500/10 border-b border-amber-500/30 px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs animate-in fade-in duration-150">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-amber-500 text-white font-bold text-[11px]">
                  {selectedLeadIds.length}
                </span>
                <span className="font-semibold text-foreground">
                  Lead Terpilih
                </span>
                <span className="text-muted-foreground hidden sm:inline">
                  (dari total {currentLeads.length} lead di halaman ini)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedLeadIds([])}
                  className="h-7 text-xs text-muted-foreground hover:text-foreground"
                >
                  Batal Pilih
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleOpenBulkDelete}
                  className="h-7 text-xs gap-1.5 font-medium shadow-xs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus Terpilih ({selectedLeadIds.length})</span>
                </Button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="w-12 px-3 text-center">
                    <Checkbox
                      checked={
                        isAllSelected
                          ? true
                          : isSomeSelected
                          ? "indeterminate"
                          : false
                      }
                      onCheckedChange={handleToggleSelectAll}
                      aria-label="Pilih semua lead di halaman ini"
                    />
                  </TableHead>
                  <TableHead className="w-36 text-xs font-semibold">Waktu Masuk</TableHead>
                  <TableHead className="w-52 text-xs font-semibold">Pelanggan & Kontak</TableHead>
                  <TableHead className="text-xs font-semibold">Produk & Nominal</TableHead>
                  <TableHead className="w-32 text-center text-xs font-semibold">Catatan</TableHead>
                  <TableHead className="w-40 text-center text-xs font-semibold">Pencocokan CS</TableHead>
                  <TableHead className="w-32 text-center text-xs font-semibold">Follow Up</TableHead>
                  <TableHead className="w-36 text-right text-xs font-semibold pr-6">Aksi Cepat</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLeadsLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-36 text-center text-muted-foreground">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                        <span className="text-xs">Memuat data lead Scalev...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (leadsData?.leads || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-36 text-center text-muted-foreground">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Users className="w-8 h-8 text-muted-foreground/40" />
                        <span className="text-sm font-medium text-foreground">Tidak ada lead ditemukan</span>
                        <span className="text-xs">
                          Coba ganti filter tanggal atau klik tombol &quot;Tarik Data Scalev&quot;.
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  (leadsData?.leads || []).map((lead: any) => {
                    const isClosed = lead.is_closed === true;
                    const hasFollowedUp = !!lead.followed_up_at;
                    const cleanPhone = String(lead.customer_phone || "").replace(/[^0-9]/g, "");
                    const isSelected = selectedLeadIds.includes(lead.id);

                    return (
                      <TableRow 
                        key={lead.id} 
                        className={`transition-colors ${
                          isSelected ? "bg-amber-500/10 dark:bg-amber-950/30" : "hover:bg-muted/30"
                        }`}
                      >
                        {/* Checkbox Select */}
                        <TableCell className="w-12 px-3 text-center">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => handleToggleSelectLead(lead.id)}
                            aria-label={`Pilih lead ${lead.customer_name}`}
                          />
                        </TableCell>

                        {/* Waktu */}
                        <TableCell className="text-xs text-muted-foreground font-mono whitespace-nowrap">
                          {formatDateIndo(lead.created_at)}
                        </TableCell>

                        {/* Pelanggan */}
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium text-xs text-foreground">
                              {lead.customer_name || "Pelanggan Scalev"}
                            </span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-xs font-mono text-muted-foreground">
                                {lead.customer_phone}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleOpenEditPhone(lead)}
                                className="p-0.5 rounded text-muted-foreground/60 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/50 transition-colors cursor-pointer"
                                title="Ubah / Perbaiki Nomor WhatsApp"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                              {lead.is_phone_edited && (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-medium" title="Nomor telah diselaraskan/diedit manual">
                                  Diedit
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-muted-foreground/70">
                              ID: {lead.scalev_order_id}
                            </span>
                          </div>
                        </TableCell>

                        {/* Produk & Nilai */}
                        <TableCell>
                          <div className="flex flex-col max-w-[240px]">
                            <span className="text-xs text-foreground font-medium truncate" title={lead.product_name}>
                              {lead.product_name || "Madu Araa Murni"}
                            </span>
                            <span className="text-xs font-semibold text-primary">
                              {formatIDR(lead.gross_revenue || 0)}
                            </span>
                          </div>
                        </TableCell>

                        {/* Catatan Lead (Status saja, hover untuk isi) */}
                        <TableCell className="text-center">
                          <LeadNotesCell leadId={lead.id} initialNotes={lead.notes} />
                        </TableCell>

                        {/* Status Closing CS */}
                        <TableCell className="text-center">
                          {isClosed ? (
                            <button
                              type="button"
                              onClick={() => handleOpenManualClosing(lead)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 hover:bg-emerald-100/90 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shadow-xs"
                              title="Klik untuk melihat detail atau membatalkan status closing"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span>Closing (Won)</span>
                              {lead.matched_order_id ? (
                                <span className="text-[9px] px-1 rounded bg-emerald-200/80 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 font-mono">
                                  Auto
                                </span>
                              ) : (
                                <span className="text-[9px] px-1 rounded bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 font-medium">
                                  Manual
                                </span>
                              )}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleOpenManualClosing(lead)}
                              className="group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50/90 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300 border border-rose-200 hover:border-rose-300 dark:border-rose-900/50 text-xs font-medium transition-all cursor-pointer whitespace-nowrap shadow-xs"
                              title="Klik untuk mengubah status jadi Closing (Won)"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0 group-hover:scale-125 transition-transform" />
                              <span>Belum Closing</span>
                            </button>
                          )}
                        </TableCell>

                        {/* Status Follow Up */}
                        <TableCell className="text-center">
                          {(() => {
                            const step = Number(lead.follow_up_step ?? lead.follow_up_count ?? 0);
                            if (step === 0 || !lead.followed_up_at) {
                              return (
                                <Badge variant="secondary" className="text-[10px] font-normal text-muted-foreground whitespace-nowrap">
                                  Belum FU
                                </Badge>
                              );
                            }
                            if (step === 1) {
                              return (
                                <div className="flex flex-col items-center">
                                  <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 border-blue-500/20 text-[10px] font-semibold whitespace-nowrap">
                                    FU 1 Terkirim
                                  </Badge>
                                  <span className="text-[10px] text-muted-foreground mt-0.5 whitespace-nowrap">
                                    {formatDateIndo(lead.fu1_at || lead.followed_up_at)}
                                  </span>
                                </div>
                              );
                            }
                            if (step === 2) {
                              return (
                                <div className="flex flex-col items-center">
                                  <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 border-amber-500/20 text-[10px] font-semibold whitespace-nowrap">
                                    FU 2 Terkirim
                                  </Badge>
                                  <span className="text-[10px] text-muted-foreground mt-0.5 whitespace-nowrap">
                                    {formatDateIndo(lead.fu2_at || lead.followed_up_at)}
                                  </span>
                                </div>
                              );
                            }
                            return (
                              <div className="flex flex-col items-center">
                                <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 border-emerald-500/20 text-[10px] font-semibold whitespace-nowrap">
                                  FU 3 (Maks)
                                </Badge>
                                <span className="text-[10px] text-muted-foreground mt-0.5 whitespace-nowrap">
                                  {formatDateIndo(lead.fu3_at || lead.followed_up_at)}
                                </span>
                              </div>
                            );
                          })()}
                        </TableCell>

                        {/* Aksi */}
                        <TableCell className="text-right pr-6">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Dynamic Follow Up Dialog Button */}
                            {(() => {
                              const step = Number(lead.follow_up_step ?? lead.follow_up_count ?? 0);
                              let btnLabel = "Follow Up 1";
                              let btnClass = "bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs";
                              if (step === 1) {
                                btnLabel = "Follow Up 2";
                                btnClass = "bg-blue-600 hover:bg-blue-700 text-white shadow-xs";
                              } else if (step === 2) {
                                btnLabel = "Follow Up 3";
                                btnClass = "bg-amber-600 hover:bg-amber-700 text-white shadow-xs";
                              } else if (step >= 3) {
                                btnLabel = "FU Selesai (Kirim Lagi)";
                                btnClass = "border border-border text-foreground hover:bg-muted";
                              }

                              return (
                                <Button
                                  size="sm"
                                  variant={step >= 3 || isClosed ? "outline" : "default"}
                                  onClick={() => handleOpenFollowUp(lead)}
                                  className={`h-7 text-xs px-2.5 gap-1.5 whitespace-nowrap font-medium ${
                                    isClosed ? "text-muted-foreground" : btnClass
                                  }`}
                                  title={`Kirim ${btnLabel} ke ${lead.customer_name}`}
                                >
                                  <Send className="w-3 h-3" />
                                  <span>{btnLabel}</span>
                                </Button>
                              );
                            })()}

                            {/* Direct WhatsApp Web Link */}
                            <a
                              href={`https://wa.me/${cleanPhone}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
                              title="Buka Chat di WhatsApp Web"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>

                            {/* Tombol Hapus Lead */}
                            <Button
                              size="icon"
                              variant="ghost"
                              type="button"
                              onClick={() => handleOpenDeleteOne(lead)}
                              className="w-7 h-7 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors shrink-0 cursor-pointer"
                              title={`Hapus lead ${lead.customer_name || "ini"}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-border/60">
              <span className="text-xs text-muted-foreground">
                Menampilkan {(currentPage - 1) * pageSize + 1} -{" "}
                {Math.min(currentPage * pageSize, totalItems)} dari {totalItems} lead
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-xs font-medium">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* DIALOG 1: Follow-Up WhatsApp Modal (3-Step Bertahap & Official Meta HSM Support) */}
      <Dialog open={followUpModalOpen} onOpenChange={setFollowUpModalOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold flex items-center gap-2">
                  <span>Follow-Up Lead Scalev</span>
                  {followUpMode === "custom" ? (
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-bold ${
                        activeStep === 1
                          ? "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30"
                          : activeStep === 2
                          ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
                          : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                      }`}
                    >
                      Tahap {activeStep} of 3
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-[10px] font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 flex items-center gap-1"
                    >
                      <ShieldCheck className="w-3 h-3 text-emerald-600" />
                      HSM Meta Template
                    </Badge>
                  )}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Pilih follow-up bertahap interaktif atau kirim template resmi Meta HSM (100% Anti-Banned).
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {selectedLead && (
            <div className="space-y-3.5 my-1">
              {/* Follow-Up Mode Switcher (Pesan Kustom Interaktif vs Template Resmi Meta HSM) */}
              <div className="flex rounded-xl bg-muted p-1 gap-1 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setFollowUpMode("custom")}
                  className={`flex-1 py-1.5 px-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                    followUpMode === "custom"
                      ? "bg-background text-foreground shadow-xs border border-border/50 font-bold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  <span>Pesan Interaktif (FU 1-3)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFollowUpMode("meta_template");
                    setSelectedFollowUpSession("waba");
                    if (!selectedMetaTemplateName && approvedMetaTemplates.length > 0) {
                      setSelectedMetaTemplateName(approvedMetaTemplates[0].name);
                    }
                  }}
                  className={`flex-1 py-1.5 px-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                    followUpMode === "meta_template"
                      ? "bg-background text-foreground shadow-xs border border-border/50 font-bold text-emerald-700 dark:text-emerald-300"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Template Resmi Meta (HSM)</span>
                  {approvedMetaTemplates.length > 0 && (
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-emerald-500/10 text-emerald-700 border-emerald-500/30">
                      {approvedMetaTemplates.length} Ready
                    </Badge>
                  )}
                </button>
              </div>

              {/* Status Riwayat FU Lead Ini */}
              <div className="p-2.5 rounded-xl border bg-muted/40 text-[11px] space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground font-medium">Riwayat Follow-Up Kontak Ini:</span>
                  <span className="font-semibold text-foreground">
                    {selectedLead.follow_up_step === 0 || !selectedLead.followed_up_at
                      ? "Belum pernah di-FU"
                      : `Tahap Terakhir: FU ${selectedLead.follow_up_step}`}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                  <div className={`p-1.5 rounded border ${selectedLead.fu1_at ? "bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-300 font-medium" : "bg-muted/30 border-muted text-muted-foreground"}`}>
                    <div className="font-bold flex items-center justify-between">
                      <span>FU 1 (Sapaan)</span>
                      {selectedLead.fu1_at && <Check className="w-3 h-3 text-blue-500" />}
                    </div>
                    <div className="truncate mt-0.5">{selectedLead.fu1_at ? formatDateIndo(selectedLead.fu1_at) : "Belum"}</div>
                  </div>
                  <div className={`p-1.5 rounded border ${selectedLead.fu2_at ? "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300 font-medium" : "bg-muted/30 border-muted text-muted-foreground"}`}>
                    <div className="font-bold flex items-center justify-between">
                      <span>FU 2 (Edukasi)</span>
                      {selectedLead.fu2_at && <Check className="w-3 h-3 text-amber-500" />}
                    </div>
                    <div className="truncate mt-0.5">{selectedLead.fu2_at ? formatDateIndo(selectedLead.fu2_at) : "Belum"}</div>
                  </div>
                  <div className={`p-1.5 rounded border ${selectedLead.fu3_at ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-medium" : "bg-muted/30 border-muted text-muted-foreground"}`}>
                    <div className="font-bold flex items-center justify-between">
                      <span>FU 3 (Final Call)</span>
                      {selectedLead.fu3_at && <Check className="w-3 h-3 text-emerald-500" />}
                    </div>
                    <div className="truncate mt-0.5">{selectedLead.fu3_at ? formatDateIndo(selectedLead.fu3_at) : "Belum"}</div>
                  </div>
                </div>
              </div>

              {/* Lead Info Box */}
              <div className="bg-muted/30 p-2.5 rounded-xl border border-border/70 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Penerima:</span>
                  <span className="font-semibold text-foreground">{selectedLead.customer_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nomor WhatsApp:</span>
                  <span className="font-mono text-foreground">{selectedLead.customer_phone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Produk:</span>
                  <span className="text-foreground truncate max-w-[260px]">{selectedLead.product_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nominal Pesanan:</span>
                  <span className="font-semibold text-primary">{formatIDR(selectedLead.gross_revenue || 0)}</span>
                </div>
              </div>

              {/* MODE 1: CUSTOM INTERACTIVE BUTTONS & MEDIA */}
              {followUpMode === "custom" ? (
                <>
                  {/* Step Tab Switcher */}
                  <div className="flex rounded-xl bg-muted p-1 gap-1">
                    <button
                      type="button"
                      onClick={() => handleSwitchStepInModal(1)}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                        activeStep === 1
                          ? "bg-background text-foreground shadow-xs border border-border/50"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <span>1️⃣ FU 1: Sapaan</span>
                      {selectedLead?.fu1_at && (
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" title="FU 1 sudah pernah dikirim" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSwitchStepInModal(2)}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                        activeStep === 2
                          ? "bg-background text-foreground shadow-xs border border-border/50"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <span>2️⃣ FU 2: Edukasi</span>
                      {selectedLead?.fu2_at && (
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="FU 2 sudah pernah dikirim" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSwitchStepInModal(3)}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                        activeStep === 3
                          ? "bg-background text-foreground shadow-xs border border-border/50"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <span>3️⃣ FU 3: Final Call</span>
                      {selectedLead?.fu3_at && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="FU 3 sudah pernah dikirim" />
                      )}
                    </button>
                  </div>

                  {/* Sender Engine Selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                      <span>Nomor WhatsApp Pengirim:</span>
                      <span className="text-[10px] text-muted-foreground">Pilih jalur pengirim pesan</span>
                    </label>
                    <Select
                      value={selectedFollowUpSession}
                      onValueChange={setSelectedFollowUpSession}
                    >
                      <SelectTrigger className="h-8 text-xs font-medium bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="waba" className="text-xs">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            <span className="font-semibold">WABA Resmi Meta (+62 856-4540-6949)</span>
                            <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                              Resmi Meta • Anti-Banned
                            </Badge>
                          </div>
                        </SelectItem>
                        <SelectItem value="campaign" className="text-xs">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${isSlot2Online ? "bg-emerald-500" : "bg-amber-500"}`} />
                            <span>Slot 2: Nomor Kampanye ({slot2Phone})</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="default" className="text-xs">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-blue-500" />
                            <span>Slot 1: CS Utama (WAHA)</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {selectedFollowUpSession === "waba" ? (
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Pesan dikirim via WhatsApp Business API Resmi + Tombol Interaktif Otomatis!
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        Status sesi: {selectedFollowUpSession === "campaign" ? (isSlot2Online ? "Online" : "Offline") : "Online"}
                      </p>
                    )}
                  </div>

                  {/* Media URL Input with Live Preview */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Image className="w-3.5 h-3.5 text-primary" />
                        <span>Link Gambar / Video (Opsional):</span>
                      </span>
                      {mediaUrl && (
                        <button
                          type="button"
                          onClick={() => setMediaUrl("")}
                          className="text-[10px] text-rose-500 hover:underline"
                        >
                          Hapus Media
                        </button>
                      )}
                    </label>
                    <Input
                      type="url"
                      placeholder="https://... (URL gambar flyer .jpg/.png atau video .mp4)"
                      value={mediaUrl}
                      onChange={(e) => setMediaUrl(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />

                    {/* Media Live Preview */}
                    {mediaUrl && mediaUrl.startsWith("http") && (
                      <div className="p-2 rounded-lg bg-muted/40 border border-border/60 flex items-center gap-3">
                        {/\.(mp4|mov|webm|avi|m4v)(\?.*)?$/i.test(mediaUrl) ? (
                          <div className="flex items-center gap-2 text-xs font-medium text-purple-600 dark:text-purple-400">
                            <Video className="w-5 h-5 shrink-0" />
                            <span className="truncate max-w-[320px]">Header Video: {mediaUrl}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2.5">
                            <img
                              src={mediaUrl}
                              alt="Preview"
                              className="w-12 h-12 object-cover rounded border border-border shrink-0"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = "none";
                              }}
                            />
                            <div className="text-[11px] text-muted-foreground truncate max-w-[280px]">
                              Header Gambar aktif untuk pesan WhatsApp
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Message Textarea */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                      <span>Pesan WhatsApp (FU {activeStep}):</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedLead) setCustomMessage(getTemplateForStep(activeStep, selectedLead));
                        }}
                        className="text-[10px] text-primary hover:underline"
                      >
                        Reset Template FU {activeStep}
                      </button>
                    </label>
                    <Textarea
                      rows={5}
                      value={customMessage}
                      onChange={(e) => setCustomMessage(e.target.value)}
                      className="text-xs resize-none font-sans"
                      placeholder="Ketik pesan follow-up..."
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Pesan otomatis dipersonalisasi dengan nama dan produk pelanggan.
                    </p>
                  </div>

                  {/* Interactive Buttons Preview (Meta Cloud API) */}
                  {selectedFollowUpSession === "waba" && (
                    <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-800 dark:text-emerald-300">
                      <div className="font-semibold flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        Tombol Balasan Cepat Otomatis (Meta Cloud API):
                      </div>
                      <div className="flex gap-1.5 mt-1.5 flex-wrap">
                        {activeStep === 1 ? (
                          <>
                            <span className="px-2 py-0.5 rounded-full bg-background border text-[10px] font-semibold text-foreground shadow-2xs">
                              ✅ Mau Bayar Sekarang
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-background border text-[10px] font-semibold text-foreground shadow-2xs">
                              💬 Tanya CS / Rekening
                            </span>
                          </>
                        ) : activeStep === 2 ? (
                          <>
                            <span className="px-2 py-0.5 rounded-full bg-background border text-[10px] font-semibold text-foreground shadow-2xs">
                              🍯 Amankan Pesanan
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-background border text-[10px] font-semibold text-foreground shadow-2xs">
                              💬 Tanya Stok / Promo
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="px-2 py-0.5 rounded-full bg-background border text-[10px] font-semibold text-foreground shadow-2xs">
                              🔥 Konfirmasi Kirim
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-background border text-[10px] font-semibold text-foreground shadow-2xs">
                              ❌ Batalkan Pesanan
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                /* MODE 2: META HSM APPROVED TEMPLATE */
                <div className="space-y-3">
                  {/* Sender Channel Info */}
                  <div className="p-2.5 rounded-xl border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                      <span className="font-semibold text-foreground">WABA Resmi Meta (+62 856-4540-6949)</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                      Cloud API • Anti-Banned
                    </Badge>
                  </div>

                  {/* Step Selector for Tracking */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                      <span>Catat Sebagai Tahap Follow-Up:</span>
                      <span className="text-[10px] text-muted-foreground">Untuk pencatatan riwayat kontak</span>
                    </label>
                    <div className="flex gap-2">
                      {[1, 2, 3].map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setActiveStep(st)}
                          className={`flex-1 py-1 rounded-md border text-xs font-medium transition-all ${
                            activeStep === st
                              ? "bg-emerald-600 text-white border-emerald-600 font-bold shadow-xs"
                              : "border-border/60 hover:bg-muted/40 text-muted-foreground"
                          }`}
                        >
                          FU {st} {st === 1 ? "(Sapaan)" : st === 2 ? "(Edukasi)" : "(Final Call)"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Template Dropdown Selector */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Pilih Template Resmi Meta (Approved):</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => refetchMetaTemplates()}
                          className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                          title="Segarkan daftar template dari Meta"
                        >
                          <RefreshCw className={`w-3 h-3 ${isTemplatesLoading ? "animate-spin" : ""}`} />
                          <span>Sync</span>
                        </button>
                        <a
                          href="https://business.facebook.com/wa/manage/message-templates"
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5"
                        >
                          Meta Manager <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                    </div>

                    {approvedMetaTemplates.length === 0 ? (
                      <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                        <p className="font-semibold">Belum Ada Template Approved</p>
                        <p className="text-[11px] leading-relaxed">
                          Tidak ditemukan template berstatus <code>APPROVED</code> di WhatsApp Business Manager. Buka Meta Manager untuk membuat template baru.
                        </p>
                      </div>
                    ) : (
                      <Select
                        value={activeMetaTemplate?.name || ""}
                        onValueChange={(val) => setSelectedMetaTemplateName(val)}
                      >
                        <SelectTrigger className="h-9 text-xs font-medium bg-background">
                          <SelectValue placeholder="Pilih Template Resmi" />
                        </SelectTrigger>
                        <SelectContent>
                          {approvedMetaTemplates.map((tpl: any) => (
                            <SelectItem key={tpl.id} value={tpl.name} className="text-xs">
                              <div className="flex items-center justify-between gap-4 w-full">
                                <span className="font-semibold">{tpl.name}</span>
                                <span className="text-[10px] text-muted-foreground uppercase">
                                  {tpl.category} • {tpl.language}
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {/* Template Variable Parameter Inputs */}
                  {activeMetaTemplate && (() => {
                    const bodyComp = activeMetaTemplate.components?.find((c: any) => c.type === "BODY");
                    const text = bodyComp?.text || "";
                    const hasParam1 = text.includes("{{1}}");
                    const hasParam2 = text.includes("{{2}}");

                    if (!hasParam1 && !hasParam2) return null;

                    return (
                      <div className="space-y-2 p-2.5 rounded-xl border bg-muted/20">
                        <span className="text-[11px] font-semibold text-foreground">
                          Parameter Variabel Pesan Template:
                        </span>
                        <div className="grid grid-cols-2 gap-2">
                          {hasParam1 && (
                            <div className="space-y-1">
                              <label className="text-[10px] text-muted-foreground">Parameter 1 ({`{{1}}`}):</label>
                              <Input
                                value={metaParam1}
                                onChange={(e) => setMetaParam1(e.target.value)}
                                placeholder="Nama Konsumen"
                                className="h-7 text-xs"
                              />
                            </div>
                          )}
                          {hasParam2 && (
                            <div className="space-y-1">
                              <label className="text-[10px] text-muted-foreground">Parameter 2 ({`{{2}}`}):</label>
                              <Input
                                value={metaParam2}
                                onChange={(e) => setMetaParam2(e.target.value)}
                                placeholder="Nama Produk"
                                className="h-7 text-xs"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Live Template Preview Card */}
                  {activeMetaTemplate && (
                    <div className="p-3 rounded-xl border bg-emerald-500/5 border-emerald-500/20 space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
                        <span className="flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5" />
                          Pratinjau Pesan Template Meta:
                        </span>
                        <Badge variant="outline" className="text-[9px] bg-background">
                          {activeMetaTemplate.name} ({activeMetaTemplate.category})
                        </Badge>
                      </div>

                      <div className="bg-background rounded-lg p-3 border shadow-2xs space-y-2 text-xs">
                        {/* Header */}
                        {activeMetaTemplate.components?.find((c: any) => c.type === "HEADER") && (
                          <div className="font-semibold text-foreground pb-1 border-b border-border/40">
                            {activeMetaTemplate.components.find((c: any) => c.type === "HEADER")?.text || "[Header Media]"}
                          </div>
                        )}

                        {/* Body */}
                        <p className="whitespace-pre-line text-foreground/90 leading-relaxed font-sans">
                          {(activeMetaTemplate.components?.find((c: any) => c.type === "BODY")?.text || "")
                            .replace(/{{1}}/g, metaParam1 || selectedLead.customer_name || "Pelanggan")
                            .replace(/{{2}}/g, metaParam2 || selectedLead.product_name || "Madu Araa")}
                        </p>

                        {/* Footer */}
                        {activeMetaTemplate.components?.find((c: any) => c.type === "FOOTER")?.text && (
                          <p className="text-[10px] text-muted-foreground pt-1 border-t border-border/40">
                            {activeMetaTemplate.components.find((c: any) => c.type === "FOOTER")?.text}
                          </p>
                        )}

                        {/* Buttons */}
                        {activeMetaTemplate.components?.find((c: any) => c.type === "BUTTONS")?.buttons && (
                          <div className="pt-2 border-t border-border/40 flex flex-wrap gap-1.5">
                            {activeMetaTemplate.components
                              .find((c: any) => c.type === "BUTTONS")
                              ?.buttons?.map((btn: any, idx: number) => (
                                <span
                                  key={idx}
                                  className="px-2.5 py-1 rounded-md bg-muted text-[11px] font-semibold text-primary border border-border flex items-center gap-1"
                                >
                                  {btn.text}
                                </span>
                              ))}
                          </div>
                        )}
                      </div>

                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        🛡️ Template ini telah diverifikasi & disetujui resmi oleh Meta. Aman 100% dari pemblokiran saat menyapa calon pembeli baru.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border/50">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFollowUpModalOpen(false)}
              disabled={followUpMutation.isPending}
            >
              Batal
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (!selectedLead) return;
                if (followUpMode === "meta_template") {
                  if (!activeMetaTemplate) {
                    toast.error("Pilih template resmi Meta terlebih dahulu.");
                    return;
                  }
                  const bodyComp = activeMetaTemplate.components?.find((c: any) => c.type === "BODY");
                  const bText = bodyComp?.text || "";
                  const bodyParams: string[] = [];
                  if (bText.includes("{{1}}")) bodyParams.push(metaParam1 || selectedLead.customer_name || "Pelanggan");
                  if (bText.includes("{{2}}")) bodyParams.push(metaParam2 || selectedLead.product_name || "Madu Araa");

                  followUpMutation.mutate({
                    leadId: selectedLead.id,
                    phone: selectedLead.customer_phone,
                    customerName: selectedLead.customer_name,
                    productName: selectedLead.product_name,
                    senderSession: "waba",
                    step: activeStep,
                    customMessage: `[Meta Template: ${activeMetaTemplate.name}]`,
                    template: {
                      name: activeMetaTemplate.name,
                      language: activeMetaTemplate.language,
                      bodyParameters: bodyParams.length > 0 ? bodyParams : undefined,
                    },
                  });
                } else {
                  followUpMutation.mutate({
                    leadId: selectedLead.id,
                    phone: selectedLead.customer_phone,
                    customerName: selectedLead.customer_name,
                    productName: selectedLead.product_name,
                    customMessage,
                    senderSession: selectedFollowUpSession,
                    step: activeStep,
                    mediaUrl: mediaUrl.trim() || undefined,
                  });
                }
              }}
              disabled={
                followUpMutation.isPending ||
                (followUpMode === "custom" && !customMessage.trim()) ||
                (followUpMode === "meta_template" && !activeMetaTemplate)
              }
              className={`text-white gap-1.5 font-bold shadow-xs ${
                followUpMode === "meta_template"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : activeStep === 1
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : activeStep === 2
                  ? "bg-blue-600 hover:bg-blue-700"
                  : "bg-amber-600 hover:bg-amber-700"
              }`}
            >
              {followUpMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              <span>
                {followUpMode === "meta_template"
                  ? `Kirim Template "${activeMetaTemplate?.name || 'HSM'}" via WABA`
                  : `Kirim FU ${activeStep} via ${
                      selectedFollowUpSession === "waba"
                        ? "WABA Resmi Meta"
                        : selectedFollowUpSession === "campaign"
                        ? "Slot 2"
                        : "Slot 1"
                    }`}
              </span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG 2: Sync Historical Scalev Orders */}
      <Dialog open={syncModalOpen} onOpenChange={setSyncModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <RefreshCw className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold">Tarik Data Order Scalev</DialogTitle>
                <DialogDescription className="text-xs">
                  Ambil data riwayat order dari Scalev API v3 dan otomatis cocokkan dengan database penjualan CS.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 my-2">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground">
                Jumlah Maksimal Order yang Ditarik:
              </label>
              <Select
                value={String(syncMaxOrders)}
                onValueChange={(val) => setSyncMaxOrders(Number(val))}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Pilih limit order" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25 Order Terakhir</SelectItem>
                  <SelectItem value="50">50 Order Terakhir</SelectItem>
                  <SelectItem value="100">100 Order Terakhir (Rekomendasi)</SelectItem>
                  <SelectItem value="250">250 Order Terakhir</SelectItem>
                  <SelectItem value="500">500 Order Terakhir</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl text-xs text-amber-800 dark:text-amber-300 space-y-1">
              <p className="font-semibold flex items-center gap-1">
                <Zap className="w-3.5 h-3.5" />
                Pencocokan Otomatis Real-Time:
              </p>
              <p className="text-[11px] leading-relaxed">
                Setiap order yang ditarik akan langsung dibandingkan dengan nomor WhatsApp di tabel pesanan CS. Jika cocok, otomatis ditandai status <strong>Closing (Won)</strong>.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSyncModalOpen(false)}
              disabled={syncMutation.isPending}
            >
              Batal
            </Button>
            <Button
              size="sm"
              onClick={() => syncMutation.mutate(syncMaxOrders)}
              disabled={syncMutation.isPending}
              className="bg-primary text-primary-foreground gap-1.5 font-medium"
            >
              {syncMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              <span>Mulai Sinkronisasi</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG 3: Webhook & API Settings Modal */}
      <Dialog open={configModalOpen} onOpenChange={setConfigModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Settings2 className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold">Konfigurasi Scalev & Follow-Up</DialogTitle>
                <DialogDescription className="text-xs">
                  Atur URL Webhook Scalev, API credentials, dan template WhatsApp follow-up.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 my-2 max-h-[65vh] overflow-y-auto pr-1">
            {/* Webhook URL Box */}
            <div className="space-y-1.5 p-3 rounded-xl bg-muted/60 border border-border">
              <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span>URL Webhook Scalev (Real-Time):</span>
                <span className="text-[10px] text-emerald-600 font-medium">Siap Dipakai</span>
              </label>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value="https://app.araahoney.my.id/api/scalev-webhook"
                  className="h-8 text-xs font-mono bg-background"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyWebhookUrl}
                  className="h-8 px-2.5 text-xs gap-1 shrink-0"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Salin
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">
                Tempel URL ini di <strong>Dashboard Scalev → Settings → Webhooks</strong>. Pilih event <code>order.created</code> dan <code>order.updated</code>.
              </p>
            </div>

            {/* API Key */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">API Key Secret Scalev:</label>
              <Input
                type="password"
                placeholder="sk_..."
                value={configForm.apiKey}
                onChange={(e) => setConfigForm({ ...configForm, apiKey: e.target.value })}
                className="h-8 text-xs font-mono"
              />
            </div>

            {/* Signing Secret */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Client ID:</label>
                <Input
                  placeholder="5823b649-..."
                  value={configForm.clientId}
                  onChange={(e) => setConfigForm({ ...configForm, clientId: e.target.value })}
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Signing Secret:</label>
                <Input
                  type="password"
                  placeholder="33FyqVrD2..."
                  value={configForm.signingSecret}
                  onChange={(e) => setConfigForm({ ...configForm, signingSecret: e.target.value })}
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>

            {/* WhatsApp Sender Slot */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">WhatsApp Engine Default Pengirim:</label>
              <Select
                value={configForm.senderSession}
                onValueChange={(val) => setConfigForm({ ...configForm, senderSession: val })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Pilih Slot Pengirim" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="waba">
                    🟢 WABA Resmi Meta (+62 856-4540-6949) - 100% Anti-Banned & Tombol Interaktif (Rekomendasi)
                  </SelectItem>
                  <SelectItem value="campaign">
                    Slot 2: Nomor Kampanye ({slot2Phone}) - Outreach WAHA
                  </SelectItem>
                  <SelectItem value="default">
                    Slot 1: CS Utama ({wahaInfo?.mainSession?.me?.id?.split("@")[0] || "081337324522"})
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Gunakan WABA Resmi Meta agar pesan follow-up calon pembeli aman dari pemblokiran dan dilengkapi tombol interaktif otomatis.
              </p>
            </div>

            {/* Follow-Up Templates & Media Configuration (Step 1, 2, 3) */}
            <div className="space-y-2 pt-1 border-t border-border/60">
              <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span>Template & Media Follow-Up Bertahap:</span>
                <span className="text-[10px] text-muted-foreground">Pesan & flyer per tahap</span>
              </label>

              {/* Tabs FU 1 / FU 2 / FU 3 */}
              <div className="flex rounded-lg bg-muted p-0.5 gap-1 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setConfigTemplateTab("fu1")}
                  className={`flex-1 py-1 px-2 rounded-md transition-all ${
                    configTemplateTab === "fu1"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  1️⃣ FU 1 (Sapaan)
                </button>
                <button
                  type="button"
                  onClick={() => setConfigTemplateTab("fu2")}
                  className={`flex-1 py-1 px-2 rounded-md transition-all ${
                    configTemplateTab === "fu2"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  2️⃣ FU 2 (Edukasi)
                </button>
                <button
                  type="button"
                  onClick={() => setConfigTemplateTab("fu3")}
                  className={`flex-1 py-1 px-2 rounded-md transition-all ${
                    configTemplateTab === "fu3"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  3️⃣ FU 3 (Final Call)
                </button>
              </div>

              {/* Tab 1 Content: FU 1 */}
              {configTemplateTab === "fu1" && (
                <div className="space-y-2 p-2.5 rounded-xl border bg-muted/20">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                      <Image className="w-3.5 h-3.5 text-primary" />
                      <span>Link Gambar / Video Default FU 1 (Opsional):</span>
                    </label>
                    <Input
                      type="url"
                      placeholder="https://.../flyer-sapaan.jpg"
                      value={configForm.fu1MediaUrl}
                      onChange={(e) => setConfigForm({ ...configForm, fu1MediaUrl: e.target.value })}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-foreground">Template Pesan FU 1:</label>
                    <Textarea
                      rows={4}
                      value={configForm.fu1Template}
                      onChange={(e) => setConfigForm({ ...configForm, fu1Template: e.target.value })}
                      className="text-xs resize-none"
                      placeholder="Halo Kak {nama}..."
                    />
                  </div>
                </div>
              )}

              {/* Tab 2 Content: FU 2 */}
              {configTemplateTab === "fu2" && (
                <div className="space-y-2 p-2.5 rounded-xl border bg-muted/20">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                      <Image className="w-3.5 h-3.5 text-primary" />
                      <span>Link Gambar / Video Default FU 2 (Opsional):</span>
                    </label>
                    <Input
                      type="url"
                      placeholder="https://.../video-panen.mp4 atau /testimoni.jpg"
                      value={configForm.fu2MediaUrl}
                      onChange={(e) => setConfigForm({ ...configForm, fu2MediaUrl: e.target.value })}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-foreground">Template Pesan FU 2:</label>
                    <Textarea
                      rows={4}
                      value={configForm.fu2Template}
                      onChange={(e) => setConfigForm({ ...configForm, fu2Template: e.target.value })}
                      className="text-xs resize-none"
                      placeholder="Halo Kak {nama}, pesanan {produk} masih kami amankan..."
                    />
                  </div>
                </div>
              )}

              {/* Tab 3 Content: FU 3 */}
              {configTemplateTab === "fu3" && (
                <div className="space-y-2 p-2.5 rounded-xl border bg-muted/20">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                      <Image className="w-3.5 h-3.5 text-primary" />
                      <span>Link Gambar / Video Default FU 3 (Opsional):</span>
                    </label>
                    <Input
                      type="url"
                      placeholder="https://.../urgency-flyer.jpg"
                      value={configForm.fu3MediaUrl}
                      onChange={(e) => setConfigForm({ ...configForm, fu3MediaUrl: e.target.value })}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-foreground">Template Pesan FU 3:</label>
                    <Textarea
                      rows={4}
                      value={configForm.fu3Template}
                      onChange={(e) => setConfigForm({ ...configForm, fu3Template: e.target.value })}
                      className="text-xs resize-none"
                      placeholder="Pemberitahuan Terakhir untuk Kak {nama}..."
                    />
                  </div>
                </div>
              )}

              <p className="text-[11px] text-muted-foreground">
                Variabel yang didukung: <code>{'{nama}'}</code>, <code>{'{produk}'}</code>, <code>{'{order_id}'}</code>.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfigModalOpen(false)}
              disabled={saveConfigMutation.isPending}
            >
              Batal
            </Button>
            <Button
              size="sm"
              onClick={() => saveConfigMutation.mutate(configForm)}
              disabled={saveConfigMutation.isPending}
              className="bg-primary text-primary-foreground font-medium gap-1.5"
            >
              {saveConfigMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              <span>Simpan Konfigurasi</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Manual Closing / Link Order */}
      <Dialog open={!!manualClosingLead} onOpenChange={(open) => !open && setManualClosingLead(null)}>
        <DialogContent className="max-w-md sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-emerald-600" />
              Kelola Status Closing Lead
            </DialogTitle>
            <DialogDescription className="text-xs">
              Tandai lead ini sebagai Closing (Won) jika konsumen memesan lewat chat WA dengan nomor HP yang berbeda.
            </DialogDescription>
          </DialogHeader>

          {manualClosingLead && (
            <div className="space-y-4 my-2 text-xs">
              {/* Card Info Lead */}
              <div className="p-3 rounded-xl bg-muted/60 border border-border space-y-1">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-foreground text-sm">{manualClosingLead.customer_name || "Pelanggan Scalev"}</p>
                    <p className="font-mono text-muted-foreground">{manualClosingLead.customer_phone}</p>
                  </div>
                  <Badge variant={manualClosingLead.is_closed ? "default" : "outline"} className={`text-[10px] ${manualClosingLead.is_closed ? "bg-emerald-600 text-white" : "border-rose-300 text-rose-600"}`}>
                    {manualClosingLead.is_closed ? "Closing (Won)" : "Belum Closing"}
                  </Badge>
                </div>
                <div className="flex justify-between text-muted-foreground pt-1.5 border-t border-border/50 text-[11px]">
                  <span>Produk: <strong className="text-foreground">{manualClosingLead.product_name || "Madu Araa"}</strong></span>
                  <span>Nominal: <strong className="text-emerald-600 font-semibold">{formatIDR(manualClosingLead.gross_revenue || 0)}</strong></span>
                </div>
              </div>

              {/* If already closed */}
              {manualClosingLead.is_closed ? (
                <div className="p-3.5 rounded-xl border border-rose-200 bg-rose-50/60 dark:bg-rose-950/20 space-y-2">
                  <p className="font-medium text-rose-700 dark:text-rose-300">
                    Lead ini saat ini tercatat sebagai <strong>Closing (Won)</strong>.
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Jika pesanan ini batal atau salah tandai, Kakak bisa mengembalikannya ke status Belum Closing.
                  </p>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleCancelClosing}
                    disabled={manualClosingMutation.isPending}
                    className="w-full h-8 text-xs font-semibold gap-1.5"
                  >
                    {manualClosingMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <AlertCircle className="w-3.5 h-3.5" />}
                    Batalkan Status Closing (Kembalikan ke Belum Closing)
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Option 1: 1-Click Fast Closing */}
                  <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-emerald-800 dark:text-emerald-300">Opsi 1: Closing Cepat (1-Klik)</span>
                      <span className="text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded-full font-bold">Rekomendasi</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Langsung tandai Closing tanpa perlu mencari faktur penjualan. Nominal Rp {formatIDR(manualClosingLead.gross_revenue || 0)} akan otomatis terhitung ke omzet closing hari ini.
                    </p>
                    <Button
                      size="sm"
                      onClick={handleQuickMarkWon}
                      disabled={manualClosingMutation.isPending}
                      className="w-full h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5"
                    >
                      {manualClosingMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      Tandai Closing (Won) Langsung
                    </Button>
                  </div>

                  {/* Option 2: Link to Order in Penjualan */}
                  <div className="p-3 rounded-xl border border-border bg-card space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">Opsi 2: Tautkan ke Faktur Penjualan CS</span>
                      <span className="text-[10px] text-muted-foreground">Jika No. HP di WA Beda</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Cari faktur order di bagian Penjualan yang dibuat oleh CS untuk konsumen ini:
                    </p>

                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                      <Input
                        value={searchOrderQuery}
                        onChange={(e) => setSearchOrderQuery(e.target.value)}
                        placeholder="Ketik nama pembeli, no HP di WA, atau no resi..."
                        className="h-8 pl-8 text-xs"
                      />
                    </div>

                    {/* Order Search Results */}
                    <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 border border-border/40 rounded-lg p-1">
                      {isSearchingOrders ? (
                        <div className="py-4 text-center text-muted-foreground text-xs flex items-center justify-center gap-1.5">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Mencari faktur penjualan...
                        </div>
                      ) : (searchOrderResults || []).length === 0 ? (
                        <div className="py-3 text-center text-muted-foreground text-[11px]">
                          Tidak ada pesanan penjualan yang cocok dengan kata kunci &quot;{searchOrderQuery}&quot;.
                        </div>
                      ) : (
                        (searchOrderResults || []).map((ord: any) => {
                          const isSelected = selectedOrderToLink?.id === ord.id;
                          return (
                            <div
                              key={ord.id}
                              onClick={() => setSelectedOrderToLink(ord)}
                              className={`p-2 rounded-md border cursor-pointer transition-colors flex items-center justify-between text-xs ${
                                isSelected
                                  ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40"
                                  : "border-border/60 hover:bg-muted/40"
                              }`}
                            >
                              <div>
                                <p className="font-semibold text-foreground">{ord.customer_name || "Tanpa Nama"}</p>
                                <p className="text-[11px] text-muted-foreground font-mono">
                                  {ord.customer_phone || "-"} {ord.tracking_number ? `• Resi: ${ord.tracking_number}` : ""}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="font-bold text-emerald-600">{formatIDR(ord.subtotal_gross || 0)}</p>
                                <p className="text-[10px] text-muted-foreground">{formatDateIndo(ord.created_at)}</p>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {selectedOrderToLink && (
                      <Button
                        size="sm"
                        onClick={handleLinkOrderAndMarkWon}
                        disabled={manualClosingMutation.isPending}
                        className="w-full h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold gap-1.5 mt-1"
                      >
                        {manualClosingMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckSquare className="w-3.5 h-3.5" />}
                        Tautkan Faktur Ini & Tandai Closing
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setManualClosingLead(null)}>
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 5. Modal Edit Nomor HP Pelanggan */}
      <Dialog open={editPhoneModalOpen} onOpenChange={setEditPhoneModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                <Pencil className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold">Ubah Nomor WhatsApp Pelanggan</DialogTitle>
                <DialogDescription className="text-xs">
                  Perbaiki kesalahan input nomor telepon dari landing page agar data selaras dengan chat riil.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {leadToEditPhone && (
            <div className="space-y-4 py-2">
              {/* Info Ringkas Pelanggan */}
              <div className="p-3 rounded-xl bg-muted/60 border border-border text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nama:</span>
                  <span className="font-semibold text-foreground">{leadToEditPhone.customer_name || "Pelanggan Scalev"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ID Scalev:</span>
                  <span className="font-mono text-muted-foreground">{leadToEditPhone.scalev_order_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nomor Saat Ini:</span>
                  <span className="font-mono text-muted-foreground">{leadToEditPhone.customer_phone || "-"}</span>
                </div>
              </div>

              {/* Input Nomor Baru */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-amber-500" />
                  Nomor WhatsApp Baru
                </label>
                <Input
                  type="tel"
                  value={newPhoneInput}
                  onChange={(e) => setNewPhoneInput(e.target.value)}
                  placeholder="Contoh: 08123456789 atau 628123456789"
                  className="font-mono text-sm"
                  autoFocus
                />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Bisa diawali <span className="font-mono text-foreground font-semibold">08...</span> atau <span className="font-mono text-foreground font-semibold">628...</span>. Sistem akan otomatis menormalkan ke format standar.
                </p>
              </div>

              {/* Catatan Otomatisasi */}
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs space-y-1">
                <p className="font-semibold flex items-center gap-1.5 text-xs">
                  <Zap className="w-3.5 h-3.5 text-emerald-600" />
                  Pencocokan Otomatis Penjualan:
                </p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Jika nomor baru ini sudah tercatat pernah membuat pesanan di menu <b>Penjualan</b>, sistem akan langsung menandai lead ini sebagai <b>Closing (Won) Auto</b>!
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditPhoneModalOpen(false)}
              disabled={updatePhoneMutation.isPending}
            >
              Batal
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (!leadToEditPhone) return;
                const clean = newPhoneInput.replace(/[^0-9]/g, "");
                if (clean.length < 9) {
                  toast.error("Nomor telepon tidak valid. Minimal 9 angka.");
                  return;
                }
                updatePhoneMutation.mutate({
                  leadId: leadToEditPhone.id,
                  newPhone: newPhoneInput,
                });
              }}
              disabled={updatePhoneMutation.isPending || !newPhoneInput.trim()}
              className="bg-amber-500 hover:bg-amber-600 text-white font-semibold flex items-center gap-1.5"
            >
              {updatePhoneMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Simpan Nomor HP
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG KONFIRMASI HAPUS LEAD (SINGLE ATAU MASSAL) */}
      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <Trash2 className="w-5 h-5" />
              <span>{leadToDelete ? "Hapus Lead Scalev" : `Hapus ${selectedLeadIds.length} Lead Terpilih`}</span>
            </DialogTitle>
            <DialogDescription className="text-xs pt-1.5 leading-relaxed text-muted-foreground">
              {leadToDelete ? (
                <>
                  Apakah Anda yakin ingin menghapus lead atas nama{" "}
                  <strong className="text-foreground">{leadToDelete.customer_name || "Pelanggan"}</strong>{" "}
                  (<span className="font-mono text-foreground">{leadToDelete.customer_phone}</span>)?
                  <br /><br />
                  Data lead ini akan dihapus permanen dari sistem. Tindakan ini tidak dapat dibatalkan.
                </>
              ) : (
                <>
                  Apakah Anda yakin ingin menghapus massal{" "}
                  <strong className="text-rose-600 font-bold">{selectedLeadIds.length} lead</strong> yang telah dicentang?
                  <br /><br />
                  Semua data lead yang dipilih akan dihapus permanen dari sistem. Tindakan ini tidak dapat dibatalkan.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="flex items-center justify-end gap-2 pt-3 border-t">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDeleteModalOpen(false)}
              disabled={isDeleting}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleExecuteDelete}
              disabled={isDeleting}
              className="gap-1.5 font-semibold shadow-xs"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Menghapus...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{leadToDelete ? "Ya, Hapus Lead" : `Ya, Hapus (${selectedLeadIds.length})`}</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

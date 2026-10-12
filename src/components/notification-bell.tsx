import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Plus,
  MessageSquare,
  Trash2,
  User,
  Phone,
  Check,
  RotateCcw,
  Sparkles,
  ExternalLink,
  Loader2,
  CalendarClock
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { useAuth } from "@/lib/auth-context";
import {
  getPendingRemindersCount,
  getFollowupReminders,
  createFollowupReminder,
  updateFollowupReminderStatus,
  deleteFollowupReminder,
  FollowupReminderItem,
} from "@/lib/reminders-and-notes.functions";
import { toast } from "sonner";

export function NotificationBell() {
  const queryClient = useQueryClient();
  const { user, role } = useAuth();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"today" | "upcoming" | "completed">("today");
  const [dialogOpen, setDialogOpen] = useState(false);

  // Form states for creating a new reminder
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [reminderDate, setReminderDate] = useState("");
  const [reminderTime, setReminderTime] = useState("09:00");
  const [notes, setNotes] = useState("");

  // Default reminder date to tomorrow or today
  useEffect(() => {
    if (!reminderDate) {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      setReminderDate(`${yyyy}-${mm}-${dd}`);
    }
  }, [reminderDate]);

  // 1. Query Counts for Bell Badge
  const { data: counts } = useQuery({
    queryKey: ["pending-reminders-count"],
    queryFn: async () => {
      return await getPendingRemindersCount();
    },
    refetchInterval: 15000, // Check every 15s
  });

  const dueOrOverdueCount = counts?.dueOrOverdueCount || 0;
  const overdueCount = counts?.overdueCount || 0;

  // 2. Query Reminders list based on active tab
  const { data: remindersData, isLoading: isLoadingList, refetch: refetchList } = useQuery({
    queryKey: ["followup-reminders-list", activeTab],
    queryFn: async () => {
      const res = await getFollowupReminders({ data: { filter: activeTab } });
      return res.reminders;
    },
    enabled: popoverOpen,
    refetchInterval: popoverOpen ? 10000 : false,
  });

  const reminders: FollowupReminderItem[] = remindersData || [];

  // 3. Create Reminder Mutation
  const createMutation = useMutation({
    mutationFn: () =>
      createFollowupReminder({
        data: {
          customer_name: customerName,
          customer_phone: customerPhone,
          reminder_date: reminderDate,
          reminder_time: reminderTime || "09:00",
          notes,
          created_by: user?.user_metadata?.full_name || (role === "owner" ? "Big Bos" : "CS"),
        },
      }),
    onSuccess: () => {
      toast.success("Jadwal pengingat konsumen berhasil dibuat! 🔔");
      setDialogOpen(false);
      setCustomerName("");
      setCustomerPhone("");
      setNotes("");
      queryClient.invalidateQueries({ queryKey: ["pending-reminders-count"] });
      queryClient.invalidateQueries({ queryKey: ["followup-reminders-list"] });
    },
    onError: (err: any) => {
      toast.error(`Gagal membuat pengingat: ${err.message}`);
    },
  });

  // 4. Update Status Mutation (Mark complete / Reopen)
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "pending" | "completed" | "cancelled" }) =>
      updateFollowupReminderStatus({ data: { id, status } }),
    onSuccess: (_, vars) => {
      if (vars.status === "completed") {
        toast.success("Pengingat ditandai selesai! ✅");
      } else {
        toast.info("Pengingat dibuka kembali.");
      }
      queryClient.invalidateQueries({ queryKey: ["pending-reminders-count"] });
      queryClient.invalidateQueries({ queryKey: ["followup-reminders-list"] });
    },
    onError: (err: any) => {
      toast.error(`Gagal mengubah status: ${err.message}`);
    },
  });

  // 5. Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFollowupReminder({ data: { id } }),
    onSuccess: () => {
      toast.success("Pengingat berhasil dihapus.");
      queryClient.invalidateQueries({ queryKey: ["pending-reminders-count"] });
      queryClient.invalidateQueries({ queryKey: ["followup-reminders-list"] });
    },
    onError: (err: any) => {
      toast.error(`Gagal menghapus: ${err.message}`);
    },
  });

  const handleOpenWhatsApp = (phone: string, name: string, noteText: string) => {
    let clean = phone.replace(/[^0-9]/g, "");
    if (clean.startsWith("0")) clean = "62" + clean.slice(1);
    else if (clean.startsWith("8")) clean = "62" + clean;

    const message = encodeURIComponent(
      `Halo Kak ${name} 👋 Salam hangat dari Araa Honey 🍯✨\n\nMenindaklanjuti rencana pemesanan madu yang sempat Kakak infokan kemarin: "${noteText}".\n\nApakah stok madunya mau kami siapkan hari ini Kak? Kami bantu proses pengirimannya ya 😊`
    );

    window.open(`https://wa.me/${clean}?text=${message}`, "_blank");
  };

  const getRelativeDateLabel = (dateStr: string) => {
    const today = new Date();
    const target = new Date(dateStr);
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);

    const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return { label: "Hari ini", isToday: true, isOverdue: false };
    if (diffDays === 1) return { label: "Besok", isToday: false, isOverdue: false };
    if (diffDays === -1) return { label: "Kemarin (Terlewat)", isToday: false, isOverdue: true };
    if (diffDays < -1) return { label: `Terlewat ${Math.abs(diffDays)} hari`, isToday: false, isOverdue: true };
    return { label: dateStr, isToday: false, isOverdue: false };
  };

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg"
            title="Notifikasi & Pengingat Jadwal Konsumen"
          >
            <Bell className="h-4 w-4" />
            
            {/* Dynamic Notification Badge */}
            {dueOrOverdueCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-red-600 text-white text-[10px] font-extrabold shadow-xs">
                {overdueCount > 0 && (
                  <span className="animate-ping absolute inset-0 rounded-full bg-red-400 opacity-60"></span>
                )}
                <span className="relative">{dueOrOverdueCount > 99 ? "99+" : dueOrOverdueCount}</span>
              </span>
            )}
          </Button>
        </PopoverTrigger>

        <PopoverContent
          align="end"
          className="w-[370px] sm:w-[420px] p-0 rounded-2xl shadow-2xl border-border bg-card overflow-hidden"
        >
          {/* Header */}
          <div className="p-4 bg-muted/40 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
                <CalendarClock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5 leading-snug">
                  Pengingat & Notifikasi 🔔
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Jadwal janji follow-up konsumen WhatsApp
                </p>
              </div>
            </div>

            <Button
              size="sm"
              onClick={() => {
                setDialogOpen(true);
                setPopoverOpen(false);
              }}
              className="h-8 px-2.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold gap-1 rounded-lg shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Jadwal Baru</span>
            </Button>
          </div>

          {/* Sub Navigation Tabs */}
          <div className="flex border-b border-border bg-muted/20 p-1.5 gap-1 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab("today")}
              className={`flex-1 py-1 px-2 rounded-md font-bold text-[11px] transition-all flex items-center justify-center gap-1.5 ${
                activeTab === "today"
                  ? "bg-background text-foreground shadow-xs border border-border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>Jatuh Tempo</span>
              {dueOrOverdueCount > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-extrabold px-1.5 py-0.2 rounded-full">
                  {dueOrOverdueCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("upcoming")}
              className={`flex-1 py-1 px-2 rounded-md font-bold text-[11px] transition-all flex items-center justify-center gap-1.5 ${
                activeTab === "upcoming"
                  ? "bg-background text-foreground shadow-xs border border-border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>Mendatang</span>
              {(counts?.upcomingCount || 0) > 0 && (
                <span className="bg-amber-500/20 text-amber-700 dark:text-amber-400 text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                  {counts?.upcomingCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("completed")}
              className={`flex-1 py-1 px-2 rounded-md font-bold text-[11px] transition-all ${
                activeTab === "completed"
                  ? "bg-background text-foreground shadow-xs border border-border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>Selesai</span>
            </button>
          </div>

          {/* List Content */}
          <div className="max-h-[360px] overflow-y-auto p-3 space-y-2.5">
            {isLoadingList ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mb-2" />
                <span className="text-xs">Memuat daftar pengingat...</span>
              </div>
            ) : reminders.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground space-y-2">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto text-muted-foreground">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <p className="text-xs font-medium">
                  {activeTab === "today"
                    ? "Tidak ada janji follow-up konsumen yang jatuh tempo hari ini!"
                    : activeTab === "upcoming"
                    ? "Belum ada jadwal follow-up mendatang."
                    : "Belum ada riwayat pengingat selesai."}
                </p>
                {activeTab === "today" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDialogOpen(true);
                      setPopoverOpen(false);
                    }}
                    className="text-xs h-7 text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700"
                  >
                    + Buat Pengingat Konsumen
                  </Button>
                )}
              </div>
            ) : (
              reminders.map((rem) => {
                const dateInfo = getRelativeDateLabel(rem.reminder_date);
                return (
                  <div
                    key={rem.id}
                    className={`p-3 rounded-xl border transition-all ${
                      rem.status === "completed"
                        ? "bg-muted/30 border-border opacity-70"
                        : dateInfo.isOverdue
                        ? "bg-red-500/5 border-red-500/30 hover:border-red-500/50"
                        : "bg-card border-border hover:border-amber-400/50 shadow-2xs"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-foreground">
                            {rem.customer_name}
                          </span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {rem.customer_phone}
                          </span>
                        </div>

                        {/* Status Badge */}
                        <div className="flex items-center gap-1.5 mt-1">
                          {rem.status === "completed" ? (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                              ✓ Selesai
                            </Badge>
                          ) : dateInfo.isOverdue ? (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0 animate-pulse">
                              ⚠️ {dateInfo.label}
                            </Badge>
                          ) : dateInfo.isToday ? (
                            <Badge variant="default" className="bg-amber-500 text-white text-[10px] px-1.5 py-0">
                              🔥 Hari Ini • {rem.reminder_time}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                              📅 {rem.reminder_date} • {rem.reminder_time}
                            </Badge>
                          )}
                          <span className="text-[9.5px] text-muted-foreground">
                            by: {rem.created_by}
                          </span>
                        </div>

                        {/* Note Description */}
                        <p className="text-xs text-foreground/90 mt-2 bg-muted/40 p-2 rounded-lg border border-border/50 leading-relaxed font-sans">
                          💬 {rem.notes}
                        </p>
                      </div>

                      {/* Action Tools */}
                      <div className="flex flex-col gap-1 shrink-0 pt-0.5">
                        {rem.status === "pending" ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenWhatsApp(rem.customer_phone, rem.customer_name, rem.notes)}
                              className="h-7 px-2 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white border-none gap-1 font-semibold shadow-xs"
                              title="Kirim pesan follow-up via WhatsApp"
                            >
                              <MessageSquare className="w-3 h-3" />
                              <span>Chat</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateStatusMutation.mutate({ id: rem.id, status: "completed" })}
                              className="h-7 px-2 text-[11px] text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800"
                              title="Tandai sudah selesai di-follow up"
                            >
                              <Check className="w-3 h-3 mr-1" /> Selesai
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => updateStatusMutation.mutate({ id: rem.id, status: "pending" })}
                            className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                            title="Buka kembali pengingat ini"
                          >
                            <RotateCcw className="w-3 h-3 mr-1" /> Re-open
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            if (confirm(`Hapus pengingat untuk ${rem.customer_name}?`)) {
                              deleteMutation.mutate(rem.id);
                            }
                          }}
                          className="h-6 w-6 text-muted-foreground hover:text-destructive self-end"
                          title="Hapus"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* CREATE REMINDER DIALOG MODAL */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[440px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <CalendarClock className="w-5 h-5 text-amber-500" />
              <span>Jadwalkan Pengingat Konsumen WA</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Catat janji order konsumen (misal: order saat gajian / tanggal muda). Sistem akan memunculkan alarm notifikasi di lonceng saat tanggalnya tiba.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!customerName.trim() || !customerPhone.trim() || !notes.trim()) {
                toast.error("Mohon lengkapi Nama, No. WhatsApp, dan Catatan Janji!");
                return;
              }
              createMutation.mutate();
            }}
            className="space-y-3.5 py-1"
          >
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Nama Konsumen *</Label>
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Contoh: Pak Budi Santoso"
                className="text-xs h-9"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Nomor WhatsApp *</Label>
              <Input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="Contoh: 081234567890"
                className="text-xs h-9 font-mono"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Tanggal Follow-Up *</Label>
                <Input
                  type="date"
                  value={reminderDate}
                  onChange={(e) => setReminderDate(e.target.value)}
                  className="text-xs h-9"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Jam Pengingat</Label>
                <Input
                  type="time"
                  value={reminderTime}
                  onChange={(e) => setReminderTime(e.target.value)}
                  className="text-xs h-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Catatan Janji / Kebutuhan *</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Contoh: Janji order 2 kg Madu Randu pas gajian tanggal 25, minta promo gratis travel botol."
                className="text-xs min-h-[85px] leading-relaxed resize-none"
                required
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDialogOpen(false)}
                className="text-xs"
              >
                Batal
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={createMutation.isPending}
                className="bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs gap-1"
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  <>
                    <CalendarClock className="w-3.5 h-3.5" />
                    <span>Simpan Jadwal Pengingat</span>
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

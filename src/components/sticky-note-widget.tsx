import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  StickyNote, 
  Minus, 
  Maximize2, 
  Save, 
  Plus, 
  Trash2, 
  CheckSquare, 
  Square, 
  Clock, 
  User, 
  RefreshCw,
  Sparkles,
  ListTodo,
  FileText
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { useAuth } from "@/lib/auth-context";
import { 
  getStickyNote, 
  updateStickyNote, 
  StickyChecklistItem, 
  StickyNoteData 
} from "@/lib/reminders-and-notes.functions";
import { toast } from "sonner";

export function StickyNoteWidget() {
  const queryClient = useQueryClient();
  const { user, role } = useAuth();
  const [isMinimized, setIsMinimized] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<"memo" | "checklist">("memo");
  
  // Local edit states
  const [content, setContent] = useState<string>("");
  const [items, setItems] = useState<StickyChecklistItem[]>([]);
  const [newItemText, setNewItemText] = useState<string>("");
  const [authorName, setAuthorName] = useState<string>("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);

  // Initialize author name from user session
  useEffect(() => {
    if (user?.user_metadata?.full_name) {
      setAuthorName(user.user_metadata.full_name);
    } else if (role === "owner") {
      setAuthorName("Big Bos");
    } else if (user?.email) {
      setAuthorName(user.email.split("@")[0]);
    } else {
      setAuthorName("CS Araa");
    }
  }, [user, role]);

  // Load minimized state preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("araa_sticky_note_minimized");
    if (saved !== null) {
      setIsMinimized(saved === "true");
    }
  }, []);

  const toggleMinimize = (min: boolean) => {
    setIsMinimized(min);
    localStorage.setItem("araa_sticky_note_minimized", min ? "true" : "false");
  };

  // Query sticky note data
  const { data: note, isLoading, refetch } = useQuery<StickyNoteData>({
    queryKey: ["sticky-note-latest"],
    queryFn: async () => {
      const res = await getStickyNote();
      return res;
    },
    refetchInterval: 30000, // Poll every 30s for collaborative 2-way sync
  });

  // Sync server note to local state when loaded
  useEffect(() => {
    if (note && !hasUnsavedChanges) {
      setContent(note.content || "");
      setItems(note.items || []);
    }
  }, [note, hasUnsavedChanges]);

  // Mutation to save sticky note
  const updateMutation = useMutation({
    mutationFn: (payload: { content: string; items: StickyChecklistItem[]; author: string }) =>
      updateStickyNote({
        data: {
          id: note?.id,
          content: payload.content,
          items: payload.items,
          author_name: payload.author || authorName || "CS",
          author_role: role || "staff",
        },
      }),
    onSuccess: (res: any) => {
      toast.success("Catatan harian berhasil disimpan! ✨");
      setHasUnsavedChanges(false);
      if (res?.note) {
        queryClient.setQueryData(["sticky-note-latest"], res.note);
      }
    },
    onError: (err: any) => {
      toast.error(`Gagal menyimpan catatan: ${err.message}`);
    },
  });

  const handleSave = () => {
    updateMutation.mutate({
      content,
      items,
      author: authorName,
    });
  };

  // Checklist handlers
  const handleToggleCheck = (itemId: string) => {
    const updated = items.map((it) =>
      it.id === itemId ? { ...it, completed: !it.completed } : it
    );
    setItems(updated);
    setHasUnsavedChanges(true);

    // Auto-save toggle immediately for smooth UX
    updateMutation.mutate({
      content,
      items: updated,
      author: authorName,
    });
  };

  const handleAddItem = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newItemText.trim()) return;

    const newItem: StickyChecklistItem = {
      id: Date.now().toString(),
      text: newItemText.trim(),
      completed: false,
      created_by: authorName || "CS",
      created_at: new Date().toISOString(),
    };

    const updated = [...items, newItem];
    setItems(updated);
    setNewItemText("");
    setHasUnsavedChanges(true);

    updateMutation.mutate({
      content,
      items: updated,
      author: authorName,
    });
  };

  const handleDeleteItem = (itemId: string) => {
    const updated = items.filter((it) => it.id !== itemId);
    setItems(updated);
    setHasUnsavedChanges(true);

    updateMutation.mutate({
      content,
      items: updated,
      author: authorName,
    });
  };

  const pendingItemsCount = items.filter((i) => !i.completed).length;

  // Format updated time
  const formatTime = (iso?: string) => {
    if (!iso) return "Baru saja";
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) + " WIB";
    } catch {
      return "Baru saja";
    }
  };

  return (
    <aside aria-label="Papan Catatan Harian" className="fixed bottom-5 right-5 z-40 print:hidden">
      {/* 1. MINIMIZED FLOATING BUTTON */}
      {isMinimized ? (
        <button
          type="button"
          onClick={() => toggleMinimize(false)}
          className="group relative flex items-center gap-2.5 px-3.5 py-2.5 rounded-full bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white shadow-xl shadow-amber-900/40 hover:scale-105 active:scale-95 transition-all border border-amber-300/40 cursor-pointer"
          title="Buka Papan Catatan Harian CS & Tim"
        >
          <div className="relative">
            <StickyNote className="w-5 h-5 text-amber-100 group-hover:rotate-12 transition-transform" />
            {pendingItemsCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
              </span>
            )}
          </div>
          <div className="flex flex-col text-left pr-1">
            <span className="text-[12px] font-bold tracking-tight text-white leading-none">
              Catatan Harian
            </span>
            <span className="text-[10px] text-amber-100/90 font-medium leading-none mt-0.5">
              {pendingItemsCount > 0 ? `${pendingItemsCount} checklist aktif` : "Buka memo"}
            </span>
          </div>
        </button>
      ) : (
        /* 2. EXPANDED STICKY NOTE CARD */
        <div className="w-[360px] sm:w-[390px] rounded-2xl bg-amber-50 dark:bg-zinc-900 border-2 border-amber-400/80 dark:border-amber-600/60 shadow-2xl shadow-amber-950/30 overflow-hidden flex flex-col transition-all animate-in fade-in slide-in-from-bottom-5 duration-200">
          
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 dark:from-amber-600 dark:to-amber-800 text-amber-950 dark:text-white px-4 py-3 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-lg bg-white/30 dark:bg-black/20 text-amber-900 dark:text-white">
                <StickyNote className="w-4 h-4" />
              </span>
              <div>
                <h2 className="text-[13px] font-bold leading-tight flex items-center gap-1.5 text-zinc-950 dark:text-white">
                  Papan Catatan CS & Tim 🍯
                </h2>
                <div className="text-[10.5px] text-amber-950/80 dark:text-amber-200/90 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>Update: {formatTime(note?.updated_at)}</span>
                  <span>•</span>
                  <span className="font-semibold">{note?.author_name || "Admin"}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => refetch()}
                className="h-7 w-7 text-amber-950 dark:text-white hover:bg-white/20 rounded-lg"
                title="Muat ulang catatan terbaru"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => toggleMinimize(true)}
                className="h-7 w-7 text-amber-950 dark:text-white hover:bg-white/20 rounded-lg"
                title="Kecilkan catatan (Minimize)"
              >
                <Minus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Navigation Sub-Tabs */}
          <div className="flex border-b border-amber-200/80 dark:border-zinc-800 bg-amber-100/50 dark:bg-zinc-800/40 p-1 gap-1">
            <button
              type="button"
              onClick={() => setActiveTab("memo")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${
                activeTab === "memo"
                  ? "bg-white dark:bg-zinc-900 text-amber-900 dark:text-amber-400 shadow-xs border border-amber-200 dark:border-zinc-700"
                  : "text-amber-800/70 dark:text-zinc-400 hover:text-amber-900 dark:hover:text-white"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Memo Harian</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("checklist")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${
                activeTab === "checklist"
                  ? "bg-white dark:bg-zinc-900 text-amber-900 dark:text-amber-400 shadow-xs border border-amber-200 dark:border-zinc-700"
                  : "text-amber-800/70 dark:text-zinc-400 hover:text-amber-900 dark:hover:text-white"
              }`}
            >
              <ListTodo className="w-3.5 h-3.5" />
              <span>Checklist Tugas</span>
              {pendingItemsCount > 0 && (
                <span className="bg-amber-500 text-white text-[10px] font-extrabold px-1.5 py-0.2 rounded-full">
                  {pendingItemsCount}
                </span>
              )}
            </button>
          </div>

          {/* Body Content */}
          <div className="p-3.5 max-h-[340px] overflow-y-auto">
            {activeTab === "memo" ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] text-amber-900/70 dark:text-zinc-400 px-1">
                  <span>💡 Info stok, promo, dan instruksi harian:</span>
                  {hasUnsavedChanges && (
                    <span className="text-amber-600 dark:text-amber-400 font-bold animate-pulse">
                      ● Ada perubahan
                    </span>
                  )}
                </div>
                <Textarea
                  value={content}
                  onChange={(e) => {
                    setContent(e.target.value);
                    setHasUnsavedChanges(true);
                  }}
                  placeholder="Ketik memo atau update hari ini di sini... (Bisa diedit oleh Big Bos maupun CS)"
                  className="min-h-[160px] text-xs leading-relaxed bg-amber-50/50 dark:bg-zinc-950/60 border-amber-200 dark:border-zinc-700 focus-visible:ring-amber-500 resize-none font-sans"
                />
              </div>
            ) : (
              <div className="space-y-3">
                {/* Add new checklist item form */}
                <form onSubmit={handleAddItem} className="flex gap-1.5">
                  <Input
                    value={newItemText}
                    onChange={(e) => setNewItemText(e.target.value)}
                    placeholder="Tambah checklist tugas baru..."
                    className="text-xs h-8 bg-white dark:bg-zinc-950 border-amber-200 dark:border-zinc-700 focus-visible:ring-amber-500"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    className="h-8 px-2.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shrink-0"
                    disabled={!newItemText.trim()}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" /> Tambah
                  </Button>
                </form>

                {/* Checklist list */}
                <div className="space-y-1.5 mt-2">
                  {items.length === 0 ? (
                    <div className="text-center py-6 text-xs text-amber-800/60 dark:text-zinc-500">
                      Belum ada checklist tugas hari ini. Silakan tambah tugas di atas.
                    </div>
                  ) : (
                    items.map((it) => (
                      <div
                        key={it.id}
                        className={`group flex items-start justify-between gap-2 p-2 rounded-lg text-xs transition-all border ${
                          it.completed
                            ? "bg-amber-100/40 dark:bg-zinc-800/20 border-amber-200/50 dark:border-zinc-800 text-muted-foreground line-through"
                            : "bg-white dark:bg-zinc-800/60 border-amber-200/80 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-2xs"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleToggleCheck(it.id)}
                          className="mt-0.5 text-amber-600 dark:text-amber-400 hover:scale-110 transition-transform shrink-0"
                        >
                          {it.completed ? (
                            <CheckSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <Square className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                          )}
                        </button>
                        <div className="flex-1 min-w-0 break-words leading-snug">
                          <span>{it.text}</span>
                          {it.created_by && (
                            <span className="block text-[9.5px] text-amber-800/50 dark:text-zinc-500 mt-0.5 not-italic">
                              Oleh: {it.created_by}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteItem(it.id)}
                          className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 p-1 transition-opacity shrink-0"
                          title="Hapus checklist"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer Bar */}
          <div className="bg-amber-100/80 dark:bg-zinc-900/90 border-t border-amber-200/80 dark:border-zinc-800 px-3.5 py-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <User className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 shrink-0" />
              <Input
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                placeholder="Nama Anda..."
                className="h-7 text-[11px] px-2 bg-white/80 dark:bg-zinc-950 border-amber-200 dark:border-zinc-700 w-28 shrink-0"
                title="Nama yang tertera sebagai pengedit catatan"
              />
              <span className="text-[10px] text-amber-800/60 dark:text-zinc-500 truncate">
                (Pengedit)
              </span>
            </div>

            <Button
              size="sm"
              onClick={handleSave}
              disabled={updateMutation.isPending || (!hasUnsavedChanges && activeTab === "memo")}
              className="h-7 px-3 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs gap-1 shadow-xs shrink-0"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{updateMutation.isPending ? "Menyimpan..." : "Simpan"}</span>
            </Button>
          </div>
        </div>
      )}
    </aside>
  );
}

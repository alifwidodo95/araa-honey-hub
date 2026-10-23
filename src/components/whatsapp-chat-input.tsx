import React, {
  useState,
  useRef,
  useMemo,
  useImperativeHandle,
  forwardRef,
  useEffect
} from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover";
import {
  Zap,
  Smile,
  Paperclip,
  Send,
  Loader2,
  X,
  Search,
  Plus,
  Pencil,
  Video
} from "lucide-react";
import { toast } from "sonner";

export interface MediaAttachmentItem {
  file: File;
  previewUrl: string;
  mediaType: "image" | "video";
  fileName: string;
  fileSize: number;
}

export interface WhatsAppChatInputHandle {
  insertText: (text: string) => void;
  setText: (text: string) => void;
  focus: () => void;
}

interface EmojiItem {
  emoji: string;
  name: string;
  keywords: string[];
}

const EMOJI_LIST: { category: string; label: string; items: EmojiItem[] }[] = [
  {
    category: "salam",
    label: "🙏 CS",
    items: [
      { emoji: "🙏", name: "terima kasih", keywords: ["makasih", "thanks", "tq", "doa", "maaf", "salam"] },
      { emoji: "😊", name: "senyum", keywords: ["smile", "ramah", "senang", "happy"] },
      { emoji: "👍", name: "jempol", keywords: ["ok", "siap", "mantap", "bagus", "baik", "setuju"] },
      { emoji: "😇", name: "senyum malaikat", keywords: ["baik", "tulus", "ikhlas"] },
      { emoji: "🤝", name: "jabat tangan", keywords: ["deal", "kerjasama", "sepakat"] },
      { emoji: "🤗", name: "peluk ramah", keywords: ["hangat", "ramah", "welcome"] },
      { emoji: "❤️", name: "hati merah", keywords: ["love", "cinta", "suka"] },
      { emoji: "👏", name: "tepuk tangan", keywords: ["selamat", "hebat", "mantul"] },
      { emoji: "👌", name: "tangan oke", keywords: ["ok", "siap", "beres"] },
      { emoji: "🥰", name: "penuh cinta", keywords: ["senang", "gemas", "suka"] },
      { emoji: "😍", name: "mata hati", keywords: ["kagum", "suka", "love"] },
      { emoji: "😁", name: "senyum lebar", keywords: ["gembira", "tertawa"] },
      { emoji: "🙌", name: "angkat tangan", keywords: ["hore", "syukur", "alhamdulillah"] },
      { emoji: "👋", name: "lambaian tangan", keywords: ["halo", "hai", "selamat tinggal"] },
      { emoji: "🎉", name: "pesta terompet", keywords: ["selamat", "promo", "kejutan"] },
      { emoji: "✨", name: "kilau bintang", keywords: ["spesial", "berkilau", "baru"] },
    ]
  },
  {
    category: "toko",
    label: "🛒 Toko",
    items: [
      { emoji: "🛒", name: "keranjang belanja", keywords: ["troli", "order", "beli", "checkout"] },
      { emoji: "📦", name: "paket kardus", keywords: ["box", "packing", "pesanan", "barang"] },
      { emoji: "🚚", name: "truk kirim", keywords: ["kurir", "ekspedisi", "ongkir", "jalan", "antar"] },
      { emoji: "🛵", name: "motor kurir", keywords: ["ojol", "instan", "sameday"] },
      { emoji: "💰", name: "kantong uang", keywords: ["duit", "bayar", "transfer", "lunas", "harga"] },
      { emoji: "💳", name: "kartu atm", keywords: ["bank", "rekening", "transfer", "qris"] },
      { emoji: "🏷️", name: "label diskon", keywords: ["promo", "potongan", "voucher"] },
      { emoji: "🎁", name: "hadiah kado", keywords: ["free", "gratis", "bonus"] },
      { emoji: "🧾", name: "struk kwitansi", keywords: ["nota", "invoice", "resi"] },
      { emoji: "🛍️", name: "tas belanja", keywords: ["shopping", "toko"] },
      { emoji: "⏰", name: "jam weker", keywords: ["waktu", "segera", "deadline"] },
      { emoji: "📍", name: "pin lokasi", keywords: ["alamat", "lokasi", "tujuan"] },
      { emoji: "📱", name: "handphone", keywords: ["wa", "hp", "chat", "kontak"] },
      { emoji: "📞", name: "gagang telepon", keywords: ["hubungi", "telepon", "call"] },
    ]
  },
  {
    category: "madu",
    label: "🍯 Madu",
    items: [
      { emoji: "🍯", name: "pot madu", keywords: ["madu", "honey", "araa", "manis", "murni"] },
      { emoji: "🐝", name: "lebah madu", keywords: ["bee", "tawon", "ternak"] },
      { emoji: "🌸", name: "bunga sakura", keywords: ["nektar", "bunga", "cantik"] },
      { emoji: "🌿", name: "daun herbal", keywords: ["herbal", "alami", "sehat"] },
      { emoji: "🍃", name: "daun hijau", keywords: ["organik", "fresh", "segar"] },
      { emoji: "🍶", name: "botol madu", keywords: ["kemasan", "jerigen", "botol"] },
      { emoji: "🥄", name: "sendok", keywords: ["minum", "dosis", "aturan"] },
      { emoji: "💛", name: "hati kuning", keywords: ["kuning", "madu", "emas"] },
      { emoji: "🍋", name: "lemon", keywords: ["jeruk", "campuran", "wedang"] },
      { emoji: "💧", name: "tetes air", keywords: ["tetes", "kental", "cair"] },
      { emoji: "🌱", name: "tunas benih", keywords: ["tumbuh", "alam"] },
      { emoji: "☀️", name: "matahari cerah", keywords: ["pagi", "sehat", "daya tahan"] },
    ]
  },
  {
    category: "simbol",
    label: "✅ Simbol",
    items: [
      { emoji: "✅", name: "centang hijau", keywords: ["sukses", "benar", "lunas", "ready", "ada"] },
      { emoji: "❌", name: "silang merah", keywords: ["batal", "habis", "kosong", "salah"] },
      { emoji: "⚠️", name: "peringatan", keywords: ["penting", "perhatian", "awas"] },
      { emoji: "💡", name: "lampu ide", keywords: ["info", "tips", "saran"] },
      { emoji: "🔥", name: "api promo", keywords: ["laris", "hot", "terbatas", "promo"] },
      { emoji: "⭐", name: "bintang", keywords: ["rating", "nilai", "bagus"] },
      { emoji: "🌟", name: "bintang bersinar", keywords: ["top", "premium"] },
      { emoji: "💯", name: "seratus persen", keywords: ["pasti", "asli", "jaminan"] },
      { emoji: "📌", name: "pin tusuk", keywords: ["catatan", "simpan", "ingat"] },
      { emoji: "🎯", name: "target sasaran", keywords: ["tepat", "fokus", "solusi"] },
    ]
  }
];

export interface WhatsAppChatInputProps {
  onSendMessage: (text: string, mediaAttachment: MediaAttachmentItem | null) => Promise<void> | void;
  sendingReply: boolean;
  uploadingMedia: boolean;
  quickReplies: Array<{ id: string; shortcut: string; title: string; message: string }>;
  displayName: string;
  onOpenManageQuickReplies: () => void;
  onPrefillQuickReplyShortcut?: (shortcut: string) => void;
}

export const WhatsAppChatInput = React.memo(
  forwardRef<WhatsAppChatInputHandle, WhatsAppChatInputProps>(function WhatsAppChatInput(
    {
      onSendMessage,
      sendingReply,
      uploadingMedia,
      quickReplies,
      displayName,
      onOpenManageQuickReplies,
      onPrefillQuickReplyShortcut
    },
    ref
  ) {
    const [text, setText] = useState("");
    const [mediaAttachment, setMediaAttachment] = useState<MediaAttachmentItem | null>(null);
    const [showQuickReplyMenu, setShowQuickReplyMenu] = useState(false);
    const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
    const [activeEmojiTab, setActiveEmojiTab] = useState("salam");
    const [emojiFilterText, setEmojiFilterText] = useState("");

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Clean up preview URL on unmount or change
    useEffect(() => {
      return () => {
        if (mediaAttachment?.previewUrl) {
          URL.revokeObjectURL(mediaAttachment.previewUrl);
        }
      };
    }, [mediaAttachment]);

    // Expose methods to parent via ref
    useImperativeHandle(
      ref,
      () => ({
        insertText: (additionalText: string) => {
          setText((prev) => {
            const trimmed = prev.trim();
            return trimmed ? `${trimmed}\n\n${additionalText}` : additionalText;
          });
          setTimeout(() => {
            if (textareaRef.current) {
              textareaRef.current.focus();
              textareaRef.current.selectionStart = textareaRef.current.value.length;
              textareaRef.current.selectionEnd = textareaRef.current.value.length;
              textareaRef.current.style.height = "auto";
              textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + "px";
            }
          }, 50);
        },
        setText: (newText: string) => {
          setText(newText);
          setTimeout(() => {
            if (textareaRef.current) {
              textareaRef.current.focus();
              textareaRef.current.style.height = "auto";
              textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + "px";
            }
          }, 50);
        },
        focus: () => {
          textareaRef.current?.focus();
        }
      }),
      []
    );

    // Filtered emoji items based on search
    const filteredEmojiItems = useMemo(() => {
      const q = emojiFilterText.trim().toLowerCase();
      if (!q) {
        const foundCategory = EMOJI_LIST.find((c) => c.category === activeEmojiTab);
        return foundCategory ? foundCategory.items : [];
      }
      const results: EmojiItem[] = [];
      EMOJI_LIST.forEach((cat) => {
        cat.items.forEach((item) => {
          if (
            item.name.toLowerCase().includes(q) ||
            item.keywords.some((k) => k.toLowerCase().includes(q))
          ) {
            results.push(item);
          }
        });
      });
      return results;
    }, [emojiFilterText, activeEmojiTab]);

    // Quick reply detection
    const isTriggeredBySlash = text.startsWith("/") && !text.includes("\n");
    const quickReplySearch = isTriggeredBySlash ? text.slice(1).trim().toLowerCase() : "";
    const isQuickReplyMenuOpen = showQuickReplyMenu || isTriggeredBySlash;

    const matchingQuickReplies = useMemo(() => {
      if (!quickReplySearch) return quickReplies;
      return quickReplies.filter(
        (qr) =>
          qr.shortcut.toLowerCase().includes(quickReplySearch) ||
          qr.title.toLowerCase().includes(quickReplySearch) ||
          qr.message.toLowerCase().includes(quickReplySearch)
      );
    }, [quickReplies, quickReplySearch]);

    const handleSelectQuickReply = (qr: { shortcut: string; title: string; message: string }) => {
      let msg = qr.message;
      const nameToUse = displayName && displayName !== "Pelanggan" && displayName !== "Meta Status" ? displayName : "Kak";
      msg = msg.replace(/\{nama\}/gi, nameToUse);
      setText(msg);
      setShowQuickReplyMenu(false);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.style.height = "auto";
          textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + "px";
        }
      }, 10);
    };

    const handleInsertEmoji = (emoji: string) => {
      const input = textareaRef.current;
      if (input) {
        const start = input.selectionStart ?? text.length;
        const end = input.selectionEnd ?? text.length;
        const nextText = text.substring(0, start) + emoji + text.substring(end);
        setText(nextText);
        setTimeout(() => {
          input.focus();
          const nextPos = start + emoji.length;
          input.setSelectionRange(nextPos, nextPos);
          input.style.height = "auto";
          input.style.height = Math.min(input.scrollHeight, 160) + "px";
        }, 10);
      } else {
        setText((prev) => prev + emoji);
      }
    };

    const handleFileSelect = (file: File) => {
      if (!file) return;

      const isImage = file.type.startsWith("image/");
      const isVideo = file.type.startsWith("video/");

      if (!isImage && !isVideo) {
        toast.error("Format berkas tidak didukung. Harap pilih foto (JPG, PNG, WebP) atau video (MP4, MOV).");
        return;
      }

      if (isImage && file.size > 5 * 1024 * 1024) {
        toast.error(`Ukuran foto terlalu besar (${(file.size / (1024 * 1024)).toFixed(1)} MB). Batas maksimal Meta WABA adalah 5 MB.`);
        return;
      }

      if (isVideo && file.size > 16 * 1024 * 1024) {
        toast.error(`Ukuran video terlalu besar (${(file.size / (1024 * 1024)).toFixed(1)} MB). Batas maksimal Meta WABA adalah 16 MB.`);
        return;
      }

      if (mediaAttachment?.previewUrl) {
        URL.revokeObjectURL(mediaAttachment.previewUrl);
      }

      const previewUrl = URL.createObjectURL(file);
      const mediaType: "image" | "video" = isVideo ? "video" : "image";

      setMediaAttachment({
        file,
        previewUrl,
        mediaType,
        fileName: file.name,
        fileSize: file.size,
      });

      toast.success(`${mediaType === "video" ? "Video" : "Foto"} siap dikirim! Anda dapat mengetik keterangan caption jika perlu.`);
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    };

    const handleRemoveMediaAttachment = () => {
      if (mediaAttachment?.previewUrl) {
        URL.revokeObjectURL(mediaAttachment.previewUrl);
      }
      setMediaAttachment(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    };

    const handlePasteMedia = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf("image") !== -1 || item.type.indexOf("video") !== -1) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            handleFileSelect(file);
            return;
          }
        }
      }
    };

    const handleSubmit = async () => {
      const trimmed = text.trim();
      if ((!trimmed && !mediaAttachment) || sendingReply || uploadingMedia) return;

      const currentText = text;
      const currentAttachment = mediaAttachment;

      // Optimistic instant clear: input feels 100% reactive
      setText("");
      setMediaAttachment(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
      setShowQuickReplyMenu(false);

      try {
        await onSendMessage(currentText, currentAttachment);
      } catch {
        // Restore on error so message is not lost
        setText(currentText);
        setMediaAttachment(currentAttachment);
      }
    };

    return (
      <div className="border-t bg-white relative">
        {/* Outgoing Media Attachment Preview Bar */}
        {mediaAttachment && (
          <div className="mx-3 mt-3 p-2.5 bg-amber-50/80 border border-amber-200 rounded-xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-1 duration-150">
            <div className="flex items-center gap-2.5 min-w-0">
              {mediaAttachment.mediaType === "video" ? (
                <div className="relative h-14 w-20 bg-black rounded-lg overflow-hidden shrink-0 flex items-center justify-center">
                  <video src={mediaAttachment.previewUrl} className="h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white">
                    <Video className="h-5 w-5" />
                  </div>
                </div>
              ) : (
                <img
                  src={mediaAttachment.previewUrl}
                  alt="Preview Lampiran"
                  className="h-14 w-14 object-cover rounded-lg border border-amber-200 shrink-0"
                />
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge className="text-[10px] font-bold bg-amber-500 text-white border-0 px-1.5 py-0">
                    {mediaAttachment.mediaType === "video" ? "🎥 Video (WABA)" : "📷 Foto (WABA)"}
                  </Badge>
                  <span className="text-xs font-semibold text-slate-800 truncate max-w-[200px]">
                    {mediaAttachment.fileName}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {(mediaAttachment.fileSize / (1024 * 1024)).toFixed(2)} MB • Ketik keterangan di bawah atau langsung tekan kirim
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleRemoveMediaAttachment}
              className="h-8 w-8 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg shrink-0 cursor-pointer"
              title="Hapus Lampiran"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        <div className="p-3 flex gap-2 items-end">
          {/* Floating Quick Reply Menu */}
          {isQuickReplyMenuOpen && (
            <div className="absolute bottom-full left-3 right-3 mb-2 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden z-40 animate-in fade-in slide-in-from-bottom-2 duration-150 max-h-72 flex flex-col">
              {/* Floating Menu Header */}
              <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200 shrink-0">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                  <Zap className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                  <span>Balas Cepat (/)</span>
                  {quickReplySearch && (
                    <span className="text-[11px] font-normal text-slate-500">
                      Cari: <code className="bg-amber-100 text-amber-800 px-1 rounded font-mono">/{quickReplySearch}</code>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowQuickReplyMenu(false);
                      onOpenManageQuickReplies();
                    }}
                    className="h-6 px-2 rounded flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-amber-800 hover:bg-amber-50 border border-transparent hover:border-amber-200 transition-all cursor-pointer"
                    title="Kelola & Tambah Balas Cepat"
                  >
                    <Pencil className="h-3.5 w-3.5 text-amber-600" />
                    <span>Kelola</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowQuickReplyMenu(false)}
                    className="h-6 w-6 rounded flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/80 transition-all cursor-pointer text-sm font-bold"
                    title="Tutup"
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* Quick Reply Items List */}
              <div className="overflow-y-auto max-h-56 divide-y divide-slate-100 p-1">
                {matchingQuickReplies.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500 space-y-2">
                    <p className="font-medium">
                      {quickReplies.length === 0
                        ? "Belum ada template balas cepat."
                        : `Tidak ditemukan balas cepat dengan kata kunci "/${quickReplySearch}"`}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      type="button"
                      onClick={() => {
                        setShowQuickReplyMenu(false);
                        onOpenManageQuickReplies();
                        if (quickReplySearch && onPrefillQuickReplyShortcut) {
                          onPrefillQuickReplyShortcut(quickReplySearch);
                        }
                      }}
                      className="h-7 text-xs gap-1 border-amber-300 text-amber-800 hover:bg-amber-50 cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Tambah Balas Cepat {quickReplySearch ? `/${quickReplySearch}` : ""}</span>
                    </Button>
                  </div>
                ) : (
                  matchingQuickReplies.map((qr) => (
                    <button
                      key={qr.id}
                      type="button"
                      onClick={() => handleSelectQuickReply(qr)}
                      className="w-full text-left p-2.5 rounded-lg hover:bg-amber-50/80 transition-colors flex items-start gap-2.5 group cursor-pointer"
                    >
                      <Badge
                        variant="outline"
                        className="bg-amber-100/70 text-amber-800 border-amber-300 font-mono text-[11px] font-bold shrink-0 mt-0.5 group-hover:bg-amber-500 group-hover:text-white transition-colors"
                      >
                        /{qr.shortcut}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate group-hover:text-amber-900">{qr.title}</p>
                        <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5 whitespace-pre-wrap">{qr.message}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Zap Toggle Button */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setShowQuickReplyMenu((prev) => !prev)}
            className={`h-9 w-9 shrink-0 rounded-xl transition-all cursor-pointer ${
              isQuickReplyMenuOpen ? "bg-amber-100 text-amber-700 font-bold" : "text-slate-400 hover:text-amber-600 hover:bg-amber-50"
            }`}
            title="Buka Balas Cepat (atau ketik /)"
          >
            <Zap className="h-4 w-4" />
          </Button>

          {/* Emoji Picker Popover */}
          <Popover open={isEmojiPickerOpen} onOpenChange={setIsEmojiPickerOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={`h-9 w-9 shrink-0 rounded-xl transition-all cursor-pointer ${
                  isEmojiPickerOpen ? "bg-amber-100 text-amber-700 font-bold" : "text-slate-400 hover:text-amber-600 hover:bg-amber-50"
                }`}
                title="Pilih Emoji (😊)"
              >
                <Smile className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="start"
              sideOffset={8}
              className="w-80 p-2.5 rounded-2xl shadow-xl border border-slate-200 bg-white z-50 animate-in fade-in zoom-in-95 duration-150"
            >
              <div className="space-y-2">
                {/* Header & Category Pills */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 px-0.5">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <span>😊</span>
                    <span>Pilih Emoji</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsEmojiPickerOpen(false)}
                    className="h-5 w-5 rounded flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 text-xs font-bold cursor-pointer"
                    title="Tutup"
                  >
                    ×
                  </button>
                </div>

                {/* Search bar inside emoji picker */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Cari emoji (cth: madu, makasih, jempol)..."
                    value={emojiFilterText}
                    onChange={(e) => setEmojiFilterText(e.target.value)}
                    className="h-7 pl-8 pr-6 text-xs bg-slate-50 rounded-lg border-slate-200"
                  />
                  {emojiFilterText && (
                    <button
                      type="button"
                      onClick={() => setEmojiFilterText("")}
                      className="absolute right-2 top-1.5 h-4 w-4 rounded-full text-[10px] text-slate-400 hover:text-slate-700 flex items-center justify-center bg-slate-200 cursor-pointer"
                    >
                      ×
                    </button>
                  )}
                </div>

                {/* Category Tabs (tampil jika tidak sedang mencari) */}
                {!emojiFilterText && (
                  <div className="grid grid-cols-4 gap-1 p-0.5 bg-slate-100 rounded-lg text-[10px]">
                    {EMOJI_LIST.map((cat) => (
                      <button
                        key={cat.category}
                        type="button"
                        onClick={() => setActiveEmojiTab(cat.category)}
                        className={`py-1 px-1 rounded font-medium truncate text-center transition-all cursor-pointer ${
                          activeEmojiTab === cat.category
                            ? "bg-white text-amber-700 shadow-2xs font-bold"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Emoji Grid */}
                <div className="max-h-48 overflow-y-auto p-1 grid grid-cols-6 gap-1">
                  {filteredEmojiItems.length === 0 ? (
                    <div className="col-span-6 py-6 text-center text-xs text-slate-400">
                      Emoji tidak ditemukan
                    </div>
                  ) : (
                    filteredEmojiItems.map((item, idx) => (
                      <button
                        key={`${item.emoji}-${idx}`}
                        type="button"
                        onClick={() => handleInsertEmoji(item.emoji)}
                        className="h-9 w-9 rounded-lg flex items-center justify-center text-xl hover:bg-amber-100/70 hover:scale-125 transition-transform active:scale-95 cursor-pointer select-none"
                        title={`${item.name} (${item.emoji})`}
                      >
                        {item.emoji}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Attachment Button for Photos & Videos */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={sendingReply || uploadingMedia}
            className="h-9 w-9 shrink-0 rounded-xl text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-all cursor-pointer"
            title="Lampirkan Foto (maks 5MB) atau Video (maks 16MB)"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelect(file);
            }}
          />

          <Textarea
            ref={textareaRef}
            rows={1}
            placeholder={
              mediaAttachment
                ? `Tulis keterangan ${mediaAttachment.mediaType === "video" ? "video" : "foto"} (opsional, tekan Enter kirim)...`
                : "Tulis balasan manual (Enter kirim, Shift+Enter baris baru, / balas cepat, Ctrl+V foto)..."
            }
            value={text}
            onPaste={handlePasteMedia}
            onChange={(e) => {
              setText(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (isQuickReplyMenuOpen && matchingQuickReplies.length > 0 && isTriggeredBySlash) {
                  handleSelectQuickReply(matchingQuickReplies[0]);
                } else {
                  handleSubmit();
                }
              } else if (e.key === "Escape") {
                setShowQuickReplyMenu(false);
              }
            }}
            className="flex-1 min-h-[38px] max-h-[160px] resize-none py-2 px-3 text-sm rounded-xl leading-relaxed border-input focus-visible:ring-amber-500"
          />

          <Button
            type="button"
            onClick={handleSubmit}
            disabled={(!text.trim() && !mediaAttachment) || sendingReply || uploadingMedia}
            className="bg-amber-500 hover:bg-amber-600 text-white rounded-xl cursor-pointer h-9 px-3 shrink-0"
            title="Kirim Pesan (Enter)"
          >
            {sendingReply || uploadingMedia ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    );
  })
);

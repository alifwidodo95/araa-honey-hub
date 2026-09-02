import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RequireAuth } from "@/components/require-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { 
  Image as ImageIcon, Video, Copy, ExternalLink, Trash2, Plus, 
  Search, HardDrive, Filter, Check, UploadCloud, Film, FileImage, Loader2
} from "lucide-react";

export const Route = createFileRoute("/media")({
  component: () => (
    <RequireAuth ownerOnly>
      <MediaGalleryPage />
    </RequireAuth>
  ),
});

interface MediaItem {
  id: string;
  title: string;
  file_name: string;
  file_url: string;
  file_type: "image" | "video";
  mime_type: string;
  file_size: number;
  category: string;
  created_at: string;
}

const CATEGORIES = [
  "Semua",
  "Testimoni",
  "Bukti Transfer",
  "Unboxing Paket",
  "Madu Akasia",
  "Madu Hutan",
  "Madu Randu",
  "Madu Klanceng",
  "Lainnya"
];

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function MediaGalleryPage() {
  const qc = useQueryClient();
  
  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Semua");
  const [selectedType, setSelectedType] = useState<"all" | "image" | "video">("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Upload Dialog States
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadCategory, setUploadCategory] = useState("Testimoni");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Delete Confirmation State
  const [deletingMedia, setDeletingMedia] = useState<MediaItem | null>(null);

  // 1. Fetch Media Items from Supabase
  const { data: mediaList = [], isLoading, refetch } = useQuery<MediaItem[]>({
    queryKey: ["media-library"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_library" as any)
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Gagal mengambil media library:", error);
        throw error;
      }
      return (data || []) as MediaItem[];
    },
  });

  // Filtered List
  const filteredMedia = useMemo(() => {
    return mediaList.filter((m) => {
      const matchesSearch = 
        m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.file_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.category.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesCategory = 
        selectedCategory === "Semua" || m.category === selectedCategory;

      const matchesType = 
        selectedType === "all" || m.file_type === selectedType;

      return matchesSearch && matchesCategory && matchesType;
    });
  }, [mediaList, searchQuery, selectedCategory, selectedType]);

  // Statistics
  const totalFiles = mediaList.length;
  const totalPhotos = mediaList.filter((m) => m.file_type === "image").length;
  const totalVideos = mediaList.filter((m) => m.file_type === "video").length;
  const totalSizeBytes = mediaList.reduce((sum, m) => sum + (Number(m.file_size) || 0), 0);

  // Copy Link Handler
  const handleCopyLink = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    toast.success("Link URL media berhasil disalin!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Upload Mutation
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadTitle.trim()) {
      toast.error("Judul media wajib diisi!");
      return;
    }
    if (!selectedFile) {
      toast.error("Pilih berkas foto/video terlebih dahulu!");
      return;
    }

    setIsUploading(true);
    try {
      // Read file to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (err) => reject(err);
      });
      reader.readAsDataURL(selectedFile);
      const fileBase64 = await base64Promise;

      const res = await fetch("/api/media/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: uploadTitle.trim(),
          category: uploadCategory,
          fileName: selectedFile.name,
          fileBase64,
          mimeType: selectedFile.type,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal mengunggah ke server VPS.");
      }

      toast.success("Berkas media berhasil diunggah langsung ke VPS!");
      setIsUploadOpen(false);
      setUploadTitle("");
      setSelectedFile(null);
      refetch();
    } catch (err: any) {
      console.error("Upload error:", err);
      toast.error(err.message || "Terjadi kesalahan saat upload.");
    } finally {
      setIsUploading(false);
    }
  };

  // Delete Mutation
  const handleDeleteMedia = async () => {
    if (!deletingMedia) return;
    try {
      const res = await fetch("/api/media/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: deletingMedia.id,
          fileName: deletingMedia.file_name,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal menghapus media.");
      }

      toast.success("Berkas media berhasil dihapus dari VPS & Database!");
      setDeletingMedia(null);
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Gagal menghapus media.");
    }
  };

  return (
    <div className="space-y-6 max-w-7xl pb-10">
      {/* Top Header & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <ImageIcon className="h-6 w-6 text-honey" />
            Galeri Media & Testimoni
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Simpan foto & video testimoni langsung di server VPS untuk digunakan di Landing Page (100% Hemat Kuota Supabase).
          </p>
        </div>

        {/* Upload Trigger Button */}
        <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
          <DialogTrigger asChild>
            <Button className="bg-honey hover:bg-honey-dark text-slate-900 font-bold shadow-md">
              <Plus className="h-4 w-4 mr-2" />
              Upload Media Baru
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <UploadCloud className="h-5 w-5 text-honey" />
                Upload Media ke Server VPS
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleUploadSubmit} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="media-title">Judul / Catatan Media</Label>
                <Input
                  id="media-title"
                  placeholder="Contoh: Testimoni Akasia Bu Rina Dumai"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="media-category">Kategori Media</Label>
                <Select value={uploadCategory} onValueChange={setUploadCategory}>
                  <SelectTrigger id="media-category">
                    <SelectValue placeholder="Pilih Kategori" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.filter((c) => c !== "Semua").map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>File Berkas (Foto atau Video)</Label>
                <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-4 text-center hover:border-amber-500 transition-colors bg-slate-50 dark:bg-slate-900/50">
                  <input
                    type="file"
                    accept="image/*,video/*"
                    id="file-input"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        setSelectedFile(e.target.files[0]);
                      }
                    }}
                  />
                  <label htmlFor="file-input" className="cursor-pointer space-y-2 block">
                    <div className="mx-auto h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-honey">
                      <UploadCloud className="h-5 w-5" />
                    </div>
                    {selectedFile ? (
                      <div>
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate max-w-[250px] mx-auto">
                          {selectedFile.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatBytes(selectedFile.size)} • {selectedFile.type}
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Klik untuk memilih foto / video (.jpg, .png, .mp4, .webm)
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          File akan langsung dikirim & disimpan di disk VPS Nginx.
                        </p>
                      </div>
                    )}
                  </label>
                </div>
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsUploadOpen(false)}
                  disabled={isUploading}
                >
                  Batal
                </Button>
                <Button
                  type="submit"
                  disabled={isUploading || !selectedFile || !uploadTitle.trim()}
                  className="bg-honey hover:bg-honey-dark text-slate-900 font-bold"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Mengunggah ke VPS...
                    </>
                  ) : (
                    "Mulai Upload"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="shadow-xs border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
              <ImageIcon className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Total Berkas</div>
              <div className="text-xl font-bold text-slate-800 dark:text-slate-100">{totalFiles} File</div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xs border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0">
              <FileImage className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Foto Testimoni</div>
              <div className="text-xl font-bold text-slate-800 dark:text-slate-100">{totalPhotos} Foto</div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xs border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center shrink-0">
              <Film className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Video Testimoni</div>
              <div className="text-xl font-bold text-slate-800 dark:text-slate-100">{totalVideos} Video</div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xs border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
              <HardDrive className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Penyimpanan VPS</div>
              <div className="text-xl font-bold text-slate-800 dark:text-slate-100">{formatBytes(totalSizeBytes)}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter & Search Bar */}
      <Card className="shadow-xs border">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col md:flex-row items-center gap-3">
            {/* Search Input */}
            <div className="relative flex-1 w-full">
              <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
              <Input
                placeholder="Cari judul media, nama file, atau kategori..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-sm"
              />
            </div>

            {/* Category Select */}
            <div className="flex items-center gap-2 w-full md:w-auto">
              <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-full md:w-[180px] text-xs">
                  <SelectValue placeholder="Kategori" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Type Filter Buttons */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-lg shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedType("all")}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                    selectedType === "all"
                      ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs"
                      : "text-muted-foreground hover:text-slate-900"
                  }`}
                >
                  Semua
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedType("image")}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1 ${
                    selectedType === "image"
                      ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs"
                      : "text-muted-foreground hover:text-slate-900"
                  }`}
                >
                  <FileImage className="h-3 w-3" /> Foto
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedType("video")}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1 ${
                    selectedType === "video"
                      ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs"
                      : "text-muted-foreground hover:text-slate-900"
                  }`}
                >
                  <Film className="h-3 w-3" /> Video
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Media Items Grid */}
      {isLoading ? (
        <div className="py-20 text-center text-muted-foreground flex flex-col items-center justify-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-honey" />
          <p className="text-sm font-medium">Memuat galeri media VPS...</p>
        </div>
      ) : filteredMedia.length === 0 ? (
        <Card className="shadow-xs border border-dashed">
          <CardContent className="py-16 text-center space-y-3">
            <div className="mx-auto h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-muted-foreground">
              <ImageIcon className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
                Belum ada media ditemukan
              </h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                {searchQuery || selectedCategory !== "Semua" || selectedType !== "all"
                  ? "Coba ubah kata kunci pencarian atau filter kategori."
                  : "Unggah foto atau video testimoni pertama Anda langsung ke VPS untuk menyalin link embed."}
              </p>
            </div>
            <Button
              onClick={() => setIsUploadOpen(true)}
              className="bg-honey hover:bg-honey-dark text-slate-900 font-bold text-xs"
            >
              <Plus className="h-4 w-4 mr-1" />
              Upload Berkas Sekarang
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredMedia.map((media) => (
            <Card key={media.id} className="overflow-hidden shadow-xs hover:shadow-md transition-all border flex flex-col justify-between group">
              {/* Media Preview Header */}
              <div className="relative aspect-video bg-slate-900 flex items-center justify-center overflow-hidden border-b">
                {media.file_type === "video" ? (
                  <video
                    src={media.file_url}
                    controls
                    preload="metadata"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <img
                    src={media.file_url}
                    alt={media.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                )}

                <Badge className="absolute top-2 left-2 text-[10px] bg-slate-900/80 backdrop-blur-xs text-white border-0">
                  {media.file_type === "video" ? (
                    <span className="flex items-center gap-1 text-purple-400">
                      <Film className="h-3 w-3" /> Video
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-blue-400">
                      <FileImage className="h-3 w-3" /> Foto
                    </span>
                  )}
                </Badge>

                <Badge variant="outline" className="absolute top-2 right-2 text-[10px] bg-amber-500/90 text-slate-950 font-bold border-0">
                  {media.category}
                </Badge>
              </div>

              {/* Media Details */}
              <CardContent className="p-3.5 space-y-2 flex-1 flex flex-col justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 line-clamp-1" title={media.title}>
                    {media.title}
                  </h4>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-1">
                    <span>{formatBytes(media.file_size)}</span>
                    <span>{new Date(media.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</span>
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="pt-2 space-y-1.5 border-t border-slate-100 dark:border-slate-800">
                  {/* Copy Link Button */}
                  <Button
                    onClick={() => handleCopyLink(media.file_url, media.id)}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-amber-400 dark:bg-amber-500 dark:hover:bg-amber-600 dark:text-slate-950 font-semibold text-xs h-8"
                  >
                    {copiedId === media.id ? (
                      <>
                        <Check className="h-3.5 w-3.5 mr-1.5 text-emerald-400 dark:text-slate-950" />
                        Tersalin!
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 mr-1.5" />
                        Salin Link Embed
                      </>
                    )}
                  </Button>

                  <div className="flex items-center gap-1.5">
                    <a
                      href={media.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1"
                    >
                      <Button variant="outline" className="w-full text-[11px] h-7 px-2">
                        <ExternalLink className="h-3 w-3 mr-1" /> Buka URL
                      </Button>
                    </a>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 shrink-0"
                      onClick={() => setDeletingMedia(media)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirm Modal */}
      <Dialog open={!!deletingMedia} onOpenChange={(open) => !open && setDeletingMedia(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base text-rose-600 flex items-center gap-2">
              <Trash2 className="h-5 w-5" /> Hapus Berkas Media
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 text-xs text-slate-700 dark:text-slate-300 space-y-2">
            <p>
              Apakah Anda yakin ingin menghapus <strong>"{deletingMedia?.title}"</strong>?
            </p>
            <p className="text-muted-foreground text-[11px]">
              Berkas fisik di VPS (`/var/www/media/{deletingMedia?.file_name}`) dan data catatan di Supabase akan dihapus secara permanen.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setDeletingMedia(null)}>
              Batal
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDeleteMedia}>
              Hapus Permanen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

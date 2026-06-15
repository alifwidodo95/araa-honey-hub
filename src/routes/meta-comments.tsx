import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RequireAuth } from "@/components/require-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { 
  MessageSquare, Facebook, Instagram, Settings, RefreshCw, 
  Send, CheckCircle, AlertTriangle, Save, Sliders, Bot, Eye, EyeOff,
  User, Check, X
} from "lucide-react";

export const Route = createFileRoute("/meta-comments")({
  component: () => (
    <RequireAuth ownerOnly>
      <MetaCommentsPage />
    </RequireAuth>
  ),
});

interface MetaComment {
  id: string;
  post_id: string;
  parent_id: string | null;
  username: string;
  message: string;
  reply_message: string | null;
  replied: boolean;
  replied_at: string | null;
  replied_by: 'ai' | 'manual' | null;
  channel: 'facebook' | 'instagram';
  created_at: string;
}

interface MetaPost {
  id: string;
  permalink: string | null;
  is_ad: boolean;
  auto_reply_active: boolean;
  last_synced_at: string | null;
  created_at: string;
}

function MetaCommentsPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"facebook" | "instagram" | "settings">("facebook");
  
  // State for Settings Form
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(true);
  const [csWhatsappNumber, setCsWhatsappNumber] = useState("0878-3703-5470");
  const [systemInstruction, setSystemInstruction] = useState("");
  const [pageAccessToken, setPageAccessToken] = useState("");
  const [facebookPageId, setFacebookPageId] = useState("");
  const [instagramAccountId, setInstagramAccountId] = useState("");
  const [showToken, setShowToken] = useState(false);

  // Quick Reply States (Mapped by comment ID)
  const [quickReplies, setQuickReplies] = useState<Record<string, string>>({});
  const [replyFilter, setReplyFilter] = useState<"all" | "unreplied" | "replied">("unreplied");

  // Loading States for Actions
  const [syncing, setSyncing] = useState(false);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [aiReplyingId, setAiReplyingId] = useState<string | null>(null);

  // 1. Fetch Comments
  const { data: comments = [], refetch: refetchComments, isLoading: commentsLoading } = useQuery<MetaComment[]>({
    queryKey: ["meta-comments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meta_comments")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) {
        console.error("Gagal mengambil komentar:", error);
        throw error;
      }
      return data as MetaComment[];
    }
  });

  // 2. Fetch Posts Config
  const { data: posts = [], refetch: refetchPosts } = useQuery<MetaPost[]>({
    queryKey: ["meta-posts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meta_posts")
        .select("*");
      if (error) {
        console.error("Gagal mengambil posts:", error);
        throw error;
      }
      return data as MetaPost[];
    }
  });

  // 3. Fetch Settings
  const { data: rawSettings, refetch: refetchSettings } = useQuery({
    queryKey: ["meta-ai-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "meta_ai_settings")
        .maybeSingle();
      if (error) throw error;
      return data?.value as any || null;
    }
  });

  // 4. Fetch Retail Prices (to show reference in settings)
  const { data: prices = [] } = useQuery({
    queryKey: ["retail-prices-ref"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("retail_prices")
        .select(`
          honey_type,
          price,
          product_sizes (name)
        `);
      if (error) throw error;
      return data || [];
    }
  });

  // Sync Supabase settings to state on load
  useEffect(() => {
    if (rawSettings) {
      if (rawSettings.auto_reply_enabled !== undefined) setAutoReplyEnabled(rawSettings.auto_reply_enabled);
      if (rawSettings.cs_whatsapp_number) setCsWhatsappNumber(rawSettings.cs_whatsapp_number);
      if (rawSettings.system_instruction) setSystemInstruction(rawSettings.system_instruction);
      if (rawSettings.page_access_token) setPageAccessToken(rawSettings.page_access_token);
      if (rawSettings.facebook_page_id) setFacebookPageId(rawSettings.facebook_page_id);
      if (rawSettings.instagram_account_id) setInstagramAccountId(rawSettings.instagram_account_id);
    }
  }, [rawSettings]);

  // Mutation to Save Settings
  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        auto_reply_enabled: autoReplyEnabled,
        cs_whatsapp_number: csWhatsappNumber,
        system_instruction: systemInstruction,
        page_access_token: pageAccessToken,
        facebook_page_id: facebookPageId,
        instagram_account_id: instagramAccountId
      };

      const { error } = await supabase
        .from("app_settings")
        .upsert({ key: "meta_ai_settings", value: payload }, { onConflict: "key" });
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pengaturan Asisten AI berhasil disimpan!");
      refetchSettings();
    },
    onError: (err: any) => {
      toast.error("Gagal menyimpan pengaturan: " + err.message);
    }
  });

  // Handle Sync Action
  const handleSyncComments = async () => {
    setSyncing(true);
    const toastId = toast.loading("Sinkronisasi komentar dari Meta Graph API...");
    try {
      const res = await fetch("/api/meta/sync-comments", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Sinkronisasi selesai! Berhasil menarik ${data.summary?.commentsSynced || 0} komentar baru.`, { id: toastId });
        refetchComments();
        refetchPosts();
      } else {
        throw new Error(data.error || "Gagal melakukan sinkronisasi.");
      }
    } catch (err: any) {
      toast.error("Error sinkronisasi: " + err.message, { id: toastId });
    } finally {
      setSyncing(false);
    }
  };

  const [batchReplying, setBatchReplying] = useState(false);

  // Handle Batch AI Reply Action
  const handleReplyAllUnreplied = async () => {
    setBatchReplying(true);
    const channelName = activeTab === "facebook" ? "facebook" : "instagram";
    
    // Count unreplied comments for this channel in current state
    const targetComments = comments.filter(c => c.channel === channelName && !c.replied);
    const totalToProcess = targetComments.length;
    
    if (totalToProcess === 0) {
      toast.info("Tidak ada komentar yang perlu dibalas.");
      setBatchReplying(false);
      return;
    }

    const toastId = toast.loading(`[1/${Math.ceil(totalToProcess / 10)}] Memulai membalas massal...`);
    let processedCount = 0;
    let loopCount = 0;
    const maxLoops = 40; // Safety batch loop limit

    try {
      while (processedCount < totalToProcess && loopCount < maxLoops) {
        loopCount++;
        const currentBatch = Math.ceil(processedCount / 10) + 1;
        const totalBatches = Math.ceil(totalToProcess / 10);
        
        toast.loading(`[Batch ${currentBatch}/${totalBatches}] Membalas komentar ${processedCount + 1} s/d ${Math.min(processedCount + 10, totalToProcess)}...`, { id: toastId });

        const res = await fetch("/api/meta/reply-all-unreplied", { 
          method: "POST", 
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel: channelName })
        });
        
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Gagal memproses balasan massal.");
        }

        const count = data.count || 0;
        processedCount += count;
        
        // Refresh comments list so UI updates in real-time
        await refetchComments();

        // If no comments were processed and there are failures, throw the specific error
        if (count === 0) {
          const failedErrors = data.failed || [];
          if (failedErrors.length > 0) {
            const firstError = failedErrors[0].error || "";
            if (firstError.includes("code\":368") || firstError.includes("spam") || firstError.includes("membatasi seberapa sering")) {
              throw new Error("Halaman Facebook Anda sedang dibatasi sementara oleh Meta karena dinilai terlalu sering berkomentar (Spam Filter/Rate Limit). Silakan coba lagi beberapa saat lagi.");
            }
            throw new Error(firstError || "Gagal memproses komentar.");
          }
          break;
        }

        // Wait 1.2 seconds between batch requests to prevent Facebook spam block
        if (processedCount < totalToProcess) {
          await new Promise(r => setTimeout(r, 1200));
        }
      }

      toast.success(`Sukses! Berhasil membalas ${processedCount} komentar menggunakan AI secara berurutan.`, { id: toastId, duration: 6000 });
    } catch (err: any) {
      toast.error("Terjadi kendala saat membalas massal: " + err.message, { id: toastId });
    } finally {
      setBatchReplying(false);
    }
  };

  const [subscribing, setSubscribing] = useState(false);

  // Handle Subscribe Webhook Action
  const handleSubscribePage = async () => {
    setSubscribing(true);
    const toastId = toast.loading("Menghubungkan halaman Facebook ke Webhook Meta...");
    try {
      const res = await fetch("/api/meta/subscribe-page", { 
        method: "POST", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userAccessToken: pageAccessToken })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || "Halaman berhasil terhubung ke Webhook!", { id: toastId });
        refetchSettings();
      } else {
        throw new Error(data.error || "Gagal menghubungkan halaman.");
      }
    } catch (err: any) {
      toast.error("Gagal menghubungkan Webhook: " + err.message, { id: toastId, duration: 6000 });
    } finally {
      setSubscribing(false);
    }
  };

  // Handle Manual Reply Action
  const handleSendManualReply = async (commentId: string, channel: 'facebook' | 'instagram') => {
    const text = quickReplies[commentId]?.trim();
    if (!text) {
      toast.warning("Teks balasan tidak boleh kosong.");
      return;
    }

    setReplyingId(commentId);
    try {
      const res = await fetch("/api/meta/reply-comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commentId,
          replyText: text,
          channel,
          repliedBy: "manual"
        })
      });

      const data = await res.json();
      if (res.ok) {
        toast.success("Balasan manual berhasil dikirim dan ter-update!");
        setQuickReplies(prev => ({ ...prev, [commentId]: "" }));
        refetchComments();
      } else {
        throw new Error(data.error || "Gagal mengirim balasan.");
      }
    } catch (err: any) {
      toast.error("Gagal membalas: " + err.message);
    } finally {
      setReplyingId(null);
    }
  };

  // Handle Trigger AI Auto-reply Single
  const handleTriggerAiReply = async (commentId: string, channel: 'facebook' | 'instagram') => {
    setAiReplyingId(commentId);
    const toastId = toast.loading("Menganalisis komentar & membalas menggunakan AI...");
    try {
      const res = await fetch("/api/meta/reply-comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commentId,
          channel,
          triggerAi: true
        })
      });

      const data = await res.json();
      if (res.ok) {
        toast.success(`AI Sukses membalas: "${data.replyText}"`, { id: toastId, duration: 6000 });
        refetchComments();
      } else {
        throw new Error(data.error || "AI gagal membalas.");
      }
    } catch (err: any) {
      toast.error("Gagal membalas dengan AI: " + err.message, { id: toastId });
    } finally {
      setAiReplyingId(null);
    }
  };

  // Toggle Auto Reply Per Post/Ad
  const handleTogglePostAutoReply = async (postId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("meta_posts")
        .update({ auto_reply_active: !currentStatus })
        .eq("id", postId);

      if (error) throw error;
      toast.success(`Auto-reply AI untuk konten ini berhasil ${!currentStatus ? "Diaktifkan" : "Dinonaktifkan"}`);
      refetchPosts();
    } catch (err: any) {
      toast.error("Gagal memperbarui pengaturan konten: " + err.message);
    }
  };

  // Filter and display comments by active tab (facebook or instagram)
  const filteredComments = useMemo(() => {
    return comments
      .filter(c => c.channel === (activeTab === "facebook" ? "facebook" : "instagram"))
      .filter(c => {
        if (replyFilter === "unreplied") return !c.replied;
        if (replyFilter === "replied") return c.replied;
        return true;
      });
  }, [comments, activeTab, replyFilter]);

  const unrepliedFbCount = comments.filter(c => c.channel === "facebook" && !c.replied).length;
  const unrepliedIgCount = comments.filter(c => c.channel === "instagram" && !c.replied).length;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto pb-20">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Komentar Iklan & AI Helper</h1>
          <p className="text-muted-foreground text-sm">
            Pantau dan balas komentar dari Facebook Ads serta Instagram Ads secara manual maupun otomatis dengan AI.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            onClick={refetchComments} 
            variant="outline" 
            size="sm"
            disabled={commentsLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${commentsLoading ? "animate-spin" : ""}`} />
            Perbarui
          </Button>
          <Button 
            onClick={handleSyncComments} 
            disabled={syncing}
            className="bg-amber-500 hover:bg-amber-600 text-white font-medium"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
            Sinkronkan Meta API
          </Button>
        </div>
      </div>

      {/* Tabs Header */}
      <div className="flex border-b border-border bg-slate-50/50 p-1.5 rounded-xl border">
        <button
          onClick={() => setActiveTab("facebook")}
          className={`flex-1 py-3 px-4 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
            activeTab === "facebook" 
              ? "bg-white text-blue-600 shadow-sm border border-slate-200" 
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Facebook className="h-4 w-4 fill-current" />
          Komentar Facebook
          {unrepliedFbCount > 0 && (
            <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full ml-1 animate-pulse">
              {unrepliedFbCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("instagram")}
          className={`flex-1 py-3 px-4 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
            activeTab === "instagram" 
              ? "bg-white text-pink-600 shadow-sm border border-slate-200" 
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Instagram className="h-4 w-4" />
          Komentar Instagram
          {unrepliedIgCount > 0 && (
            <span className="bg-pink-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full ml-1 animate-pulse">
              {unrepliedIgCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("settings")}
          className={`flex-1 py-3 px-4 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
            activeTab === "settings" 
              ? "bg-white text-amber-600 shadow-sm border border-slate-200" 
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Settings className="h-4 w-4" />
          Pengaturan AI Asisten
        </button>
      </div>

      {/* Tabs Content */}
      {activeTab !== "settings" ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          {/* Main Comments List (Left Column, span 2) */}
          <div className="lg:col-span-2 space-y-4">
            
            {/* Filter Sub-header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-white p-4 rounded-xl border shadow-sm gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-800">Filter Status:</span>
                <div className="flex gap-2">
                  <Button 
                    onClick={() => setReplyFilter("unreplied")} 
                    variant={replyFilter === "unreplied" ? "default" : "outline"}
                    size="sm"
                    className={replyFilter === "unreplied" ? "bg-amber-500 hover:bg-amber-600" : ""}
                  >
                    Belum Dibalas
                  </Button>
                  <Button 
                    onClick={() => setReplyFilter("replied")} 
                    variant={replyFilter === "replied" ? "default" : "outline"}
                    size="sm"
                    className={replyFilter === "replied" ? "bg-amber-500 hover:bg-amber-600" : ""}
                  >
                    Sudah Dibalas
                  </Button>
                  <Button 
                    onClick={() => setReplyFilter("all")} 
                    variant={replyFilter === "all" ? "default" : "outline"}
                    size="sm"
                    className={replyFilter === "all" ? "bg-amber-500 hover:bg-amber-600" : ""}
                  >
                    Semua
                  </Button>
                </div>
              </div>

              {/* Batch AI Auto-Reply Button */}
              {replyFilter === "unreplied" && filteredComments.length > 0 && (
                <Button 
                  onClick={handleReplyAllUnreplied}
                  disabled={batchReplying}
                  className="bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs py-1.5 px-3 flex items-center gap-1.5 rounded-lg shrink-0"
                >
                  <Bot className={`h-3.5 w-3.5 ${batchReplying ? "animate-spin" : ""}`} />
                  Balas Semua ({filteredComments.length}) dgn AI
                </Button>
              )}
            </div>

            {/* Comments Array Rendering */}
            {commentsLoading ? (
              <Card className="p-8 text-center">
                <CardDescription>Memuat daftar komentar...</CardDescription>
              </Card>
            ) : filteredComments.length === 0 ? (
              <Card className="p-12 text-center border-dashed">
                <MessageSquare className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
                <CardTitle className="text-base text-slate-700">Tidak ada komentar ditemukan</CardTitle>
                <CardDescription className="text-xs">
                  Semua komentar sudah diselesaikan atau sesuaikan filter Anda.
                </CardDescription>
              </Card>
            ) : (
              filteredComments.map((comment) => {
                const linkedPost = posts.find(p => p.id === comment.post_id);
                
                return (
                  <Card key={comment.id} className="overflow-hidden border border-slate-100 hover:shadow-md transition-shadow">
                    <CardHeader className="bg-slate-50/50 p-4 border-b border-slate-100 flex flex-row items-center justify-between gap-3 space-y-0">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                          {comment.username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <span className="font-semibold text-sm text-slate-800">{comment.username}</span>
                          <span className="text-[10px] text-muted-foreground block">
                            {new Date(comment.created_at).toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {comment.replied ? (
                          comment.replied_by === "ai" ? (
                            <Badge className="bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-50 flex items-center gap-1 font-semibold text-[10px] py-0.5">
                              <Bot className="h-3 w-3" /> Dibalas AI
                            </Badge>
                          ) : (
                            <Badge className="bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-50 flex items-center gap-1 font-semibold text-[10px] py-0.5">
                              <User className="h-3 w-3" /> Dibalas Manual
                            </Badge>
                          )
                        ) : (
                          <Badge className="bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-50 font-semibold text-[10px] py-0.5">
                            Belum Dibalas
                          </Badge>
                        )}
                        {linkedPost?.permalink && (
                          <a 
                            href={linkedPost.permalink} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="text-xs text-honey hover:underline font-semibold"
                          >
                            Buka Post ↗
                          </a>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="p-4 space-y-4">
                      {/* Comment Message */}
                      <p className="text-sm text-slate-800 bg-amber-50/20 p-3 rounded-lg border border-amber-100/40">
                        {comment.message}
                      </p>

                      {/* Reply Section */}
                      {comment.replied ? (
                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-1">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Jawaban Kita:</span>
                          <p className="text-sm text-slate-700 italic">"{comment.reply_message}"</p>
                          {comment.replied_at && (
                            <span className="text-[9px] text-muted-foreground block text-right">
                              Dibalas pada: {new Date(comment.replied_at).toLocaleString('id-ID')}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-3 pt-1">
                          <div className="flex gap-2">
                            <Input
                              placeholder="Ketik jawaban manual di sini..."
                              value={quickReplies[comment.id] || ""}
                              onChange={(e) => setQuickReplies(prev => ({ ...prev, [comment.id]: e.target.value }))}
                              className="text-sm focus-visible:ring-amber-500"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleSendManualReply(comment.id, comment.channel);
                                }
                              }}
                            />
                            <Button
                              onClick={() => handleSendManualReply(comment.id, comment.channel)}
                              disabled={replyingId === comment.id || aiReplyingId === comment.id}
                              className="bg-slate-800 hover:bg-slate-900 text-white shrink-0"
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="flex justify-end">
                            <Button
                              onClick={() => handleTriggerAiReply(comment.id, comment.channel)}
                              disabled={replyingId === comment.id || aiReplyingId === comment.id}
                              variant="outline"
                              size="sm"
                              className="text-amber-600 border-amber-200 bg-amber-50/30 hover:bg-amber-50 hover:text-amber-700 font-semibold text-xs flex items-center gap-1.5"
                            >
                              <Bot className="h-3.5 w-3.5" />
                              Balas dengan AI Asisten
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>

          {/* Ad Post Settings Panel (Right Column, span 1) */}
          <div className="space-y-4">
            <Card className="shadow-sm border">
              <CardHeader className="p-4 border-b">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sliders className="h-4 w-4 text-honey" />
                  Filter Auto-Reply per Konten
                </CardTitle>
                <CardDescription className="text-xs">
                  Aktifkan/nonaktifkan auto-reply AI untuk postingan iklan tertentu secara spesifik.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-3 max-h-[500px] overflow-y-auto">
                {posts.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">Tidak ada konten iklan terdaftar. Klik "Sinkronkan Meta API" di atas.</p>
                ) : (
                  posts.map((post) => (
                    <div key={post.id} className="flex items-center justify-between border-b pb-2.5 last:border-0 last:pb-0">
                      <div className="space-y-0.5 max-w-[170px]">
                        <span className="font-mono text-[10px] text-slate-500 block truncate" title={post.id}>
                          ID: {post.id}
                        </span>
                        {post.permalink ? (
                          <a 
                            href={post.permalink} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-xs text-honey font-semibold hover:underline block truncate"
                          >
                            Lihat Postingan ↗
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground italic block">Iklan Tersembunyi</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-500">AI:</span>
                        <Switch
                          checked={post.auto_reply_active}
                          onCheckedChange={() => handleTogglePostAutoReply(post.id, post.auto_reply_active)}
                        />
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

        </div>
      ) : (
        /* Settings Tab Content */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          {/* Config Forms (Left Side, span 2) */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="shadow-sm border">
              <CardHeader className="border-b">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sliders className="h-4 w-4 text-honey" />
                  Kredensial Integrasi Meta API
                </CardTitle>
                <CardDescription className="text-xs">
                  Hubungkan Araa Honey Hub ke halaman Facebook dan Instagram Business milik Anda.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="fb-page-id">ID Halaman Facebook (Facebook Page ID)</Label>
                    <Input
                      id="fb-page-id"
                      placeholder="Masukkan FB Page ID Anda..."
                      value={facebookPageId}
                      onChange={(e) => setFacebookPageId(e.target.value)}
                      className="text-sm focus-visible:ring-amber-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ig-account-id">ID Akun Instagram Business</Label>
                    <Input
                      id="ig-account-id"
                      placeholder="Masukkan Instagram Account ID..."
                      value={instagramAccountId}
                      onChange={(e) => setInstagramAccountId(e.target.value)}
                      className="text-sm focus-visible:ring-amber-500"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="page-token" className="flex items-center justify-between">
                    <span>Token Akses Halaman Meta (Page Access Token Permanen)</span>
                    <button 
                      type="button" 
                      onClick={() => setShowToken(!showToken)}
                      className="text-honey hover:underline text-xs font-semibold flex items-center gap-1"
                    >
                      {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      {showToken ? "Sembunyikan" : "Tampilkan"}
                    </button>
                  </Label>
                  <Input
                    id="page-token"
                    type={showToken ? "text" : "password"}
                    placeholder="Masukkan EAAN... token akses permanen dari Meta Developer Portal"
                    value={pageAccessToken}
                    onChange={(e) => setPageAccessToken(e.target.value)}
                    className="text-sm font-mono focus-visible:ring-amber-500"
                  />
                </div>

                <div className="flex pt-2">
                  <Button 
                    onClick={handleSubscribePage} 
                    disabled={subscribing}
                    variant="outline"
                    className="border-blue-200 text-blue-700 bg-blue-50/30 hover:bg-blue-50 hover:text-blue-800 font-semibold"
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${subscribing ? "animate-spin" : ""}`} />
                    Hubungkan Webhook Halaman
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border">
              <CardHeader className="border-b">
                <CardTitle className="text-base flex items-center gap-2">
                  <Bot className="h-4 w-4 text-honey" />
                  Konfigurasi Asisten AI (Prompting & Target CS)
                </CardTitle>
                <CardDescription className="text-xs">
                  Atur perilaku, data Q&A khusus, dan link redirect CS ketika AI membalas komentar.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-semibold text-slate-800">Auto-Reply AI Aktif secara Global</Label>
                    <span className="text-xs text-muted-foreground block">
                      Jika dimatikan, komentar tetap dicatat tetapi AI tidak akan membalas otomatis.
                    </span>
                  </div>
                  <Switch
                    checked={autoReplyEnabled}
                    onCheckedChange={setAutoReplyEnabled}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="cs-whatsapp">Nomor WhatsApp CS (Tujuan Pemesanan)</Label>
                  <Input
                    id="cs-whatsapp"
                    placeholder="Contoh: 0878-3703-5470"
                    value={csWhatsappNumber}
                    onChange={(e) => setCsWhatsappNumber(e.target.value)}
                    className="text-sm focus-visible:ring-amber-500"
                  />
                  <span className="text-[10px] text-muted-foreground">
                    Sistem otomatis merubah format nomor ini menjadi link klik langsung `wa.me/` ketika AI merespon kontak.
                  </span>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ai-instructions">Instruksi & Q&A Kustom untuk Asisten AI</Label>
                  <textarea
                    id="ai-instructions"
                    rows={6}
                    placeholder="Tulis panduan menjawab di sini... Contoh:&#10;- Jika konsumen skeptis dengan keaslian, jelaskan madu kita murni 100% bersertifikat dan bergaransi uang kembali.&#10;- Jika ada yang membandingkan dengan madu supermarket, jelaskan madu kita murni mentah tanpa pemanasan."
                    value={systemInstruction}
                    onChange={(e) => setSystemInstruction(e.target.value)}
                    className="w-full text-sm p-3 rounded-lg border border-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:border-transparent"
                  />
                </div>

                <div className="flex justify-end items-center pt-2">
                  <Button 
                    onClick={() => saveSettingsMutation.mutate()} 
                    disabled={saveSettingsMutation.isPending}
                    className="bg-amber-500 hover:bg-amber-600 text-white font-medium"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    Simpan Pengaturan
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Reference Pricing and System Webhook Setup Info (Right Side, span 1) */}
          <div className="space-y-6">
            {/* Live Pricing Reference */}
            <Card className="shadow-sm border">
              <CardHeader className="p-4 border-b">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                  Harga Terbaca Database
                </CardTitle>
                <CardDescription className="text-[11px]">
                  Daftar harga retail madu Araa saat ini. AI membaca tabel ini secara real-time.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4">
                <div className="space-y-2">
                  {prices.map((p: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center text-xs border-b pb-1.5 last:border-0 last:pb-0">
                      <span className="text-slate-600">Madu {p.honey_type} {p.product_sizes?.name}</span>
                      <span className="font-bold text-slate-800">Rp {Number(p.price).toLocaleString('id-ID')}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Webhook Instruction Card */}
            <Card className="shadow-sm border bg-slate-900 text-white">
              <CardHeader className="p-4 border-b border-slate-800">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Sliders className="h-4 w-4 text-amber-400" />
                  Konfigurasi Webhook Meta
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3 text-xs leading-relaxed opacity-90">
                <p>Untuk mengaktifkan respon instan real-time, masukkan detail berikut pada menu <strong>Webhooks</strong> di Meta Developer App Anda:</p>
                <div className="space-y-2.5 bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono text-[11px]">
                  <div>
                    <span className="text-slate-500 block">Callback URL:</span>
                    <span className="text-amber-400 break-all select-all">https://app.araahoney.my.id/api/webhooks/meta-comments</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Verify Token:</span>
                    <span className="text-amber-400 select-all">araahoney123</span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400">Hubungkan webhook tersebut ke topik <strong>feed</strong> (di Page Facebook) dan <strong>comments</strong> (di Akun Instagram Business).</p>
              </CardContent>
            </Card>
          </div>

        </div>
      )}
    </div>
  );
}

export interface AdMetrics {
  id: string;
  name: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  cpc: number;
  frequency?: number;
  adset_name?: string;
  campaign_name?: string;
  preview_url?: string;
}

export interface AdSetMetrics {
  id: string;
  name: string;
  status: string;
  campaign_name: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  cpc: number;
  daily_budget: number;
}

export interface CampaignMetrics {
  id: string;
  name: string;
  status: string;
  objective: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  cpc: number;
  daily_budget: number;
}

export interface RealSalesData {
  totalRevenue: number;
  totalOrders: number;
  totalCogs: number;
  totalNetProfit: number;
  realRoas: number;
}

export interface CreativeInsight {
  adId: string;
  adName: string;
  adsetName: string;
  status: "WINNER" | "WARNING" | "FATIGUE" | "TESTING";
  headline: string;
  diagnosis: string;
  actionRecommendation: string;
  ctr: number;
  spend: number;
  estimatedRoas: number;
}

export interface AIAdsAnalysisResult {
  summary: {
    periodText: string;
    totalSpend: number;
    realRevenue: number;
    realNetProfit: number;
    realRoas: number;
    totalOrders: number;
    avgCpc: number;
    avgCtr: number;
    healthScore: number; // 0 - 100
    healthStatus: "Sangat Sehat" | "Cukup Sehat" | "Perlu Evaluasi" | "Kritis (Boncos)";
  };
  campaignInsights: {
    topCampaigns: CampaignMetrics[];
    underperformingCampaigns: CampaignMetrics[];
    budgetRecommendations: string[];
  };
  creativeInsights: CreativeInsight[];
  nextDayActionPlan: string[];
  creativeIdeas: {
    title: string;
    hook: string;
    angle: string;
    targetAudience: string;
  }[];
  telegramFormattedText: string;
}

function formatIDR(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

/**
 * Core AI Media Buyer Evaluation Engine
 */
export function generateAIAdsAnalysis(
  campaigns: CampaignMetrics[],
  adsets: AdSetMetrics[],
  ads: AdMetrics[],
  sales: RealSalesData,
  periodName: string = "7 Hari Terakhir"
): AIAdsAnalysisResult {
  const totalSpend = campaigns.reduce((sum, c) => sum + (c.spend || 0), 0);
  const totalImpressions = campaigns.reduce((sum, c) => sum + (c.impressions || 0), 0);
  const totalClicks = campaigns.reduce((sum, c) => sum + (c.clicks || 0), 0);
  
  const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const realRoas = totalSpend > 0 ? sales.totalRevenue / totalSpend : 0;
  const realNetProfit = sales.totalRevenue - sales.totalCogs - totalSpend;

  // Calculate Health Score
  let healthScore = 50;
  if (realRoas >= 4.0) healthScore += 35;
  else if (realRoas >= 3.0) healthScore += 25;
  else if (realRoas >= 2.0) healthScore += 10;
  else healthScore -= 20;

  if (avgCtr >= 1.5) healthScore += 15;
  else if (avgCtr < 0.8) healthScore -= 15;

  healthScore = Math.max(10, Math.min(98, Math.round(healthScore)));

  let healthStatus: AIAdsAnalysisResult["summary"]["healthStatus"] = "Cukup Sehat";
  if (healthScore >= 80) healthStatus = "Sangat Sehat";
  else if (healthScore >= 60) healthStatus = "Cukup Sehat";
  else if (healthScore >= 40) healthStatus = "Perlu Evaluasi";
  else healthStatus = "Kritis (Boncos)";

  // Campaign evaluation
  const activeCampaigns = campaigns.filter(c => c.status === "ACTIVE");
  const topCampaigns = [...activeCampaigns].sort((a, b) => (b.conversions || 0) - (a.conversions || 0)).slice(0, 3);
  const underperformingCampaigns = [...activeCampaigns].filter(c => c.spend > 100000 && (c.conversions === 0 || c.ctr < 0.8));

  // Budget recommendations
  const budgetRecommendations: string[] = [];
  if (topCampaigns.length > 0 && realRoas >= 3.0) {
    budgetRecommendations.push(`Tingkatkan anggaran harian 15-20% pada kampanye '${topCampaigns[0].name}' karena menghasilkan efisiensi penjualan tertinggi.`);
  }
  if (underperformingCampaigns.length > 0) {
    budgetRecommendations.push(`Kurangi atau jeda kampanye '${underperformingCampaigns[0].name}' yang telah menghabiskan ${formatIDR(underperformingCampaigns[0].spend)} dengan konversi minim.`);
  }

  // Micro ADS / Creative Deep-Dive Analysis
  const creativeInsights: CreativeInsight[] = ads.map(ad => {
    const ctr = ad.impressions > 0 ? (ad.clicks / ad.impressions) * 100 : 0;
    const estRoas = ad.spend > 0 ? ((ad.conversions * 125000) / ad.spend) : 0;

    let status: CreativeInsight["status"] = "TESTING";
    let headline = "Kinerja Standar";
    let diagnosis = "Materi iklan berjalan normal dalam batas wajar.";
    let actionRecommendation = "Pertahankan dan pantau metrik harian.";

    if (ctr >= 1.5 && (ad.conversions > 10 || estRoas >= 3.0)) {
      status = "WINNER";
      headline = "⭐ Materi Iklan Pemenang (High Hook & High Convert)";
      diagnosis = `CTR tinggi (${ctr.toFixed(2)}%) membuktikan hook 3 detik pertama sangat memikat audiens, dan pesan di iklan selaras dengan closing di chat.`;
      actionRecommendation = "Jadikan materi ini sebagai acuan utama. Buat 2 variasi baru dengan konsep visual serupa.";
    } else if (ctr >= 1.5 && ad.conversions < 3 && ad.spend > 200000) {
      status = "WARNING";
      headline = "⚠️ Hook Menarik tapi Miskoneksi Closing";
      diagnosis = `Banyak yang klik (CTR ${ctr.toFixed(2)}%), namun sedikit yang checkout. Kemungkinan ada ketidaksesuaian harga atau penawaran antara teks iklan dengan CS.`;
      actionRecommendation = "Perjelas harga promo paket madu langsung di gambar/video agar audiens yang klik sudah terfilter siap beli.";
    } else if (ctr < 0.8 && ad.spend > 250000) {
      status = "FATIGUE";
      headline = "🔄 Indikasi Jenuh / Creative Fatigue";
      diagnosis = `CTR rendah (${ctr.toFixed(2)}%) dan biaya per klik meningkat. Audiens sudah sering melihat visual ini dan mulai mengabaikannya.`;
      actionRecommendation = "Ganti thumbnail/cover video dan perbarui 3 detik pembuka video dengan sudut pandang (angle) baru.";
    } else if (ad.spend < 150000) {
      status = "TESTING";
      headline = "⏳ Masih Tahap Penjajakan (Learning Phase)";
      diagnosis = "Data tayangan belum cukup untuk kesimpulan mutlak.";
      actionRecommendation = "Biarkan berjalan hingga menjangkau minimal 3.000 tayangan.";
    }

    return {
      adId: ad.id,
      adName: ad.name,
      adsetName: ad.adset_name || "Adset Terkait",
      status,
      headline,
      diagnosis,
      actionRecommendation,
      ctr,
      spend: ad.spend,
      estimatedRoas: estRoas
    };
  });

  // Action Plan
  const nextDayActionPlan: string[] = [
    `Fokuskan 60-70% alokasi anggaran pada kreatif pemenang dengan ROAS > 3.5x.`,
    `Evaluasi materi iklan yang CTR-nya di bawah 0.8% untuk diistirahatkan atau diganti sudut pandangnya.`,
    `Pastikan stok kemasan madu varian terlaris (Akasia 1KG) aman untuk memenuhi lonjakan order.`,
  ];

  // Creative Ideas for Future Ads
  const creativeIdeas = [
    {
      title: "UGC Bukti Uji Keaslian Madu di Air Dingin",
      hook: "'Jangan beli madu sebelum tahu cara tes madu asli vs sintetis ini...'",
      angle: "Edukasi + Pembuktian Kualitas Alami Tanpa Gula",
      targetAudience: "Pria & Wanita 28-55 tahun yang peduli kesehatan keluarga & herbal"
    },
    {
      title: "Solusi Alami Maag & Asam Lambung Kambuh",
      hook: "'Tiap pagi perut perih & kembung? Coba minum 2 sendok madu hutan ini sebelum sarapan.'",
      angle: "Problem-Agitate-Solution (Keluhan Lambung)",
      targetAudience: "Pekerja kantoran & ibu rumah tangga 25-45 tahun"
    },
    {
      title: "Video Panen Langsung dari Pohon Hutan Liar",
      hook: "Visual macro zoom-in sarang lebah meneteskan madu segar kental ke dalam botol",
      angle: "Visual Aesthetic & Freshness (Kemurnian 100%)",
      targetAudience: "Pencinta produk organik & konsumen loyal"
    }
  ];

  // Telegram Markdown Formatted Text
  const nowStr = new Date().toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  const statusEmoji = healthStatus === "Sangat Sehat" ? "🟢" : healthStatus === "Cukup Sehat" ? "🟡" : "🔴";

  const topAds = creativeInsights.filter(c => c.status === "WINNER");
  const warningAds = creativeInsights.filter(c => c.status === "WARNING" || c.status === "FATIGUE");

  const telegramFormattedText = `🍯 *ARAA HONEY - ADS INTELLIGENCE REPORT*
📅 *Tanggal:* ${nowStr} (${periodName})
Status Iklan: ${statusEmoji} *${healthStatus}* (Skor: ${healthScore}/100)

━━━━━━━━━━━━━━━━━━━━━
📊 *1. KINERJA KEUANGAN RIIL:*
• Total Biaya Iklan: \`${formatIDR(totalSpend)}\`
• Omzet Penjualan Riil: \`${formatIDR(sales.totalRevenue)}\` (${sales.totalOrders} Pesanan)
• Estimasi HPP Madu: \`${formatIDR(sales.totalCogs)}\`
• *Laba Bersih Real:* \`${formatIDR(realNetProfit)}\`
• *Real ROAS:* *${realRoas.toFixed(2)}x* (Target > 3.0x)

━━━━━━━━━━━━━━━━━━━━━
🎯 *2. RANGKUMAN TINGKAT IKLAN (ADS):*
${topAds.length > 0 ? `🏆 *Iklan Pemenang (Top Performer):*
• *${topAds[0].adName}*
  CTR: \`${topAds[0].ctr.toFixed(2)}%\` | Spend: \`${formatIDR(topAds[0].spend)}\`
  👉 *Saran AI:* ${topAds[0].actionRecommendation}
` : "• Belum ada materi iklan yang mencapai status pemenang mutlak."}
${warningAds.length > 0 ? `
⚠️ *Iklan Perlu Diperbaiki:*
• *${warningAds[0].adName}*
  CTR: \`${warningAds[0].ctr.toFixed(2)}%\` | Spend: \`${formatIDR(warningAds[0].spend)}\`
  👉 *Saran AI:* ${warningAds[0].actionRecommendation}
` : ""}
━━━━━━━━━━━━━━━━━━━━━
💡 *3. REKOMENDASI AKSI MEDIA BUYER:*
1. ${nextDayActionPlan[0]}
2. ${nextDayActionPlan[1]}
3. ${nextDayActionPlan[2]}

🎬 *Ide Konsep Iklan Baru Berikutnya:*
• *Angle:* ${creativeIdeas[0].angle}
• *Hook Pembuka:* _${creativeIdeas[0].hook}_

━━━━━━━━━━━━━━━━━━━━━
_Laporan otomatis oleh Jarvis AI Ads Intelligence - Araa Honey Hub_`;

  return {
    summary: {
      periodText: periodName,
      totalSpend,
      realRevenue: sales.totalRevenue,
      realNetProfit,
      realRoas,
      totalOrders: sales.totalOrders,
      avgCpc,
      avgCtr,
      healthScore,
      healthStatus
    },
    campaignInsights: {
      topCampaigns,
      underperformingCampaigns,
      budgetRecommendations
    },
    creativeInsights,
    nextDayActionPlan,
    creativeIdeas,
    telegramFormattedText
  };
}

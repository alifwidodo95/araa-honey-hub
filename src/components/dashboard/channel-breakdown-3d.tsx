import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatIDR } from "@/lib/theme";
import { getSalesChannelBreakdown, ChannelStat, ChannelBreakdownResponse } from "@/lib/dashboard.functions";
import { 
  Package, 
  DollarSign, 
  TrendingUp, 
  Layers, 
  Calendar, 
  PieChart as PieIcon, 
  Sparkles,
  ArrowUpRight
} from "lucide-react";

type MetricType = "paket" | "omzet" | "laba";
type PeriodType = "today" | "yesterday" | "7days" | "month";

interface DonutSliceGeometry {
  index: number;
  stat: ChannelStat;
  value: number;
  percentage: number;
  startAngle: number;
  endAngle: number;
  midAngle: number;
  pathTop: string;
  pathExtrusion: string;
  dx: number;
  dy: number;
}

// Convert polar to cartesian coordinates
function polarToCartesian(cx: number, cy: number, r: number, angleRad: number) {
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad),
  };
}

// Generate an SVG path for a donut wedge
function createDonutArc(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  startAngle: number,
  endAngle: number
): string {
  const delta = endAngle - startAngle;
  // If slice spans almost full circle, split into two arcs to avoid SVG degenerate circle bug
  if (delta >= 2 * Math.PI - 0.002) {
    const mid = startAngle + Math.PI;
    return `${createDonutArc(cx, cy, rInner, rOuter, startAngle, mid)} ${createDonutArc(cx, cy, rInner, rOuter, mid, endAngle)}`;
  }

  const p1 = polarToCartesian(cx, cy, rOuter, startAngle);
  const p2 = polarToCartesian(cx, cy, rOuter, endAngle);
  const p3 = polarToCartesian(cx, cy, rInner, endAngle);
  const p4 = polarToCartesian(cx, cy, rInner, startAngle);

  const largeArcFlag = delta > Math.PI ? 1 : 0;

  return [
    `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`,
    `A ${rOuter} ${rOuter} 0 ${largeArcFlag} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
    `L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)}`,
    `A ${rInner} ${rInner} 0 ${largeArcFlag} 0 ${p4.x.toFixed(2)} ${p4.y.toFixed(2)}`,
    "Z",
  ].join(" ");
}

export function ChannelBreakdown3D({ showFinancials = true }: { showFinancials?: boolean }) {
  const [metric, setMetric] = useState<MetricType>("paket");
  const [period, setPeriod] = useState<PeriodType>("today");
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  const { data, isLoading } = useQuery<ChannelBreakdownResponse>({
    queryKey: ["dashboard-channel-breakdown", period],
    queryFn: () => getSalesChannelBreakdown({ data: { period } }),
    refetchInterval: 30000,
  });

  const channels = data?.channels || [];
  const totalPaket = data?.total_paket || 0;
  const totalOmzet = data?.total_omzet || 0;
  const totalLaba = data?.total_laba_kotor || 0;

  // Geometry configuration
  const svgSize = 360;
  const center = svgSize / 2;
  const rOuter = 135;
  const rInner = 74;
  const extrusionDepth = 10; // 3D depth in px

  // Calculate slices based on selected metric
  const slices: DonutSliceGeometry[] = useMemo(() => {
    if (!channels || channels.length === 0) return [];

    let totalVal = 0;
    channels.forEach((c) => {
      const val =
        metric === "paket"
          ? c.total_paket
          : metric === "omzet"
          ? c.omzet
          : Math.max(0, c.laba_kotor);
      totalVal += val;
    });

    if (totalVal <= 0) return [];

    let currentAngle = -Math.PI / 2; // start from 12 o'clock

    return channels.map((c, idx) => {
      const val =
        metric === "paket"
          ? c.total_paket
          : metric === "omzet"
          ? c.omzet
          : Math.max(0, c.laba_kotor);

      const sliceAngle = (val / totalVal) * (2 * Math.PI);
      const startAngle = currentAngle;
      const endAngle = currentAngle + sliceAngle;
      currentAngle = endAngle;

      const midAngle = startAngle + sliceAngle / 2;
      const percentage = (val / totalVal) * 100;

      // Pop-out radial vector (16px outwards)
      const popDist = 16;
      const dx = Math.cos(midAngle) * popDist;
      const dy = Math.sin(midAngle) * popDist;

      // Top cap path
      const pathTop = createDonutArc(center, center, rInner, rOuter, startAngle, endAngle);
      // Extruded bottom path (offset down by extrusionDepth)
      const pathExtrusion = createDonutArc(
        center,
        center + extrusionDepth,
        rInner,
        rOuter,
        startAngle,
        endAngle
      );

      return {
        index: idx,
        stat: c,
        value: val,
        percentage,
        startAngle,
        endAngle,
        midAngle,
        pathTop,
        pathExtrusion,
        dx,
        dy,
      };
    });
  }, [channels, metric, center, rInner, rOuter, extrusionDepth]);

  // Find currently active channel stat
  const activeStat = useMemo(() => {
    if (!hoveredKey) return null;
    return channels.find((c) => c.key === hoveredKey) || null;
  }, [hoveredKey, channels]);

  const activeSlice = useMemo(() => {
    if (!hoveredKey) return null;
    return slices.find((s) => s.stat.key === hoveredKey) || null;
  }, [hoveredKey, slices]);

  // Order slices so hovered slice renders last (on top of others)
  const sortedSlices = useMemo(() => {
    return [...slices].sort((a, b) => {
      if (a.stat.key === hoveredKey) return 1;
      if (b.stat.key === hoveredKey) return -1;
      return a.index - b.index;
    });
  }, [slices, hoveredKey]);

  return (
    <Card className="rounded-2xl border-muted/50 shadow-xs overflow-hidden bg-card transition-all duration-300 hover:shadow-md">
      {/* Header with Title & Controls */}
      <CardHeader className="pb-3 border-b border-muted/20">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-honey/15 text-honey">
                <PieIcon className="w-4 h-4" />
              </div>
              <CardTitle className="text-base font-bold text-foreground">
                Distribusi Saluran Penjualan
              </CardTitle>
              <span className="text-[10px] bg-honey/10 text-honey font-bold px-2 py-0.5 rounded-full flex items-center gap-1 border border-honey/20">
                <Sparkles className="w-3 h-3 animate-pulse" /> 3D Interaktif
              </span>
            </div>
            <CardDescription className="text-xs text-muted-foreground">
              Arahkan mouse ke irisan diagram untuk melihat animasi 3D terangkat dan detail lengkap profitabilitas
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Metric Toggle: Paket / Omzet / Laba */}
            <div className="flex items-center p-0.5 rounded-xl bg-muted/60 border border-muted/80 text-xs">
              <button
                type="button"
                onClick={() => setMetric("paket")}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium transition-all ${
                  metric === "paket"
                    ? "bg-card text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Package className="w-3.5 h-3.5" />
                <span>Paket</span>
              </button>
              {showFinancials && (
                <>
                  <button
                    type="button"
                    onClick={() => setMetric("omzet")}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium transition-all ${
                      metric === "omzet"
                        ? "bg-card text-foreground shadow-xs font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <DollarSign className="w-3.5 h-3.5" />
                    <span>Omzet</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMetric("laba")}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium transition-all ${
                      metric === "laba"
                        ? "bg-card text-foreground shadow-xs font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>Untung</span>
                  </button>
                </>
              )}
            </div>

            {/* Quick Period Filter */}
            <div className="flex items-center p-0.5 rounded-xl bg-muted/60 border border-muted/80 text-xs">
              {(
                [
                  { id: "today", label: "Hari Ini" },
                  { id: "yesterday", label: "Kemarin" },
                  { id: "7days", label: "7 Hari" },
                  { id: "month", label: "Bulan Ini" },
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPeriod(p.id)}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                    period === p.id
                      ? "bg-amber-500 text-white font-semibold shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-6 pb-6">
        {isLoading ? (
          <div className="h-80 flex flex-col items-center justify-center space-y-3">
            <div className="w-10 h-10 border-4 border-honey/30 border-t-honey rounded-full animate-spin" />
            <p className="text-xs text-muted-foreground">Mengkalkulasi saluran penjualan...</p>
          </div>
        ) : channels.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center">
            <p className="text-sm font-semibold text-muted-foreground">
              Tidak ada data penjualan pada periode ini.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* LEFT SIDE: 3D Donut Chart Interactive Stage */}
            <div className="lg:col-span-6 flex flex-col items-center justify-center relative">
              {/* Isometric 3D Perspective Box */}
              <div 
                className="relative flex items-center justify-center"
                style={{
                  perspective: "1000px",
                  width: `${svgSize}px`,
                  height: `${svgSize}px`,
                }}
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                }}
                onMouseLeave={() => {
                  setHoveredKey(null);
                  setMousePos(null);
                }}
              >
                {/* SVG 3D Canvas */}
                <svg
                  width={svgSize}
                  height={svgSize}
                  className="overflow-visible select-none"
                  style={{
                    transform: "rotateX(20deg)",
                    transformOrigin: "center center",
                    transition: "transform 0.4s ease",
                  }}
                >
                  <defs>
                    {/* Dynamic High Elevation Shadow Filter for Hovered Slice */}
                    <filter id="lifted-shadow" x="-50%" y="-50%" width="200%" height="200%">
                      <feDropShadow dx="0" dy="18" stdDeviation="12" floodOpacity="0.45" floodColor="#000000" />
                      <feDropShadow dx="0" dy="6" stdDeviation="4" floodOpacity="0.25" floodColor="#000000" />
                    </filter>
                    
                    {/* Normal Subtle Drop Shadow for Resting Slices */}
                    <filter id="resting-shadow" x="-30%" y="-30%" width="160%" height="160%">
                      <feDropShadow dx="0" dy="5" stdDeviation="4" floodOpacity="0.2" floodColor="#000000" />
                    </filter>

                    {/* Gradient Definitions for Slices */}
                    {channels.map((c) => (
                      <linearGradient
                        key={`grad-${c.key}`}
                        id={`grad-${c.key}`}
                        x1="0%"
                        y1="0%"
                        x2="100%"
                        y2="100%"
                      >
                        <stop offset="0%" stopColor={c.color} stopOpacity="1" />
                        <stop offset="100%" stopColor={c.darkColor} stopOpacity="0.95" />
                      </linearGradient>
                    ))}
                  </defs>

                  {/* 1. Perfectly Concentric Center Disc (Shares exact same 3D projective geometry) */}
                  <circle
                    cx={center}
                    cy={center}
                    r={rInner - 5}
                    className="fill-card stroke-muted/60"
                    strokeWidth="1.5"
                    filter="url(#resting-shadow)"
                  />

                  {/* 2. Render 3D Donut Slices */}
                  <g>
                    {sortedSlices.map((s) => {
                      const isHovered = hoveredKey === s.stat.key;
                      const hasHover = hoveredKey !== null;

                      // Radial Pop-out translation
                      const transformStr = isHovered
                        ? `translate(${s.dx.toFixed(2)}px, ${s.dy.toFixed(2)}px) scale(1.05)`
                        : "translate(0px, 0px) scale(1)";

                      return (
                        <g
                          key={s.stat.key}
                          style={{
                            transform: transformStr,
                            transformOrigin: `${center}px ${center}px`,
                            transition: "transform 0.38s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease, filter 0.3s ease",
                            cursor: "pointer",
                            opacity: hasHover && !isHovered ? 0.45 : 1,
                          }}
                          onMouseEnter={() => setHoveredKey(s.stat.key)}
                        >
                          {/* 1. Extruded Bottom Face (3D Thickness Wall) */}
                          <path
                            d={s.pathExtrusion}
                            fill={s.stat.darkColor}
                            opacity={0.85}
                            filter="brightness(0.7)"
                          />

                          {/* 2. Top Cap Face */}
                          <path
                            d={s.pathTop}
                            fill={`url(#grad-${s.stat.key})`}
                            stroke="rgba(255, 255, 255, 0.35)"
                            strokeWidth={isHovered ? "2.5" : "1.2"}
                            filter={isHovered ? "url(#lifted-shadow) brightness(1.15)" : "url(#resting-shadow)"}
                            style={{
                              transition: "filter 0.3s ease, stroke-width 0.25s ease",
                            }}
                          />
                        </g>
                      );
                    })}
                  </g>
                </svg>

                {/* Dynamic Center Badge (Concentric & Tilted with matching 3D perspective) */}
                <div
                  className="absolute pointer-events-none flex flex-col items-center justify-center text-center p-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${(rInner - 5) * 2}px`,
                    height: `${(rInner - 5) * 2}px`,
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%) rotateX(20deg)",
                    transformOrigin: "center center",
                    zIndex: 20,
                  }}
                >
                  {activeStat ? (
                    <div className="space-y-0.5 animate-in fade-in zoom-in-95 duration-200">
                      <div className="text-lg leading-none">{activeStat.icon}</div>
                      <div className="text-[10px] font-bold text-foreground truncate max-w-[85px]" title={activeStat.label}>
                        {activeStat.label.replace(" (Scalev)", "")}
                      </div>
                      <div className="text-xs font-black truncate max-w-[90px]" style={{ color: activeStat.color }}>
                        {metric === "paket" && `${activeStat.total_paket} Pkt`}
                        {metric === "omzet" && (activeStat.omzet >= 1000000 ? `Rp ${(activeStat.omzet / 1000000).toFixed(2)} Jt` : formatIDR(activeStat.omzet))}
                        {metric === "laba" && (activeStat.laba_kotor >= 1000000 ? `Rp ${(activeStat.laba_kotor / 1000000).toFixed(2)} Jt` : formatIDR(activeStat.laba_kotor))}
                      </div>
                      <div className="text-[9px] font-semibold text-muted-foreground leading-none">
                        {activeSlice?.percentage.toFixed(1)}% porsi
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground leading-none">
                        Total {metric === "paket" ? "Order" : metric === "omzet" ? "Omzet" : "Laba"}
                      </div>
                      <div className="text-xs font-black text-foreground">
                        {metric === "paket" && `${totalPaket} Paket`}
                        {metric === "omzet" && `Rp ${(totalOmzet / 1000000).toFixed(2)} Jt`}
                        {metric === "laba" && `Rp ${(totalLaba / 1000000).toFixed(2)} Jt`}
                      </div>
                      <div className="text-[8px] text-amber-500 font-semibold flex items-center justify-center gap-0.5 leading-none">
                        <Sparkles className="w-2.5 h-2.5" /> Arahkan Mouse
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Floating Glassmorphism Tooltip - OUTSIDE 3D CONTAINER so it NEVER gets cut/covered by SVG */}
              {activeStat && mousePos && (
                <div
                  className="absolute pointer-events-none z-50 p-3 rounded-xl bg-card/95 backdrop-blur-xl border border-muted/80 shadow-2xl text-left transition-all duration-100 space-y-1.5 animate-in fade-in zoom-in-95"
                  style={{
                    left: `${mousePos.x > center ? Math.max(10, mousePos.x - 200) : Math.min(mousePos.x + 20, svgSize - 190)}px`,
                    top: `${mousePos.y > center ? Math.max(10, mousePos.y - 140) : Math.min(mousePos.y + 15, svgSize - 140)}px`,
                    borderColor: activeStat.color,
                    width: "190px",
                    boxShadow: `0 15px 30px -5px ${activeStat.color}35, 0 8px 12px -3px rgba(0, 0, 0, 0.25)`,
                  }}
                >
                  <div className="flex items-center gap-1.5 pb-1 border-b border-muted/30">
                    <span className="text-base">{activeStat.icon}</span>
                    <span className="text-xs font-bold text-foreground truncate">{activeStat.label}</span>
                  </div>
                  <div className="space-y-1 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Paket:</span>
                      <span className="font-bold text-foreground">
                        {activeStat.total_paket} <span className="text-[10px] font-normal text-muted-foreground">({activeStat.percent_paket.toFixed(1)}%)</span>
                      </span>
                    </div>
                    {showFinancials && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Omzet Bersih:</span>
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">
                            {formatIDR(activeStat.omzet)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">HPP Madu:</span>
                          <span className="font-medium text-muted-foreground">{formatIDR(activeStat.cogs)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Laba Kotor:</span>
                          <span className="font-bold text-amber-500">{formatIDR(activeStat.laba_kotor)}</span>
                        </div>
                        <div className="flex justify-between pt-1 border-t border-muted/20">
                          <span className="text-muted-foreground">Margin Untung:</span>
                          <span className="font-extrabold text-foreground">{activeStat.margin.toFixed(1)}%</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Sub-helper text */}
              <p className="text-[11px] text-muted-foreground mt-3 text-center">
                Piringan 3D interaktif: klik metrik di atas untuk mengubah proporsi sudut pandang
              </p>
            </div>

            {/* RIGHT SIDE: Interactive Channel Cards & Metrics */}
            <div className="lg:col-span-6 space-y-2.5">
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center justify-between">
                <span>Rincian Saluran ({channels.length} Aktif)</span>
                <span className="text-[11px] font-normal normal-case text-muted-foreground">
                  Hover kartu untuk menyorot
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {channels.map((c) => {
                  const isHovered = hoveredKey === c.key;
                  return (
                    <div
                      key={c.key}
                      onMouseEnter={() => setHoveredKey(c.key)}
                      onMouseLeave={() => setHoveredKey(null)}
                      className={`relative p-3.5 rounded-xl border transition-all duration-200 cursor-pointer overflow-hidden ${
                        isHovered
                          ? "bg-muted/70 shadow-md scale-[1.02]"
                          : "bg-muted/20 hover:bg-muted/40 border-muted/60"
                      }`}
                      style={{
                        borderLeftColor: c.color,
                        borderLeftWidth: "4px",
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm">{c.icon}</span>
                          <span className="text-xs font-bold text-foreground truncate max-w-[120px]">
                            {c.label}
                          </span>
                        </div>
                        <span
                          className="text-[11px] font-extrabold px-1.5 py-0.5 rounded-md"
                          style={{
                            backgroundColor: `${c.color}20`,
                            color: c.color,
                          }}
                        >
                          {c.total_paket} pkt
                        </span>
                      </div>

                      {/* Progress bar of percentage */}
                      <div className="w-full bg-muted/60 h-1.5 rounded-full mt-2.5 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${c.percent_paket}%`,
                            backgroundColor: c.color,
                          }}
                        />
                      </div>

                      {/* Financial Metrics */}
                      {showFinancials && (
                        <div className="mt-2.5 pt-2 border-t border-muted/30 flex items-center justify-between text-[11px]">
                          <div>
                            <div className="text-[10px] text-muted-foreground">Omzet</div>
                            <div className="font-bold text-foreground">{formatIDR(c.omzet)}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] text-muted-foreground">Untung (Margin)</div>
                            <div className="font-bold text-amber-500">
                              {formatIDR(c.laba_kotor)}{" "}
                              <span className="text-[10px] font-normal text-muted-foreground">
                                ({c.margin.toFixed(0)}%)
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Total Summary Footer Strip */}
              <div className="mt-3 p-3 rounded-xl bg-gradient-to-r from-muted/50 to-muted/20 border border-muted/60 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-bold text-foreground">Total Keseluruhan</span>
                </div>
                <div className="flex items-center gap-4">
                  <div>
                    <span className="text-muted-foreground">Order: </span>
                    <span className="font-bold text-foreground">{totalPaket} Paket</span>
                  </div>
                  {showFinancials && (
                    <>
                      <div>
                        <span className="text-muted-foreground">Omzet: </span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          {formatIDR(totalOmzet)}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Untung: </span>
                        <span className="font-extrabold text-amber-500">{formatIDR(totalLaba)}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

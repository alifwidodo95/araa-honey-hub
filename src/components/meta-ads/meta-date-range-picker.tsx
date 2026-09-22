import React, { useState, useMemo } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon, ChevronDown, ChevronLeft, ChevronRight, Check } from "lucide-react";

export interface MetaDateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  presetKey?: string;
  presetLabel?: string;
}

interface MetaDateRangePickerProps {
  value: MetaDateRange;
  onChange: (range: MetaDateRange) => void;
  className?: string;
}

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseYMD(str: string): Date {
  const parts = str.split("-");
  return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des"
];

const MONTH_NAMES_FULL = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

function formatIndoShort(ymd: string): string {
  if (!ymd) return "";
  const d = parseYMD(ymd);
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

function formatIndoInput(ymd: string): string {
  if (!ymd) return "";
  const d = parseYMD(ymd);
  return `${d.getDate()} ${MONTH_NAMES_FULL[d.getMonth()]}`;
}

// Compute presets based on Jakarta / local time
function getPresets(todayYmd: string) {
  const today = parseYMD(todayYmd);

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const d7 = new Date(today);
  d7.setDate(today.getDate() - 6);

  const d14 = new Date(today);
  d14.setDate(today.getDate() - 13);

  const d28 = new Date(today);
  d28.setDate(today.getDate() - 27);

  const d30 = new Date(today);
  d30.setDate(today.getDate() - 29);

  // Minggu ini (start Sunday)
  const thisWeekStart = new Date(today);
  thisWeekStart.setDate(today.getDate() - today.getDay());

  // Minggu lalu (previous Sunday to Saturday)
  const lastWeekEnd = new Date(thisWeekStart);
  lastWeekEnd.setDate(thisWeekStart.getDate() - 1);
  const lastWeekStart = new Date(lastWeekEnd);
  lastWeekStart.setDate(lastWeekEnd.getDate() - 6);

  // Bulan ini
  const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  // Bulan lalu
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

  return [
    { key: "today", label: "Hari Ini", start: toYMD(today), end: toYMD(today) },
    { key: "yesterday", label: "Kemarin", start: toYMD(yesterday), end: toYMD(yesterday) },
    { key: "today_and_yesterday", label: "Hari ini dan kemarin", start: toYMD(yesterday), end: toYMD(today) },
    { key: "last_7d", label: "7 hari terakhir", start: toYMD(d7), end: toYMD(today) },
    { key: "last_14d", label: "14 hari terakhir", start: toYMD(d14), end: toYMD(today) },
    { key: "last_28d", label: "28 hari terakhir", start: toYMD(d28), end: toYMD(today) },
    { key: "last_30d", label: "30 hari terakhir", start: toYMD(d30), end: toYMD(today) },
    { key: "this_week", label: "Minggu ini", start: toYMD(thisWeekStart), end: toYMD(today) },
    { key: "last_week", label: "Minggu lalu", start: toYMD(lastWeekStart), end: toYMD(lastWeekEnd) },
    { key: "this_month", label: "Bulan ini", start: toYMD(thisMonthStart), end: toYMD(today) },
    { key: "last_month", label: "Bulan lalu", start: toYMD(lastMonthStart), end: toYMD(lastMonthEnd) },
    { key: "custom", label: "Kustom", start: "", end: "" },
  ];
}

export function MetaDateRangePicker({ value, onChange, className }: MetaDateRangePickerProps) {
  const [open, setOpen] = useState(false);

  // Current WIB Today
  const todayYmd = useMemo(() => {
    const nowWib = new Date(Date.now() + 7 * 3600000);
    return nowWib.toISOString().slice(0, 10);
  }, []);

  const presets = useMemo(() => getPresets(todayYmd), [todayYmd]);

  // Draft state inside popover
  const [tempStart, setTempStart] = useState<string>(value.startDate || todayYmd);
  const [tempEnd, setTempEnd] = useState<string>(value.endDate || todayYmd);
  const [selectedPreset, setSelectedPreset] = useState<string>(value.presetKey || "last_7d");
  const [hoverDate, setHoverDate] = useState<string | null>(null);

  // Month currently displayed on left calendar
  const [viewMonthDate, setViewMonthDate] = useState<Date>(() => {
    const initDate = value.endDate ? parseYMD(value.endDate) : parseYMD(todayYmd);
    return new Date(initDate.getFullYear(), initDate.getMonth(), 1);
  });

  // Right calendar month is left month + 1
  const rightMonthDate = useMemo(() => {
    return new Date(viewMonthDate.getFullYear(), viewMonthDate.getMonth() + 1, 1);
  }, [viewMonthDate]);

  // Sync draft state when popover opens
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setTempStart(value.startDate);
      setTempEnd(value.endDate);
      setSelectedPreset(value.presetKey || "custom");
      const initDate = value.endDate ? parseYMD(value.endDate) : parseYMD(todayYmd);
      setViewMonthDate(new Date(initDate.getFullYear(), initDate.getMonth(), 1));
    }
    setOpen(newOpen);
  };

  // Select Preset Handler
  const handleSelectPreset = (p: typeof presets[0]) => {
    setSelectedPreset(p.key);
    if (p.key !== "custom") {
      setTempStart(p.start);
      setTempEnd(p.end);
      const targetMonth = parseYMD(p.end);
      setViewMonthDate(new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1));
    }
  };

  // Day Click Handler in Calendar
  const handleDayClick = (ymd: string) => {
    setSelectedPreset("custom");

    if (!tempStart || (tempStart && tempEnd)) {
      setTempStart(ymd);
      setTempEnd("");
    } else {
      // tempStart exists, tempEnd is empty
      if (ymd < tempStart) {
        setTempStart(ymd);
        setTempEnd(tempStart);
      } else {
        setTempEnd(ymd);
      }
    }
  };

  // Month navigation
  const prevMonth = () => {
    setViewMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setViewMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  // Apply Changes
  const handleUpdate = () => {
    const finalStart = tempStart || todayYmd;
    const finalEnd = tempEnd || finalStart;
    const activePreset = presets.find((p) => p.key === selectedPreset);

    onChange({
      startDate: finalStart <= finalEnd ? finalStart : finalEnd,
      endDate: finalStart <= finalEnd ? finalEnd : finalStart,
      presetKey: selectedPreset,
      presetLabel: activePreset?.label || "Kustom"
    });
    setOpen(false);
  };

  // Render Days for a given month
  const renderMonthDays = (baseMonthDate: Date) => {
    const year = baseMonthDate.getFullYear();
    const month = baseMonthDate.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 is Sunday
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: React.ReactNode[] = [];

    // Empty leading days
    for (let i = 0; i < firstDayIndex; i++) {
      cells.push(<div key={`empty-${i}`} className="h-8 w-8" />);
    }

    const currentEnd = tempEnd || (hoverDate && tempStart && hoverDate >= tempStart ? hoverDate : tempStart);

    for (let day = 1; day <= daysInMonth; day++) {
      const ymd = `${year}-${pad(month + 1)}-${pad(day)}`;
      const isStart = tempStart === ymd;
      const isEnd = (tempEnd === ymd) || (!tempEnd && hoverDate === ymd && ymd > tempStart);
      const isSingle = isStart && (!currentEnd || currentEnd === ymd);
      const inRange = tempStart && currentEnd && ymd > tempStart && ymd < currentEnd;
      const isToday = ymd === todayYmd;

      cells.push(
        <div 
          key={ymd} 
          className={`h-8 w-8 p-0 flex items-center justify-center relative ${
            inRange ? "bg-blue-50 dark:bg-blue-950/40" : ""
          } ${isStart && !isSingle ? "bg-gradient-to-r from-transparent to-blue-50 dark:to-blue-950/40" : ""} ${
            isEnd && !isSingle ? "bg-gradient-to-l from-transparent to-blue-50 dark:to-blue-950/40" : ""
          }`}
          onMouseEnter={() => {
            if (tempStart && !tempEnd) setHoverDate(ymd);
          }}
        >
          <button
            type="button"
            onClick={() => handleDayClick(ymd)}
            className={`h-7 w-7 text-xs font-medium flex items-center justify-center rounded-full transition-all cursor-pointer ${
              isStart || isEnd
                ? "bg-[#0064e0] text-white font-bold shadow-xs scale-105"
                : inRange
                ? "text-blue-900 dark:text-blue-200 font-semibold"
                : isToday
                ? "border border-[#0064e0] text-[#0064e0] font-bold"
                : "text-foreground hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            {day}
          </button>
        </div>
      );
    }

    return cells;
  };

  // Trigger button label display
  const triggerLabel = useMemo(() => {
    const p = presets.find((pr) => pr.key === value.presetKey);
    if (value.presetKey === "today" || (value.startDate === todayYmd && value.endDate === todayYmd)) {
      return `Hari Ini: ${formatIndoShort(value.startDate)}`;
    }
    if (value.startDate === value.endDate) {
      return `${p ? p.label : "Tanggal"}: ${formatIndoShort(value.startDate)}`;
    }
    if (p && p.key !== "custom") {
      return `${p.label}: ${formatIndoShort(value.startDate)} – ${formatIndoShort(value.endDate)}`;
    }
    return `${formatIndoShort(value.startDate)} – ${formatIndoShort(value.endDate)}`;
  }, [value, presets, todayYmd]);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={`h-9 px-3 text-xs bg-background border-border/80 hover:bg-muted/40 font-medium flex items-center gap-2 shadow-xs cursor-pointer ${className}`}
        >
          <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground" />
          <span>{triggerLabel}</span>
          <ChevronDown className="w-3 h-3 text-muted-foreground ml-0.5" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-[700px] p-0 shadow-2xl rounded-2xl border border-border/90 bg-background overflow-hidden animate-in fade-in-50 zoom-in-95 duration-150"
      >
        <div className="flex flex-row">
          {/* Left Sidebar: Presets */}
          <div className="w-[210px] border-r border-border/60 bg-muted/20 p-3 flex flex-col justify-between max-h-[460px] overflow-y-auto select-none">
            <div className="space-y-3">
              {/* Recently Used */}
              <div>
                <p className="text-[11px] font-bold text-muted-foreground mb-1.5 px-1.5">
                  Baru-baru ini digunakan
                </p>
                <div className="space-y-0.5">
                  {presets.slice(0, 3).map((p) => {
                    const isSelected = selectedPreset === p.key;
                    return (
                      <div
                        key={`recent-${p.key}`}
                        onClick={() => handleSelectPreset(p)}
                        className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                          isSelected ? "bg-primary/10 text-primary font-semibold" : "hover:bg-muted text-foreground"
                        }`}
                      >
                        <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                          isSelected ? "border-[#0064e0] bg-[#0064e0]" : "border-muted-foreground/60"
                        }`}>
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                        <span>{p.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-border/60 my-1" />

              {/* Full Presets List */}
              <div className="space-y-0.5">
                {presets.map((p) => {
                  const isSelected = selectedPreset === p.key;
                  return (
                    <div
                      key={p.key}
                      onClick={() => handleSelectPreset(p)}
                      className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                        isSelected ? "bg-primary/10 text-primary font-semibold" : "hover:bg-muted text-foreground"
                      }`}
                    >
                      <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                        isSelected ? "border-[#0064e0] bg-[#0064e0]" : "border-muted-foreground/60"
                      }`}>
                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <span>{p.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Main Section: Calendar & Actions */}
          <div className="flex-1 p-4 flex flex-col justify-between space-y-4">
            {/* Top Month Navigation Headers */}
            <div className="flex items-center justify-between pb-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={prevMonth}
                className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>

              <div className="flex items-center justify-around flex-1 text-xs font-bold text-foreground">
                <span>{MONTH_NAMES[viewMonthDate.getMonth()]} {viewMonthDate.getFullYear()}</span>
                <span>{MONTH_NAMES[rightMonthDate.getMonth()]} {rightMonthDate.getFullYear()}</span>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={nextMonth}
                className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            {/* Dual Calendars */}
            <div className="grid grid-cols-2 gap-4">
              {/* Left Calendar Month */}
              <div>
                <div className="grid grid-cols-7 gap-0 text-center mb-1">
                  {DAY_NAMES.map((d) => (
                    <span key={d} className="text-[10px] font-semibold text-muted-foreground">
                      {d}
                    </span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-y-1">
                  {renderMonthDays(viewMonthDate)}
                </div>
              </div>

              {/* Right Calendar Month */}
              <div>
                <div className="grid grid-cols-7 gap-0 text-center mb-1">
                  {DAY_NAMES.map((d) => (
                    <span key={d} className="text-[10px] font-semibold text-muted-foreground">
                      {d}
                    </span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-y-1">
                  {renderMonthDays(rightMonthDate)}
                </div>
              </div>
            </div>

            {/* Bottom Controls */}
            <div className="space-y-3 pt-3 border-t border-border/60">
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                  <input type="checkbox" className="rounded border-border text-primary focus:ring-0 h-3.5 w-3.5" disabled />
                  <span>Bandingkan</span>
                </label>

                <div className="flex items-center gap-2">
                  <div className="text-xs bg-muted/60 px-2.5 py-1 rounded border border-border/80 text-foreground font-medium">
                    {presets.find((p) => p.key === selectedPreset)?.label || "Kustom"}
                  </div>

                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="bg-background px-2.5 py-1 rounded border border-border text-foreground font-mono text-[11px]">
                      {formatIndoInput(tempStart)}
                    </span>
                    <span className="text-muted-foreground">-</span>
                    <span className="bg-background px-2.5 py-1 rounded border border-border text-foreground font-mono text-[11px]">
                      {formatIndoInput(tempEnd || tempStart)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Footer Buttons */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-muted-foreground italic">
                  Tanggal ditampilkan dalam Waktu Jakarta
                </span>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setOpen(false)}
                    className="h-8 text-xs cursor-pointer"
                  >
                    Batal
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleUpdate}
                    className="h-8 text-xs bg-[#0064e0] hover:bg-[#0052b8] text-white font-semibold px-4 cursor-pointer"
                  >
                    Update
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

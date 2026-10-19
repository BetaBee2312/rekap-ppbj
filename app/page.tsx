"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "./dashboard.css";

type ViewKey = "dashboard" | "monthly" | "yearly" | "data" | "reports" | "settings";

type MonthlyStat = {
  monthNumber: number;
  month: string;
  count: number;
  rowCount: number;
  amount: number;
};

type ExpenseItem = { category: string; amount: number; percent: number };
type RequestRow = {
  sourceRowNumber: number;
  date: string | null;
  noPpbj: string;
  requester: string;
  division: string;
  item: string;
  unit: string;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
  costCenter: string;
  needDate: string | null;
  reason: string;
  rawDate: string | null;
};

type DashboardData = {
  source: "MySQL";
  period: string;
  periodLabel: string;
  scope?: "month" | "year";
  kpis: {
    ppbjCount: number;
    rowCount: number;
    totalAmount: number;
    averageAmount: number;
    averagePpbjCount: number;
    missingAmountCount: number;
  };
  monthlyStats: MonthlyStat[];
  expenseBreakdown: ExpenseItem[];
  rows: RequestRow[];
  quality: {
    totalActiveRows: number;
    invalidDateCount: number;
    missingAmountCount: number;
  };
  years: number[];
  sync: {
    lastSuccessAt: string | null;
    rowsSynced: number;
    rowsChanged: number;
    rowsArchived: number;
    sourceRange: string | null;
  };
};

const TABLE_PAGE_SIZE = 15;
type TableKey = "monthly" | "yearly" | "data" | "reports";

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const COLORS = ["#387653", "#6497bb", "#d9aa60", "#b9a0d0", "#d38b86", "#80b9aa"];
const VIEW_META: Record<ViewKey, { label: string; title: string; description: string; eyebrow: string }> = {
  dashboard: { label: "Dashboard", title: "Dashboard Marketing", description: "Pantau permintaan PPBJ dan ringkasan biaya dari database.", eyebrow: "MARKETING OVERVIEW" },
  monthly: { label: "Rekap Bulanan", title: "Rekap Bulanan", description: "Tinjau pengajuan, nilai biaya, dan detail PPBJ untuk satu bulan.", eyebrow: "MONTHLY REPORT" },
  yearly: { label: "Rekap Tahunan", title: "Rekap Tahunan", description: "Bandingkan jumlah pengajuan dan nominal biaya dari Januari sampai Desember.", eyebrow: "YEARLY REPORT" },
  data: { label: "Data PPBJ", title: "Data PPBJ", description: "Telusuri seluruh baris PPBJ Marketing dalam tahun terpilih.", eyebrow: "DATA EXPLORER" },
  reports: { label: "Export Laporan", title: "Export Laporan", description: "Unduh laporan Excel berdesain rapi; ekspor tahunan dipisahkan menjadi 12 sheet per bulan.", eyebrow: "REPORT TOOLS" },
  settings: { label: "Sinkronisasi", title: "Status Sinkronisasi", description: "Periksa sumber data, kualitas data, dan jalankan sinkronisasi secara manual.", eyebrow: "DATA MANAGEMENT" },
};
const NAV_ITEMS: Array<{ key: ViewKey; icon: string; group: "workspace" | "preferences" }> = [
  { key: "dashboard", icon: "grid", group: "workspace" },
  { key: "monthly", icon: "calendar", group: "workspace" },
  { key: "yearly", icon: "chart", group: "workspace" },
  { key: "data", icon: "database", group: "workspace" },
  { key: "reports", icon: "download", group: "workspace" },
  { key: "settings", icon: "settings", group: "preferences" },
];
const IDR = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const INTEGER = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatDate(value: string | null) {
  if (!value) return "Perlu diperiksa";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function formatSyncDate(value: string | null) {
  if (!value) return "Belum pernah";
  const parsed = new Date(value.replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(parsed);
}

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const shared = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  switch (name) {
    case "grid": return <svg {...shared}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>;
    case "calendar": return <svg {...shared}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="m8 15 2 2 5-5"/></svg>;
    case "database": return <svg {...shared}><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>;
    case "chart": return <svg {...shared}><path d="M3 3v18h18"/><path d="m7 14 4-4 3 2 5-6"/><path d="M16 6h3v3"/></svg>;
    case "settings": return <svg {...shared}><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1a1.8 1.8 0 0 1-2.5 2.5l-.1-.1a1.8 1.8 0 0 0-3 .9v.2a1.8 1.8 0 0 1-3.6 0v-.2a1.8 1.8 0 0 0-3-.9l-.1.1a1.8 1.8 0 0 1-2.5-2.5l.1-.1a1.8 1.8 0 0 0-.9-3h-.2a1.8 1.8 0 0 1 0-3.6h.2a1.8 1.8 0 0 0 .9-3l-.1-.1a1.8 1.8 0 0 1 2.5-2.5l.1.1a1.8 1.8 0 0 0 3-.9v-.2a1.8 1.8 0 0 1 3.6 0v.2a1.8 1.8 0 0 0 3 .9l.1-.1a1.8 1.8 0 0 1 2.5 2.5l-.1.1a1.8 1.8 0 0 0 .9 3h.2a1.8 1.8 0 0 1 0 3.6h-.2a1.8 1.8 0 0 0-.9 3Z"/></svg>;
    case "search": return <svg {...shared}><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/></svg>;
    case "download": return <svg {...shared}><path d="M12 3v12m-5-5 5 5 5-5"/><path d="M4 17v3h16v-3"/></svg>;
    case "bell": return <svg {...shared}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>;
    case "chevron": return <svg {...shared}><path d="m7 10 5 5 5-5"/></svg>;
    case "wallet": return <svg {...shared}><rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9h18M16 14h2M6 5V3h12"/></svg>;
    case "receipt": return <svg {...shared}><path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3Z"/><path d="M8 8h8M8 12h8M8 16h4"/></svg>;
    case "clock": return <svg {...shared}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
    case "check": return <svg {...shared}><path d="m5 12 4 4L19 6"/></svg>;
    case "refresh": return <svg {...shared}><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.4-3"/></svg>;
    default: return <svg {...shared}><circle cx="12" cy="12" r="9"/></svg>;
  }
}

function StatCard({ icon, label, value, note, tone }: { icon: string; label: string; value: string; note: string; tone: "green" | "blue" | "amber" | "purple" }) {
  return <article className="mk-stat-card"><div className={`mk-stat-icon mk-tone-${tone}`}><Icon name={icon} size={19}/></div><div className="mk-stat-label">{label}</div><div className="mk-stat-value">{value}</div><div className="mk-stat-note">{note}</div></article>;
}

function TablePagination({
  totalItems,
  pageIndex,
  onPageChange,
  rightNote,
}: {
  totalItems: number;
  pageIndex: number;
  onPageChange: (page: number) => void;
  rightNote?: string;
}) {
  const pageCount = Math.max(1, Math.ceil(totalItems / TABLE_PAGE_SIZE));
  const safePage = Math.min(Math.max(0, pageIndex), pageCount - 1);
  const startItem = totalItems === 0 ? 0 : safePage * TABLE_PAGE_SIZE + 1;
  const endItem = Math.min(totalItems, (safePage + 1) * TABLE_PAGE_SIZE);
  const visiblePageCount = Math.min(5, pageCount);
  const startPage = Math.max(0, Math.min(pageCount - visiblePageCount, safePage - 2));
  const pageNumbers = Array.from({ length: visiblePageCount }, (_, index) => startPage + index);

  return (
    <div className="mk-table-footer">
      <span className="mk-pagination-count">
        Menampilkan <strong>{INTEGER.format(startItem)}–{INTEGER.format(endItem)}</strong> dari <strong>{INTEGER.format(totalItems)}</strong> baris
      </span>
      {rightNote ? <span className="mk-pagination-note">{rightNote}</span> : null}
      {pageCount > 1 ? (
        <span className="mk-table-pagination" aria-label="Navigasi halaman tabel">
          <button type="button" disabled={safePage === 0} onClick={() => onPageChange(safePage - 1)} aria-label="Halaman sebelumnya">‹</button>
          {pageNumbers.map((pageNumber) => (
            <button
              key={pageNumber}
              type="button"
              className={pageNumber === safePage ? "current" : ""}
              aria-current={pageNumber === safePage ? "page" : undefined}
              aria-label={`Halaman ${pageNumber + 1}`}
              disabled={pageNumber === safePage}
              onClick={() => onPageChange(pageNumber)}
            >{pageNumber + 1}</button>
          ))}
          <button type="button" disabled={safePage >= pageCount - 1} onClick={() => onPageChange(safePage + 1)} aria-label="Halaman berikutnya">›</button>
        </span>
      ) : null}
    </div>
  );
}

function expenseDisplay(items: ExpenseItem[]) {
  const positive = items.filter((item) => item.amount > 0);
  if (positive.length <= 5) return positive;
  const head = positive.slice(0, 4);
  const rest = positive.slice(4);
  const remaining = rest.reduce((sum, item) => sum + item.amount, 0);
  const total = head.reduce((sum, item) => sum + item.amount, 0) + remaining;
  return [...head, { category: "Lainnya", amount: remaining, percent: total > 0 ? (remaining / total) * 100 : 0 }];
}

export default function DashboardPage() {
  // Avoid reading the current clock during Client Component prerender.
  const [period, setPeriod] = useState<string>("2026-10");
  const [activeView, setActiveView] = useState<ViewKey>("dashboard");
  const [query, setQuery] = useState("");
  const [tablePages, setTablePages] = useState<Record<TableKey, number>>({ monthly: 0, yearly: 0, data: 0, reports: 0 });
  const [data, setData] = useState<DashboardData | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncFinished, setSyncFinished] = useState(false);
  const [syncRun, setSyncRun] = useState(0);
  const [syncVersion, setSyncVersion] = useState(0);
  const [syncError, setSyncError] = useState("");
  const [requiresShrinkConfirmation, setRequiresShrinkConfirmation] = useState(false);
  const allowShrinkNextSync = useRef(false);
  const [dataError, setDataError] = useState("");
  const [loadingData, setLoadingData] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    // Resolve the initial month only in the browser after hydration.
    setPeriod(currentPeriod());
  }, []);

  useEffect(() => {
    setTablePages({ monthly: 0, yearly: 0, data: 0, reports: 0 });
  }, [period, query, activeView, syncVersion]);

  useEffect(() => {
    const controller = new AbortController();
    setSyncing(true);
    setSyncError("");
    async function runSync() {
      try {
        const response = await fetch("/api/ppbj/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force: syncRun > 0, allowShrink: allowShrinkNextSync.current }),
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json();
        if (!response.ok) {
          if (payload?.code === "SOURCE_SHRINK") setRequiresShrinkConfirmation(true);
          throw new Error(payload?.error || "Sinkronisasi spreadsheet gagal.");
        }
        setRequiresShrinkConfirmation(false);
      } catch (error) {
        if (controller.signal.aborted) return;
        setSyncError(error instanceof Error ? error.message : "Sinkronisasi spreadsheet gagal.");
      } finally {
        if (!controller.signal.aborted) {
          setSyncing(false);
          setSyncFinished(true);
          setSyncVersion((version) => version + 1);
          allowShrinkNextSync.current = false;
        }
      }
    }
    void runSync();
    return () => controller.abort();
  }, [syncRun]);

  useEffect(() => {
    if (!syncFinished || !period) return;
    const controller = new AbortController();
    setLoadingData(true);
    setDataError("");
    async function loadData() {
      try {
        const scope = ["yearly", "data", "reports", "settings"].includes(activeView) ? "year" : "month";
        const response = await fetch(`/api/ppbj?period=${encodeURIComponent(period)}&scope=${scope}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || "Gagal mengambil rekap dari MySQL.");
        setData(payload as DashboardData);
      } catch (error) {
        if (controller.signal.aborted) return;
        setDataError(error instanceof Error ? error.message : "Gagal mengambil rekap dari MySQL.");
      } finally {
        if (!controller.signal.aborted) setLoadingData(false);
      }
    }
    void loadData();
    return () => controller.abort();
  }, [period, syncFinished, syncVersion, activeView]);

  function handleSyncClick() {
    let allowShrink = false;
    if (requiresShrinkConfirmation) {
      allowShrink = window.confirm("Jumlah baris di Google Sheets jauh lebih sedikit daripada data MySQL. Jika dilanjutkan, baris yang hilang dari sumber akan diarsipkan dan tidak tampil pada rekap aktif, tetapi riwayat sebelumnya tetap disimpan. Pastikan penghapusan ini memang disengaja.");
      if (!allowShrink) return;
    }
    allowShrinkNextSync.current = allowShrink;
    setSyncFinished(false);
    setSyncRun((run) => run + 1);
  }

  const [selectedYearText, selectedMonthText] = period.split("-");
  const selectedYear = Number(selectedYearText);
  const selectedMonth = Number(selectedMonthText);
  const selectedStat = data?.monthlyStats.find((stat) => stat.monthNumber === selectedMonth);

  const filteredRows = useMemo(() => (data?.rows ?? []).filter((row) => {
    const needle = query.trim().toLocaleLowerCase("id-ID");
    if (!needle) return true;
    return [row.noPpbj, row.requester, row.item, row.costCenter, row.reason, row.unit]
      .some((value) => String(value ?? "").toLocaleLowerCase("id-ID").includes(needle));
  }), [data?.rows, query]);

  const expenseItems = useMemo(() => expenseDisplay(data?.expenseBreakdown ?? []), [data?.expenseBreakdown]);
  const donutBackground = useMemo(() => {
    const total = expenseItems.reduce((sum, item) => sum + item.amount, 0);
    if (total <= 0) return "conic-gradient(#e7ece8 0 100%)";
    let current = 0;
    const segments = expenseItems.map((item, index) => {
      const next = current + (item.amount / total) * 100;
      const segment = `${COLORS[index % COLORS.length]} ${current.toFixed(2)}% ${next.toFixed(2)}%`;
      current = next;
      return segment;
    });
    return `conic-gradient(${segments.join(",")})`;
  }, [expenseItems]);

  const chartMax = Math.max(4, Math.ceil(Math.max(0, ...(data?.monthlyStats ?? []).map((stat) => stat.count)) / 4) * 4);
  const chartTicks = [chartMax, chartMax * 0.75, chartMax * 0.5, chartMax * 0.25, 0].map(Math.round);

  function handlePeriodMonth(monthNumber: number) {
    setPeriod(`${selectedYear}-${String(monthNumber).padStart(2, "0")}`);
  }

  async function downloadExcel(scope: "month" | "year") {
    if (exporting) return;
    setExporting(true);
    try {
      const response = await fetch(`/api/ppbj/export?period=${encodeURIComponent(period)}&scope=${scope}`, {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        let message = "Gagal membuat file Excel.";
        try {
          const payload = await response.json();
          if (payload?.error) message = String(payload.error);
        } catch {
          // Keep generic error if response isn't JSON.
        }
        throw new Error(message);
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^";]+)"?/i);
      const fallbackName = scope === "year"
        ? `rekap-ppbj-marketing-tahunan-${selectedYear}.xlsx`
        : `rekap-ppbj-marketing-${period}.xlsx`;
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = match?.[1] || fallbackName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Gagal membuat file Excel.");
    } finally {
      setExporting(false);
    }
  }

  function exportExcel() {
    const annualView = ["yearly", "data", "reports"].includes(activeView);
    void downloadExcel(annualView ? "year" : "month");
  }

  function exportMonthExcel() {
    void downloadExcel("month");
  }

  function exportYearExcel() {
    void downloadExcel("year");
  }

  function navigateTo(view: ViewKey) {
    setActiveView(view);
    setQuery("");
  }


  const dbOnline = Boolean(data) && !dataError;
  const canExport = Boolean(data) && filteredRows.length > 0;
  const isAnnualScope = ["yearly", "data", "reports", "settings"].includes(activeView);
  const showMonthFilter = ["dashboard", "monthly", "reports"].includes(activeView);
  const viewMeta = VIEW_META[activeView];
  const annualRows = data?.monthlyStats ?? MONTHS.map((month, index) => ({ month, monthNumber: index + 1, count: 0, rowCount: 0, amount: 0 }));
  const annualTotalPpbj = data?.kpis.ppbjCount ?? 0;
  const annualRowCount = data?.kpis.rowCount ?? 0;
  const annualTotalAmount = data?.kpis.totalAmount ?? 0;
  const annualAverageAmount = data?.kpis.averageAmount ?? 0;
  const setTablePage = (view: TableKey, page: number) => {
    setTablePages((current) => ({ ...current, [view]: Math.max(0, page) }));
  };
  const monthlyPageRows = filteredRows.slice(tablePages.monthly * TABLE_PAGE_SIZE, (tablePages.monthly + 1) * TABLE_PAGE_SIZE);
  const yearlyPageRows = annualRows.slice(tablePages.yearly * TABLE_PAGE_SIZE, (tablePages.yearly + 1) * TABLE_PAGE_SIZE);
  const dataPageRows = filteredRows.slice(tablePages.data * TABLE_PAGE_SIZE, (tablePages.data + 1) * TABLE_PAGE_SIZE);
  const reportPageRows = annualRows.slice(tablePages.reports * TABLE_PAGE_SIZE, (tablePages.reports + 1) * TABLE_PAGE_SIZE);

  return (
    <div className="mk-app-shell">
      <aside className="mk-sidebar">
        <div className="mk-brand">
          <div className="mk-brand-mark">
  <img src="/favicon.ico" alt="Yomart" />
</div><div><div className="mk-brand-name">Rekap PPBJ<span>.</span></div><div className="mk-brand-subtitle">DIV. MARKETING</div></div></div>
        <div className="mk-sidebar-label">WORKSPACE</div>
        <nav className="mk-nav" aria-label="Navigasi utama">
          {NAV_ITEMS.filter((item) => item.group === "workspace").map((item) => <button key={item.key} type="button" title={VIEW_META[item.key].label} aria-current={activeView === item.key ? "page" : undefined} className={`mk-nav-item ${activeView === item.key ? "active" : ""}`} onClick={() => navigateTo(item.key)}><Icon name={item.icon} size={18}/><span>{VIEW_META[item.key].label}</span>{activeView === item.key && <span className="mk-nav-indicator"/>}</button>)}
        </nav>
        <div className="mk-sidebar-label mk-sidebar-label-lower">TOOLS</div>
        <nav className="mk-nav" aria-label="Tools aplikasi">
          {NAV_ITEMS.filter((item) => item.group === "preferences").map((item) => <button key={item.key} type="button" title={VIEW_META[item.key].label} aria-current={activeView === item.key ? "page" : undefined} className={`mk-nav-item ${activeView === item.key ? "active" : ""}`} onClick={() => navigateTo(item.key)}><Icon name={item.icon} size={18}/><span>{VIEW_META[item.key].label}</span>{activeView === item.key && <span className="mk-nav-indicator"/>}</button>)}
        </nav>
        <div className="mk-sidebar-bottom">
          <div className="mk-source-card">
            <div className="mk-source-top"><span className={`mk-source-dot ${syncing ? "syncing" : dbOnline && !syncError ? "online" : "offline"}`}/><span>Sumber data</span></div>
            <strong>Google Sheets → MySQL</strong>
            <p>{syncing ? "Sedang menyinkronkan sumber data." : syncError ? "Sinkronisasi gagal. Dashboard akan mencoba membaca data tersimpan." : "Data disalin ke MySQL saat dashboard dibuka."}</p>
            <div className="mk-source-progress"><span style={{ width: syncing ? "65%" : dbOnline ? "100%" : "12%" }}/></div>
            <div className="mk-source-footer"><span>Sinkron terakhir</span><b>{formatSyncDate(data?.sync.lastSuccessAt ?? null)}</b></div>
          </div>
          <div className="mk-profile"><div className="mk-profile-info"><strong>Divisi Marketing</strong><span>Workspace internal</span></div><span className="mk-profile-menu">···</span></div>
        </div>
      </aside>

      <main className="mk-main" id="dashboard">
        <header className="mk-topbar">
          <div className="mk-breadcrumb"><span>Workspace</span><span className="mk-breadcrumb-slash">/</span><strong>{viewMeta.label}</strong></div>
          <div className="mk-topbar-actions"><span className={`mk-preview-badge ${syncing ? "is-syncing" : syncError ? "is-offline" : dbOnline ? "is-live" : "is-offline"}`}><span/>{syncing ? "SYNCING" : syncError ? "SYNC ERROR" : dbOnline ? "LIVE · MYSQL" : "OFFLINE"}</span></div>
        </header>
        <nav className="mk-mobile-nav" aria-label="Navigasi mobile">
          {NAV_ITEMS.map((item) => <button key={item.key} type="button" aria-current={activeView === item.key ? "page" : undefined} className={activeView === item.key ? "active" : ""} onClick={() => navigateTo(item.key)}><Icon name={item.icon} size={15}/><span>{VIEW_META[item.key].label}</span></button>)}
        </nav>

        <div className="mk-page-content">
          <div className="mk-page-heading">
            <div><div className="mk-eyebrow">{viewMeta.eyebrow} <span>•</span> {selectedYear}</div><h1>{viewMeta.title}</h1><p>{viewMeta.description}</p></div>
            <div className="mk-heading-actions">{activeView !== "reports" && activeView !== "settings" && <button className="mk-secondary-button" onClick={handleSyncClick} disabled={syncing}><Icon name="refresh" size={16}/>{syncing ? "Sinkronisasi..." : requiresShrinkConfirmation ? "Konfirmasi sinkronisasi" : "Sinkronkan"}</button>}{activeView !== "settings" && <button className="mk-primary-button" onClick={exportExcel} disabled={!canExport}><Icon name="download" size={17}/>{exporting ? "Menyiapkan Excel..." : "Export Excel"}</button>}</div>
          </div>

          {syncError && <div className="mk-live-notice warning"><span className="mk-notice-icon">!</span><div><strong>Sinkronisasi spreadsheet gagal.</strong> {syncError} {data ? "Data yang sudah tersimpan di MySQL tetap ditampilkan." : ""}</div></div>}
          {dataError && <div className="mk-live-notice error"><span className="mk-notice-icon">!</span><div><strong>Database belum bisa dibaca.</strong> {dataError}</div></div>}
          {!syncError && !dataError && data?.quality.invalidDateCount ? <div className="mk-live-notice warning"><span className="mk-notice-icon">!</span><div><strong>{INTEGER.format(data.quality.invalidDateCount)} baris Marketing memiliki tanggal yang perlu diperiksa.</strong> Baris tersebut tetap tersimpan di database dan ditandai melalui data mentah, tetapi tidak masuk ke rekap bulan tertentu sampai tanggalnya valid.</div></div> : null}

          {activeView !== "settings" && <section className="mk-filter-row" aria-label="Filter laporan">
            <div className="mk-filter-caption"><span className="mk-filter-icon"><Icon name="calendar" size={16}/></span><div><strong>{isAnnualScope && activeView !== "reports" ? "Tahun laporan" : "Periode laporan"}</strong><span>{showMonthFilter ? "Pilih bulan dan tahun untuk menyaring data" : "Pilih tahun untuk melihat ringkasan dan data terkait"}</span></div></div>
            <div className="mk-filter-controls">
              {showMonthFilter && <label className="mk-select-wrap"><span>Bulan</span><select value={String(selectedMonth)} onChange={(event) => handlePeriodMonth(Number(event.target.value))}>{MONTHS.map((item, index) => <option key={item} value={index + 1}>{item}</option>)}</select><Icon name="chevron" size={15}/></label>}
              <label className="mk-select-wrap year"><span>Tahun</span><select value={String(selectedYear)} onChange={(event) => setPeriod(`${event.target.value}-${String(selectedMonth).padStart(2, "0")}`)}>{(data?.years?.length ? data.years : [selectedYear]).map((year) => <option key={year} value={year}>{year}</option>)}</select><Icon name="chevron" size={15}/></label>
            </div>
          </section>}

          {(activeView === "dashboard" || activeView === "monthly") && <>
          <section className="mk-stats-grid" aria-label={`Ringkasan ${data?.periodLabel ?? period}`}>
            <StatCard icon="receipt" label="Total PPBJ" value={data ? INTEGER.format(data.kpis.ppbjCount) : "—"} note={`${INTEGER.format(data?.kpis.rowCount ?? 0)} baris detail${loadingData ? " · memuat" : ""}`} tone="green"/>
            <StatCard icon="wallet" label="Total Nilai Pengajuan" value={data ? IDR.format(data.kpis.totalAmount) : "—"} note="Akumulasi kolom Jumlah Harga" tone="blue"/>
            <StatCard icon="chart" label="Rata-rata per PPBJ" value={data ? IDR.format(data.kpis.averageAmount) : "—"} note={`${INTEGER.format(data?.kpis.averagePpbjCount ?? 0)} PPBJ dengan nominal`} tone="purple"/>
            <StatCard icon="clock" label="Nominal Belum Diisi" value={data ? INTEGER.format(data.kpis.missingAmountCount) : "—"} note="Baris pada periode terpilih" tone="amber"/>
          </section>

          <section className="mk-content-grid">
            <article className="mk-panel mk-trend-panel">
              <div className="mk-panel-header"><div><h2>Tren pengajuan</h2><p>Jumlah PPBJ unik per bulan pada {selectedYear}</p></div><span className="mk-panel-tag">JAN–DES {selectedYear}</span></div>
              <div className="mk-chart-summary"><strong>{INTEGER.format(selectedStat?.count ?? 0)}</strong><span>PPBJ pada {MONTHS[selectedMonth - 1]}</span><span className="mk-chart-summary-dot"/></div>
              <div className="mk-chart-area">
                <div className="mk-y-axis">{chartTicks.map((tick, index) => <span key={`${tick}-${index}`}>{INTEGER.format(tick)}</span>)}</div>
                <div className="mk-chart-grid">{chartTicks.map((tick, index) => <div key={`${tick}-${index}`} className="mk-grid-line"><span/></div>)}
                  <div className="mk-bars">{(data?.monthlyStats ?? MONTHS.map((month, index) => ({ month, monthNumber: index + 1, count: 0, rowCount: 0, amount: 0 }))).map((stat) => <button key={stat.monthNumber} className={`mk-bar-column ${selectedMonth === stat.monthNumber ? "selected" : ""}`} onClick={() => handlePeriodMonth(stat.monthNumber)} title={`${stat.month}: ${INTEGER.format(stat.count)} PPBJ`}><div className="mk-bar-value">{stat.count || ""}</div><div className="mk-bar-track"><span style={{ height: `${Math.min(100, (stat.count / chartMax) * 100)}%` }}/></div><div className="mk-bar-label">{stat.month.slice(0, 3)}</div></button>)}</div>
                </div>
              </div>
              <div className="mk-chart-legend"><span className="mk-legend-dot"/> PPBJ unik <span className="mk-chart-footnote">Sumber: MySQL</span></div>
            </article>

            <article className="mk-panel mk-cost-panel">
              <div className="mk-panel-header"><div><h2>Komposisi anggaran</h2><p>Berdasarkan Beban Biaya</p></div></div>
              <div className="mk-donut-wrap"><div className="mk-donut" style={{ background: donutBackground }}><div className="mk-donut-center"><strong>{IDR.format(data?.kpis.totalAmount ?? 0).replace(",00", "")}</strong><span>Total nilai</span></div></div></div>
              <div className="mk-legend-list">{expenseItems.map((item, index) => <div key={item.category}><span className="mk-legend-square" style={{ background: COLORS[index % COLORS.length] }}/><span title={item.category}>{item.category}</span><strong>{Math.round(item.percent)}%</strong></div>)}{expenseItems.length === 0 && <div className="mk-cost-empty">Belum ada nominal pada periode ini.</div>}</div>
            </article>
          </section>

          <section className="mk-panel mk-table-panel">
            <div className="mk-panel-header mk-table-header"><div><h2>Detail pengajuan</h2><p>Baris detail PPBJ pada {MONTHS[selectedMonth - 1]} {selectedYear}</p></div><div className="mk-table-actions"><label className="mk-search-box"><Icon name="search" size={16}/><input type="search" placeholder="Cari PPBJ, barang, pembuat..." value={query} onChange={(event) => setQuery(event.target.value)}/></label><button className="mk-secondary-button" onClick={exportExcel} disabled={!canExport}><Icon name="download" size={15}/>{exporting ? "Menyiapkan..." : "Export Excel"}</button></div></div>
            <div className="mk-table-scroll"><table className="mk-table"><thead><tr><th>No. PPBJ</th><th>Tanggal</th><th>Nama barang / jasa</th><th>Pembuat</th><th>Beban biaya</th><th>Jumlah harga</th></tr></thead><tbody>{monthlyPageRows.map((row) => <tr key={row.sourceRowNumber}><td><span className="mk-ppbj-id">{row.noPpbj}</span></td><td className="mk-date-cell">{formatDate(row.date)}</td><td><strong className="mk-item-name">{row.item || "Belum diisi"}</strong><span className="mk-item-sub">{row.quantity !== null ? `${INTEGER.format(row.quantity)} ${row.unit}`.trim() : "Rincian barang/jasa"}</span></td><td>{row.requester || "Belum diisi"}</td><td><span className="mk-cost-tag">{row.costCenter || "Belum diisi"}</span></td><td className="mk-amount-cell">{row.amount === null ? "Belum diisi" : IDR.format(row.amount)}</td></tr>)}{filteredRows.length === 0 && <tr><td colSpan={6} className="mk-empty-row">{loadingData ? "Memuat data dari MySQL..." : "Tidak ada data PPBJ untuk periode atau pencarian ini."}</td></tr>}</tbody></table></div>
            <TablePagination totalItems={filteredRows.length} pageIndex={tablePages.monthly} onPageChange={(page) => setTablePage("monthly", page)} />
          </section>
          </>}

          {activeView === "yearly" && <>
            <section className="mk-stats-grid" aria-label={`Ringkasan tahunan ${selectedYear}`}>
              <StatCard icon="receipt" label="Total PPBJ Tahunan" value={data ? INTEGER.format(annualTotalPpbj) : "—"} note={`${INTEGER.format(annualRowCount)} baris detail dalam tahun terpilih`} tone="green"/>
              <StatCard icon="wallet" label="Total Nilai Tahunan" value={data ? IDR.format(annualTotalAmount) : "—"} note="Akumulasi seluruh bulan dalam tahun" tone="blue"/>
              <StatCard icon="chart" label="Rata-rata per PPBJ" value={data ? IDR.format(annualAverageAmount) : "—"} note={`${INTEGER.format(data?.kpis.averagePpbjCount ?? 0)} PPBJ dengan nominal`} tone="purple"/>
              <StatCard icon="clock" label="Nominal Belum Diisi" value={data ? INTEGER.format(data.kpis.missingAmountCount) : "—"} note="Baris dalam tahun terpilih" tone="amber"/>
            </section>
            <section className="mk-content-grid">
              <article className="mk-panel mk-trend-panel">
                <div className="mk-panel-header"><div><h2>Tren PPBJ per bulan</h2><p>Jumlah PPBJ unik per bulan sepanjang {selectedYear}</p></div><span className="mk-panel-tag">TAHUN {selectedYear}</span></div>
                <div className="mk-chart-summary"><strong>{INTEGER.format(annualTotalPpbj)}</strong><span>PPBJ dalam tahun terpilih</span><span className="mk-chart-summary-dot"/></div>
                <div className="mk-chart-area"><div className="mk-y-axis">{chartTicks.map((tick, index) => <span key={`${tick}-${index}`}>{INTEGER.format(tick)}</span>)}</div><div className="mk-chart-grid">{chartTicks.map((tick, index) => <div key={`${tick}-${index}`} className="mk-grid-line"><span/></div>)}<div className="mk-bars">{annualRows.map((stat) => <button key={stat.monthNumber} className={`mk-bar-column ${selectedMonth === stat.monthNumber ? "selected" : ""}`} onClick={() => { setPeriod(`${selectedYear}-${String(stat.monthNumber).padStart(2, "0")}`); navigateTo("monthly"); }} title={`${stat.month}: ${INTEGER.format(stat.count)} PPBJ`}><div className="mk-bar-value">{stat.count || ""}</div><div className="mk-bar-track"><span style={{ height: `${Math.min(100, (stat.count / chartMax) * 100)}%` }}/></div><div className="mk-bar-label">{stat.month.slice(0, 3)}</div></button>)}</div></div></div>
                <div className="mk-chart-legend"><span className="mk-legend-dot"/> PPBJ unik <span className="mk-chart-footnote">Pilih batang untuk membuka rekap bulan</span></div>
              </article>
              <article className="mk-panel mk-cost-panel"><div className="mk-panel-header"><div><h2>Komposisi biaya tahunan</h2><p>Berdasarkan Beban Biaya</p></div></div><div className="mk-donut-wrap"><div className="mk-donut" style={{ background: donutBackground }}><div className="mk-donut-center"><strong>{IDR.format(annualTotalAmount).replace(",00", "")}</strong><span>Total nilai</span></div></div></div><div className="mk-legend-list">{expenseItems.map((item, index) => <div key={item.category}><span className="mk-legend-square" style={{ background: COLORS[index % COLORS.length] }}/><span title={item.category}>{item.category}</span><strong>{Math.round(item.percent)}%</strong></div>)}{expenseItems.length === 0 && <div className="mk-cost-empty">Belum ada nominal pada tahun ini.</div>}</div></article>
            </section>
            <section className="mk-panel mk-table-panel"><div className="mk-panel-header mk-table-header"><div><h2>Ringkasan per bulan</h2><p>Total aktivitas dan biaya tiap bulan pada {selectedYear}</p></div><button className="mk-secondary-button" onClick={exportExcel} disabled={!canExport}><Icon name="download" size={15}/>{exporting ? "Menyiapkan..." : "Export Excel tahunan"}</button></div><div className="mk-table-scroll"><table className="mk-table"><thead><tr><th>Bulan</th><th>Jumlah PPBJ</th><th>Baris detail</th><th>Jumlah harga</th><th>Porsi dari total tahun</th><th>Aksi</th></tr></thead><tbody>{yearlyPageRows.map((stat) => <tr key={stat.monthNumber}><td><strong className="mk-item-name">{stat.month} {selectedYear}</strong></td><td>{INTEGER.format(stat.count)}</td><td>{INTEGER.format(stat.rowCount)}</td><td className="mk-amount-cell">{IDR.format(stat.amount)}</td><td>{annualTotalAmount > 0 ? `${Math.round((stat.amount / annualTotalAmount) * 100)}%` : "0%"}</td><td><button className="mk-table-link" onClick={() => { setPeriod(`${selectedYear}-${String(stat.monthNumber).padStart(2, "0")}`); navigateTo("monthly"); }}>Lihat bulan →</button></td></tr>)}</tbody></table></div><TablePagination totalItems={annualRows.length} pageIndex={tablePages.yearly} onPageChange={(page) => setTablePage("yearly", page)} rightNote={`Total tahun: ${IDR.format(annualTotalAmount)}`} /></section>
          </>}

          {activeView === "data" && <>
            <section className="mk-stats-grid" aria-label="Ringkasan data PPBJ"><StatCard icon="receipt" label="Total PPBJ" value={data ? INTEGER.format(annualTotalPpbj) : "—"} note={`Tahun ${selectedYear}`} tone="green"/><StatCard icon="database" label="Baris detail" value={data ? INTEGER.format(annualRowCount) : "—"} note="Data aktif Marketing" tone="blue"/><StatCard icon="wallet" label="Total nilai" value={data ? IDR.format(annualTotalAmount) : "—"} note="Akumulasi Jumlah Harga" tone="purple"/><StatCard icon="clock" label="Perlu pemeriksaan" value={data ? INTEGER.format(data.quality.invalidDateCount + data.quality.missingAmountCount) : "—"} note="Tanggal atau nominal bermasalah" tone="amber"/></section>
            <section className="mk-panel mk-table-panel"><div className="mk-panel-header mk-table-header"><div><h2>Semua data PPBJ Marketing</h2><p>Data tahun {selectedYear}, bersumber dari MySQL</p></div><div className="mk-table-actions"><label className="mk-search-box"><Icon name="search" size={16}/><input type="search" placeholder="Cari nomor, barang, pembuat, biaya..." value={query} onChange={(event) => setQuery(event.target.value)}/></label><button className="mk-secondary-button" onClick={exportExcel} disabled={!canExport}><Icon name="download" size={15}/>{exporting ? "Menyiapkan..." : "Export Excel"}</button></div></div><div className="mk-table-scroll"><table className="mk-table"><thead><tr><th>No. PPBJ</th><th>Tanggal</th><th>Nama barang / jasa</th><th>Pembuat</th><th>Divisi</th><th>Beban biaya</th><th>Jumlah harga</th></tr></thead><tbody>{dataPageRows.map((row) => <tr key={row.sourceRowNumber}><td><span className="mk-ppbj-id">{row.noPpbj}</span></td><td className="mk-date-cell">{formatDate(row.date)}</td><td><strong className="mk-item-name">{row.item || "Belum diisi"}</strong><span className="mk-item-sub">{row.quantity !== null ? `${INTEGER.format(row.quantity)} ${row.unit}`.trim() : "Rincian barang/jasa"}</span></td><td>{row.requester || "Belum diisi"}</td><td>{row.division || "Belum diisi"}</td><td><span className="mk-cost-tag">{row.costCenter || "Belum diisi"}</span></td><td className="mk-amount-cell">{row.amount === null ? "Belum diisi" : IDR.format(row.amount)}</td></tr>)}{filteredRows.length === 0 && <tr><td colSpan={7} className="mk-empty-row">{loadingData ? "Memuat data dari MySQL..." : "Tidak ada data untuk pencarian ini."}</td></tr>}</tbody></table></div><TablePagination totalItems={filteredRows.length} pageIndex={tablePages.data} onPageChange={(page) => setTablePage("data", page)} rightNote={`Tahun ${selectedYear}`} /></section>
          </>}

          {activeView === "reports" && <>
            <section className="mk-report-grid">
              <article className="mk-panel mk-action-card"><div className="mk-action-icon green"><Icon name="calendar" size={22}/></div><h2>Laporan Bulanan</h2><p>Unduh detail PPBJ untuk {MONTHS[selectedMonth - 1]} {selectedYear}. Pilih bulan pada filter di atas sebelum mengekspor.</p><div className="mk-action-meta"><span>Periode terpilih</span><strong>{MONTHS[selectedMonth - 1]} {selectedYear}</strong></div><button className="mk-primary-button" onClick={exportMonthExcel} disabled={!data || !data.rows.some((row) => (row.date ?? "").startsWith(period))}><Icon name="download" size={16}/>{exporting ? "Menyiapkan Excel..." : "Download Excel bulanan"}</button></article>
              <article className="mk-panel mk-action-card"><div className="mk-action-icon blue"><Icon name="chart" size={22}/></div><h2>Laporan Tahunan</h2><p>Unduh seluruh baris PPBJ Marketing pada tahun yang dipilih beserta 12 kolom data sumber.</p><div className="mk-action-meta"><span>Total data tahun ini</span><strong>{INTEGER.format(annualRowCount)} baris</strong></div><button className="mk-primary-button" onClick={exportYearExcel} disabled={!canExport}><Icon name="download" size={16}/>{exporting ? "Menyiapkan Excel..." : "Download Excel tahunan (12 sheet)"}</button></article>
              <article className="mk-panel mk-action-card"><div className="mk-action-icon amber"><Icon name="receipt" size={22}/></div><h2>Kualitas Data</h2><p>Periksa catatan yang perlu ditinjau sebelum laporan digunakan.</p><div className="mk-quality-list"><div><span>Tanggal tidak valid</span><strong>{INTEGER.format(data?.quality.invalidDateCount ?? 0)}</strong></div><div><span>Nominal kosong</span><strong>{INTEGER.format(data?.quality.missingAmountCount ?? 0)}</strong></div></div><button className="mk-secondary-button" onClick={() => navigateTo("settings")}>Buka status data →</button></article>
            </section>
            <section className="mk-panel mk-table-panel"><div className="mk-panel-header mk-table-header"><div><h2>Ringkasan nilai per bulan</h2><p>Ikhtisar untuk memilih periode laporan</p></div></div><div className="mk-table-scroll"><table className="mk-table"><thead><tr><th>Bulan</th><th>Jumlah PPBJ</th><th>Baris detail</th><th>Nilai pengajuan</th><th>Aksi</th></tr></thead><tbody>{reportPageRows.map((stat) => <tr key={stat.monthNumber}><td><strong className="mk-item-name">{stat.month} {selectedYear}</strong></td><td>{INTEGER.format(stat.count)}</td><td>{INTEGER.format(stat.rowCount)}</td><td className="mk-amount-cell">{IDR.format(stat.amount)}</td><td><button className="mk-table-link" onClick={() => { setPeriod(`${selectedYear}-${String(stat.monthNumber).padStart(2, "0")}`); navigateTo("monthly"); }}>Buka rekap →</button></td></tr>)}</tbody></table></div><TablePagination totalItems={annualRows.length} pageIndex={tablePages.reports} onPageChange={(page) => setTablePage("reports", page)} rightNote={`Tahun ${selectedYear}`} /></section>
          </>}

          {activeView === "settings" && <>
            <section className="mk-settings-grid">
              <article className="mk-panel mk-settings-card"><div className="mk-panel-header"><div><h2>Status sumber data</h2><p>Koneksi dan sinkronisasi spreadsheet ke MySQL</p></div><span className={`mk-preview-badge ${syncing ? "is-syncing" : syncError ? "is-offline" : dbOnline ? "is-live" : "is-offline"}`}><span/>{syncing ? "SYNCING" : syncError ? "ERROR" : dbOnline ? "CONNECTED" : "OFFLINE"}</span></div><div className="mk-settings-list"><div><span>Sumber</span><strong>Google Sheets → MySQL</strong></div><div><span>Database</span><strong>db_ppbj_rekap / tb_ppbj</strong></div><div><span>Rentang sheet</span><strong>{data?.sync.sourceRange || "Belum tersedia"}</strong></div><div><span>Sinkron terakhir</span><strong>{formatSyncDate(data?.sync.lastSuccessAt ?? null)}</strong></div><div><span>Baris disinkronkan terakhir</span><strong>{INTEGER.format(data?.sync.rowsSynced ?? 0)}</strong></div><div><span>Baris berubah terakhir</span><strong>{INTEGER.format(data?.sync.rowsChanged ?? 0)}</strong></div><div><span>Baris diarsipkan terakhir</span><strong>{INTEGER.format(data?.sync.rowsArchived ?? 0)}</strong></div></div><button className="mk-primary-button" onClick={handleSyncClick} disabled={syncing}><Icon name="refresh" size={16}/>{syncing ? "Sinkronisasi berlangsung..." : requiresShrinkConfirmation ? "Konfirmasi sinkronisasi" : "Jalankan sinkronisasi"}</button>{syncError && <p className="mk-settings-error">{syncError}</p>}</article>
              <article className="mk-panel mk-settings-card"><div className="mk-panel-header"><div><h2>Kualitas data</h2><p>Catatan dari seluruh data Marketing yang aktif</p></div></div><div className="mk-quality-large"><div><span>Baris aktif</span><strong>{INTEGER.format(data?.quality.totalActiveRows ?? 0)}</strong></div><div><span>Tanggal perlu diperiksa</span><strong>{INTEGER.format(data?.quality.invalidDateCount ?? 0)}</strong></div><div><span>Nominal belum diisi</span><strong>{INTEGER.format(data?.quality.missingAmountCount ?? 0)}</strong></div></div><p className="mk-settings-help">Data yang tanggalnya belum valid tetap disimpan, tetapi tidak masuk rekap bulanan atau tahunan sampai tanggal sumber diperbaiki dan sinkronisasi dijalankan lagi.</p><button className="mk-secondary-button" onClick={() => navigateTo("data")}>Buka Data PPBJ →</button></article>
            </section>
          </>}

          <footer className="mk-footer"><span>Marketing Operations <b>·</b> PPBJ Dashboard</span><span>Google Sheets → MySQL <b>·</b> {syncing ? "Sinkronisasi berjalan" : `Sinkron terakhir ${formatSyncDate(data?.sync.lastSuccessAt ?? null)}`}</span></footer>
        </div>
      </main>
    </div>
  );
}

import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "../../../lib/db";

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function errorResponse(message: string, status = 500) {
  return NextResponse.json({ error: message }, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const periodMatch = period.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (!periodMatch) return errorResponse("Format periode tidak valid. Gunakan YYYY-MM.", 400);
  const scope = searchParams.get("scope") === "year" ? "year" : "month";

  const year = Number(periodMatch[1]);
  const month = Number(periodMatch[2]);
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextDate = new Date(Date.UTC(year, month, 1));
  const endDate = `${nextDate.getUTCFullYear()}-${String(nextDate.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year + 1}-01-01`;
  const rangeStart = scope === "year" ? yearStart : startDate;
  const rangeEnd = scope === "year" ? yearEnd : endDate;
  const whereMarketing = "source_row_number IS NOT NULL AND is_active = 1 AND LOWER(TRIM(COALESCE(divisi, ''))) = 'marketing' AND NULLIF(TRIM(COALESCE(no_ppbj, '')), '') IS NOT NULL";

  try {
    const pool = getDbPool();
    const [kpiRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(DISTINCT no_ppbj) AS ppbj_count,
              COUNT(DISTINCT CASE WHEN jumlah_harga IS NOT NULL THEN NULLIF(TRIM(no_ppbj), '') END) AS average_ppbj_count,
              COUNT(*) AS row_count,
              COALESCE(SUM(jumlah_harga), 0) AS total_amount,
              SUM(CASE WHEN jumlah_harga IS NULL THEN 1 ELSE 0 END) AS missing_amount_count
       FROM tb_ppbj WHERE ${whereMarketing} AND tanggal >= ? AND tanggal < ?`,
      [rangeStart, rangeEnd],
    );
    const kpi = kpiRows[0] ?? {};

    const [monthlyRows] = await pool.query<RowDataPacket[]>(
      `SELECT MONTH(tanggal) AS month_number,
              COUNT(DISTINCT no_ppbj) AS ppbj_count,
              COUNT(*) AS row_count,
              COALESCE(SUM(jumlah_harga), 0) AS total_amount
       FROM tb_ppbj WHERE ${whereMarketing} AND tanggal >= ? AND tanggal < ?
       GROUP BY MONTH(tanggal) ORDER BY MONTH(tanggal)`,
      [yearStart, yearEnd],
    );
    const monthlyMap = new Map<number, RowDataPacket>(monthlyRows.map((row): [number, RowDataPacket] => [Number(row.month_number), row]));
    const monthlyStats = MONTH_NAMES.map((monthName, index) => {
      const record = monthlyMap.get(index + 1);
      return {
        monthNumber: index + 1,
        month: monthName,
        count: toNumber(record?.ppbj_count),
        rowCount: toNumber(record?.row_count),
        amount: toNumber(record?.total_amount),
      };
    });

    const [expenseRows] = await pool.query<RowDataPacket[]>(
      `SELECT COALESCE(NULLIF(TRIM(beban_biaya), ''), 'Belum diisi') AS category,
              COALESCE(SUM(jumlah_harga), 0) AS amount
       FROM tb_ppbj WHERE ${whereMarketing} AND tanggal >= ? AND tanggal < ?
       GROUP BY COALESCE(NULLIF(TRIM(beban_biaya), ''), 'Belum diisi')
       ORDER BY amount DESC`,
      [rangeStart, rangeEnd],
    );
    const expenseTotal = expenseRows.reduce((total, row) => total + toNumber(row.amount), 0);
    const expenseBreakdown = expenseRows.map((row) => ({
      category: String(row.category),
      amount: toNumber(row.amount),
      percent: expenseTotal > 0 ? (toNumber(row.amount) / expenseTotal) * 100 : 0,
    }));

    const [dataRows] = await pool.query<RowDataPacket[]>(
      `SELECT source_row_number AS sourceRowNumber,
              DATE_FORMAT(tanggal, '%Y-%m-%d') AS date,
              no_ppbj AS noPpbj,
              COALESCE(nama_pembuat_ppbj, '') AS requester,
              COALESCE(divisi, '') AS division,
              COALESCE(nama_barang_jasa, '') AS item,
              COALESCE(satuan, '') AS unit,
              jumlah AS quantity,
              harga_satuan AS unitPrice,
              jumlah_harga AS amount,
              COALESCE(beban_biaya, 'Belum diisi') AS costCenter,
              DATE_FORMAT(tanggal_kebutuhan, '%Y-%m-%d') AS needDate,
              COALESCE(alasan_permintaan, '') AS reason,
              raw_tanggal AS rawDate
       FROM tb_ppbj WHERE ${whereMarketing} AND tanggal >= ? AND tanggal < ?
       ORDER BY tanggal DESC, source_row_number DESC LIMIT 5000`,
      [rangeStart, rangeEnd],
    );

    const [qualityRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total_active_rows,
              SUM(CASE WHEN tanggal IS NULL THEN 1 ELSE 0 END) AS invalid_date_count,
              SUM(CASE WHEN jumlah_harga IS NULL THEN 1 ELSE 0 END) AS missing_amount_count
       FROM tb_ppbj WHERE ${whereMarketing}`,
    );
    const quality = qualityRows[0] ?? {};

    const [yearRows] = await pool.query<RowDataPacket[]>(
      `SELECT DISTINCT YEAR(tanggal) AS year FROM tb_ppbj
       WHERE source_row_number IS NOT NULL AND is_active = 1 AND tanggal IS NOT NULL AND NULLIF(TRIM(COALESCE(no_ppbj, '')), '') IS NOT NULL ORDER BY year DESC`,
    );
    const years = Array.from(new Set([new Date().getFullYear(), year, ...yearRows.map((row) => Number(row.year))]))
      .filter((value) => Number.isInteger(value) && value >= 2000 && value <= 2100)
      .sort((a, b) => b - a);

    const [syncRows] = await pool.query<RowDataPacket[]>(
      `SELECT DATE_FORMAT(last_success_at, '%Y-%m-%d %H:%i:%s') AS lastSuccessAt,
              rows_synced AS rowsSynced, rows_changed AS rowsChanged,
              rows_archived AS rowsArchived, source_range AS sourceRange
       FROM tb_ppbj_sync_state WHERE id = 1`,
    );
    const sync = syncRows[0] ?? {};
    const ppbjCount = toNumber(kpi.ppbj_count);
    const averagePpbjCount = toNumber(kpi.average_ppbj_count);
    const totalAmount = toNumber(kpi.total_amount);

    return NextResponse.json({
      source: "MySQL",
      period,
      scope,
      periodLabel: scope === "year" ? `Tahun ${year}` : `${MONTH_NAMES[month - 1]} ${year}`,
      kpis: {
        ppbjCount,
        rowCount: toNumber(kpi.row_count),
        totalAmount,
        averageAmount: averagePpbjCount > 0 ? totalAmount / averagePpbjCount : 0,
        averagePpbjCount,
        missingAmountCount: toNumber(kpi.missing_amount_count),
      },
      monthlyStats,
      expenseBreakdown,
      rows: dataRows.map((row) => ({
        ...row,
        sourceRowNumber: Number(row.sourceRowNumber),
        quantity: row.quantity === null ? null : toNumber(row.quantity),
        unitPrice: row.unitPrice === null ? null : toNumber(row.unitPrice),
        amount: row.amount === null ? null : toNumber(row.amount),
      })),
      quality: {
        totalActiveRows: toNumber(quality.total_active_rows),
        invalidDateCount: toNumber(quality.invalid_date_count),
        missingAmountCount: toNumber(quality.missing_amount_count),
      },
      years,
      sync: {
        lastSuccessAt: sync.lastSuccessAt ? String(sync.lastSuccessAt) : null,
        rowsSynced: toNumber(sync.rowsSynced),
        rowsChanged: toNumber(sync.rowsChanged),
        rowsArchived: toNumber(sync.rowsArchived),
        sourceRange: sync.sourceRange ? String(sync.sourceRange) : null,
      },
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    console.error("PPBJ MySQL read failed:", error);
    const message = error instanceof Error && error.message.includes("Konfigurasi MySQL")
      ? error.message
      : "Gagal membaca database PPBJ. Pastikan MySQL berjalan dan database/schema sudah dibuat.";
    return errorResponse(message, 503);
  }
}

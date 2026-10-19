import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "../../../../lib/db";

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const HEADERS = [
  "Tanggal",
  "No PPBJ",
  "Nama Pembuat PPBJ",
  "Divisi",
  "Nama Barang / Jasa",
  "Satuan",
  "Jumlah",
  "Harga Satuan",
  "Jumlah Harga",
  "Beban Biaya",
  "Tanggal Kebutuhan",
  "Alasan Permintaan",
];

const COLORS = {
  green: "174B3A",
  greenMid: "2C6A50",
  greenPale: "EAF3EE",
  greenLight: "F5F9F6",
  text: "21352B",
  muted: "64756B",
  border: "D8E3DC",
  white: "FFFFFF",
  stripe: "F7FAF8",
  gold: "D5A85B",
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

function numberValue(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function excelDate(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function styleCell(cell: ExcelJS.Cell, style: Partial<ExcelJS.Style>) {
  Object.assign(cell, style);
}

function styleMergedRow(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  firstColumn: number,
  lastColumn: number,
  text: string,
  style: Partial<ExcelJS.Style>,
) {
  worksheet.mergeCells(rowNumber, firstColumn, rowNumber, lastColumn);
  for (let column = firstColumn; column <= lastColumn; column += 1) {
    styleCell(worksheet.getCell(rowNumber, column), style);
  }
  worksheet.getCell(rowNumber, firstColumn).value = text;
}

type PpbjExportRow = {
  tanggal: string | null;
  no_ppbj: string;
  nama_pembuat_ppbj: string;
  divisi: string;
  nama_barang_jasa: string;
  satuan: string;
  jumlah: unknown;
  harga_satuan: unknown;
  jumlah_harga: unknown;
  beban_biaya: string;
  tanggal_kebutuhan: string | null;
  alasan_permintaan: string;
};

function buildMonthSheet(
  workbook: ExcelJS.Workbook,
  monthNumber: number,
  year: number,
  rows: PpbjExportRow[],
) {
  const worksheet = workbook.addWorksheet(MONTHS[monthNumber - 1], {
    properties: { tabColor: COLORS.greenMid },
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  });

  worksheet.columns = [
    { key: "tanggal", width: 16 },
    { key: "no_ppbj", width: 20 },
    { key: "nama_pembuat_ppbj", width: 27 },
    { key: "divisi", width: 16 },
    { key: "nama_barang_jasa", width: 36 },
    { key: "satuan", width: 13 },
    { key: "jumlah", width: 14 },
    { key: "harga_satuan", width: 20 },
    { key: "jumlah_harga", width: 21 },
    { key: "beban_biaya", width: 24 },
    { key: "tanggal_kebutuhan", width: 19 },
    { key: "alasan_permintaan", width: 42 },
  ];

  styleMergedRow(worksheet, 1, 1, 12, "REKAP PENGAJUAN PPBJ · DIVISI MARKETING", {
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.green } },
    font: { name: "Aptos Display", size: 17, bold: true, color: { argb: COLORS.white } },
    alignment: { vertical: "middle", horizontal: "left" },
  });
  worksheet.getRow(1).height = 36;

  styleMergedRow(worksheet, 2, 1, 12, `Laporan ${MONTHS[monthNumber - 1]} ${year}  |  Sumber: Database PPBJ Marketing`, {
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.greenPale } },
    font: { name: "Aptos", size: 10, color: { argb: COLORS.muted }, italic: true },
    alignment: { vertical: "middle", horizontal: "left" },
  });
  worksheet.getRow(2).height = 23;
  worksheet.getRow(3).height = 9;

  const uniquePpbj = new Set(rows.map((row) => row.no_ppbj.trim()).filter(Boolean)).size;
  const totalAmount = rows.reduce((sum, row) => sum + numberValue(row.jumlah_harga), 0);
  const kpis = [
    { start: 1, end: 4, label: "JUMLAH PPBJ", value: uniquePpbj, format: "#,##0" },
    { start: 5, end: 8, label: "BARIS DETAIL", value: rows.length, format: "#,##0" },
    { start: 9, end: 12, label: "TOTAL PENGAJUAN", value: totalAmount, format: '"Rp" #,##0;[Red]-"Rp" #,##0;-' },
  ];
  for (const kpi of kpis) {
    styleMergedRow(worksheet, 4, kpi.start, kpi.end, kpi.label, {
      fill: { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.greenMid } },
      font: { name: "Aptos", size: 9, bold: true, color: { argb: COLORS.white } },
      alignment: { vertical: "middle", horizontal: "center" },
    });
    worksheet.mergeCells(5, kpi.start, 5, kpi.end);
    for (let column = kpi.start; column <= kpi.end; column += 1) {
      styleCell(worksheet.getCell(5, column), {
        fill: { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.greenPale } },
        font: { name: "Aptos Display", size: 15, bold: true, color: { argb: COLORS.green } },
        alignment: { vertical: "middle", horizontal: "center" },
        border: { bottom: { style: "thin", color: { argb: COLORS.border } } },
      });
    }
    const cell = worksheet.getCell(5, kpi.start);
    cell.value = kpi.value;
    cell.numFmt = kpi.format;
  }
  worksheet.getRow(4).height = 20;
  worksheet.getRow(5).height = 31;
  worksheet.getRow(6).height = 10;

  const headerRow = 7;
  const header = worksheet.getRow(headerRow);
  header.values = HEADERS;
  header.height = 34;
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.green } };
    cell.font = { name: "Aptos", size: 10, bold: true, color: { argb: COLORS.white } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: COLORS.green } },
      bottom: { style: "medium", color: { argb: COLORS.gold } },
      left: { style: "thin", color: { argb: COLORS.green } },
      right: { style: "thin", color: { argb: COLORS.green } },
    };
  });

  const dataStartRow = headerRow + 1;
  for (let index = 0; index < rows.length; index += 1) {
    const item = rows[index];
    const row = worksheet.addRow([
      excelDate(item.tanggal),
      item.no_ppbj,
      item.nama_pembuat_ppbj,
      item.divisi,
      item.nama_barang_jasa,
      item.satuan,
      item.jumlah === null || item.jumlah === undefined || item.jumlah === "" ? null : numberValue(item.jumlah),
      item.harga_satuan === null || item.harga_satuan === undefined || item.harga_satuan === "" ? null : numberValue(item.harga_satuan),
      item.jumlah_harga === null || item.jumlah_harga === undefined || item.jumlah_harga === "" ? null : numberValue(item.jumlah_harga),
      item.beban_biaya,
      excelDate(item.tanggal_kebutuhan),
      item.alasan_permintaan,
    ]);
    row.height = 30;
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: index % 2 === 0 ? COLORS.white : COLORS.stripe },
      };
      cell.font = { name: "Aptos", size: 10, color: { argb: COLORS.text } };
      cell.alignment = {
        vertical: "top",
        horizontal: [7, 8, 9].includes(columnNumber) ? "right" : "left",
        wrapText: [3, 5, 10, 12].includes(columnNumber),
      };
      cell.border = { bottom: { style: "hair", color: { argb: COLORS.border } } };
    });
    row.getCell(1).numFmt = "dd mmm yyyy";
    row.getCell(7).numFmt = "#,##0.###";
    row.getCell(8).numFmt = '"Rp" #,##0.00;[Red]-"Rp" #,##0.00;-';
    row.getCell(9).numFmt = '"Rp" #,##0.00;[Red]-"Rp" #,##0.00;-';
    row.getCell(11).numFmt = "dd mmm yyyy";
  }

  const lastDataRow = dataStartRow + rows.length - 1;
  let reportEndRow = headerRow;
  if (rows.length > 0) {
    worksheet.autoFilter = { from: `A${headerRow}`, to: `L${lastDataRow}` };
    const totalRowNumber = lastDataRow + 1;
    worksheet.mergeCells(totalRowNumber, 1, totalRowNumber, 6);
    for (let column = 1; column <= 12; column += 1) {
      styleCell(worksheet.getCell(totalRowNumber, column), {
        fill: { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.greenPale } },
        font: { name: "Aptos", size: 10, bold: true, color: { argb: COLORS.green } },
        border: { top: { style: "medium", color: { argb: COLORS.greenMid } } },
        alignment: { vertical: "middle", horizontal: column === 7 || column === 9 ? "right" : "left" },
      });
    }
    worksheet.getCell(totalRowNumber, 1).value = "TOTAL";
    worksheet.getCell(totalRowNumber, 7).value = { formula: `SUM(G${dataStartRow}:G${lastDataRow})`, result: rows.reduce((sum, row) => sum + numberValue(row.jumlah), 0) };
    worksheet.getCell(totalRowNumber, 7).numFmt = "#,##0.###";
    worksheet.getCell(totalRowNumber, 9).value = { formula: `SUM(I${dataStartRow}:I${lastDataRow})`, result: totalAmount };
    worksheet.getCell(totalRowNumber, 9).numFmt = '"Rp" #,##0.00;[Red]-"Rp" #,##0.00;-';
    worksheet.getRow(totalRowNumber).height = 25;
    reportEndRow = totalRowNumber;
  } else {
    styleMergedRow(worksheet, dataStartRow, 1, 12, "Tidak ada data PPBJ Marketing pada periode ini.", {
      fill: { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.greenLight } },
      font: { name: "Aptos", size: 11, italic: true, color: { argb: COLORS.muted } },
      alignment: { vertical: "middle", horizontal: "center" },
      border: { bottom: { style: "thin", color: { argb: COLORS.border } } },
    });
    worksheet.getRow(dataStartRow).height = 32;
    reportEndRow = dataStartRow;
  }

  const footerRow = reportEndRow + 2;
  styleMergedRow(worksheet, footerRow, 1, 12, `Dibuat otomatis oleh Marketing Operations · ${new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date())} WIB`, {
    font: { name: "Aptos", size: 9, italic: true, color: { argb: COLORS.muted } },
    alignment: { vertical: "middle", horizontal: "left" },
  });
  worksheet.getRow(footerRow).height = 21;
  worksheet.views = [{ state: "frozen", ySplit: headerRow }];
  worksheet.properties.defaultRowHeight = 18;
  worksheet.pageSetup.printArea = `A1:L${footerRow}`;
  worksheet.headerFooter.oddFooter = "&LInternal · PPBJ Marketing&CHalaman &P dari &N&R&F";
  return worksheet;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const match = period.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (!match) return jsonError("Format periode tidak valid. Gunakan YYYY-MM.", 400);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const scope = searchParams.get("scope") === "year" ? "year" : "month";
  const rangeStart = scope === "year" ? `${year}-01-01` : `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonth = new Date(Date.UTC(year, scope === "year" ? 12 : month, 1));
  const rangeEnd = scope === "year"
    ? `${year + 1}-01-01`
    : `${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth() + 1).padStart(2, "0")}-01`;

  try {
    const pool = getDbPool();
    const [records] = await pool.query<RowDataPacket[]>(
      `SELECT DATE_FORMAT(tanggal, '%Y-%m-%d') AS tanggal,
              no_ppbj,
              COALESCE(nama_pembuat_ppbj, '') AS nama_pembuat_ppbj,
              COALESCE(divisi, '') AS divisi,
              COALESCE(nama_barang_jasa, '') AS nama_barang_jasa,
              COALESCE(satuan, '') AS satuan,
              jumlah, harga_satuan, jumlah_harga,
              COALESCE(beban_biaya, '') AS beban_biaya,
              DATE_FORMAT(tanggal_kebutuhan, '%Y-%m-%d') AS tanggal_kebutuhan,
              COALESCE(alasan_permintaan, '') AS alasan_permintaan
       FROM tb_ppbj
       WHERE source_row_number IS NOT NULL
         AND is_active = 1
         AND LOWER(TRIM(COALESCE(divisi, ''))) = 'marketing'
         AND tanggal >= ? AND tanggal < ?
       ORDER BY tanggal ASC, no_ppbj ASC, source_row_number ASC`,
      [rangeStart, rangeEnd],
    );

    const rows = records as PpbjExportRow[];
    const byMonth = new Map<number, PpbjExportRow[]>();
    for (let monthNumber = 1; monthNumber <= 12; monthNumber += 1) byMonth.set(monthNumber, []);
    for (const row of rows) {
      if (!row.tanggal) continue;
      const monthNumber = Number(row.tanggal.slice(5, 7));
      byMonth.get(monthNumber)?.push(row);
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Marketing Operations";
    workbook.lastModifiedBy = "Marketing Operations";
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.subject = scope === "year" ? `Rekap PPBJ Marketing tahun ${year}` : `Rekap PPBJ Marketing ${MONTHS[month - 1]} ${year}`;
    workbook.title = "Rekap PPBJ Marketing";
    workbook.company = "Marketing Operations";
    workbook.calcProperties.fullCalcOnLoad = true;

    if (scope === "year") {
      for (let monthNumber = 1; monthNumber <= 12; monthNumber += 1) {
        buildMonthSheet(workbook, monthNumber, year, byMonth.get(monthNumber) ?? []);
      }
    } else {
      buildMonthSheet(workbook, month, year, byMonth.get(month) ?? []);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const arrayBuffer = new ArrayBuffer(buffer.byteLength);
    new Uint8Array(arrayBuffer).set(buffer);
    const filename = scope === "year"
      ? `rekap-ppbj-marketing-tahunan-${year}.xlsx`
      : `rekap-ppbj-marketing-${year}-${String(month).padStart(2, "0")}.xlsx`;

    return new Response(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("PPBJ Excel export failed:", error);
    const message = error instanceof Error && error.message.includes("Konfigurasi MySQL")
      ? error.message
      : "Gagal membuat file Excel. Pastikan database PPBJ tersedia.";
    return jsonError(message, 503);
  }
}

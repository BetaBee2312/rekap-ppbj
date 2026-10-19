import { createHash } from "node:crypto";
import { google } from "googleapis";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "./db";

type Cell = string | number | boolean | null | undefined;
type ParsedDate = { iso: string; inferred: boolean } | null;

type SheetPpbjRow = {
  sourceRowNumber: number;
  tanggal: string | null;
  noPpbj: string;
  namaPembuatPpbj: string | null;
  divisi: string | null;
  namaBarangJasa: string | null;
  satuan: string | null;
  jumlah: number | null;
  hargaSatuan: number | null;
  jumlahHarga: number | null;
  bebanBiaya: string | null;
  tanggalKebutuhan: string | null;
  alasanPermintaan: string | null;
  rawTanggal: string | null;
  rawTanggalKebutuhan: string | null;
  sourceHash: string;
  sourceRawJson: string;
};

const MONTH_ALIASES: Record<string, number> = {
  jan: 1, januari: 1, january: 1,
  feb: 2, februari: 2, february: 2,
  mar: 3, maret: 3, march: 3,
  apr: 4, april: 4,
  mei: 5, may: 5,
  jun: 6, juni: 6, june: 6,
  jul: 7, juli: 7, july: 7,
  agu: 8, ags: 8, agustus: 8, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oktober: 10, oct: 10, october: 10,
  nov: 11, november: 11,
  des: 12, desember: 12, dec: 12, december: 12,
};

function validIsoDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function yearFromPpbj(noPpbj: string): number | null {
  const digits = noPpbj.replace(/\D/g, "");
  if (digits.length < 2) return null;
  const shortYear = Number(digits.slice(0, 2));
  return shortYear >= 20 && shortYear <= 80 ? 2000 + shortYear : null;
}

function parseSheetDate(value: Cell, noPpbj = ""): ParsedDate {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value < 20000 || value > 90000) return null;
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
    const iso = validIsoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
    return iso ? { iso, inferred: false } : null;
  }
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  const inferredYear = yearFromPpbj(noPpbj);

  let match = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (match) {
    let year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    let inferred = false;
    if (year < 2000 && inferredYear) { year = inferredYear; inferred = true; }
    const iso = validIsoDate(year, month, day);
    return iso ? { iso, inferred } : null;
  }

  match = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    let year = Number(match[3]);
    let inferred = false;
    if (year < 100) year += 2000;
    if (year < 2000 && inferredYear) { year = inferredYear; inferred = true; }
    const iso = validIsoDate(year, month, day);
    return iso ? { iso, inferred } : null;
  }

  match = raw.toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ").match(/^(\d{1,2})[\s/.-]+([a-z]+)[\s/.-]*(\d{2,4})?$/i);
  if (match) {
    const day = Number(match[1]);
    const month = MONTH_ALIASES[match[2].toLowerCase()];
    if (!month) return null;
    let year = match[3] ? Number(match[3]) : 0;
    let inferred = false;
    if (year > 0 && year < 100) year += 2000;
    if ((!year || year < 2000) && inferredYear) { year = inferredYear; inferred = true; }
    const iso = validIsoDate(year, month, day);
    return iso ? { iso, inferred } : null;
  }
  return null;
}

function parseNumeric(value: Cell): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  let text = value.trim().replace(/\s/g, "").replace(/^(rp|idr)/i, "").replace(/(rp|idr)$/i, "");
  if (!text) return null;
  text = text.replace(/[^\d,.-]/g, "");
  if (!text || !/\d/.test(text)) return null;
  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) text = text.replace(/\./g, "").replace(",", ".");
    else text = text.replace(/,/g, "");
  } else if (lastComma >= 0 || lastDot >= 0) {
    const separator = lastComma >= 0 ? "," : ".";
    const pieces = text.split(separator);
    if (pieces.length > 2) text = pieces.join("");
    else if (pieces[1]?.length === 1 || pieces[1]?.length === 2) text = `${pieces[0]}.${pieces[1]}`;
    else text = pieces.join("");
  }
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function cellText(value: Cell): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function nullableText(value: Cell): string | null {
  const text = cellText(value);
  return text || null;
}

function normalizeHeader(value: Cell): string {
  return cellText(value).toLocaleLowerCase("id-ID").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function mapHeaders(headerCells: Cell[]) {
  const headers = headerCells.map(normalizeHeader);
  const find = (predicate: (header: string) => boolean) => headers.findIndex(predicate);
  const result = {
    tanggal: find((h) => h === "tanggal"),
    noPpbj: find((h) => h.replace(/\./g, "") === "no ppbj"),
    namaPembuatPpbj: find((h) => h.includes("nama pembuat ppbj")),
    divisi: find((h) => h === "divisi"),
    namaBarangJasa: find((h) => h.includes("nama barang") && h.includes("jasa")),
    satuan: find((h) => h === "satuan"),
    jumlah: find((h) => h === "jumlah"),
    hargaSatuan: find((h) => h.includes("harga satuan")),
    jumlahHarga: find((h) => h.includes("jumlah harga")),
    bebanBiaya: find((h) => h.includes("beban biaya")),
    tanggalKebutuhan: find((h) => h.includes("tanggal kebutuhan")),
    alasanPermintaan: find((h) => h.includes("alasan permintaan")),
  };
  const missing = Object.entries(result).filter(([, index]) => index < 0).map(([name]) => name);
  if (missing.length) throw new Error(`Header kolom tidak lengkap: ${missing.join(", ")}. Periksa GOOGLE_SHEETS_RANGE.`);
  return result as Record<keyof typeof result, number>;
}

function normalizeRow(cells: Cell[], sourceRowNumber: number, index: Record<string, number>, range: string): SheetPpbjRow | null {
  const noPpbj = cellText(cells[index.noPpbj]);
  // Baris kosong dan judul bagian seperti "AGUSTUS" tidak dianggap transaksi.
  if (!noPpbj) return null;

  const rawCells = Array.from({ length: 12 }, (_, column) => cells[column] ?? null);
  const parsedDate = parseSheetDate(cells[index.tanggal], noPpbj);
  const parsedNeedDate = parseSheetDate(cells[index.tanggalKebutuhan], noPpbj);
  const sourcePayload = JSON.stringify({ range, sourceRowNumber, values: rawCells });
  const sourceHash = createHash("sha256").update(JSON.stringify(rawCells)).digest("hex");

  return {
    sourceRowNumber,
    tanggal: parsedDate?.iso ?? null,
    noPpbj,
    namaPembuatPpbj: nullableText(cells[index.namaPembuatPpbj]),
    divisi: nullableText(cells[index.divisi]),
    namaBarangJasa: nullableText(cells[index.namaBarangJasa]),
    satuan: nullableText(cells[index.satuan]),
    jumlah: parseNumeric(cells[index.jumlah]),
    hargaSatuan: parseNumeric(cells[index.hargaSatuan]),
    jumlahHarga: parseNumeric(cells[index.jumlahHarga]),
    bebanBiaya: nullableText(cells[index.bebanBiaya]),
    tanggalKebutuhan: parsedNeedDate?.iso ?? null,
    alasanPermintaan: nullableText(cells[index.alasanPermintaan]),
    rawTanggal: nullableText(cells[index.tanggal]),
    rawTanggalKebutuhan: nullableText(cells[index.tanggalKebutuhan]),
    sourceHash,
    sourceRawJson: sourcePayload,
  };
}

function toDbSnapshot(row: SheetPpbjRow) {
  return {
    source_row_number: row.sourceRowNumber,
    tanggal: row.tanggal,
    no_ppbj: row.noPpbj,
    nama_pembuat_ppbj: row.namaPembuatPpbj,
    divisi: row.divisi,
    nama_barang_jasa: row.namaBarangJasa,
    satuan: row.satuan,
    jumlah: row.jumlah,
    harga_satuan: row.hargaSatuan,
    jumlah_harga: row.jumlahHarga,
    beban_biaya: row.bebanBiaya,
    tanggal_kebutuhan: row.tanggalKebutuhan,
    alasan_permintaan: row.alasanPermintaan,
    raw_tanggal: row.rawTanggal,
    raw_tanggal_kebutuhan: row.rawTanggalKebutuhan,
    source_hash: row.sourceHash,
    source_raw_json: row.sourceRawJson,
    is_active: 1,
  };
}

export type PpbjSyncResult = {
  ok: true;
  skipped: boolean;
  reason?: string;
  range: string;
  sourceRows: number;
  changedRows: number;
  archivedRows: number;
  lastSuccessAt: string | null;
};

export async function syncGoogleSheetToMySql(force = false, allowShrink = false): Promise<PpbjSyncResult> {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const range = process.env.GOOGLE_SHEETS_RANGE || "'Sheet1'!A4:L";
  if (!spreadsheetId || !serviceAccountEmail || !privateKey) {
    throw new Error("Konfigurasi Google Sheets belum lengkap. Periksa GOOGLE_SHEETS_SPREADSHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, dan GOOGLE_PRIVATE_KEY di .env.local.");
  }

  const pool = getDbPool();
  const connection = await pool.getConnection();
  let lockAcquired = false;
  const lockName = "marketing_ppbj_sheet_sync";
  try {
    const [lockRows] = await connection.query<RowDataPacket[]>("SELECT GET_LOCK(?, 20) AS acquired", [lockName]);
    lockAcquired = Number(lockRows[0]?.acquired) === 1;
    if (!lockAcquired) throw new Error("Sinkronisasi lain masih berjalan. Coba muat ulang beberapa saat lagi.");

    if (!force) {
      const [recentRows] = await connection.query<RowDataPacket[]>(
        "SELECT last_success_at, rows_synced, rows_changed, rows_archived, source_range, (last_success_at >= DATE_SUB(NOW(), INTERVAL 10 SECOND)) AS is_recent FROM tb_ppbj_sync_state WHERE id = 1",
      );
      const recent = recentRows[0];
      if (Number(recent?.is_recent) === 1) {
        return {
          ok: true,
          skipped: true,
          reason: "recent-success",
          range: String(recent.source_range || range),
          sourceRows: Number(recent.rows_synced || 0),
          changedRows: Number(recent.rows_changed || 0),
          archivedRows: Number(recent.rows_archived || 0),
          lastSuccessAt: recent.last_success_at ? String(recent.last_success_at) : null,
        };
      }
    }

    const auth = new google.auth.JWT({
      email: serviceAccountEmail,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
      valueRenderOption: "UNFORMATTED_VALUE",
      dateTimeRenderOption: "SERIAL_NUMBER",
      majorDimension: "ROWS",
    });

    const values = result.data.values ?? [];
    if (values.length < 2) throw new Error("Google Sheets kosong atau tidak memiliki baris data. Database tidak diubah.");
    const header = values[0] as Cell[];
    const column = mapHeaders(header);
    const rangeStartMatch = range.match(/!(?:\$?[A-Z]+)\$?(\d+)/i);
    const headerRowNumber = rangeStartMatch ? Number(rangeStartMatch[1]) : 1;
    const incomingRows = values.slice(1).map((cells, rowIndex) => normalizeRow(
      cells as Cell[], headerRowNumber + rowIndex + 1, column, range,
    )).filter((row): row is SheetPpbjRow => row !== null && (row.divisi ?? "").toLocaleLowerCase("id-ID") === "marketing");

    // Fail closed: a cleared/wrong range must never deactivate the existing database mirror.
    if (incomingRows.length === 0) {
      throw new Error("Tidak ditemukan baris dengan No PPBJ. Database tidak diubah agar data lama tetap aman.");
    }

    const incomingByRow = new Map<number, SheetPpbjRow>(incomingRows.map((row): [number, SheetPpbjRow] => [row.sourceRowNumber, row]));
    await connection.beginTransaction();
    try {
      const [existingRows] = await connection.query<RowDataPacket[]>("SELECT * FROM tb_ppbj WHERE source_row_number IS NOT NULL");
      const activeExistingCount = existingRows.filter((row) => Number(row.is_active) === 1).length;
      if (!allowShrink && activeExistingCount >= 10 && incomingRows.length < activeExistingCount * 0.5) {
        throw new Error(`SOURCE_SHRINK: Sumber sekarang hanya memiliki ${incomingRows.length} baris, jauh lebih sedikit daripada ${activeExistingCount} baris aktif di MySQL. Database tidak diubah. Periksa Google Sheets sebelum mengonfirmasi penghapusan.`);
      }
      const existingByRow = new Map<number, RowDataPacket>(
        existingRows.map((row): [number, RowDataPacket] => [Number(row.source_row_number), row]),
      );
      let changedRows = 0;
      let archivedRows = 0;

      for (const oldRow of existingRows) {
        const rowNumber = Number(oldRow.source_row_number);
        const incoming = incomingByRow.get(rowNumber);
        const wasActive = Number(oldRow.is_active) === 1;

        if (!incoming && wasActive) {
          await connection.execute(
            "INSERT INTO tb_ppbj_sync_history (source_row_number, action_type, before_data, after_data) VALUES (?, 'REMOVED', ?, NULL)",
            [rowNumber, JSON.stringify(oldRow)],
          );
          await connection.execute("UPDATE tb_ppbj SET is_active = 0, last_synced_at = NOW() WHERE source_row_number = ?", [rowNumber]);
          archivedRows += 1;
          continue;
        }

        if (incoming && (String(oldRow.source_hash) !== incoming.sourceHash || !wasActive)) {
          const action = wasActive ? "UPDATED" : "RESTORED";
          await connection.execute(
            "INSERT INTO tb_ppbj_sync_history (source_row_number, action_type, before_data, after_data) VALUES (?, ?, ?, ?)",
            [rowNumber, action, JSON.stringify(oldRow), JSON.stringify(toDbSnapshot(incoming))],
          );
          changedRows += 1;
        }
      }

      for (const incoming of incomingRows) {
        if (!existingByRow.has(incoming.sourceRowNumber)) changedRows += 1;
      }
      const dataColumnNames = [
        "source_row_number", "tanggal", "no_ppbj", "nama_pembuat_ppbj", "divisi", "nama_barang_jasa",
        "satuan", "jumlah", "harga_satuan", "jumlah_harga", "beban_biaya", "tanggal_kebutuhan",
        "alasan_permintaan", "raw_tanggal", "raw_tanggal_kebutuhan", "source_hash", "source_raw_json", "is_active",
      ];
      const columnNames = [...dataColumnNames, "last_synced_at"];
      const updateColumns = dataColumnNames.filter((name) => name !== "source_row_number");

      // The multi-row upsert is idempotent: loading the same sheet twice will not duplicate PPBJ rows.
      for (let offset = 0; offset < incomingRows.length; offset += 250) {
        const batch = incomingRows.slice(offset, offset + 250);
        const valueTuple = `(${dataColumnNames.map(() => "?").join(",")}, NOW())`;
        const sql = `INSERT INTO tb_ppbj (${columnNames.join(",")}) VALUES ${batch.map(() => valueTuple).join(",")} ON DUPLICATE KEY UPDATE ${updateColumns.map((name) => `${name} = VALUES(${name})`).join(",")}, last_synced_at = NOW()`;
        const params: Array<string | number | null> = [];
        for (const row of batch) {
          params.push(
            row.sourceRowNumber, row.tanggal, row.noPpbj, row.namaPembuatPpbj, row.divisi, row.namaBarangJasa,
            row.satuan, row.jumlah, row.hargaSatuan, row.jumlahHarga, row.bebanBiaya, row.tanggalKebutuhan,
            row.alasanPermintaan, row.rawTanggal, row.rawTanggalKebutuhan, row.sourceHash, row.sourceRawJson, 1,
          );
        }
        await connection.query(sql, params);
      }

      await connection.execute(
        `INSERT INTO tb_ppbj_sync_state (id, last_success_at, rows_synced, rows_changed, rows_archived, source_range)
         VALUES (1, NOW(), ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE last_success_at = NOW(), rows_synced = VALUES(rows_synced), rows_changed = VALUES(rows_changed), rows_archived = VALUES(rows_archived), source_range = VALUES(source_range)`,
        [incomingRows.length, changedRows, archivedRows, range],
      );
      await connection.commit();
      const [stateRows] = await connection.query<RowDataPacket[]>("SELECT last_success_at FROM tb_ppbj_sync_state WHERE id = 1");
      return {
        ok: true,
        skipped: false,
        range,
        sourceRows: incomingRows.length,
        changedRows,
        archivedRows,
        lastSuccessAt: stateRows[0]?.last_success_at ? String(stateRows[0].last_success_at) : null,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } finally {
    if (lockAcquired) {
      try { await connection.query("SELECT RELEASE_LOCK(?)", [lockName]); } catch { /* Connection cleanup below is still required. */ }
    }
    connection.release();
  }
}

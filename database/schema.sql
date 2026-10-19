CREATE DATABASE IF NOT EXISTS db_ppbj_rekap
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE db_ppbj_rekap;

-- Baris aktif mencerminkan baris Divisi Marketing dari Google Sheets saat sinkronisasi terakhir.
-- source_row_number adalah nomor baris fisik di sheet, sehingga satu No PPBJ
-- boleh muncul di beberapa baris untuk rincian barang/jasa.
CREATE TABLE IF NOT EXISTS tb_ppbj (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_row_number INT UNSIGNED NOT NULL,
  tanggal DATE NULL,
  no_ppbj VARCHAR(100) NOT NULL,
  nama_pembuat_ppbj VARCHAR(150) NULL,
  divisi VARCHAR(100) NULL,
  nama_barang_jasa TEXT NULL,
  satuan VARCHAR(50) NULL,
  jumlah DECIMAL(15,3) NULL,
  harga_satuan DECIMAL(18,2) NULL,
  jumlah_harga DECIMAL(18,2) NULL,
  beban_biaya VARCHAR(150) NULL,
  tanggal_kebutuhan DATE NULL,
  alasan_permintaan TEXT NULL,
  raw_tanggal VARCHAR(255) NULL,
  raw_tanggal_kebutuhan VARCHAR(255) NULL,
  source_hash CHAR(64) NOT NULL,
  source_raw_json LONGTEXT NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_synced_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tb_ppbj_source_row_number (source_row_number),
  KEY idx_tb_ppbj_tanggal (tanggal),
  KEY idx_tb_ppbj_divisi_tanggal (divisi, tanggal),
  KEY idx_tb_ppbj_no_ppbj (no_ppbj),
  KEY idx_tb_ppbj_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Setiap perubahan/penghapusan dari sumber diarsipkan agar snapshot lama tetap tersedia.
CREATE TABLE IF NOT EXISTS tb_ppbj_sync_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_row_number INT UNSIGNED NOT NULL,
  action_type VARCHAR(20) NOT NULL,
  before_data LONGTEXT NOT NULL,
  after_data LONGTEXT NULL,
  changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_history_source_row (source_row_number),
  KEY idx_history_changed_at (changed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tb_ppbj_sync_state (
  id TINYINT UNSIGNED NOT NULL,
  last_success_at DATETIME NULL,
  rows_synced INT UNSIGNED NOT NULL DEFAULT 0,
  rows_changed INT UNSIGNED NOT NULL DEFAULT 0,
  rows_archived INT UNSIGNED NOT NULL DEFAULT 0,
  source_range VARCHAR(255) NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO tb_ppbj_sync_state (id, rows_synced, rows_changed, rows_archived)
VALUES (1, 0, 0, 0)
ON DUPLICATE KEY UPDATE id = VALUES(id);

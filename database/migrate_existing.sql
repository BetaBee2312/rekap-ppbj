-- Gunakan file ini HANYA jika tabel `tb_ppbj` lama sudah dibuat dari SQL awal
-- (sebelum kolom sinkronisasi Google Sheets ditambahkan). Jangan jalankan setelah schema.sql pada database baru.
USE db_ppbj_rekap;

ALTER TABLE tb_ppbj
  ADD COLUMN source_row_number INT UNSIGNED NULL AFTER id,
  ADD COLUMN raw_tanggal VARCHAR(255) NULL,
  ADD COLUMN raw_tanggal_kebutuhan VARCHAR(255) NULL,
  ADD COLUMN source_hash CHAR(64) NULL,
  ADD COLUMN source_raw_json LONGTEXT NULL,
  ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN last_synced_at DATETIME NULL,
  ADD UNIQUE KEY uq_tb_ppbj_source_row_number (source_row_number),
  ADD KEY idx_tb_ppbj_divisi_tanggal (divisi, tanggal),
  ADD KEY idx_tb_ppbj_active (is_active);

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

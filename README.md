# Marketing Dashboard — Google Sheets → MySQL → Next.js

Versi ini mengganti data demo dengan data yang benar-benar dibaca dari MySQL. Setiap kali dashboard dibuka, server Next.js akan meminta data terbaru dari Google Sheets, lalu melakukan upsert ke MySQL. Dashboard mengambil KPI, grafik, komposisi beban biaya, dan tabel dari MySQL.

## Nama database

Aplikasi menggunakan database `db_ppbj_rekap` dan tabel data utama `tb_ppbj`. Tabel pendukung sinkronisasi bernama `tb_ppbj_sync_history` dan `tb_ppbj_sync_state`.

## Alur sinkronisasi

1. Browser membuka dashboard.
2. Next.js membaca rentang sumber Google Sheets menggunakan service account dengan izin baca saja.
3. Baris PPBJ dinormalisasi lalu disimpan dengan `INSERT ... ON DUPLICATE KEY UPDATE`; pemuatan ulang tidak membuat baris ganda.
4. Dashboard mengambil data dari tabel MySQL `tb_ppbj`.
5. Perubahan/penghapusan sumber dicatat di `tb_ppbj_sync_history`. Baris yang hilang dari sheet ditandai tidak aktif, bukan dihapus fisik.

Ada perlindungan tambahan: jika sumber tiba-tiba menyusut menjadi kurang dari 50% jumlah baris aktif di database (dan ada minimal 10 baris sebelumnya), sinkronisasi otomatis dihentikan agar kekosongan/penghapusan tidak langsung diterapkan. Dashboard menampilkan peringatan dan tombol konfirmasi; konfirmasi hanya dilakukan setelah pemeriksaan manual. Permintaan sinkronisasi duplikat dalam 10 detik memakai hasil sinkronisasi terakhir untuk mengurangi permintaan berulang saat React Strict Mode atau beberapa tab terbuka.

## File

- `app/page.tsx` — dashboard dan navigasi: Dashboard, Rekap Bulanan, Rekap Tahunan, Data PPBJ, Export Laporan, dan Sinkronisasi; saat mount memulai sinkronisasi.
- `app/dashboard.css` — styling dashboard.
- `app/api/ppbj/route.ts` — endpoint baca agregasi dari MySQL; gunakan `?period=2026-10` untuk rekap bulanan atau `?period=2026-10&scope=year` untuk ringkasan dan baris seluruh tahun 2026.
- `app/api/ppbj/sync/route.ts` — endpoint sinkronisasi sumber Google Sheets ke MySQL.
- `app/api/ppbj/export/route.ts` — generator file Excel berformat rapi; ekspor tahunan menghasilkan 12 worksheet per bulan.
- `lib/db.ts` — connection pool `mysql2/promise`.
- `lib/ppbj-sync.ts` — baca Google Sheets, parse tanggal/nominal, upsert dan arsip riwayat.
- `database/schema.sql` — schema untuk database baru/kosong.
- `database/migrate_existing.sql` — migrasi bila tabel `tb_ppbj` lama sudah dibuat dari SQL awal.
- `.env.example` — contoh konfigurasi, tanpa kredensial nyata.

## Navigasi dashboard

Semua menu sidebar sekarang aktif:

- **Dashboard** — KPI periode terpilih dan tren satu tahun.
- **Rekap Bulanan** — KPI, komposisi beban biaya, dan rincian untuk bulan terpilih.
- **Rekap Tahunan** — KPI agregat satu tahun, tren 12 bulan, dan tabel ringkasan per bulan. Pilih batang grafik atau tautan pada tabel untuk membuka bulan tertentu.
- **Data PPBJ** — pencarian dan tabel baris PPBJ Marketing sepanjang tahun terpilih.
- **Export Laporan** — laporan Excel berdesain rapi dengan judul, periode, ringkasan KPI, header tabel, format tanggal/Rupiah, filter, baris total, dan pengaturan cetak landscape. Ekspor tahunan menghasilkan 12 worksheet, Januari sampai Desember; bulan tanpa transaksi tetap memiliki sheet kosong yang diberi keterangan.
- **Sinkronisasi** — status Google Sheets → MySQL, jumlah baris sinkron/berubah/diarsipkan, serta tindakan sinkronisasi manual.

Pada layar kecil, navigasi tersedia dalam bentuk bar menu yang dapat digeser secara horizontal. API bulanan dan tahunan memakai range tanggal yang sesuai, tetapi sumbernya tetap satu tabel `tb_ppbj`.

## 1. Pilih schema yang sesuai

### Database baru atau masih kosong

Jalankan `database/schema.sql` melalui phpMyAdmin atau MySQL client. File ini membuat database `db_ppbj_rekap`, tabel `tb_ppbj`, tabel riwayat, dan status sinkronisasi.

### Sudah membuat tabel `tb_ppbj` dari SQL versi sebelumnya

Jangan jalankan `schema.sql` saja karena `CREATE TABLE IF NOT EXISTS` tidak menambah kolom pada tabel yang sudah ada. Periksa backup terlebih dahulu, lalu jalankan `database/migrate_existing.sql`. Script migrasi ini menambahkan metadata sinkronisasi. Data lama yang tidak mempunyai `source_row_number` tetap tersimpan, tetapi aplikasi tidak mencampurnya dengan baris yang disinkronkan dari spreadsheet.

## 2. Pasang dependensi

Di folder utama proyek Next.js yang sudah kamu punya:

```bash
npm install mysql2 googleapis exceljs
```

Salin file `app/`, `lib/`, dan `database/` ke proyek. Salin `.env.example` sebagai `.env.local`. Kalau proyek menggunakan `src/app`, taruh `app/` di `src/app` dan `lib/` di `src/lib` agar jalur relatif API tetap sesuai.

## 3. Konfigurasi `.env.local`

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=db_ppbj_rekap
DB_CONNECTION_LIMIT=10

GOOGLE_SHEETS_SPREADSHEET_ID=1lz8Sw2-n6zZBH1QjfLKDb9vNgf-d3mp4PAQ-D2sBe90
GOOGLE_SHEETS_RANGE=Sheet1!A4:L
GOOGLE_SERVICE_ACCOUNT_EMAIL=email-service-account-dari-json
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nISI_KEY_BARU\n-----END PRIVATE KEY-----\n"
```

- Pastikan nama tab Google Sheet benar-benar `Sheet1`. Kalau bukan, ubah `GOOGLE_SHEETS_RANGE` memakai nama tab yang benar dan tetap dimulai dari baris header, misalnya `'Nama Tab'!A4:L`.
- Buat service account di Google Cloud, aktifkan Google Sheets API, dan bagikan spreadsheet sebagai **Viewer** ke email service account.
- Gunakan private key baru setelah merotasi key yang pernah terekspos. Jangan mengirim private key lewat chat dan jangan commit `.env.local` ke GitHub.
- Untuk Laragon lokal biasanya `root` dengan password kosong; sesuaikan jika konfigurasi MySQL kamu berbeda. Di production, gunakan database user terpisah dengan izin minimum, jangan memakai `root`.

## 4. Jalankan dan uji

```bash
npm run dev
```

Buka `http://localhost:3000`. Saat halaman dimuat, sinkronisasi dimulai otomatis. Untuk pemeriksaan terpisah:

- `http://localhost:3000/api/ppbj?period=2026-10` — baca rekap periode dari MySQL.
- `http://localhost:3000/api/ppbj/export?period=2026-10&scope=month` — unduh Excel satu bulan.
- `http://localhost:3000/api/ppbj/export?period=2026-10&scope=year` — unduh Excel dengan 12 sheet bulanan untuk tahun 2026.
- Sinkronisasi menggunakan `POST /api/ppbj/sync`; jangan membuka endpoint itu sebagai halaman GET.

Syaratnya MySQL harus berjalan, schema harus sudah dibuat, variabel `.env.local` lengkap, dan spreadsheet dibagikan ke service account.

## Catatan integritas data

- Hanya baris dengan `Divisi = Marketing` yang disalin ke database; baris divisi lain tidak diimpor. Data PPBJ dapat terdiri dari beberapa baris untuk satu `No PPBJ`; setiap baris dipetakan menggunakan nomor baris fisik sumber, bukan `No PPBJ` sebagai kunci unik.
- Karena spreadsheet belum memiliki ID permanen per baris, `source_row_number` digunakan untuk mengidentifikasi sumber. Jika baris disisipkan, dihapus, atau diurut ulang, snapshot lama disimpan dalam `tb_ppbj_sync_history`, sedangkan isi aktif mengikuti sheet saat ini.
- Baris dengan tanggal yang tidak valid tetap disimpan dengan `tanggal = NULL`, berikut nilai mentahnya. Baris tersebut tidak masuk ke rekap bulanan sampai tanggal diperbaiki.
- Jika sumber kosong atau tidak ada `No PPBJ`, sinkronisasi gagal dengan aman dan tidak menonaktifkan data di database.
- Data bisnis tersimpan di `tb_ppbj`; perubahan dan penghapusan disimpan di `tb_ppbj_sync_history`. Jadwalkan backup database harian ke lokasi terpisah; tabel riwayat bukan pengganti backup.
- Dashboard ini belum memiliki login/role. Jangan publikasikan ke internet berisi data sensitif sebelum autentikasi dan otorisasi ditambahkan.


## Kompatibilitas Next.js 16 dengan `cacheComponents`

Route Handler tidak mengekspor `runtime` atau `dynamic`. Dengan `cacheComponents` aktif, konfigurasi route-segment tersebut tidak kompatibel; Node.js adalah runtime default. Jika muncul error konfigurasi serupa, pastikan `export const runtime = "nodejs"` dan `export const dynamic = "force-dynamic"` tidak ada di file route.


## Catatan kompatibilitas Next.js 16 + cacheComponents

Route Handler tidak mengekspor `runtime` atau `dynamic`. Untuk nilai periode awal, komponen dashboard menghitung bulan berjalan di `useEffect` setelah hydration, bukan ketika Client Component sedang diprerender.

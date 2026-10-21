# Rekap PPBJ Marketing

Dashboard untuk memantau permintaan PPBJ Marketing, nilai biaya, tren bulanan/tahunan, dan detail baris transaksi. Data terbaru dibaca dari Google Sheets, dinormalisasi di server Next.js, lalu disinkronkan ke MySQL sebelum ditampilkan dan diekspor.

## Fitur

- Dashboard KPI: jumlah PPBJ, jumlah baris, total biaya, rata-rata, serta indikator kualitas data.
- Rekap bulanan dan tahunan, tren 12 bulan, dan komposisi beban biaya.
- Penjelajahan data PPBJ dengan pencarian dan filter periode.
- Sinkronisasi Google Sheets ke MySQL melalui service account dengan akses baca.
- Upsert data agar pemuatan ulang tidak membuat duplikasi.
- Riwayat perubahan dan arsip untuk baris yang diubah atau tidak lagi aktif di sumber.
- Perlindungan terhadap penyusutan jumlah baris sumber yang tidak wajar; sinkronisasi dapat dihentikan agar penghapusan data besar tidak diterapkan tanpa pemeriksaan.
- Ekspor Excel satu periode atau laporan tahunan dengan 12 worksheet bulanan.

## Teknologi

- Next.js 16.4.x, React 19, TypeScript
- MySQL melalui `mysql2/promise`
- Google Sheets API melalui `googleapis`
- ExcelJS untuk file Excel
- Tailwind CSS v4 dan CSS dashboard

## Alur data

1. Dashboard meminta sinkronisasi melalui `POST /api/ppbj/sync`.
2. Server mengakses rentang Google Sheets memakai service account dengan scope baca saja.
3. Header dan baris spreadsheet dinormalisasi, termasuk tanggal, nominal, dan kolom PPBJ.
4. Baris dengan `Divisi = Marketing` disimpan ke MySQL. Kunci sumber menggunakan nomor baris dan hash isi.
5. Dashboard membaca data agregasi dari MySQL, bukan menghitung seluruh dashboard di browser.
6. Perubahan dan arsip disimpan di tabel riwayat sinkronisasi.

Sumber spreadsheet harus memiliki header yang dibutuhkan dalam rentang yang dikonfigurasi. Periksa pesan validasi bila nama kolom atau rentang berubah.

## Struktur proyek

```text
app/
  page.tsx                    # Dashboard dan navigasi
  dashboard.css               # Styling dashboard
  api/ppbj/route.ts            # Data dan agregasi PPBJ
  api/ppbj/sync/route.ts       # Sinkronisasi Google Sheets ke MySQL
  api/ppbj/export/route.ts     # Ekspor laporan Excel
lib/
  db.ts                        # Pool koneksi MySQL
  ppbj-sync.ts                 # Baca, normalisasi, upsert, dan arsip data
database/
  schema.sql                   # Skema database baru
  migrate_existing.sql         # Perubahan untuk tabel lama
.env.example                   # Template environment tanpa secret nyata
```

## Persyaratan

- Node.js 20.9 atau lebih baru.
- npm.
- MySQL/MariaDB.
- Google Cloud project dengan Google Sheets API aktif.
- Service account yang memiliki akses **Viewer** ke spreadsheet sumber.

## Menyiapkan database

Pilih langkah sesuai kondisi database dan lakukan backup sebelum mengubah struktur.

### Database baru atau kosong

Jalankan `database/schema.sql` melalui MySQL client atau phpMyAdmin. Skema membuat database `db_ppbj_rekap`, tabel PPBJ, riwayat sinkronisasi, dan status sinkronisasi.

### Sudah ada tabel `tb_ppbj` dari versi sebelumnya

Periksa terlebih dahulu apakah tabel lama punya kolom metadata sinkronisasi. Setelah backup, tinjau dan jalankan `database/migrate_existing.sql` jika sesuai. Jangan mengasumsikan `CREATE TABLE IF NOT EXISTS` akan menambahkan kolom ke tabel yang sudah dibuat.

Nama database aktual ditentukan melalui `DB_NAME`, jadi sesuaikan schema dan environment dengan instalasi yang digunakan.

## Menyiapkan Google Sheets API

1. Aktifkan Google Sheets API di Google Cloud.
2. Buat service account dan simpan private key dengan aman.
3. Bagikan spreadsheet ke email service account dengan izin Viewer.
4. Isi spreadsheet ID, rentang header/data, email service account, dan private key di `.env.local`.
5. Pastikan rentang memulai header yang sesuai. Nilai bawaan template adalah `Sheet1!A4:L`; ganti nama tab/rentang bila spreadsheet berbeda.

**Jangan commit service-account key atau file `.env.local` ke GitHub.** Jika key pernah terekspos, cabut dan buat key baru.

## Menjalankan lokal

Clone repo dan pasang dependensi:

```bash
git clone https://github.com/BetaBee2312/rekap-ppbj.git
cd rekap-ppbj
npm install
```

Salin `.env.example` menjadi `.env.local` lalu isi nilainya:

```dotenv
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=db_ppbj_rekap
DB_CONNECTION_LIMIT=10

GOOGLE_SHEETS_SPREADSHEET_ID=isi_spreadsheet_id
GOOGLE_SHEETS_RANGE=Sheet1!A4:L
GOOGLE_SERVICE_ACCOUNT_EMAIL=service-account-email
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nGANTI_DENGAN_PRIVATE_KEY\n-----END PRIVATE KEY-----\n"
```

Di local Laragon, MySQL sering memakai `root` dan password kosong, tetapi gunakan nilai yang benar untuk lingkungan kamu. Untuk produksi, buat user database khusus dengan hak minimum.

Jalankan development server:

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000).

## Perintah npm

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | Menjalankan Next.js dengan Webpack |
| `npm run build` | Membuat build produksi dengan Webpack |
| `npm run start` | Menjalankan build produksi |
| `npm run lint` | Menjalankan ESLint |

Sebelum menjalankan server produksi, jalankan `npm run build`.

## Endpoint API

| Method | Endpoint | Kegunaan |
| --- | --- | --- |
| GET | `/api/ppbj?period=YYYY-MM` | Data dan ringkasan periode bulanan |
| GET | `/api/ppbj?period=YYYY-MM&scope=year` | Ringkasan tahunan untuk tahun yang dipilih |
| POST | `/api/ppbj/sync` | Menjalankan sinkronisasi Sheets ke MySQL |
| GET | `/api/ppbj/export?period=YYYY-MM&scope=month` | Ekspor Excel bulanan |
| GET | `/api/ppbj/export?period=YYYY-MM&scope=year` | Ekspor Excel tahunan dengan 12 worksheet |

Tahun/periode pada query harus disesuaikan dengan data yang ingin diperiksa.

## Data dan integritas

- Tabel utama: `tb_ppbj`.
- Tabel pendukung: `tb_ppbj_sync_history` dan `tb_ppbj_sync_state`.
- Setiap baris sumber diidentifikasi memakai `source_row_number` karena spreadsheet tidak memiliki ID permanen per baris.
- Baris dengan tanggal yang belum bisa diparse tetap dapat disimpan dengan nilai tanggal mentah untuk pemeriksaan. Baris tersebut tidak masuk agregasi periode sampai tanggalnya valid.
- Jika sumber kosong, header tidak cocok, atau jumlah data turun tajam, sinkronisasi dirancang untuk gagal secara aman daripada langsung menonaktifkan banyak baris lama.
- Tabel riwayat mencatat perubahan, tetapi **bukan pengganti backup database**. Buat backup terjadwal ke lokasi terpisah.

## Keamanan dan deployment

- Dashboard ini tidak memiliki autentikasi/role aplikasi dalam implementasi saat ini. Jangan memublikasikan dashboard berisi data sensitif ke internet tanpa menambah autentikasi dan otorisasi.
- Simpan kredensial database dan private key Google hanya di environment server.
- Gunakan HTTPS dan batasi akses jaringan ke server database.
- Pastikan hosting memiliki akses jaringan ke Google Sheets API dan MySQL.
- Jika host menggunakan filesystem sementara, konfigurasi data backup/ekspor agar tetap tersedia sesuai kebutuhan operasional.

## Troubleshooting

**MySQL tidak dapat dihubungi:** periksa service MySQL dan seluruh variabel `DB_*`.

**Konfigurasi Google Sheets tidak lengkap:** periksa `GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, dan `GOOGLE_PRIVATE_KEY`.

**Header tidak lengkap:** cocokkan nama header sheet dan `GOOGLE_SHEETS_RANGE` dengan kolom PPBJ yang dibutuhkan.

**Akses spreadsheet ditolak:** pastikan spreadsheet dibagikan sebagai Viewer ke service account yang benar.

**Sinkronisasi dihentikan karena penyusutan data:** periksa spreadsheet dan rentang sumber secara manual sebelum melakukan sinkronisasi paksa/konfirmasi. Jangan mengabaikan peringatan tanpa mengetahui penyebab perubahan jumlah baris.

## AI-assisted development

Proyek ini dikembangkan dengan bantuan ChatGPT (OpenAI) untuk implementasi, debugging, peninjauan kode, dan dokumentasi. Commit tetap diatribusikan ke akun GitHub yang menerbitkannya.

# Task 7: Pendaftaran terapis dengan persetujuan admin

Status: implementasi dan verifikasi lokal selesai pada 15 November 2026;
verifikasi staging dan penerapan produksi belum dilakukan.

Panduan konfigurasi: [Operasional persetujuan terapis](../operations/therapist-approval.md).
Checkbox di bawah mencatat implementasi dan pengujian lokal. Identitas admin nyata,
domain pengirim, kontak bantuan, dan environment staging masih perlu ditetapkan
pengelola sebelum tahap operasional.

## Ruang lingkup

Hapus kode undangan dari pendaftaran. Pengajuan terapis diperiksa admin sebelum
mendapat akses klinis. Tambahan yang dipilih pengguna: (1) perlu perbaikan,
(3) riwayat keputusan, (4) penangguhan akun, dan (5) notifikasi email melalui
Resend. Tambahan (2), pemisahan catatan internal dan pesan pendaftar, tidak
diimplementasikan. Gunakan satu alasan keputusan yang terlihat oleh pendaftar.
OTP email bukan bagian dari pekerjaan ini.

## Alur dan status

Daftar -> PENDING -> pemeriksaan admin -> APPROVED / NEEDS_REVISION / REJECTED.
NEEDS_REVISION -> perbaikan dan kirim ulang oleh pemilik -> PENDING.
APPROVED -> SUSPENDED -> APPROVED setelah admin memulihkan akses.

| Status | Hak pengguna |
| --- | --- |
| PENDING | Login terbatas untuk melihat status dan profil pengajuan sendiri |
| NEEDS_REVISION | Melihat alasan, memperbaiki pengajuan sendiri, dan mengirim ulang |
| APPROVED | Mengakses akun terapis; fitur berbayar mengikuti status langganan |
| REJECTED | Melihat hasil dan alasan penolakan; menghubungi admin untuk peninjauan ulang |
| SUSPENDED | Melihat pemberitahuan penangguhan; akses klinis diblokir |

Persetujuan admin tidak mengaktifkan langganan. Pembayaran baru tersedia untuk
akun yang disetujui. Admin mengelola pengajuan tanpa otomatis mendapat akses data
pasien. Perubahan status tidak menghapus data klinis atau riwayat pembayaran.

## T1. Database dan migrasi

- [x] Tambahkan peran ADMIN; pendaftaran publik selalu menetapkan THERAPIST.
- [x] Tambahkan status pengajuan dengan default PENDING untuk akun baru,
      organisasi/klinik, waktu pengajuan, waktu pemeriksaan, dan admin pemeriksa.
- [x] Tambahkan tabel riwayat keputusan: akun, pelaku, status awal/akhir, alasan,
      dan waktu. Simpan perubahan status dan riwayat dalam satu transaksi.
- [x] Tambahkan antrean notifikasi persisten dengan status pengiriman dan ID
      kejadian untuk mencegah pengiriman ganda.
- [x] Migrasi akun lama secara eksplisit: akun aktif tetap APPROVED; akun yang
      dinonaktifkan tetap tidak mendapat akses. Jangan memberi default persetujuan
      kepada pendaftaran baru atau mengubah data pasien/langganan.
- [x] Buat migrasi SQL yang dapat ditinjau dan jalankan prisma generate.

## T2. Backend pendaftaran dan autentikasi

- [x] Hapus ketergantungan REGISTRATION_INVITE_CODE serta validasi inviteCode.
- [x] Wajibkan nama, username, email, kata sandi, dan klinik/instansi. Nomor
      SIP/lisensi menjadi informasi pemeriksaan jika tersedia; jelaskan kepada
      admin bahwa isian tersebut belum otomatis terverifikasi.
- [x] Pendaftaran membuat akun PENDING tanpa akses klinis dan menolak atribut
      role/status/isActive yang dikirim klien sebagai penentu hak akses.
- [x] Setelah kredensial diverifikasi, login mengarahkan akun belum disetujui
      ke halaman status. Backend membatasi sesi ini ke endpoint yang diizinkan.
- [x] Periksa akun, peran, status terkini, dan isActive pada setiap permintaan
      terlindungi. Token lama tidak boleh mempertahankan akses setelah penangguhan.
- [x] Sediakan GET /api/auth/application dan PUT /api/auth/application milik sendiri;
      pengiriman ulang hanya dari NEEDS_REVISION dan kembali ke PENDING.
- [x] Tolak pengubahan email/identitas yang telah disetujui tanpa pemeriksaan ulang.
- [x] Audit juga endpoint home-session berkode agar akses yang bergantung pada
      terapis yang ditangguhkan tidak melewati pemeriksaan status.
- [x] Batasi percobaan login, pendaftaran, dan pengiriman ulang pengajuan.

## T3. API dan dashboard admin

- [x] Sediakan daftar, pencarian, filter status, detail pengajuan, dan riwayat.
- [x] Sediakan keputusan setujui, minta perbaikan, tolak, tangguhkan, dan pulihkan.
      Wajibkan alasan untuk perbaikan, penolakan, penangguhan, dan pemulihan.
- [x] Validasi transisi di backend; cegah keputusan bersamaan menimpa status
      yang sudah berubah dan cegah admin menyetujui pengajuannya sendiri.
- [x] Terapkan pembatasan ADMIN pada seluruh endpoint admin; jangan hanya
      mengandalkan tampilan menu. Jangan tampilkan hash kata sandi.
- [x] Sediakan perintah bootstrap admin pertama yang tidak terbuka melalui API
      publik dan tidak memiliki kata sandi bawaan. Penetapan akun admin pertama
      memerlukan identitas pemilik dari pengguna saat tahap ini dikerjakan.
- [x] Pastikan identitas, klinik, dan informasi profesi diperiksa sesuai checklist
      admin sebelum keputusan. Hindari pengumpulan KTP/dokumen tambahan tanpa kebutuhan.

## T4. Formulir dan halaman status

- [x] Ubah register.html, register.js, dan kedua registration-validation.js:
      hapus kode undangan, wajibkan email dan klinik, perbarui petunjuk.
- [x] Tombol menjadi "Ajukan pendaftaran" dan pesan sukses menjelaskan pemeriksaan admin.
- [x] Buat halaman status dengan alasan keputusan, riwayat, dan formulir perbaikan
      pada NEEDS_REVISION. Pendaftar hanya dapat mengakses pengajuannya sendiri.
- [x] Perbarui pengalihan login/dashboard/game agar sesuai status terbaru, termasuk
      pemberitahuan yang jelas ketika sesi kehilangan akses karena penangguhan.
- [x] Sediakan tautan kontak admin yang dapat dikonfigurasi dan perkiraan waktu
      pemeriksaan yang hanya ditampilkan setelah ditetapkan pengelola.

## T5. Notifikasi Resend

- [x] Email untuk pengajuan diterima, perlu perbaikan, disetujui, ditolak,
      ditangguhkan, dan dipulihkan. Isi alasan yang sama dengan halaman status.
- [x] Gunakan RESEND_API_KEY dan EMAIL_FROM di backend saja; domain pengirim
      harus terverifikasi. Jangan memasukkan kata sandi atau data pasien ke email.
- [x] Simpan keputusan dan kejadian notifikasi bersama; kirim melalui antrean
      dengan retry terbatas dan idempotensi. Kegagalan email tidak membatalkan keputusan.
- [x] Tampilkan kegagalan pengiriman kepada admin agar bisa dicoba ulang.
      Halaman status tetap menjadi sumber informasi ketika email gagal terkirim.
- [x] Perbarui .env.example dan panduan Railway; uji memakai transport palsu
      sebelum uji pengiriman nyata yang diizinkan pengguna.

## T6. Pengujian dan deployment

- [x] Uji PENDING/NEEDS_REVISION/REJECTED/SUSPENDED tidak dapat mengakses data
      pasien, permainan klinis, dan transaksi pembayaran baru.
- [x] Uji terapis tidak dapat memanggil API admin atau membaca pengajuan orang lain.
- [x] Uji seluruh transisi, pengiriman ulang, keputusan bersamaan, dan token lama
      setelah penangguhan, termasuk endpoint home-session yang relevan.
- [x] Uji persetujuan tidak mengubah langganan; pembatasan kepemilikan pasien tetap berlaku.
- [x] Uji duplikasi akun, migrasi akun lama, riwayat keputusan, serta kegagalan/retry email.
- [x] Jalankan tes frontend/backend dan pemeriksaan browser untuk daftar, status,
      review admin, serta akses klinis setelah persetujuan dan langganan aktif.
- [ ] Verifikasi di staging dengan database terpisah sebelum migrasi/deploy produksi.

## Perbaikan warning pada sesi penyusunan task

- [x] Hilangkan pemaksaan FORCE_COLOR yang bertabrakan dengan NO_COLOR pada dev runner.
- [x] Tetapkan perilaku TLS alias pg menjadi sslmode=verify-full di runtime,
      seed, dan skrip E2E; pertahankan konfigurasi libpq yang dipilih eksplisit.
- [x] Perbarui contoh DATABASE_URL dan DIRECT_URL ke sslmode=verify-full.
- [x] Verifikasi pengujian dan startup setelah perubahan warning.

Catatan lingkungan: Node global adalah v20.19.5, sedangkan backend mensyaratkan
>=22.12.0. Prisma generate/validate dan pengujian memakai Node v22.23.5 sementara.
Samakan runtime pengembangan rutin dan deployment dengan persyaratan engines;
task ini tidak mengubah instalasi Node global.

## Hasil verifikasi lokal

- Tes unit: 37 backend dan 42 frontend lulus (termasuk periode WITA dan filter dashboard).
- Prisma Client berhasil dihasilkan dan schema valid dengan Prisma 7.10.1.
- Integrasi PostgreSQL terpisah lulus: migrasi akun lama, bootstrap admin uji,
  kredensial salah, isolasi admin/pemilik, semua transisi, riwayat, perbaikan,
  keputusan bersamaan, langganan, token lama, dan kode home-session.
- Antrean email diuji dengan transport palsu: kegagalan, retry, dan idempotensi;
  tidak mengirim email nyata.
- Chrome headless lulus: daftar, login, halaman status, review admin, perbaikan,
  persetujuan, dashboard klinis dengan langganan aktif, serta penangguhan dan
  pengalihan dashboard/kedua permainan. Tampilan seluler tidak meluber horizontal.
- Pembatasan frekuensi pendaftaran, login, dan pengiriman ulang pengajuan lulus
  pada HTTP nyata.
- PostgreSQL sementara hanya berisi data uji; database uji acak dihapus oleh
  skrip setelah selesai. Database produksi tidak dimigrasikan.

## Informasi yang dibutuhkan saat pelaksanaan

Identitas akun admin pertama, domain pengirim Resend, dan kontak bantuan admin.
API key dimasukkan langsung ke environment server, bukan ke dokumen atau chat.

## Dashboard sesuai desain administrasi

Tampilan `admin.html` mengikuti referensi `desain_admin_dashboard.html`: kanvas
abu-abu, empat kartu ringkasan, filter horizontal, tab status, antrean pengajuan,
dan panel detail berdampingan. CSS lokal menggantikan dependensi Tailwind CDN.
Angka, identitas admin, riwayat, dan notifikasi memakai data backend.

Filter mendukung pencarian, spesialisasi dari data aktual, status, bulan pengajuan
(WITA), serta pagination. Menu atas membuka riwayat keputusan global, antrean
email, dan informasi layanan. Undangan menyalin tautan pendaftaran atau membuka
draf email; tidak membuat kode undangan atau otomatis mengirim pesan.

Referensi berisi contoh STR, KTP, PDF, dan persentase validitas. Implementasi
memakai data yang benar-benar dikumpulkan: identitas, nomor SIP/lisensi, dan
informasi profesi. Kelengkapan nomor tidak diklaim sebagai validitas dokumen;
checklist pemeriksaan manusia tetap wajib sebelum persetujuan/pemulihan.

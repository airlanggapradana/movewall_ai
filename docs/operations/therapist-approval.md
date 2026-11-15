# Operasional pendaftaran dan persetujuan terapis

Implementasi dan migrasi produksi tersedia. Penetapan admin nyata dan pengiriman
email nyata menunggu konfigurasi pengelola. Spesifikasi dan hasil pengujian:
[Task 7](../tasks/Task_7_Admin_Approval.md).

## Runtime dan database

Gunakan Node.js >=22.12.0 sesuai `game-ui/backend/package.json`. Node global pada
mesin pengembangan masih v20.19.5; pengujian 15 November 2026 memakai Node v22.23.5
sementara tanpa mengubah instalasi global.

Backend memakai `DATABASE_URL`; Prisma CLI memakai `DIRECT_URL` jika diisi,
atau `DATABASE_URL` sebagai fallback. Gunakan database staging terpisah sebelum
produksi. Tinjau migrasi SQL dan cadangan database yang dituju sebelum penerapan.

Dari folder `game-ui/backend`, setelah environment staging ditetapkan:

```sh
npm install
npx prisma validate
npx prisma migrate status
npx prisma migrate deploy
npm run build
npm start
```

`migrate deploy` menerapkan migrasi tersimpan, sedangkan `build` menghasilkan
Prisma Client. Rujukan: [Prisma migrate deploy](https://docs.prisma.io/docs/cli/migrate/deploy).
Migrasi baru mengubah akun lama aktif menjadi `APPROVED`, akun lama nonaktif
menjadi `SUSPENDED`, dan mempertahankan default `PENDING` untuk akun baru.
Data pasien, langganan, dan pembayaran tidak diubah oleh migrasi ini.

Di Railway, root service backend adalah `game-ui/backend`, build tetap
`npm install`, dan start `npm start`. `railway.json` menetapkan pre-deploy
`npx prisma migrate deploy`. Perintah `npm start` juga menjalankan migrasi yang
idempoten sebelum server aktif, sehingga skema tetap disiapkan bila pengaturan
pre-deploy hosting tidak dijalankan.
Lihat [Railway pre-deploy command](https://docs.railway.com/deployments/pre-deploy-command).
Deploy frontend setelah backend beserta migrasinya siap.

## Admin pertama

Pengelola harus menentukan username akun khusus admin. Jangan memakai akun
terapis yang menangani pasien. Daftarkan akun tersebut melalui formulir biasa
dengan kata sandi yang ditentukan pemilik, lalu jalankan pada environment database
yang benar:

```sh
npm run admin:bootstrap -- --username USERNAME_PEMILIK
```

Perintah mempromosikan satu akun aktif yang sudah ada, mencatat riwayat keputusan,
dan menolak jika admin sudah tersedia atau akun memiliki pasien. Tidak ada password
bawaan, pembuatan akun otomatis, atau endpoint publik untuk promosi admin.
Identitas admin nyata belum ditetapkan.

Login admin menuju `admin.html`. Cari dan pilih pengajuan, periksa identitas,
klinik, dan informasi profesi, lalu pilih keputusan. Isian SIP/lisensi adalah
informasi pendaftar yang belum diverifikasi otomatis. Checklist wajib untuk
persetujuan dan pemulihan. Alasan perbaikan, penolakan, penangguhan, pemulihan,
dan pembukaan ulang wajib diisi dan terlihat oleh pendaftar; jangan masukkan
catatan internal ke kolom ini.

Keputusan memakai `expectedVersion` untuk mencegah pemeriksaan bersamaan saling
menimpa. Saat mendapat konflik, muat ulang dan periksa status terbaru. Admin tidak
dapat memeriksa dirinya sendiri atau mengakses data pasien lewat peran admin.

Dashboard menampilkan statistik aktual dan filter spesialisasi, status, pencarian,
serta bulan pengajuan. Pelaporan memakai WITA (UTC+08). Persetujuan bulanan hanya
menghitung transisi `PENDING -> APPROVED`; pemulihan akses tidak dihitung ulang.
Durasi pemeriksaan dihitung dari pengajuan/kirim ulang terakhir ke keputusan
admin. Akun lama tanpa riwayat tidak diberi angka durasi buatan. Kelengkapan SIP
mengukur pengisian nomor lisensi, bukan validitas profesi atau dokumen.

Menu atas membuka riwayat keputusan global, antrean email dengan filter status,
dan informasi layanan. Tombol undangan menyediakan tautan formulir pendaftaran
dan draf email; pengelola tetap memilih sendiri penerima dan mengirim pesan.
Tidak ada klaim verifikasi KTP/STR atau pratinjau berkas yang belum dikumpulkan.

## Environment backend

| Variabel | Kegunaan |
| --- | --- |
| `DATABASE_URL`, `DIRECT_URL` | Koneksi runtime dan migrasi sesuai penjelasan di atas |
| `JWT_SECRET` | Secret backend minimal 32 karakter |
| `ADMIN_CONTACT_URL` | Kontak pengelola berupa `https://...` atau `mailto:...`; kosong berarti tautan disembunyikan |
| `APPLICATION_REVIEW_ESTIMATE` | Perkiraan pemeriksaan dari pengelola; kosong berarti tidak ditampilkan |
| `RESEND_API_KEY` | Secret API Resend, hanya di environment backend |
| `EMAIL_FROM` | Contoh format: `MoveWall <akun@domain-pengelola.example>` |
| `NOTIFICATION_WORKER_ENABLED` | Worker otomatis kecuali nilainya `false`; tetap memerlukan konfigurasi Resend |
| `TRUST_PROXY_HOPS` | Jumlah reverse proxy tepercaya sesuai topologi, misalnya `1`; jangan menebak saat ada beberapa proxy |

Salin struktur dari `.env.example`; simpan nilai rahasia langsung di server.
`REGISTRATION_INVITE_CODE` tidak lagi dibaca. Batasi endpoint login/pendaftaran juga
di proxy bila menjalankan beberapa replika: limiter aplikasi tersimpan per proses.
Login dibatasi 15 percobaan per 15 menit per IP; pendaftaran 5 per 15 menit per IP;
pengiriman ulang pengajuan 5 per 15 menit per akun. Proses restart mereset limiter ini.

## Resend dan antrean email

Tambahkan dan verifikasi domain pengirim di Resend sebelum mengisi `EMAIL_FROM`.
Gunakan alamat dari domain tersebut; ikuti [panduan domain Resend](https://resend.com/docs/dashboard/domains/introduction).
Jika key atau pengirim belum diisi, kejadian tetap masuk antrean dan status akun
tetap dapat dilihat. Jangan mengaktifkan pengiriman nyata sebelum penerima dan
domain pengirim ditetapkan pengelola.

Pada server persisten yang menjalankan `node server.js`, worker memeriksa antrean
setiap 30 detik dengan batch 10. Pada serverless, atau untuk drain manual, jalankan
perintah berikut melalui scheduler backend dengan environment yang sama:

```sh
npm run notifications:drain
```

Satu pemanggilan memproses maksimal 10 kejadian yang siap; atur frekuensi scheduler
sesuai volume. Worker memakai lease dan ID kejadian tetap. Maksimal lima percobaan
dengan jeda bertambah, dan tidak mengirim ulang percobaan ambigu setelah 23 jam
sejak percobaan pertama. Batas ini berada dalam retensi idempotensi Resend selama
24 jam. Rujukan: [Resend idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys).

Admin melihat status `PENDING`, `SENDING`, `SENT`, atau `FAILED` pada detail
pengajuan. `SENT` berarti diterima API Resend; aplikasi belum melacak pengantaran
ke inbox melalui webhook. Tombol coba ulang hanya muncul untuk kegagalan yang
masih dalam batas percobaan dan waktu idempotensi. Jika batas tercapai, periksa
status provider sebelum tindakan lanjutan; jangan menghapus ID kejadian untuk
memaksa pengiriman baru. Kegagalan email tidak membatalkan keputusan admin.

## Pengujian

Dari root repository dengan Node yang memenuhi syarat:

```sh
npm run test:frontend
npm run test:backend
```

Uji integrasi memakai PostgreSQL khusus pada `127.0.0.1:55432` dengan user
`movewall_test` yang memiliki izin membuat database. Jangan gunakan database
operasional untuk pengujian ini. Siapkan cluster sementara memakai `initdb` dan
`pg_ctl` dari instalasi PostgreSQL; jalankan hanya pada loopback. Contoh PowerShell:

```powershell
$testData = Join-Path $env:TEMP ('movewall-pg-' + [guid]::NewGuid().ToString('N'))
initdb -D $testData -U movewall_test --auth=trust
pg_ctl -D $testData -l ($testData + '.log') -o '-p 55432 -h 127.0.0.1' -w start
$env:TEST_DATABASE_URL = 'postgresql://movewall_test@127.0.0.1:55432/postgres'
npm --prefix game-ui/backend run test:registration
pg_ctl -D $testData -m fast -w stop
```

Skrip membuat database bernama acak, menjalankan seluruh migrasi, menguji HTTP,
lalu menghapus hanya database yang dibuatnya. Ia tidak memakai URL `.env` untuk
koneksi database uji. Tambahkan `$env:RUN_BROWSER = '1'` sebelum pengujian untuk
Chrome headless; instalasi Chrome dan paket `playwright` di `game-ui` diperlukan.
Screenshot disimpan dalam folder sementara yang dicetak pada hasil tes.
Transport email palsu dipakai sepanjang pengujian; tidak ada pengiriman email nyata.

Verifikasi lokal mencakup migrasi akun lama, isolasi admin/pemilik/pasien, perubahan
status, kirim ulang, konflik keputusan, token lama, kode sesi rumah, pemisahan
persetujuan dan langganan, pembatasan pendaftaran, serta retry email. Uji staging
Railway, bootstrap admin nyata, dan pengiriman Resend nyata masih menunggu
konfigurasi pengelola.

## Patch dependency rilis

Rilis memakai Prisma Client/adapter/CLI 7.10.1 serta lockfile yang diperbarui.
Override `qs` 6.17.1 menutup advisory pada versi yang dipatok Express 4; override
`minimatch` 11.0.8 untuk nodemon menutup advisory glob pada dependency pengembangan.
Audit seluruh dependency backend pada 15 November 2026 melaporkan 0 kerentanan.
Tes unit, PostgreSQL, dan Chrome dijalankan ulang setelah patch ini.

## Konfigurasi Resend 16 November 2026

`RESEND_API_KEY` dan `APP_URL=https://movewall-ai.vercel.app` sudah dipasang
di environment backend Railway. Nilai API key tidak disimpan dalam repository.
API Resend menerima key tersebut, tetapi daftar domain pengirim masih kosong;
pengelola mengonfirmasi belum memiliki domain.

`NOTIFICATION_WORKER_ENABLED=false` sementara dan `EMAIL_FROM` belum ditetapkan,
sehingga antrean pendaftar tetap tersimpan tanpa percobaan pengiriman yang akan
ditolak provider. Pengirim bawaan `onboarding@resend.dev` hanya untuk uji ke
email pemilik akun Resend; alamat tersebut harus ditentukan pengelola sebelum
uji pengiriman nyata. Pengiriman ke pendaftar lain memerlukan domain pengirim
sendiri yang diverifikasi. Lihat [batasan domain uji Resend](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).

Backend produksi berjalan sebagai server Railway, jadi scheduler Vercel tidak
diperlukan. Aktifkan worker setelah domain dan pengirim produksi siap. Scheduler
`npm run notifications:drain` hanya diperlukan jika backend dipindahkan ke
serverless atau worker otomatis sengaja dinonaktifkan untuk pemrosesan terjadwal.

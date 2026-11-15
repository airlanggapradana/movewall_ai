# EmailJS untuk notifikasi MoveWall

Pengiriman tetap dijalankan backend Railway setelah keputusan dan kejadian email
tersimpan. Google/Gmail dihubungkan melalui dashboard EmailJS milik pengelola.
Tidak ada password Gmail atau credential EmailJS di kode frontend.

## Pengaturan dashboard EmailJS

1. Di **Email Services**, hubungkan Gmail dan catat **Service ID**.
2. Buat template umum untuk seluruh status pengajuan, lalu catat **Template ID**.
   Desain persetujuan yang sudah tersedia dapat digunakan sebagai template kedua
   khusus persetujuan. Jangan memakai konten penerimaan untuk penolakan/revisi.
3. Isi **To Email** dengan `{{to_email}}`, **Subject** dengan `{{subject}}`, dan
   nama pengirim dengan `MoveWall AI`. Gunakan alamat pengirim dari service.
4. Isi konten template dengan `{{message}}`; gunakan contoh HTML di
   [emailjs-template.html](emailjs-template.html) jika memakai editor kode.
   Gunakan kurung ganda agar input pendaftar/alasan admin di-escape.
5. Di **Account → API Keys**, catat **Public Key**. Di **Account → Security**,
   aktifkan akses API untuk aplikasi non-browser. Jika Private Key authentication
   diaktifkan, simpan Private Key langsung ke environment Railway.

Variabel template yang dikirim backend: `to_email`, `to_name`, `subject`, `message`,
`event_id`, `next_step_url`, `sender_name`, `organization_name`, `reply_to`.
Penerima harus dinamis `{{to_email}}`, bukan alamat statis admin. Pada desain
persetujuan, sertakan `{{message}}` agar catatan keputusan admin tetap terlihat.
`next_step_url` mengarah ke halaman login dari `APP_URL`.
Referensi: [REST API EmailJS](https://www.emailjs.com/docs/rest-api/send/),
[variabel template](https://www.emailjs.com/docs/user-guide/dynamic-variables-templates/).

## Environment Railway

```text
EMAIL_PROVIDER=emailjs
EMAILJS_SERVICE_ID=<service-id>
EMAILJS_TEMPLATE_ID=<template-id>
EMAILJS_APPROVAL_TEMPLATE_ID=<template-persetujuan-opsional>
EMAILJS_REPLY_TO=<email-bantuan>
EMAILJS_PUBLIC_KEY=<public-key>
EMAILJS_PRIVATE_KEY=<private-key-jika-diaktifkan>
APP_URL=https://movewall-ai.vercel.app
NOTIFICATION_WORKER_ENABLED=false
```

Setel worker `true` setelah pengiriman uji melalui service/template yang benar
diterima. Service ID, Template ID, dan Public Key diperlukan untuk aktivasi;
API key Resend tidak dapat dipakai sebagai credential EmailJS.

Worker membatasi transport EmailJS menjadi satu permintaan setiap 1,1 detik.
Jika provider menolak dengan 429, kejadian tetap menunggu retry terbatas. Error
konfigurasi menjadi `FAILED` dan dapat dicoba ulang setelah diperbaiki.

EmailJS tidak mendokumentasikan idempotency key pada endpoint `/send`. Respons
terputus, HTTP 5xx/408, respons tidak dikenali, atau pemulihan lease pengiriman
menjadi `UNCERTAIN` (**Perlu pemeriksaan pengiriman**). Email tersebut tidak
diulang otomatis; periksa Email History EmailJS terlebih dahulu. Kejadian yang
sudah dicoba lewat Resend juga ditahan untuk pemeriksaan ketika beralih provider.
Kejadian `PENDING` yang belum pernah dicoba dapat diproses EmailJS tanpa mengubah
status pengajuan atau isi email.

Status `SENT` berarti API provider menerima permintaan, bukan bukti masuk inbox.
Jika menjalankan beberapa replika/worker, batas akun EmailJS tetap berlaku;
respons 429 akan ditangani oleh antrean. Saat ini produksi memakai satu server
Railway dan tidak memerlukan scheduler Vercel.

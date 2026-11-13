# MoveWall AI — Design System v1.1 (Draft untuk Review)

| Field | Detail |
|---|---|
| Acuan | PRD MoveWall AI v1.0 (28 Juli 2026) |
| Versi | v1.1, 13 Oktober 2026. Menggantikan arah visual "Goniometer editorial" v1.0 dengan arah **SaaS modern** |
| Status | Draft Markdown untuk review sebelum difinalkan (token JSON, preview HTML, handoff) |
| Cakupan | Aplikasi Pasien (shell web + gameplay) dan Therapist Dashboard |
| Bahasa UI | Bahasa Indonesia (default), struktur siap i18n |

Label kepercayaan dipakai pada klaim yang tidak bisa saya buktikan dari PRD: **[High]**, **[Medium]**, **[Low]**. Seluruh angka kontras di Bagian 4 **dihitung ulang** dengan rumus WCAG 2.x untuk palet v1.1; angka v1.0 tidak berlaku lagi untuk warna yang berubah.

**Yang belum dilakukan:** dokumen ini belum dirender. Kesan "SaaS modern" baru bisa dinilai setelah halaman pratinjau HTML dibuat; sampai saat itu semuanya masih spesifikasi di atas kertas.

### Ringkasan perubahan dari v1.0

| Area | v1.0 | v1.1 |
|---|---|---|
| Arah visual | Editorial hangat, garis tipis, tanpa bayangan standar | SaaS modern: app shell dengan sidebar, kartu berbayang halus, badge, tabel padat, skeleton, toast |
| Netral | Krem hangat (`bone`) | Slate dingin (`bg-app`, `surface`, `border-*`, `text-*`) |
| Aksen utama | Teal tua `#17594F` | Teal `#0F766E` (tetap teal, lebih cerah). Sengaja tidak memakai indigo/ungu khas template |
| Tipografi | Atkinson + Newsreader (serif) | Inter untuk Dashboard; Atkinson Hyperlegible Next untuk Aplikasi Pasien dan Stage; serif dihapus |
| Bentuk | Radius 4/8/16, kartu tanpa bayangan | Radius 6/8/12/16, empat tingkat bayangan halus |
| Kepadatan kontrol | Studio 48 px | Pasien 48 px (tidak berubah); Dashboard 40 px default dan 32 px kompak |
| Stage (gameplay) | Gelap, lantai teks 40 px | **Tidak diubah** |
| Bagian 3 | "Anti-Template" | Diganti "Batas Gaya SaaS" (apa yang diambil dan apa yang sengaja tidak) |
| Koreksi kecil | Temuan #10 merujuk "Bagian 5.2" | Seharusnya Bagian 5.3 (skala Stage); sudah diperbaiki |

---

## 0. Baca Dulu

### 0.1 Risiko dari arah "SaaS modern" (paling penting)

Permintaan ini punya masalah mendasar yang perlu disebut sebelum desainnya: **gaya SaaS modern dioptimalkan untuk orang bekerja di depan layar pada jarak ±50 cm**, dengan teks 12–14 px abu-abu terang, border nyaris tak terlihat, dan kontrol kompak. Produk ini juga dipakai pasien berdiri 1,5–2,5 m dari layar, termasuk persona berusia 58 tahun. Menyalin gaya SaaS apa adanya akan terlihat bagus di mockup dan gagal di ruang tamu.

Karena itu v1.1 membagi penerapannya:

| Permukaan | Seberapa SaaS | Alasan |
|---|---|---|
| Therapist Dashboard | **Penuh** | Pengguna duduk, memakai mouse, membaca data padat. Ini habitat asli gaya SaaS |
| Aplikasi Pasien, mode Studio (duduk) | **Bahasa visualnya saja** (kartu, radius, bayangan, badge), **bukan ukuran dan kepadatannya** | Teks minimum tetap 18 px dan target 48 px |
| Stage (gameplay, berdiri) | **Tidak ada** | Keterbacaan 2 m dan keselamatan tidak boleh dikompromikan demi gaya |

| # | Risiko | Mitigasi di v1.1 | Confidence |
|---|---|---|---|
| 1 | Ukuran dan kepadatan SaaS (14 px, kontrol kompak) tidak terbaca dari 2 m dan sulit bagi pengguna lansia | Pembagian permukaan di atas; lantai Stage 40 px dan minimum pasien 18 px dipertahankan | High (logika), Medium (batas ukuran, perlu uji lapangan) |
| 2 | Border SaaS yang tipis (`#E2E8F0`, rasio **1,23**) gagal 3:1 untuk batas kontrol | Dua kelas border: `border-subtle`/`border-default` hanya dekoratif; `border-control` `#7C8CA3` (3,42 di putih, 3,27 di `bg-app`) untuk input dan kontrol | High (dihitung) |
| 3 | Abu-abu tersier SaaS (`#64748B`) hanya 4,55 di `bg-app` dan **4,34 di `surface-muted` (gagal)** | `text-500` dibatasi untuk latar putih dan `bg-app`, teks ≥ 14 px. Di `surface-muted` dan untuk teks 13 px pakai `text-600` | High (dihitung) |
| 4 | Kontrol kompak 32 px bertentangan dengan target 48 px v1.0 | Dua kepadatan (Bagian 6). Batas minimum WCAG 2.2 untuk target adalah 24 px (SC 2.5.8); perlu verifikasi ke spesifikasi W3C. Jika Dashboard dipakai di tablet/layar sentuh, 32 px terlalu kecil. **PRD tidak menjelaskan perangkat terapis; ini perlu dikonfirmasi** | High (angka 24 px, perlu verifikasi), Low (asumsi perangkat) |
| 5 | Aksen teal berdekatan hue dengan status "Tercapai" (hijau); pengguna bisa mengira tombol utama = status berhasil | Aksen hanya untuk aksi, tautan, fokus. Status selalu bentuk + kata + warna (prinsip 4). Perlu uji simulasi CVD | Medium |
| 6 | Pola SaaS yang berbahaya di konteks klinis: toast hilang otomatis, badge titik warna tanpa teks, "skor risiko" tanpa alasan | Aturan di Bagian 3 | High |
| 7 | Dua keluarga font (Inter + Atkinson) menambah beban muat dan risiko inkonsistensi; ketersediaan dan lisensi Inter belum saya verifikasi | Dibatasi: Inter hanya Dashboard. Lihat keputusan #9 di Bagian 16 | Medium |

### 0.2 Temuan PRD yang Mengubah Keputusan Desain

Temuan di bawah **tidak berubah** dari v1.0 (kecuali koreksi rujukan #10). Ini bukan kritik atas kualitas PRD, tapi celah yang kalau dibiarkan membuat design system terlihat bagus di Figma lalu gagal di ruang tamu pasien. Urut dari yang paling berdampak.

| # | Temuan | Dampak desain | Confidence |
|---|---|---|---|
| 1 | **Tombol "Stop/Nyeri" via 1 klik (Risiko #9) tidak bisa dijangkau pasien yang berdiri 1,5–2,5 m dari laptop (FR-5.2).** Pasien tidak memegang mouse. | Perlu pemicu tanpa sentuhan: gestur (silang tangan di dada, tahan 1 detik), perintah suara, dan tombol layar besar sebagai cadangan. Detail di 10.1. Gestur harus divalidasi klinis dan diuji false-positive. | High (logika), Medium (kelayakan teknis suara berbahasa Indonesia, perlu verifikasi) |
| 2 | **Seluruh navigasi non-gameplay mengasumsikan klik**, padahal pasien bergerak. Kalibrasi sudah hands-free secara alami, tapi "mulai misi", "lanjut set", "selesai" belum. | Pola "tahan pose untuk konfirmasi" (pose-to-confirm) dan auto-advance berpenghitung mundur. Mouse/keyboard tetap ada untuk fase duduk (pre-flight, ringkasan). | High |
| 3 | **Target latensi <30 ms (8.1) secara aritmetika tidak mungkin** pada webcam 30 fps: satu interval frame saja sudah ±33 ms, belum termasuk inferensi, bridge JS↔Unity, dan render. | Desain tidak boleh bergantung pada kontrol "twitch". Mekanik game memakai jendela toleransi (tahan, bukan refleks), avatar mengikuti sudut yang dihaluskan. Target latensi sebaiknya direvisi ke angka yang diukur dari prototipe. | High (aritmetika), Low (angka pengganti, saya tidak punya data, perlu pengukuran) |
| 4 | **Kode warna hijau/kuning/merah (FR-5.1) sendirian tidak aksesibel** untuk buta warna merah-hijau dan terlalu mengandalkan nada "salah" pada lansia. | Setiap status wajib punya penanda kedua: bentuk sendi, label, atau pola. Palet digeser (hijau ke arah teal, merah ke arah coral) untuk memperbesar jarak. Perlu uji simulasi CVD. | High (prinsip), Medium (palet belum disimulasikan, perlu verifikasi) |
| 5 | **Persona Pak Dedi minta "video/replay gerakan bermasalah" (4.3)**, sementara 8.2 melarang video/pose mentah keluar perangkat. FR-D.4 hanya menyebut breakdown per repetisi. | Desain memakai grafik sudut per repetisi plus anotasi, bukan replay. Replay kerangka (stick figure) hanya bisa jika tim privasi menyetujui penyimpanan deret landmark. Dashboard tidak boleh menjanjikan replay sebelum keputusan itu. | High |
| 6 | **FR-6.4 menyarankan "Coba tingkatkan level besok"**, tapi level dan safety ceiling adalah wewenang terapis (6.3.4). | Teks ringkasan tidak boleh mendorong pasien menaikkan beban sendiri. Contoh kalimat diganti di Bagian 13. | High |
| 7 | **Leaderboard di Challenge Mode** memberi insentif memaksakan gerakan pada populasi pasca-cedera, meski ada hard-cap. | Default: bandingkan dengan diri sendiri. Peringkat antarpasien hanya opt-in dan harus disetujui Clinical Advisory Board. Ini rekomendasi desain, bukan fakta klinis. | Medium |
| 8 | **ROM ditampilkan dari kamera 2D monokuler**, padahal Lampiran B menyatakan belum ada validasi vs goniometer. | Tampilkan derajat sebagai bilangan bulat (tanpa desimal), beri tag "Estimasi kamera" di dashboard, dan jangan pakai kata "clinical-grade" di antarmuka. | High |
| 9 | **"Google ML Kit" disebut sebagai opsi pose engine**, padahal untuk target Windows/macOS browser yang relevan adalah MediaPipe. ML Kit adalah SDK Android/iOS. | Tidak mengubah visual, tapi memengaruhi spesifikasi overlay skeleton. Tolong dikonfirmasi tim ML. | High |
| 10 | **Teks kecil mustahil dibaca dari 2 m**, padahal HUD biasanya penuh teks. PRD mengakui ini di FR-5.2 tapi tidak menurunkannya jadi aturan ukuran. | Skala tipografi Stage dengan lantai ukuran keras (Bagian 5.3) dan batas elemen HUD. | Medium (angka berasal dari aturan praktis, perlu uji pada laptop 13–15 inci) |

Dua hal yang saya **tidak** ubah karena itu keputusan bisnis/klinis: skema monetisasi (Lampiran B-4) dan klaim akurasi klinis (Lampiran B-2).

---

## 1. Prinsip Desain

1. **Gerakan adalah antarmuka.** Saat pasien bergerak, layar hanya menjawab tiga pertanyaan: sudah sampai mana, apakah benar, berapa lagi. Semua yang lain disembunyikan.
2. **Aman lebih penting dari menang.** Batas aman (safety ceiling) digambar sebagai bagian dari alat ukur, bukan peringatan tambahan. Tidak ada elemen visual yang merayakan melewati target secara berlebihan.
3. **Terbaca dari dua meter.** Ada dua mode ukuran: *near-field* (duduk, ±50 cm) dan *far-field* (berdiri, ±2 m). Elemen far-field punya lantai ukuran dan tidak boleh jatuh ke ukuran near-field.
4. **Tidak pernah hanya warna.** Setiap status = warna + bentuk + kata (dan suara untuk status kritikal).
5. **Modern, tapi tenang.** Rapi, lapang, dan terstruktur seperti produk SaaS yang matang, tanpa maskot kartun dan konfeti. Persona kita berusia 29 dan 58.
6. **Jujur soal ketidakpastian.** Ini estimasi dari kamera. Antarmuka tidak menampilkan presisi palsu.
7. **Data otomatis dan penilaian manusia selalu terlihat berbeda.** Terapis harus bisa membedakan "kata sistem" dan "kata saya" dalam sekali lihat (FR-D.5).
8. **Kepadatan mengikuti situasi, bukan tren.** Dashboard boleh padat; layar pasien dan Stage tidak.

---

## 2. Konsep Identitas: Produk SaaS Klinis dengan Motif Goniometer

Goniometer adalah alat ukur sudut sendi yang dipakai fisioterapis. Motif busur ukur tetap dipertahankan sebagai satu-satunya elemen yang membuat MoveWall tidak terlihat seperti template SaaS generik, tapi sekarang dirender dengan bahasa visual SaaS.

- **Motif inti: busur ukur.** Busur 0–180° dengan skala halus dan satu penanda target. Muncul di logo, ROM gauge, loading, dan empty state. Ini aset yang membedakan; jangan diperbanyak ke tempat lain.
- **Warna tetap bermakna.** Warna padat dipakai untuk aksi utama dan status. Latar dan kartu netral. Ember (oranye) sengaja langka: kemunculannya berarti target atau perhatian.
- **Dua permukaan, satu keluarga:**
  - **Studio** (terang, slate dingin, kartu putih): Dashboard terapis dan layar pasien saat duduk.
  - **Stage** (gelap, tenang): layar gameplay. Gelap supaya overlay kerangka menonjol dan cahaya layar tidak menyilaukan di ruang redup. Tidak berubah dari v1.0.

Logo (konsep): ikon aplikasi berupa persegi bersudut membulat 12 px berlatar `accent-700`, berisi busur setengah lingkaran putih dengan satu titik `ember-400`; di sampingnya wordmark "MoveWall" (bobot 700, tracking −1%). Aset logo final perlu dibuat terpisah.

---

## 3. Batas Gaya SaaS (Yang Diambil dan Yang Sengaja Tidak)

Bagian ini menggantikan "Anti-Template" di v1.0, yang bertentangan langsung dengan arah baru.

### 3.1 Diambil

| Pola SaaS | Dipakai di | Catatan |
|---|---|---|
| App shell: sidebar + top bar | Dashboard | Bagian 10.2.Q |
| Kartu putih, border 1 px, bayangan halus | Dashboard, Studio pasien | Bagian 6 |
| Kartu statistik (KPI) | Dashboard, ringkasan sesi pasien | 10.2.R |
| Tabel padat dengan header lengket, hover baris | Dashboard | 10.2.J |
| Badge/chip dengan ikon | Dashboard, Studio pasien | **Wajib ada ikon atau kata**, bukan titik warna saja |
| Skeleton loading, empty state, toast | Dashboard, Studio | Aturan khusus di bawah |
| Palet perintah (Ctrl/Cmd+K) | Dashboard saja | Opsional; perlu dicek pemakaiannya dengan terapis |
| Latar tonal halus (`accent-50`, `surface-muted`) | Dashboard, Studio | Bukan gradien warna-warni |
| Blur latar pada top bar lengket | Dashboard saja | Wajib ada fallback solid; tidak dipakai di atas video kamera |

### 3.2 Sengaja tidak

- Gradien ungu-biru, "aurora blob", dan gradien pada angka atau grafik. Gradien hanya boleh sangat halus (`accent-50` ke putih) di hero onboarding, tidak pernah di data atau status.
- Ikon kilau/✨ untuk menandai "AI". Yang ditonjolkan adalah hasil ukur.
- Glassmorphism/blur di atas video kamera atau di Stage. Alasan fungsional: kontras teks di atas video tidak bisa dijamin, dan blur dapat membebani GPU yang sudah memikul inferensi + WebGL. [Medium, tidak diukur]
- **Toast yang hilang otomatis untuk hal keselamatan dan kegagalan sinkron.** Pemberitahuan keselamatan bersifat menetap sampai dikonfirmasi. Toast otomatis hanya untuk konfirmasi sukses yang tidak kritikal.
- **Teks abu-abu 12 px** di Aplikasi Pasien atau Stage.
- **Badge titik warna tanpa teks** (pola SaaS umum untuk status).
- **Skor risiko tanpa alasan** di Dashboard. Setiap prioritas menyertakan kalimat penjelas (10.2.J).
- Konfeti, emoji sebagai ikon fungsional, maskot kartun.
- Angka desimal pada ROM (presisi palsu, lihat temuan #8).
- Warna merah sebagai "hukuman". Coral dipakai sebagai sinyal koreksi, bahasanya tetap suportif.
- Kartu seragam bersudut 16 px dengan bayangan tebal. Radius kartu 12 px dengan bayangan tipis.

---

## 4. Warna

### 4.1 Studio (terang)

| Token | Hex | Peran |
|---|---|---|
| `bg-app` | `#F8FAFC` | Latar halaman |
| `surface` | `#FFFFFF` | Kartu, panel, dialog |
| `surface-muted` | `#F1F5F9` | Latar sekunder, header tabel, chip, area input baca-saja |
| `border-subtle` | `#E2E8F0` | Pemisah halus. **Dekoratif saja** |
| `border-default` | `#CBD5E1` | Border kartu dan tabel. **Dekoratif saja** |
| `border-control` | `#7C8CA3` | Border input, checkbox, kontrol interaktif |
| `text-900` | `#0F172A` | Teks utama, judul |
| `text-700` | `#334155` | Teks isi |
| `text-600` | `#475569` | Teks sekunder, label, keterangan |
| `text-500` | `#64748B` | Teks tersier. Hanya di `surface`/`bg-app`, ≥ 14 px (lihat 4.5) |
| `accent-50` | `#F0FDFA` | Baris terpilih, latar informasional ringan, pita target grafik |
| `accent-700` | `#0F766E` | **Aksi utama**, tautan, fokus |
| `accent-800` | `#115E59` | Hover aksi utama |
| `accent-900` | `#134E4A` | Pressed aksi utama |
| `ember-50` | `#FFF7ED` | Latar peringatan target/perhatian ringan |
| `ember-400` | `#FB923C` | Isian aksen, teks `text-900` di atasnya |
| `ember-500` | `#EA580C` | **Hanya grafis non-teks** (garis putus-putus ceiling, jarum, ikon besar) |
| `ember-600` | `#C2410C` | Tombol sekunder berisi, teks penekanan di atas `ember-50` |

Aksen utama sengaja tetap **teal**, bukan indigo/violet yang menjadi seragam template SaaS. Alasannya: kesan klinis yang tenang dan pembeda dari produk generik. Konsekuensinya sudah dicatat di 0.1 #5 (kedekatan hue dengan status "Tercapai").

### 4.2 Stage (gelap, untuk gameplay)

Tidak berubah dari v1.0.

| Token | Hex | Peran |
|---|---|---|
| `stage-900` | `#0E1514` | Latar |
| `stage-800` | `#162321` | Panel HUD (solid, bukan transparan) |
| `stage-700` | `#1F312E` | Pemisah, track gauge |
| `stage-text` | `#F2EFE8` | Teks utama |
| `stage-muted` | `#A9B5B0` | Teks sekunder dan tanda skala gauge |

### 4.3 Warna Status Gerakan (semantik, tiga set)

Warna status tidak berubah dari v1.0 (nilainya sudah lolos kontras); yang baru adalah latar tint untuk badge di Studio.

| Status | Light (teks di Studio) | Tint (latar badge Studio) | Stage (garis/isian di gelap) | Penanda kedua (wajib) |
|---|---|---|---|---|
| **Tercapai** (ROM sesuai target) | `#0B6B4A` | `#ECFDF5` | `#4FD6A5` | Sendi bulat penuh, garis tebal, kata "Tercapai" |
| **Hampir** (mendekati target) | `#7A5200` | `#FFFBEB` | `#F5C04A` | Sendi belah ketupat, garis putus-putus halus, kata "Hampir" |
| **Koreksi** (kompensasi/postur) | `#A82C16` | `#FEF2F2` | `#FF7A5C` | Sendi segitiga, garis ganda, kata "Koreksi postur" |

Nama status di UI memakai **Tercapai / Hampir / Koreksi**, bukan "Benar/Salah", karena label pertama membingkai pasien sebagai sedang berproses.

### 4.4 Warna Sistem

| Peran | Studio | Stage |
|---|---|---|
| Berhenti/Nyeri (aksi darurat) | isi `#A82C16`, teks putih | isi `#FF7A5C`, teks `#13211F` |
| Info/sinkron | `accent-700` | `#4FD6A5` |
| Peringatan | `#7A5200` di atas `#FFFBEB` | `#F5C04A` |

### 4.5 Kontras Terverifikasi (dihitung ulang dengan rumus WCAG 2.x untuk v1.1)

| Pasangan | Rasio | Ambang | Lolos |
|---|---|---|---|
| `text-900` di `surface` | 17,85 | 4,5 | Ya |
| `text-900` di `bg-app` | 17,06 | 4,5 | Ya |
| `text-700` di `surface` | 10,35 | 4,5 | Ya |
| `text-600` di `surface` | 7,58 | 4,5 | Ya |
| `text-600` di `bg-app` | 7,24 | 4,5 | Ya |
| `text-600` di `surface-muted` | 6,92 | 4,5 | Ya |
| `text-500` di `surface` | 4,76 | 4,5 | Ya (margin tipis) |
| `text-500` di `bg-app` | 4,55 | 4,5 | Ya (margin sangat tipis) |
| `text-500` di `surface-muted` | **4,34** | 4,5 | **Tidak**, jangan dipakai di sini |
| `accent-700` di `surface` | 5,47 | 4,5 | Ya |
| `accent-700` di `bg-app` | 5,23 | 4,5 | Ya |
| `accent-700` di `accent-50` | 5,25 | 4,5 | Ya |
| Putih di `accent-700` | 5,47 | 4,5 | Ya |
| Putih di `accent-800` | 7,58 | 4,5 | Ya |
| Putih di `accent-900` | 9,48 | 4,5 | Ya |
| Putih di `ember-600` | 5,18 | 4,5 | Ya |
| `ember-600` di `ember-50` | 4,88 | 4,5 | Ya |
| `text-900` di `ember-400` | 7,89 | 4,5 | Ya |
| `ember-500` di `surface` | **3,56** | 4,5 (teks) / 3 (grafis) | **Tidak untuk teks**; lolos untuk grafis non-teks |
| Status Tercapai di `surface` | 6,53 | 4,5 | Ya |
| Status Tercapai di tint `#ECFDF5` | 6,20 | 4,5 | Ya |
| Status Hampir di `surface` | 6,92 | 4,5 | Ya |
| Status Hampir di tint `#FFFBEB` | 6,67 | 4,5 | Ya |
| Status Koreksi di `surface` | 6,92 | 4,5 | Ya |
| Status Koreksi di tint `#FEF2F2` | 6,32 | 4,5 | Ya |
| Putih di `#A82C16` (tombol Berhenti, Studio) | 6,92 | 4,5 | Ya |
| Putih di `text-900` (tooltip) | 17,85 | 4,5 | Ya |
| `border-control` di `surface` | 3,42 | 3 (non-teks) | Ya |
| `border-control` di `bg-app` | 3,27 | 3 (non-teks) | Ya |
| `border-default` di `surface` | **1,48** | 3 (non-teks) | **Tidak**, karena itu hanya dekoratif |
| `border-subtle` di `surface` | **1,23** | 3 (non-teks) | **Tidak**, karena itu hanya dekoratif |
| `stage-text` di `stage-900` | 16,10 | 4,5 | Ya |
| `stage-muted` di `stage-900` | 8,74 | 4,5 | Ya |
| `stage-muted` di `stage-800` | 7,65 | 4,5 | Ya |
| Tercapai (stage) di `stage-900` / `stage-800` | 10,12 / 8,87 | 3 (grafis) / 4,5 (teks) | Ya |
| Hampir (stage) di `stage-900` / `stage-800` | 11,02 / 9,66 | sama | Ya |
| Koreksi (stage) di `stage-900` / `stage-800` | 7,21 / 6,32 | sama | Ya |
| `#13211F` di isian `#4FD6A5` | 9,09 | 4,5 | Ya |
| `#13211F` di isian `#FF7A5C` (tombol Berhenti, Stage) | 6,47 | 4,5 | Ya |
| `stage-700` di `stage-900` (track gauge) | **1,35** | 3 (non-teks) | **Tidak**, lihat catatan |

**Catatan track gauge Stage:** track `stage-700` hanya 1,35:1 terhadap latar. Itu bukan pembawa informasi (isian, jarum target, dan arsir ceiling yang membawanya), tetapi **tanda skala di atas track harus memakai `stage-muted`** (8,74) agar rentang 0–180° tetap terbaca. Bug ini ada juga di v1.0 dan baru ketahuan saat dihitung ulang.

**Belum diverifikasi:** keterbedaan tiga warna status di bawah simulasi buta warna (protanopia/deuteranopia), dan keterbedaan aksen teal dari status "Tercapai". Inilah alasan penanda kedua bersifat wajib, bukan opsional.

### 4.6 Warna Grafik (Dashboard)

| Elemen | Warna | Catatan |
|---|---|---|
| Garis ROM (satu seri) | `accent-700` | Satu warna per grafik; pelabelan langsung di ujung garis |
| Pita target | `accent-50` | Bukan pembawa informasi tunggal; ada label "Target" |
| Garis safety ceiling | `ember-500`, putus-putus | 3,56 di putih, lolos untuk grafis |
| Sesi anomali | Titik berongga `ember-500` + tooltip | Bentuk berbeda dari titik data biasa |
| Gridline | `border-subtle` | Dekoratif, minimal |

Jika sebuah grafik perlu lebih dari satu seri, jangan membedakan hanya dengan warna: pakai gaya garis (padat, putus-putus) dan label langsung. Palet multi-seri belum didefinisikan di draft ini.

---

## 5. Tipografi

### 5.1 Keluarga

| Peran | Font | Alasan |
|---|---|---|
| Therapist Dashboard | **Inter** | Standar de facto produk SaaS, bobot lengkap, mendukung angka tabular untuk tabel. Cocok untuk data padat dan pembaca yang duduk dekat |
| Aplikasi Pasien (Studio) dan seluruh Stage | **Atkinson Hyperlegible Next** | Dirancang oleh Braille Institute untuk keterbacaan penglihatan rendah; huruf mirip (I/l/1, O/0) dibuat jelas berbeda. Cocok untuk Bu Ratna dan angka derajat |
| Angka berderet (tabel, log) | Font yang sama dengan permukaannya + `font-variant-numeric: tabular-nums` | Kolom angka lurus |

Serif (Newsreader) **dihapus**: tampilan SaaS modern memakai satu keluarga sans per permukaan.

**Perlu verifikasi sebelum final** [Medium]: ketersediaan dan lisensi Inter dan Atkinson Hyperlegible Next di Google Fonts (keduanya setahu saya berlisensi OFL, tapi saya tidak memeriksa langsung), kelengkapan glyph Bahasa Indonesia, bobot yang dibutuhkan, dan apakah huruf kapital I dan huruf kecil l di Inter cukup mudah dibedakan untuk angka dan label klinis (jika tidak, pakai Atkinson di Dashboard juga, dan itu lebih sederhana).

Fallback: `system-ui, "Segoe UI", Roboto, sans-serif`. Muat font dengan `font-display: swap`; jangan blokir sesi karena font.

### 5.2 Skala Near-Field (Studio)

**Dashboard (Inter, terapis duduk)**

| Token | Ukuran / Line-height | Bobot | Pemakaian |
|---|---|---|---|
| `d-display` | 32 / 40 | 600, tracking −2% | Angka KPI utama |
| `d-title` | 24 / 32 | 600, tracking −1% | Judul halaman |
| `d-heading` | 18 / 28 | 600 | Judul kartu dan bagian |
| `d-body` | 14 / 20 | 400 | Isi umum |
| `d-data` | 14 / 20 | 500, tabular | Sel tabel (minimum untuk terapis) |
| `d-caption` | 13 / 18 | 400 | Keterangan, tag, header kolom. Lantai: tidak ada teks Dashboard di bawah 13 px |

**Aplikasi Pasien, mode Studio (Atkinson, duduk)**

| Token | Ukuran / Line-height | Bobot | Pemakaian |
|---|---|---|---|
| `p-display` | 36 / 44 | 700 | Headline ringkasan sesi |
| `p-title` | 28 / 36 | 700 | Judul halaman |
| `p-heading` | 20 / 28 | 700 | Judul bagian |
| `p-body-lg` | 18 / 28 | 400 | Isi aplikasi pasien (**minimum untuk pasien**) |
| `p-body` | 16 / 24 | 400 | Hanya untuk keterangan sekunder yang bukan instruksi |

`caption` 13 px **tidak dipakai** di Aplikasi Pasien.

### 5.3 Skala Far-Field (Stage, baca dari ±2 m)

Tidak berubah dari v1.0.

Dasar perhitungan: aturan praktis tinggi huruf kapital ≈ jarak ÷ 200. Pada 2 m itu ≈ 10 mm. Laptop 14 inci Full HD punya ±62 px per cm (≈1920 px untuk ±31 cm lebar), jadi 10 mm ≈ 62 px tinggi kapital ≈ 85–90 px ukuran font. Ini batas nyaman, bukan batas minimum; lantai di bawah sengaja lebih rendah.

| Token | Ukuran | Pemakaian |
|---|---|---|
| `stage-cue` | 96 px, bobot 700 | Instruksi kritikal ("Mundur", "Tahan") |
| `stage-metric` | 80 px, bobot 700, tabular | Hitungan repetisi, sudut saat ini |
| `stage-label` | 40 px, bobot 500 | **Lantai.** Tidak ada teks di bawah ini saat pasien bergerak |
| (di bawah 40 px) | n/a | Hanya near-field (pre-flight, ringkasan) |

Confidence: **Medium-Low**. Aturan praktis dan asumsi ukuran layar memengaruhi hasil; wajib diuji dengan pengguna lansia pada laptop 13–15 inci sebelum angka dikunci. Layar lebih kecil atau resolusi lebih rendah memerlukan skala yang dapat diperbesar (8.4 PRD), jadi semua ukuran Stage dikalikan faktor pengguna 1,0 / 1,25 / 1,5.

Batas HUD saat bermain: **maksimal tiga elemen teks sekaligus** (hitungan rep, sudut/ROM gauge, satu cue).

---

## 6. Spasi, Bentuk, Elevasi

| Aspek | Aturan |
|---|---|
| Basis spasi | 4 px; skala 4, 8, 12, 16, 24, 32, 48, 64, 96 |
| Radius | `r-sm` 6 (chip, badge, tag), `r-md` 8 (tombol, input), `r-lg` 12 (kartu), `r-xl` 16 (dialog, panel HUD Stage), `r-full` hanya untuk kontrol bulat, avatar, dan pil filter |
| Kartu (Studio) | Latar `surface`, border 1 px `border-default`, `shadow-xs`. Kartu yang bisa diklik naik ke `shadow-sm` saat hover |
| Elevasi (Studio) | `shadow-xs` `0 1px 2px rgba(15,23,42,0.06)` · `shadow-sm` `0 1px 3px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.04)` · `shadow-md` `0 4px 12px rgba(15,23,42,0.08)` (menu, popover) · `shadow-lg` `0 12px 32px rgba(15,23,42,0.14)` (dialog) |
| Elevasi (Stage) | Tanpa bayangan; pakai lapisan warna |
| Tinggi kontrol, **Aplikasi Pasien** | Minimum 48 px. Stage: kontrol layar minimum 120 × 120 px |
| Tinggi kontrol, **Dashboard** | 40 px default, 32 px kompak (opsional untuk tabel padat). Lihat risiko 0.1 #4 |
| Top bar Dashboard | Tinggi 56 px, lengket |
| Sidebar Dashboard | Lebar 256 px; menciut jadi rel ikon 72 px |
| Grid Dashboard | 12 kolom, gutter 24, lebar konten maks 1280 px, padding sisi 24 (≥1024 px) atau 16 |
| Fokus keyboard | Cincin 2 px `accent-700` + offset 2 px (5,47 di putih) |
| Garis ukur | Stroke 1,5 px (near-field), 6 px (Stage) |

Titik henti responsif Dashboard (usulan, belum dari PRD): ≥1280 sidebar penuh; 1024–1279 sidebar rel; <1024 sidebar jadi laci. Jika terapis memakai tablet, perlu uji ulang ukuran target.

---

## 7. Ikon dan Overlay Kerangka

- **Ikon fungsional:** set garis konsisten, stroke 1,75 px pada kanvas 24 px (varian 16 dan 20 px dengan stroke 1,5 px untuk tabel dan badge), ujung bulat, tanpa isian. Ikon latihan (bahu, lutut, siku, batang tubuh) digambar sebagai figur garis dengan sendi relevan ditandai titik. Jika memakai library ikon terbuka (mis. Lucide atau Phosphor), lisensi dan ketersediaan ikon medis perlu diverifikasi.
- **Overlay kerangka (FR-5.1)** (tidak berubah):
  - Tulang: garis 6 px dengan ujung bulat. Warna mengikuti status segmen (Bagian 4.3).
  - Sendi: bulat (Tercapai), belah ketupat (Hampir), segitiga (Koreksi), ukuran 20 px.
  - Sendi yang sedang diukur diberi cincin luar tipis agar jelas mana yang dinilai.
  - Landmark berkepercayaan rendah (<0,5, PRD 7.4) digambar sebagai titik berongga dan pudar, bukan dihilangkan, supaya pasien paham kenapa sistem ragu.
- **Video pasien:** diredam ke ±35% kecerahan di belakang kerangka agar garis menonjol. Ada sakelar "tampilkan kamera / hanya kerangka". Pada mode hanya-kerangka, tidak ada gambar tubuh yang tampil sama sekali, selaras prinsip privasi.

---

## 8. Motion

| Token | Durasi | Easing | Dipakai untuk |
|---|---|---|---|
| `motion-instant` | 80 ms | linear | Perubahan status kecil |
| `motion-quick` | 160 ms | `cubic-bezier(0.2, 0, 0, 1)` | Hover, fokus, chip, tombol |
| `motion-standard` | 240 ms | sama | Transisi panel, dialog, toast masuk |
| `motion-slow` | 400 ms | `cubic-bezier(0.3, 0, 0, 1)` | Perpindahan antar langkah sesi |

Aturan:
- Tidak ada pantulan (bounce/overshoot) di UI klinis.
- Dialog dan menu: fade + geser ≤ 8 px (atau skala 0,98 → 1). Toast: fade + geser 8 px.
- Skeleton loading memakai kilau pelan (siklus 1,5 detik); dengan `prefers-reduced-motion` menjadi blok statis.
- Repetisi tervalidasi: cincin di sekitar hitungan berdenyut sekali (skala 1,0 → 1,06 → 1,0, 320 ms) disertai nada naik. Tanpa konfeti.
- **Target ROM tidak pernah bergerak di tengah set** (PRD 6.3.3). Ketika target berubah di antara set, tanda target bergeser perlahan (400 ms) dengan label "Target 95° → 100°" selama 3 detik, supaya pasien tidak bingung.
- `prefers-reduced-motion`: semua denyut/geser diganti perubahan opasitas atau warna; game tetap bisa dimainkan karena gerakan game berasal dari tubuh pasien, bukan animasi UI.
- Frame budget: animasi UI di Stage hanya properti `transform` dan `opacity`, karena CPU/GPU dibagi dengan inferensi pose. [Medium]

---

## 9. Desain Audio

Tidak berubah dari v1.0. PRD menegaskan audio wajib (FR-5.2), jadi audio diperlakukan sebagai bagian dari design system, bukan tambahan.

### 9.1 Token Suara

| Token | Makna | Karakter | Durasi |
|---|---|---|---|
| `snd-ready` | Posisi terkunci | Satu nada lembut, naik sedikit | ≤ 400 ms |
| `snd-rep-ok` | Repetisi tercapai | Dua nada naik, hangat | ≤ 500 ms |
| `snd-rep-partial` | Repetisi parsial | Satu nada netral, mendatar | ≤ 300 ms |
| `snd-correct` | Koreksi postur | Dua nada turun, lembut (bukan buzzer) | ≤ 500 ms |
| `snd-safety` | Keselamatan | Dua nada berpola unik, lebih panjang, selalu diikuti suara | ≤ 1,6 s |
| `snd-rest` | Selesai set / istirahat | Tiga nada turun pelan | ≤ 900 ms |

Suara non-verbal harus membawa makna sendirian (naik = berhasil, turun = perbaiki), sesuai PRD.

### 9.2 Aturan Frekuensi dan Volume

- Energi utama nada di 500–2.500 Hz. Speaker laptop lemah di bawah ±300 Hz, dan pendengar lansia sering kehilangan frekuensi tinggi, jadi hindari ketergantungan pada di atas ±4 kHz. [Medium, pengetahuan umum, belum diukur pada perangkat target]
- Antrean sesuai PRD: **keselamatan > koreksi postur > motivasi**. Usulan tambahan: jeda minimum 800 ms antar cue, cue motivasi dibuang (tidak ditunda) jika ada cue lebih tinggi menunggu.
- **Tes pendengaran saat kalibrasi (tambahan, bukan di PRD):** bunyikan nada uji dan minta pasien menahan pose "angkat tangan" bila terdengar. Ini satu-satunya cara memvalidasi "terdengar jelas pada 2 m" per perangkat. Tanpa ini, spesifikasi volume 2 m di PRD tidak bisa dijamin.
- Suara pemandu: Bahasa Indonesia, tempo tenang, kalimat ≤ 4 kata. Pilihan suara perempuan/laki-laki diserahkan ke pasien.

---

## 10. Komponen

Semua komponen Studio memakai token Bagian 4 dan 6. Komponen Stage memakai token Stage dan tidak mengikuti gaya kartu SaaS.

### 10.1 Aplikasi Pasien

**A. Kontrol Darurat "Berhenti" (menjawab Risiko #9)**
- Tiga jalur, aktif bersamaan sepanjang sesi:
  1. **Gestur:** kedua lengan disilang di dada, tahan 1 detik. Cincin kemajuan muncul di tengah layar selama penahanan; lepas sebelum penuh = batal. Perlu uji false-positive dengan gerakan latihan yang sebenarnya. [perlu validasi klinis dan teknis]
  2. **Suara:** "Berhenti". Syarat: pengenalan ucapan on-device dalam Bahasa Indonesia. **Kelayakan perlu diverifikasi** dan tidak boleh mengirim audio ke server (bertentangan dengan 8.2).
  3. **Tombol layar:** 128 × 128 px, pojok kanan bawah, isian koreksi, label "BERHENTI" dengan sublabel "Terasa nyeri". Bisa dijangkau oleh pendamping atau saat pasien sudah dekat.
- Efek: sesi langsung jeda, tampilan menenangkan ("Istirahat dulu. Tidak apa-apa."), target turun ke level termudah (PRD 6.3.5), dan kejadian dicatat untuk terapis.
- Komponen ini **tidak mengikuti gaya SaaS** (tanpa kartu, tanpa bayangan halus); kontras dan ukuran lebih penting.

**B. Daftar Periksa Pra-sesi (FR-1.2, FR-1.3)**
- Kartu putih berisi empat baris: Kamera, Izin kamera, Cahaya, Ruang. Status memakai badge dengan ikon dan kata: menunggu (lingkaran kosong), baik (centang), perhatian (segitiga), gagal (silang). Setiap baris selalu punya kalimat tindakan, bukan kode.
- Contoh: "Ruangan agak gelap. Nyalakan lampu di depan Anda."
- Tombol "Mulai" tetap aktif pada status *perhatian* (jangan memblokir pasien karena cahaya yang masih cukup), nonaktif hanya pada *gagal*.

**C. Siluet Kalibrasi (FR-2.1 sampai 2.6)** (tidak berubah, Stage)
- Garis siluet 6 px; netral (`stage-muted`) → hampir (kuning) → terkunci (hijau) + cincin kemajuan 3 detik (FR-2.4).
- Dua kurung di tepi atas dan bawah layar menandai rentang tinggi tubuh ideal 60–85% (FR-2.2), supaya "jarak ideal" bisa dilihat, bukan hanya didengar.
- Instruksi jarak: satu kata raksasa dengan panah ("MUNDUR ↓"), sinkron dengan audio.
- Setelah 45 detik gagal: panel tutorial singkat muncul tanpa menghentikan kamera; tombol "Coba lagi" tanpa batas.

**D. Pose-to-Confirm** (tidak berubah, Stage)
- Cincin yang terisi selama pose tahan (2 detik) untuk memulai misi atau lanjut set. Mengganti klik pada fase berdiri. Selalu ada alternatif keyboard (Spasi) untuk pendamping.

**E. ROM Arc Gauge (komponen penanda produk)**
- Setengah lingkaran 0–180° dengan skala halus, ujung isian membulat.
- Lapisan, dari dalam ke luar: *track* netral → *isian capaian* (sudut saat ini) → **tanda target** (ember, jarum tebal) → **minimum fungsional** (takik kecil) → **zona di atas safety ceiling** diarsir diagonal dan tidak pernah terisi.
- Angka sudut besar di tengah, bilangan bulat, tanpa desimal.
- Isian berubah warna dan bentuk ujung sesuai status (Bagian 4.3). Ini menerjemahkan logika adaptive difficulty dan safety ceiling PRD menjadi satu gambar yang bisa dipahami sekilas.
- Tanda skala memakai warna teks sekunder (di Studio `text-500`, di Stage `stage-muted`), bukan warna track (lihat catatan 4.5).
- Ukuran Stage: diameter ≥ 360 px. Studio: 160–240 px.

**F. Chip Repetisi**

| Status | Bentuk | Warna | Label |
|---|---|---|---|
| Valid | Lingkaran penuh + centang | Tercapai | "Valid" |
| Parsial | Lingkaran setengah isi | Hampir | "Parsial" |
| Kompensasi | Cincin dengan garis diagonal | Koreksi | "Kompensasi" |

Di Studio, chip berlatar tint status dengan radius `r-sm`; di Stage, hanya bentuk dan warna garis.

**G. Hitungan dan Set**
- Satu angka besar `stage-metric` ("7") dengan "dari 10" memakai `stage-label`. Titik-titik kecil di bawahnya memperlihatkan riwayat chip rep dalam set.

**H. Indikator Sinkron (FR-6.3, Risiko #7)**
- Empat keadaan: "Tersimpan di perangkat", "Menyinkronkan…", "Tersinkron", "Belum tersinkron, akan dicoba lagi". Ikon + teks, tidak pernah berupa titik warna saja. Tidak pernah memakai bahasa yang menimbulkan rasa data hilang.
- **Bukan toast yang hilang sendiri**: status ini menetap di pojok layar sampai keadaannya berubah.

**I. Ringkasan Sesi (FR-6.1, 6.2)**
- Headline `p-display` satu kalimat berfakta ("ROM bahu rata-rata 112° hari ini"). Di bawahnya: tiga kartu statistik (ROM puncak, akurasi, repetisi valid) dan kartu grafik tren sederhana dengan garis target.
- Kartu "Catatan dari kamera" memuat jumlah repetisi kompensasi dalam bahasa suportif.
- Tanpa skor game yang dominan; skor ditampilkan di baris sekunder agar yang menonjol adalah hasil klinis.
- Kalori: opsional, kecil, berlabel "perkiraan".

**S. Kartu Misi Hari Ini (baru di v1.1)**
- Kartu `r-lg` putih per misi: ikon latihan, nama gerakan dalam bahasa awam, jumlah set × repetisi, status (belum/sebagian/selesai) dengan ikon + kata. Satu aksi utama per kartu ("Mulai"). Teks isi 18 px, tombol 48 px. Maksimal tiga kartu terlihat sekaligus tanpa gulir.

### 10.2 Therapist Dashboard

**Q. App Shell (baru di v1.1)**
- **Sidebar** 256 px (rel 72 px): logo, navigasi utama (Pasien, Resep, Laporan, Pengaturan), lencana peran di bawah. Item aktif: latar `accent-50`, teks `accent-700`, **plus** batang kiri 3 px dan `aria-current="page"` (bukan warna saja).
- **Top bar** 56 px: breadcrumb, kolom pencarian pasien, palet perintah (opsional), menu akun. Blur latar diperbolehkan hanya di sini, dengan fallback solid `surface`.
- **Header halaman:** judul `d-title`, deskripsi satu baris `text-600`, aksi utama di kanan (maksimal satu tombol berisi per halaman).

**R. Kartu Statistik (KPI) (baru di v1.1)**
- Label `d-caption` `text-600`, nilai `d-display` tabular, perubahan dengan **panah + kata** ("naik 6° dibanding minggu lalu"), sparkline opsional.
- Perubahan berwarna netral secara default. Warna status dipakai hanya untuk hal yang melewati ambang yang ditetapkan terapis, dan selalu disertai alasan. Tidak ada gradien pada angka.
- Tag "Estimasi kamera" pada kartu yang menampilkan ROM (temuan #8).

**J. Tabel Pasien (Triage, FR-D.1)**
- Header lengket, latar `surface-muted`, teks `d-caption` bobot 600 `text-600`. Tinggi baris 48 px (40 px kompak). Hover baris `surface-muted`; baris terpilih `accent-50` plus kotak centang terisi.
- Kolom: penanda prioritas, nama + diagnosis singkat, adherence 4 minggu (sparkline), perubahan ROM (derajat), tren kompensasi (panah + kata), sesi terakhir.
- **Setiap tanda prioritas wajib disertai alasannya dalam kalimat**, contoh "Adherence turun 3 sesi berturut". Tidak ada skor risiko kotak-hitam, karena Pak Dedi tidak percaya data yang tidak bisa ia telusuri.
- Badge prioritas: ikon + kata ("Perlu perhatian"), bukan titik warna. Urutan default: butuh perhatian dulu, lalu menurut sesi terakhir. Bisa difilter.
- Filter: kontrol segmen dan pil filter (`r-full`) dengan jumlah hasil; state kosong tersedia (10.2.T).

**K. Grafik ROM (FR-D.2)**
- Garis tunggal per gerakan, satu warna (`accent-700`), pita target (`accent-50`) dan **garis safety ceiling** putus-putus ember (4.6). Penanda sesi anomali (Risiko #8) sebagai titik berongga ember dengan tooltip.
- Pelabelan langsung di ujung garis, gridline minimal, sumbu Y dimulai dari nilai yang bermakna secara klinis dengan label sumbu terlihat.
- Selalu ada tag **"Estimasi kamera"** di judul grafik (temuan #8). Dibungkus kartu `r-lg`.

**L. Heatmap Adherence (FR-D.2)**
- Kalender dengan **empat** keadaan sel: selesai (isian `accent-700`), sebagian (setengah), **terlewat** (silang tipis), **tidak dijadwalkan** (kosong, tanpa tanda). Membedakan hari istirahat dari hari terlewat penting agar pasien tidak tampak lebih tidak patuh dari kenyataannya.

**M. Formulir Resep (FR-D.3, Risiko #10)**
- Tata letak dua kolom: formulir di kiri, pratinjau di kanan (lengket).
- Bidang: jenis latihan, target ROM, **batas aman maksimum (safety ceiling)**, ROM minimum fungsional, repetisi × set, level awal, frekuensi mingguan.
- Usulan: safety ceiling **tanpa nilai bawaan dan wajib diisi**; tanpa batas aman, algoritma adaptif tidak punya pagar (6.3.4). Ini usulan desain, perlu persetujuan klinis.
- Validasi kewajaran berupa **peringatan lunak** (kotak `ember-50`/kuning dengan ikon dan kalimat penjelas), bukan blokir (sesuai PRD): "Target 150° lebih tinggi dari rentang umum untuk frozen shoulder. Lanjutkan jika sudah sesuai penilaian Anda."
- Pratinjau: ROM Arc Gauge yang menampilkan target, minimum, dan ceiling yang sedang diatur, sehingga kesalahan ketik terlihat.
- Ringkasan perubahan sebelum simpan (dialog `shadow-lg`): "Perubahan berlaku pada sesi berikutnya pasien." Setelah simpan, toast sukses boleh hilang otomatis; **kesalahan simpan tidak**.

**N. Tinjauan Sesi (FR-D.4)**
- Lajur waktu berisi chip repetisi (Bagian 10.1.F) dengan jejak sudut di bawahnya. Repetisi kompensasi diberi anotasi otomatis; klik membuka panel detail samping (sudut puncak, tempo, sendi penyebab).
- Tidak ada pemutar video di v1 (temuan #5). Jika replay kerangka disetujui kelak, ruang untuk panel ini dicadangkan di tata letak.

**O. Catatan Klinis vs Data Otomatis (FR-D.5)**
- Data otomatis: latar `surface-muted`, tag "Otomatis".
- Catatan terapis: latar `surface`, garis kiri 3 px `accent-700`, nama dan waktu penulis. Dua gaya ini tidak boleh dicampur dalam satu kartu.

**P. Peran dan Akses (FR-D.6)**
- Lencana peran (Admin, Terapis, Staf baca-saja). Kontrol yang tidak diizinkan ditampilkan nonaktif dengan alasan ("Hanya terapis yang dapat mengubah resep"), bukan disembunyikan, supaya perilaku RBAC bisa dimengerti. Jejak audit akses disajikan sebagai daftar kronologis sederhana.

**T. Keadaan Sistem: Kosong, Memuat, Galat (baru di v1.1)**
- **Memuat:** skeleton yang bentuknya meniru isi (baris tabel, kartu statistik). Jangan menampilkan angka nol sambil memuat.
- **Kosong:** ilustrasi garis kecil bermotif busur (satu-satunya tempat motif dipakai sebagai dekorasi), satu kalimat penjelas, satu aksi. Contoh: "Belum ada sesi minggu ini. Pasien akan muncul di sini setelah menyelesaikan latihan."
- **Galat:** kotak inline di dekat sumbernya dengan ikon + kata + tindakan; tidak pernah hanya toast.
- **Toast:** hanya untuk konfirmasi sukses non-kritikal, hilang setelah 5 detik, dapat dijeda saat hover/fokus, dan dibacakan pembaca layar (`role="status"`).

---

## 11. Tata Letak Per Langkah (Alur Pasien)

| Langkah | Mode | Tata letak inti |
|---|---|---|
| 1. Mulai Sesi | Studio, near-field | Kartu Misi Hari Ini (10.1.S) + kartu daftar periksa pra-sesi |
| 2. Kalibrasi | Stage, far-field | Kamera penuh, siluet, kurung rentang, instruksi satu kata, tes pendengaran |
| 3. Main Misi | Stage | Game penuh; HUD solid di tepi: hitungan (kiri atas), ROM gauge (kanan atas), cue (tengah bawah), tombol Berhenti (kanan bawah) |
| 4. Analisis Gerak | Stage | Kerangka berwarna di atas video redup, tanpa teks tambahan |
| 5. Umpan Balik | Stage | Cue ≤ 2 detik, nada, denyut cincin |
| 6. Ringkasan | Studio, near-field | Headline, tiga kartu statistik, kartu grafik tren, status sinkron |

Perpindahan Stage ↔ Studio memakai transisi `motion-slow` dengan jeda napas 600 ms supaya pasien yang baru berhenti bergerak sempat menyesuaikan.

Rekomendasi implementasi: **hanya elemen gameplay yang dirender di Unity.** Pra-sesi, kalibrasi teks, ringkasan, pengaturan, dan seluruh dashboard dirender sebagai DOM biasa karena kanvas WebGL tidak terbaca pembaca layar dan sulit diperbesar. [Medium, praktik umum, perlu dikonfirmasi tim Game Dev]

---

## 12. Arah Visual Game

Tidak ada perubahan: **Stage sengaja tidak mengikuti arah SaaS.** Konsistensi dengan Studio dijaga lewat status warna + bentuk, ROM gauge, dan keluarga font, bukan lewat gaya kartu.

- **Gaya:** diagram kinetik. Lapisan bentuk datar, garis tipis, tekstur butir halus, tanpa gradien mengilap. Palet dari token Stage ditambah satu warna aksen per dunia (mis. teal laut, ocher gurun, biru malam).
- **Karakter:** tidak ada maskot. Pahlawan adalah **kerangka garis pasien sendiri** yang tumbuh menjadi bentuk sesuai mekanik (sayap garis untuk fleksi bahu, busur untuk abduksi). Ini menghemat aset, memperkuat rasa "gerakanku adalah kontrol", dan menghindari infantilisasi pada Bu Ratna.
- **Rintangan/target:** bentuk geometris sederhana yang kontras dengan latar, ukuran besar, jumlah di layar dibatasi (maks tiga sekaligus).
- **Pemetaan PRD 6.1:** Shoulder Flexion → glider yang naik; Abduction → menangkap benda kiri/kanan; Squat → menyelam menembus blok; Elbow Flexion → menarik tuas; Trunk Rotation → membelokkan kendaraan. Isyarat visual setiap gerakan selalu menampilkan **ROM gauge**, jadi pasien melihat sudutnya, bukan hanya efek game.
- **Mode (5.2):** Story (dunia berurutan), Training (tanpa skor, hanya gauge), Challenge (garis personal-best sebagai "hantu" yang dikejar, default bandingkan dengan diri sendiri), Daily Quest (satu kartu harian dengan ring penyelesaian).

---

## 13. Suara dan Nada Penulisan (Microcopy, Bahasa Indonesia)

Prinsip: tenang, singkat, konkret, tidak menggurui, tidak berlebihan memuji. Sapaan netral "Anda"; pasien dapat memilih nama panggilan. Gaya SaaS cenderung ramah dan cerewet ("Yay!", "Oops!"); itu tidak dipakai di sini.

### Sisi pasien

| Situasi | Hindari | Pakai |
|---|---|---|
| Repetisi bagus | "LUAR BIASA!!! Kamu juara!" | "Bagus." |
| Kurang naik | "Gerakan salah" | "Naik sedikit lagi" |
| Terlalu cepat | "Peringatan! Terlalu cepat!" | "Pelan-pelan" |
| Kompensasi | "Postur salah, skor dikurangi" | "Bahu tetap rileks" |
| Oklusi | "Error: landmark hilang" | "Pastikan tangan terlihat kamera" |
| Nyeri | "Sesi dihentikan karena kesalahan" | "Istirahat dulu. Tidak apa-apa." |
| Akhir sesi | "Coba tingkatkan level besok" (bertentangan dengan wewenang terapis) | "Sesi selesai. Terapis Anda akan melihat hasil hari ini." |
| Offline | "Gagal terhubung" | "Tersimpan di perangkat. Akan dikirim saat tersambung." |

### Sisi terapis (Dashboard)

| Situasi | Hindari | Pakai |
|---|---|---|
| Resep tersimpan | "Yay, berhasil disimpan!" | "Resep disimpan. Berlaku pada sesi berikutnya pasien." |
| Gagal simpan | "Oops, ada yang salah" | "Resep belum tersimpan. Periksa koneksi lalu coba lagi." |
| Daftar kosong | "Tidak ada data" | "Belum ada sesi minggu ini. Pasien akan muncul di sini setelah menyelesaikan latihan." |
| Penanda prioritas | "Risiko tinggi" | "Adherence turun 3 sesi berturut" |
| Data kamera | "Akurasi klinis" | "Estimasi kamera" |

Aturan: satu tanda seru per layar paling banyak; tidak ada istilah teknis ("landmark", "confidence", "ROM" di sisi pasien; gunakan "sudut gerak" atau "seberapa tinggi lengan terangkat" sesuai konteks).

---

## 14. Aksesibilitas (Ringkas, Mengacu PRD 8.4)

- Kontras mengikuti tabel 4.5 (AA terpenuhi untuk semua pasangan teks yang dipakai; AAA untuk teks utama). Pasangan yang gagal ditandai dan dilarang untuk teks (`text-500` di `surface-muted`, `ember-500`).
- Dua modalitas untuk semua umpan balik kritikal: visual (bentuk + teks) dan audio.
- Skala ukuran pengguna 1,0 / 1,25 / 1,5 untuk seluruh Stage dan UI pasien.
- Fokus keyboard terlihat: cincin 2 px `accent-700` dengan offset 2 px di Studio.
- Pembaca layar untuk seluruh DOM; label ARIA pada gauge ("Sudut bahu 112 derajat, target 120, batas aman 140"). Item navigasi aktif memakai `aria-current`.
- `prefers-reduced-motion` dihormati (Bagian 8), termasuk skeleton.
- Tidak ada konten berkedip lebih dari 3 kali per detik.
- Target klik: Pasien ≥ 48 px; Dashboard ≥ 32 px (ambang minimum WCAG 2.2 adalah 24 px, perlu verifikasi ke spesifikasi).
- Mode kontras tinggi sebagai varian token (rencana, belum didefinisikan angka di draft ini).

**Perlu diuji dengan manusia, bukan hanya dihitung:** keterbacaan 2 m, pembedaan tiga status pada buta warna, pembedaan aksen teal dari status "Tercapai", kejelasan gestur Berhenti, dan terdengarnya nada pada speaker laptop murah.

---

## 15. Token (Cuplikan Siap Pakai)

Sumber tunggal sebaiknya berupa JSON token dan diekspor ke CSS dan Unity (alat seperti Style Dictionary dapat dipakai; verifikasi kecocokan dengan pipeline tim). Cuplikan CSS berikut menunjukkan pemetaannya. Nama token sekarang **semantik** (`--bg-app`, `--surface`) agar tema lain, mis. Studio gelap kelak, bisa ditambahkan tanpa mengganti nama.

```css
:root {
  /* Neutral (slate) */
  --bg-app:#F8FAFC; --surface:#FFFFFF; --surface-muted:#F1F5F9;
  --border-subtle:#E2E8F0;   /* dekoratif saja */
  --border-default:#CBD5E1;  /* dekoratif saja */
  --border-control:#7C8CA3;  /* kontrol interaktif, >= 3:1 */
  --text-900:#0F172A; --text-700:#334155; --text-600:#475569;
  --text-500:#64748B;        /* hanya di --surface / --bg-app, >= 14px */

  /* Accent (teal) */
  --accent-50:#F0FDFA; --accent-700:#0F766E; --accent-800:#115E59; --accent-900:#134E4A;
  --on-accent:#FFFFFF;

  /* Ember (target / perhatian) */
  --ember-50:#FFF7ED; --ember-400:#FB923C;
  --ember-500:#EA580C;       /* grafis non-teks saja */
  --ember-600:#C2410C;

  /* Status (light) */
  --status-reach:#0B6B4A; --status-reach-bg:#ECFDF5;
  --status-near:#7A5200;  --status-near-bg:#FFFBEB;
  --status-comp:#A82C16;  --status-comp-bg:#FEF2F2;
  --stop-bg:#A82C16; --on-stop:#FFFFFF;

  /* Type */
  --font-dashboard:"Inter", system-ui, "Segoe UI", Roboto, sans-serif;
  --font-patient:"Atkinson Hyperlegible Next", system-ui, "Segoe UI", Roboto, sans-serif;

  /* Space & shape */
  --space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px;
  --space-6:24px; --space-8:32px; --space-12:48px; --space-16:64px; --space-24:96px;
  --r-sm:6px; --r-md:8px; --r-lg:12px; --r-xl:16px; --r-full:9999px;

  /* Elevation */
  --shadow-xs:0 1px 2px rgba(15,23,42,0.06);
  --shadow-sm:0 1px 3px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.04);
  --shadow-md:0 4px 12px rgba(15,23,42,0.08);
  --shadow-lg:0 12px 32px rgba(15,23,42,0.14);

  /* Control height */
  --control-patient:48px; --control-dash:40px; --control-dash-compact:32px;

  /* Focus */
  --focus-ring:0 0 0 2px var(--surface), 0 0 0 4px var(--accent-700);

  /* Motion */
  --ease:cubic-bezier(0.2,0,0,1);
  --dur-instant:80ms; --dur-quick:160ms; --dur-std:240ms; --dur-slow:400ms;
}

[data-surface="stage"] {
  --bg:#0E1514; --panel:#162321; --track:#1F312E;
  --text:#F2EFE8; --muted:#A9B5B0;   /* --muted juga untuk tanda skala gauge */
  --status-reach:#4FD6A5; --status-near:#F5C04A; --status-comp:#FF7A5C;
  --stop-bg:#FF7A5C; --on-stop:#13211F;
  --r-panel:16px;
  --scale:1; /* 1 | 1.25 | 1.5 */
  --type-cue:calc(96px * var(--scale));
  --type-metric:calc(80px * var(--scale));
  --type-label:calc(40px * var(--scale)); /* lantai */
}
```

---

## 16. Daftar Keputusan yang Dibutuhkan Sebelum Finalisasi

| # | Keputusan | Pemilik | Mengapa menghambat |
|---|---|---|---|
| 1 | Gestur/suara Berhenti: layak secara teknis dan disetujui klinis? | ML + Clinical Advisory | Risiko keselamatan #9 tidak tertutup tanpa ini |
| 2 | Replay kerangka di dashboard: boleh menyimpan deret landmark? | Privasi/Compliance | Menentukan isi Tinjauan Sesi |
| 3 | Target latensi realistis berdasarkan pengukuran prototipe | Engineering | Menentukan seberapa "refleks" mekanik game boleh dibuat |
| 4 | Peringkat antarpasien di Challenge Mode: ada atau tidak? | Clinical Advisory | Menentukan desain leaderboard |
| 5 | Safety ceiling wajib diisi tanpa nilai bawaan? | Clinical Advisory + Product | Menentukan formulir resep |
| 6 | Uji lapangan 2 m dengan pengguna lansia dan simulasi buta warna (termasuk teal vs "Tercapai") | UX Research | Mengunci skala Stage dan palet status |
| 7 | Lisensi dan ketersediaan font, set glyph | Design + Legal | Mengunci tipografi |
| 8 | Aset logo "busur goniometer" dan wordmark | Design | Belum dibuat |
| 9 | Inter untuk Dashboard, atau satu keluarga (Atkinson) untuk semua? Cek pembedaan I/l dan lisensi | Design + Frontend | Menentukan beban muat dan konsistensi |
| 10 | Perangkat terapis (laptop saja atau juga tablet)? | Product | Menentukan apakah kontrol kompak 32 px boleh dan titik henti responsif |
| 11 | Apakah Studio gelap (tema gelap umum) dibutuhkan? Stage bukan pengganti tema gelap umum | Product + Design | Menentukan perlu tidaknya set token tema kedua |
| 12 | Palet perintah (Ctrl/Cmd+K) dan sidebar: sesuai alur kerja terapis? | UX Research | Bagian 10.2.Q bersifat usulan, belum divalidasi dengan pengguna |

---

## 17. Peta Migrasi Token v1.0 → v1.1

| Token v1.0 | Token v1.1 | Catatan |
|---|---|---|
| `bone-50` | `bg-app` | Krem hangat → slate dingin |
| `bone-100` | `surface-muted` | |
| (kartu = `bone-100`) | `surface` | Kartu kini putih |
| `bone-200` | `border-subtle` | Dekoratif |
| `bone-300` | `border-default` | Dekoratif |
| `edge-strong` `#8C8472` | `border-control` `#7C8CA3` | Rasio 3,42 di putih |
| `ink-900` / `ink-700` / `ink-600` / `ink-500` | `text-900` / `text-700` / `text-600` / `text-500` | `text-500` kini punya pembatasan pemakaian |
| `primary-50` / `-600` / `-700` | `accent-50` / `accent-700` / `accent-800` | Tambah `accent-900` untuk pressed |
| `ember-400` / `-500` / `-600` | `ember-400` / `-500` / `-600` | Nilai `-400` (`#F07A4F` → `#FB923C`) dan `-500` (`#E4572E` → `#EA580C`) berubah; `-600` tetap `#C2410C`. Tambah `ember-50` |
| `--font-serif` (Newsreader) | dihapus | |
| `--font-ui` | `--font-dashboard` dan `--font-patient` | |
| `--r-sm/md/lg` 4/8/16 | `--r-sm/md/lg/xl` 6/8/12/16 | |
| Stage tokens | tidak berubah | Ditambah `--stop-bg`, `--on-stop`, `--r-panel` |

---

## 18. Langkah Berikutnya yang Disarankan

1. Anda review dokumen ini, terutama Bagian 0.1, 3, dan 16.
2. Setelah disetujui: ekspor token ke JSON, buat halaman pratinjau HTML (swatch, tipografi, ROM Arc Gauge, chip repetisi, kartu statistik, tabel pasien, app shell Dashboard, siluet kalibrasi dalam dua permukaan), lalu spesifikasi handoff untuk tim Frontend dan Unity. Kesan "SaaS modern" baru bisa dinilai pada tahap pratinjau ini.

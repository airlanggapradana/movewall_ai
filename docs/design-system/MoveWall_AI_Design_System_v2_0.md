# MoveWall AI — Design System v2.0 (Draft untuk Review)

| Field | Detail |
|---|---|
| Acuan | PRD MoveWall AI v1.0 (28 Juli 2026) |
| Versi | v2.0, 24 Oktober 2026. Memperbarui v1.1 (13 Oktober 2026): bahasa visual Dashboard dan Studio pasien dimodernkan ke gaya dashboard SaaS terkini |
| Status | Draft Markdown untuk review sebelum difinalkan (token JSON, preview HTML, handoff) |
| Cakupan | Aplikasi Pasien (shell web + gameplay) dan Therapist Dashboard |
| Bahasa UI | Bahasa Indonesia (default), struktur siap i18n |

Label kepercayaan dipakai pada klaim yang tidak bisa saya buktikan dari PRD atau dari pengukuran: **[High]**, **[Medium]**, **[Low]**.

**Cara angka di dokumen ini dihasilkan:**
- Semua rasio kontras (Bagian 4.6) **dihitung dengan skrip** (rumus WCAG 2.x), bukan dikutip dari v1.1.
- Uji buta warna (Bagian 4.7) adalah **simulasi saya sendiri** (matriks Machado 2009, jarak warna CIE76). Ini perkiraan kasar, bukan pengganti uji dengan pengguna.

**Yang belum dilakukan:** dokumen ini belum dirender. Kesan "kekinian" baru bisa dinilai setelah halaman pratinjau HTML dibuat; sampai saat itu semuanya masih spesifikasi di atas kertas.

**Batas bukti untuk klaim "kekinian":** saya mencoba memverifikasi tren lewat pencarian web. Satu artikel yang berhasil dibaca ([saasframe.io, "Anatomy of High-Performance SaaS Dashboard Design: 2026 Trends & Patterns"](https://www.saasframe.io/blog/the-anatomy-of-high-performance-saas-dashboard-design-2026-trends-patterns)) hanya mendukung: sidebar kiri yang bisa diciutkan, dark mode sebagai ekspektasi pengguna berat, tampilan tersimpan (*saved views*) dan filter global, empty state dengan CTA, serta tabel ramah pembaca layar. Artikel itu **tidak** membahas bento grid, command palette, radius/bayangan, maupun motion. Bagian itu berasal dari pengetahuan saya tentang produk SaaS (Linear, Vercel, Stripe, Notion dan sejenisnya) dan berstatus **[Medium]**: masuk akal, tetapi tidak saya konfirmasi ke sumber.

---

## Penilaian Jujur atas v1.1

v1.1 sudah memakai komponen SaaS, tetapi menurut saya masih terbaca seperti template SaaS sekitar 2022–2023: slate + putih, kartu seragam ber-border 1 px, satu tema terang. Kelemahan yang membuatnya belum terasa "dashboard SaaS masa kini" **[Medium, penilaian saya dari spesifikasi, bukan dari tampilan yang dirender]**:

1. **Hanya satu tema (terang).** Dark mode kini dianggap standar di banyak produk SaaS.
2. **Semua kartu setara.** Tidak ada hierarki ukuran (bento), sehingga halaman ringkasan terasa seperti deretan kotak.
3. **Navigasi cepat belum jadi pusat.** Palet perintah hanya "opsional"; tidak ada pintasan keyboard yang terdefinisi.
4. **Tabel belum "kerja berat".** Belum ada tampilan tersimpan, aksi massal, panel detail samping, dan pilihan kepadatan.
5. **Grafik hanya satu seri.** Palet multi-seri tidak didefinisikan, padahal perbandingan kiri/kanan atau minggu ini/lalu cepat dibutuhkan.
6. **Tipografi datar.** Hampir semua judul bobot 600, tanpa kontras ritme antara angka besar, label kecil, dan isi.
7. **Interaksi kecil kurang.** Tidak ada indikator tab yang meluncur, bilah aksi melayang, atau popover yang terstandar.

### Ringkasan perubahan dari v1.1

| Area | v1.1 | v2.0 |
|---|---|---|
| Tema | Terang saja | Terang **dan gelap** untuk Dashboard (Studio Gelap). Studio pasien tetap terang; Stage tidak berubah |
| Shell | Sidebar + top bar rata | Sidebar di atas `bg-app` + **kanvas konten melayang** (panel `r-xl` bercincin halus) pada layar ≥ 1280 px; datar di bawahnya |
| Layout halaman ringkasan | Deretan kartu setara | **Bento grid**: ukuran kartu mengikuti prioritas klinis (Bagian 6.4, 11.2) |
| Permukaan kartu | Border 1 px + bayangan tipis, radius 12 | **Cincin 1 px tipis + bayangan berlapis**, radius **16**; kartu menonjol memakai radius 20 |
| Tipografi | Inter, hampir semua 600 | Inter dengan **ritme bobot** (500 untuk UI, 600 untuk judul, angka KPI tabular dengan tracking rapat), skala diperbarui |
| Navigasi cepat | Palet perintah opsional | **Palet perintah (Ctrl/Cmd+K) terdefinisi** dengan aturan privasi data pasien (10.2.U) |
| Tabel | Header lengket, hover | + **Tampilan tersimpan**, aksi massal melayang, panel detail samping, kepadatan 3 tingkat (10.2.J) |
| Grafik | Satu seri, warna `accent-700` | **Palet empat seri** (3 hue + 1 netral pembanding), area fill satu-hue memudar, batang bertepi bulat (4.8, 10.2.K) |
| Kotak masuk / notifikasi | Tidak ada | **Kotak masuk** klinis: kejadian nyeri/Berhenti menetap sampai diakui (10.2.V) |
| Warna "Koreksi" (Studio) | `#A82C16` (vermilion) | **`#9F1239` (crimson)**: lebih mudah dibedakan dari "Hampir" pada simulasi deuteranopia (2,5 → 14,0). Lihat 0.1 #6 |
| Kontras Stage | Tidak berubah | Tidak berubah (diverifikasi ulang, angka sama) |
| Bagian lain | | Bagian 1, 2, 3, 4, 5, 6, 8, 10.2, 10.3 (baru), 11.2 (baru), 14, 15, 16, 17 diperbarui. Bagian 0.2, 7, 9, 10.1, 11.1, 12, 13 **dibawa tanpa perubahan substansi** (lihat penanda "tidak berubah") |

---

## 0. Baca Dulu

### 0.1 Risiko dari Peningkatan Gaya (paling penting)

Permintaan "tampak kekinian" paling mudah gagal dengan cara yang sama seperti v1.1: tampilan yang bagus di mockup tetapi menyulitkan pengguna di lapangan. Berikut risiko yang **baru atau bertambah** di v2.0.

| # | Risiko | Mitigasi di v2.0 | Confidence |
|---|---|---|---|
| 1 | **Pola SaaS "bersih"** (aksi baris yang baru muncul saat hover, teks 12 px abu-abu, garis nyaris tak terlihat) sulit diakses keyboard/sentuh dan lansia | Aksi baris **juga muncul saat fokus keyboard dan selalu terlihat pada perangkat sentuh**; lantai teks Dashboard tetap 13 px; dua kelas border (dekoratif vs kontrol) tetap berlaku | High |
| 2 | **Bento grid** membuat kartu besar terlihat lebih penting. Jika ukuran mengikuti estetika, kartu "bagus dilihat" menang atas kartu "perlu ditindak" | Aturan penempatan: kartu **Perlu perhatian** selalu di kiri atas dan berukuran paling lebar (Bagian 6.4). Ukuran = prioritas klinis | Medium (logika desain; perlu uji dengan terapis) |
| 3 | **Dark mode** melipatgandakan permukaan yang harus diuji (setiap komponen × 2 tema) dan terapis mungkin tidak pernah memakainya | Dibatasi untuk Dashboard. Token semantik sudah siap. Perlu keputusan produk apakah layak dikerjakan di v1 (Bagian 16 #11) | Medium |
| 4 | **Kanvas konten melayang** mengurangi lebar konten 16–24 px dan menambah bayangan/cincin yang dirender ulang saat gulir | Hanya ≥ 1280 px; di bawahnya datar. Bayangan tidak dianimasikan. Dampak performa **tidak diukur** | Low (tidak diukur) |
| 5 | **Palet perintah** memunculkan nama pasien (data kesehatan) di layar bersama dan di riwayat pencarian | Tidak ada saran nama sebelum mengetik ≥ 2 huruf; riwayat tidak menyimpan nama pasien; akses dicatat di jejak audit (10.2.U). Perlu persetujuan Privasi/Compliance | Medium |
| 6 | **Warna status "Koreksi" v1.1 nyaris tak terbedakan dari "Hampir"** pada simulasi deuteranopia (jarak CIE76 **2,5**; di bawah ±10 umumnya sulit dibedakan) | Studio: Koreksi diganti `#9F1239` (jarak menjadi **14,0**). Penanda kedua (bentuk + kata) tetap wajib. Stage tidak berubah (jarak minimum 22,3). Ini temuan dari v1.1 yang baru terlihat karena saya mensimulasikannya | Medium (simulasi kasar; perlu uji pengguna) |
| 7 | **Efek "kekinian" yang konflik dengan konteks klinis**: angka KPI yang menghitung naik (count-up), kilau/glow, mikro-animasi berlebih | Dilarang (Bagian 3.2, 8). Count-up menunda terbacanya angka dan memberi kesan presisi yang bergerak | High |
| 8 | **Palet grafik empat seri** pada deuteranopia: jarak minimum 10,5 (terang) dan 11,6 (gelap), masih rendah | Seri **selalu** dibedakan juga oleh gaya garis/penanda dan label langsung; warna tidak pernah satu-satunya pembeda (Bagian 4.8) | Medium |
| 9 | Ukuran dan kepadatan SaaS tetap tidak terbaca dari 2 m dan sulit bagi pengguna lansia | **Tidak berubah dari v1.1**: Dashboard penuh gaya SaaS; Studio pasien hanya bahasa visualnya (kartu, radius, bayangan, badge), bukan ukuran/kepadatannya; Stage tidak ikut | High (logika), Medium (batas ukuran) |
| 10 | Perangkat terapis tidak diketahui (laptop atau tablet) | Kontrol kompak 32 px dan sidebar rel tetap bergantung jawaban ini (Bagian 16 #10) | Low (asumsi) |

| Permukaan | Seberapa "kekinian" | Alasan |
|---|---|---|
| Therapist Dashboard | **Penuh**: shell melayang, bento, dark mode, palet perintah, tabel kerja berat | Pengguna duduk, memakai mouse, membaca data padat |
| Aplikasi Pasien, Studio (duduk) | **Bahasa visualnya saja** (kartu radius 16, bayangan berlapis, badge ber-ikon). **Bukan** ukuran, kepadatan, atau interaksi tersembunyi | Teks minimum 18 px, target 48 px, tanpa hover-only |
| Stage (gameplay, berdiri) | **Tidak ada** | Keterbacaan 2 m dan keselamatan |

### 0.2 Temuan PRD yang Mengubah Keputusan Desain

*(Tidak berubah dari v1.1.)*
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
9. **Modern berarti hierarki dan kecepatan, bukan dekorasi.** (baru di v2.0) Setiap elemen gaya baru (bento, dark mode, palet perintah, tampilan tersimpan) harus menjawab satu pertanyaan: apakah terapis menemukan pasien yang butuh perhatian lebih cepat? Jika tidak, itu dekorasi dan dibuang.
10. **Yang berbahaya tidak boleh tersembunyi di balik interaksi.** (baru di v2.0) Tidak ada informasi atau aksi klinis yang hanya muncul saat hover, di balik menu "⋯" tanpa label, atau di toast yang hilang.

---

## 2. Konsep Identitas: Produk SaaS Klinis dengan Motif Goniometer

Goniometer adalah alat ukur sudut sendi yang dipakai fisioterapis. Motif busur ukur tetap dipertahankan sebagai satu-satunya elemen yang membuat MoveWall tidak terlihat seperti template SaaS generik, dirender dengan bahasa visual SaaS masa kini.

- **Motif inti: busur ukur.** Busur 0–180° dengan skala halus dan satu penanda target. Muncul di logo, ROM gauge, loading, dan empty state. Jangan diperbanyak ke tempat lain.
- **Warna tetap bermakna.** Warna padat dipakai untuk aksi utama dan status. Latar dan kartu netral. Ember (oranye) sengaja langka: kemunculannya berarti target atau perhatian.
- **Tiga permukaan, satu keluarga:**
  - **Studio Terang** (slate dingin, kartu putih): Dashboard terapis dan layar pasien saat duduk. Bawaan.
  - **Studio Gelap** (baru di v2.0, **Dashboard saja**): tema gelap untuk sesi kerja panjang atau ruang redup. Bukan pengganti Stage.
  - **Stage** (gelap, tenang, tema khusus gameplay): overlay kerangka menonjol dan cahaya layar tidak menyilaukan. **Tidak berubah** dari v1.0/v1.1.
- **Studio Gelap dan Stage sama-sama gelap, tetapi berbeda tujuan.** Studio Gelap mengikuti gaya SaaS (kartu, cincin, bayangan); Stage mengikuti aturan far-field (panel solid, tanpa bayangan, tipografi raksasa). Jangan dicampur.

Logo (konsep): ikon aplikasi berupa persegi bersudut membulat 12 px berlatar `accent-700`, berisi busur setengah lingkaran putih dengan satu titik `ember-400`; di sampingnya wordmark "MoveWall" (bobot 700, tracking −1%). Pada Studio Gelap, ikon memakai `accent-fill` dengan busur `on-accent`. Aset logo final perlu dibuat terpisah.

---

## 3. Batas Gaya SaaS (Yang Diambil dan Yang Sengaja Tidak)

### 3.1 Diambil

| Pola SaaS | Dipakai di | Catatan |
|---|---|---|
| App shell: sidebar + **kanvas konten melayang** | Dashboard (≥ 1280 px) | 6.4, 10.2.Q |
| **Bento grid** dengan hierarki ukuran | Dashboard (halaman ringkasan), ringkasan sesi pasien | Ukuran = prioritas klinis (6.4, 11.2) |
| Kartu: cincin 1 px tipis + bayangan berlapis | Dashboard, Studio pasien | Bagian 6.3 |
| Kartu statistik (KPI) dengan sparkline | Dashboard, ringkasan sesi pasien | 10.2.R |
| Tabel kerja berat: header lengket, tampilan tersimpan, aksi massal, panel detail samping | Dashboard | 10.2.J |
| Badge/chip dengan ikon | Dashboard, Studio pasien | **Wajib ada ikon atau kata** |
| Palet perintah (Ctrl/Cmd+K) dengan petunjuk pintasan | Dashboard saja | 10.2.U, aturan privasi |
| Dark mode | Dashboard saja | Bagian 4.2 |
| Tab dengan indikator meluncur, segmented control | Dashboard, Studio | 10.3 |
| Kotak masuk notifikasi dengan status baca/diakui | Dashboard | 10.2.V |
| Skeleton loading, empty state ber-CTA, toast bertumpuk | Dashboard, Studio | 10.2.T |
| Latar tonal halus (`accent-50`, `surface-muted`) dan **wash gradien satu-hue** di kepala halaman | Dashboard, onboarding | Batasan di bawah |
| Blur latar pada top bar lengket | Dashboard saja | Wajib ada fallback solid; tidak dipakai di atas video kamera |
| Tipografi dengan ritme bobot dan angka tabular | Dashboard | Bagian 5 |

### 3.2 Sengaja tidak

- **Gradien multi-hue** (ungu-biru), "aurora/mesh blob", glow berwarna di sekeliling kartu, dan gradien pada **teks atau angka**.
  - Gradien yang **diperbolehkan** (relaksasi dari v1.1): (a) wash `accent-50 → bg-app` di belakang kepala halaman Dashboard dan hero onboarding; (b) area fill grafik **satu hue** yang memudar dari 18% ke 0% opasitas; (c) garis cahaya 1 px (`rgba(255,255,255,0.04)`) di tepi atas kartu pada Studio Gelap. Selebihnya dilarang.
- Ikon kilau/✨ untuk menandai "AI". Yang ditonjolkan adalah hasil ukur, bukan label teknologinya.
- **Angka KPI yang menghitung naik (count-up).** Menunda terbacanya angka dan memberi kesan presisi yang bergerak.
- Glassmorphism/blur di atas video kamera atau di Stage. Alasan fungsional: kontras teks di atas video tidak bisa dijamin, dan blur membebani GPU yang sudah memikul inferensi + WebGL. [Medium, tidak diukur]
- **Toast yang hilang otomatis untuk hal keselamatan dan kegagalan sinkron.** Pemberitahuan keselamatan bersifat menetap sampai dikonfirmasi.
- **Aksi baris yang hanya muncul saat hover.** Harus juga terlihat saat fokus keyboard (`:focus-within`) dan selalu terlihat pada perangkat sentuh.
- **Teks abu-abu 12 px** di Aplikasi Pasien atau Stage.
- **Badge titik warna tanpa teks.**
- **Skor risiko tanpa alasan** di Dashboard. Setiap prioritas menyertakan kalimat penjelas (10.2.J).
- **Gulir tak berujung (infinite scroll) pada tabel pasien.** Klinis membutuhkan posisi yang bisa diacu dan dilaporkan; pakai paginasi.
- **Saran otomatis nama pasien** di palet perintah/pencarian sebelum pengguna mengetik (privasi, 10.2.U).
- Konfeti, emoji sebagai ikon fungsional, maskot kartun.
- Angka desimal pada ROM (presisi palsu, lihat temuan #8).
- Warna merah sebagai "hukuman". Crimson/coral dipakai sebagai sinyal koreksi, bahasanya tetap suportif.
- Kartu radius 16 px dengan **bayangan tebal**. Radius 16 diperbolehkan hanya dengan cincin tipis + bayangan berlapis lembut (6.3).

---
## 4. Warna

### 4.1 Studio Terang (bawaan)

| Token | Hex | Peran |
|---|---|---|
| `bg-app` | `#F8FAFC` | Latar halaman dan sidebar |
| `surface` | `#FFFFFF` | Kartu, kanvas konten, dialog |
| `surface-muted` | `#F1F5F9` | Latar sekunder, header tabel, chip, area input baca-saja |
| `border-subtle` | `#E2E8F0` | Pemisah halus. **Dekoratif saja** |
| `border-default` | `#CBD5E1` | Cincin kartu (dengan transparansi, lihat 6.3) dan tabel. **Dekoratif saja** |
| `border-control` | `#7C8CA3` | Border input, checkbox, kontrol interaktif |
| `text-900` | `#0F172A` | Teks utama, judul |
| `text-700` | `#334155` | Teks isi |
| `text-600` | `#475569` | Teks sekunder, label, keterangan |
| `text-500` | `#64748B` | Teks tersier. Hanya di `surface`/`bg-app`, ≥ 14 px (lihat 4.6) |
| `accent-50` | `#F0FDFA` | Baris terpilih, latar informasional ringan, pita target grafik, wash kepala halaman |
| `accent-100` | `#CCFBF1` | *(baru)* Baris terpilih saat hover, chip aktif |
| `accent-600` | `#0D9488` | *(baru)* **Hanya grafis non-teks** (area fill, penanda). 3,74 di putih |
| `accent-700` | `#0F766E` | **Aksi utama**, tautan, fokus |
| `accent-800` | `#115E59` | Hover aksi utama |
| `accent-900` | `#134E4A` | Pressed aksi utama |
| `ember-50` | `#FFF7ED` | Latar peringatan target/perhatian ringan |
| `ember-400` | `#FB923C` | Isian aksen, teks `text-900` di atasnya |
| `ember-500` | `#EA580C` | **Hanya grafis non-teks** (garis putus-putus ceiling, jarum, ikon besar) |
| `ember-600` | `#C2410C` | Tombol sekunder berisi, teks penekanan di atas `ember-50` |
| `overlay` | `rgba(15,23,42,0.45)` | *(baru)* Latar di belakang dialog dan laci |

Aksen utama sengaja tetap **teal**, bukan indigo/violet yang menjadi seragam template SaaS. Alasannya: kesan klinis yang tenang dan pembeda dari produk generik. Konsekuensinya: kedekatan hue dengan status "Tercapai" (hijau); jarak antara `accent-700` dan `status-reach` pada simulasi tritanopia hanya 6,0 (4.7). Karena itu aksen hanya dipakai untuk aksi, tautan, dan fokus; status selalu membawa bentuk + kata.

### 4.2 Studio Gelap (baru di v2.0, Dashboard saja)

Tema gelap untuk sesi kerja panjang atau ruang redup. Dibuat sebagai set token semantik yang sama (nama token tidak berubah, nilainya berbeda), sehingga komponen tidak perlu ditulis ulang.

| Token | Hex | Peran |
|---|---|---|
| `bg-app` | `#0B1220` | Latar halaman dan sidebar |
| `surface` | `#121B2C` | Kartu, kanvas konten |
| `surface-raised` | `#18233A` | Popover, menu, dialog, laci (lebih terang = lebih tinggi) |
| `surface-muted` | `#1A2640` | Header tabel, chip, input baca-saja |
| `border-subtle` | `#1F2A3F` | Pemisah halus. **Dekoratif saja** |
| `border-default` | `#2A3750` | Cincin kartu dan tabel. **Dekoratif saja** (1,44 di `surface`) |
| `border-control` | `#6B7C96` | Border input dan kontrol interaktif |
| `text-900` | `#F1F5F9` | Teks utama |
| `text-700` | `#CBD5E1` | Teks isi |
| `text-600` | `#A5B4C8` | Teks sekunder |
| `text-500` | `#8B9BB2` | Teks tersier (lolos 4,5 di semua permukaan gelap; tetap ≥ 14 px) |
| `accent-text` | `#2DD4BF` | Tautan, ikon aktif, fokus |
| `accent-subtle` | `#163541` | Baris terpilih, latar informasional (teal 14% di atas `surface`) |
| `accent-fill` | `#14B8A6` | Tombol utama. Teks `on-accent` |
| `accent-fill-hover` | `#2DD4BF` | Hover tombol utama |
| `accent-fill-pressed` | `#11A99B` | Pressed tombol utama |
| `on-accent` | `#042F2E` | Teks di atas `accent-fill` |
| `ember-400` | `#FB923C` | Penanda target/peringatan (teks dan isian; 7,61 di `surface`) |
| `ember-tint` | `#332C2E` | Latar peringatan ember |
| `overlay` | `rgba(0,0,0,0.6)` | Latar di belakang dialog dan laci |

Aturan elevasi pada tema gelap: **permukaan yang lebih tinggi lebih terang**, ditambah garis cahaya 1 px di tepi atas kartu (`rgba(255,255,255,0.04)`). Bayangan hampir tidak terlihat pada latar gelap, jadi jangan mengandalkannya untuk memisahkan lapisan.

Studio Gelap **tidak** dipakai di Aplikasi Pasien pada v2.0. Alasan: pasien memakai ruang tamu yang terangnya tidak terkendali, dan tema kedua menggandakan beban uji keterbacaan lansia yang belum dilakukan. Bisa dibuka kembali setelah uji lapangan. [Medium, keputusan desain]

### 4.3 Stage (gelap, untuk gameplay)

Tidak berubah dari v1.0/v1.1.

| Token | Hex | Peran |
|---|---|---|
| `stage-900` | `#0E1514` | Latar |
| `stage-800` | `#162321` | Panel HUD (solid, bukan transparan) |
| `stage-700` | `#1F312E` | Pemisah, track gauge |
| `stage-text` | `#F2EFE8` | Teks utama |
| `stage-muted` | `#A9B5B0` | Teks sekunder dan tanda skala gauge |

### 4.4 Warna Status Gerakan (semantik, empat set)

Nama status di UI memakai **Tercapai / Hampir / Koreksi**, bukan "Benar/Salah", karena label pertama membingkai pasien sebagai sedang berproses. **Yang berubah di v2.0:** warna Koreksi pada Studio Terang (vermilion `#A82C16` → crimson `#9F1239`) dan set baru untuk Studio Gelap.

| Status | Studio Terang (teks) | Studio Terang (tint latar badge) | Studio Gelap (teks) | Studio Gelap (tint) | Stage (garis/isian) | Penanda kedua (wajib) |
|---|---|---|---|---|---|---|
| **Tercapai** | `#0B6B4A` | `#ECFDF5` | `#4FD6A5` | `#1B353D` | `#4FD6A5` | Sendi bulat penuh, garis tebal, kata "Tercapai" |
| **Hampir** | `#7A5200` | `#FFFBEB` | `#F5C04A` | `#323230` | `#F5C04A` | Sendi belah ketupat, garis putus-putus halus, kata "Hampir" |
| **Koreksi** | **`#9F1239`** | **`#FFF1F2`** | `#FF7A5C` | `#332833` | `#FF7A5C` | Sendi segitiga, garis ganda, kata "Koreksi postur" |

Catatan: pada Studio Terang hue Koreksi (crimson) kini berbeda dari Stage/Studio Gelap (coral). Ini kompromi untuk keterbedaan buta warna; yang menyatukan kedua permukaan adalah bentuk + kata, bukan hue. Dicatat sebagai keputusan di Bagian 16 #13.

### 4.5 Warna Sistem

| Peran | Studio Terang | Studio Gelap dan Stage |
|---|---|---|
| Berhenti/Nyeri (aksi darurat) | isi `#9F1239`, teks putih | isi `#FF7A5C`, teks `#13211F` |
| Info/sinkron | `accent-700` | `accent-text` (`#2DD4BF`) di Studio Gelap; `#4FD6A5` di Stage |
| Peringatan | `#7A5200` di atas `#FFFBEB` | `#F5C04A` |

### 4.6 Kontras Terverifikasi (dihitung dengan skrip, rumus WCAG 2.x)

**Studio Terang**

| Pasangan | Rasio | Ambang | Lolos |
|---|---|---|---|
| `text-900` di `surface` | 17,85 | 4,5 | Ya |
| `text-900` di `bg-app` | 17,06 | 4,5 | Ya |
| `text-900` di `surface-muted` | 16,30 | 4,5 | Ya |
| `text-700` di `surface` | 10,35 | 4,5 | Ya |
| `text-600` di `surface` | 7,58 | 4,5 | Ya |
| `text-600` di `bg-app` | 7,24 | 4,5 | Ya |
| `text-600` di `surface-muted` | 6,92 | 4,5 | Ya |
| `text-500` di `surface` | 4,76 | 4,5 | Ya (margin tipis) |
| `text-500` di `bg-app` | 4,55 | 4,5 | Ya (margin sangat tipis) |
| `text-500` di `surface-muted` | **4,34** | 4,5 | **Tidak**, jangan dipakai di sini |
| `accent-700` di `surface` | 5,47 | 4,5 | Ya |
| `accent-700` di `bg-app` | 5,23 | 4,5 | Ya |
| `accent-700` di `surface-muted` | 5,00 | 4,5 | Ya |
| `accent-700` di `accent-50` | 5,25 | 4,5 | Ya |
| `accent-800` di `accent-100` | 6,73 | 4,5 | Ya |
| `text-900` di `accent-100` | 15,84 | 4,5 | Ya |
| Putih di `accent-700` | 5,47 | 4,5 | Ya |
| Putih di `accent-800` | 7,58 | 4,5 | Ya |
| Putih di `accent-900` | 9,48 | 4,5 | Ya |
| `accent-600` di `surface` (grafis) | 3,74 | 3 | Ya, **non-teks saja** |
| Putih di `ember-600` | 5,18 | 4,5 | Ya |
| `ember-600` di `ember-50` | 4,88 | 4,5 | Ya |
| `text-900` di `ember-400` | 7,89 | 4,5 | Ya |
| `ember-500` di `surface` | **3,56** | 4,5 (teks) / 3 (grafis) | **Tidak untuk teks**; lolos untuk grafis |
| Tercapai di `surface` / tint | 6,53 / 6,20 | 4,5 | Ya |
| Hampir di `surface` / tint | 6,92 / 6,67 | 4,5 | Ya |
| **Koreksi `#9F1239`** di `surface` / tint `#FFF1F2` | **8,02 / 7,30** | 4,5 | Ya |
| Putih di `#9F1239` (tombol Berhenti) | 8,02 | 4,5 | Ya |
| `border-control` di `surface` | 3,42 | 3 (non-teks) | Ya |
| `border-control` di `bg-app` | 3,27 | 3 (non-teks) | Ya |
| `border-control` di `surface-muted` | 3,12 | 3 (non-teks) | Ya (margin tipis) |
| `border-default` di `surface` | **1,48** | 3 (non-teks) | **Tidak**, karena itu hanya dekoratif |
| `border-subtle` di `surface` | **1,23** | 3 (non-teks) | **Tidak**, karena itu hanya dekoratif |
| Cincin fokus `accent-700` di `surface` / `surface-muted` | 5,47 / 5,00 | 3 | Ya |

**Studio Gelap**

| Pasangan | Rasio | Ambang | Lolos |
|---|---|---|---|
| `text-900` di `surface` / `bg-app` / `surface-raised` | 15,73 / 17,09 / 14,30 | 4,5 | Ya |
| `text-700` di `surface` | 11,60 | 4,5 | Ya |
| `text-600` di `surface` / `surface-raised` / `surface-muted` | 8,17 / 7,43 / 7,14 | 4,5 | Ya |
| `text-500` di `surface` / `bg-app` / `surface-muted` | 6,10 / 6,62 / 5,32 | 4,5 | Ya |
| `accent-text` di `surface` / `surface-muted` / `accent-subtle` | 9,26 / 8,09 / 6,97 | 4,5 | Ya |
| `text-900` di `accent-subtle` | 11,84 | 4,5 | Ya |
| `on-accent` di `accent-fill` / `-hover` / `-pressed` | 5,81 / 7,77 / 4,94 | 4,5 | Ya |
| `border-control` di `surface` / `surface-muted` / `bg-app` | 4,06 / 3,55 / 4,41 | 3 (non-teks) | Ya |
| `border-default` di `surface` | **1,44** | 3 (non-teks) | **Tidak**, dekoratif saja |
| Tercapai di `surface` / tint | 9,43 / 7,08 | 4,5 | Ya |
| Hampir di `surface` / tint | 10,27 / 7,66 | 4,5 | Ya |
| Koreksi di `surface` / tint | 6,72 / 5,49 | 4,5 | Ya |
| `ember-400` di `surface` / `ember-tint` | 7,61 / 6,02 | 4,5 | Ya |
| Cincin fokus `accent-text` di `bg-app` | 10,06 | 3 | Ya |

Catatan: `accent-fill-pressed` semula saya coba `#0D9488` dan **gagal** (3,86); diganti `#11A99B` (4,94).

**Stage** (tidak berubah; dihitung ulang, angka sama dengan v1.1)

| Pasangan | Rasio | Ambang | Lolos |
|---|---|---|---|
| `stage-text` di `stage-900` | 16,10 | 4,5 | Ya |
| `stage-muted` di `stage-900` / `stage-800` | 8,74 / 7,65 | 4,5 | Ya |
| Tercapai di `stage-900` / `stage-800` | 10,12 / 8,87 | 4,5 | Ya |
| Hampir di `stage-900` / `stage-800` | 11,02 / 9,66 | 4,5 | Ya |
| Koreksi di `stage-900` / `stage-800` | 7,21 / 6,32 | 4,5 | Ya |
| `#13211F` di `#4FD6A5` | 9,09 | 4,5 | Ya |
| `#13211F` di `#FF7A5C` (tombol Berhenti) | 6,47 | 4,5 | Ya |
| `stage-700` di `stage-900` (track gauge) | **1,35** | 3 (non-teks) | **Tidak**, lihat catatan |

**Catatan track gauge Stage:** track `stage-700` hanya 1,35:1 terhadap latar. Itu bukan pembawa informasi (isian, jarum target, dan arsir ceiling yang membawanya), tetapi **tanda skala di atas track harus memakai `stage-muted`** (8,74) agar rentang 0–180° tetap terbaca.

### 4.7 Uji Buta Warna (simulasi saya, perkiraan kasar)

Metode: simulasi protanopia/deuteranopia/tritanopia dengan matriks Machado (2009), keparahan penuh; jarak terkecil antar pasangan warna dalam satu set, diukur CIE76 (ΔE). Aturan praktis saya: di bawah ±10 sulit dibedakan hanya dari warna, di atas ±20 jelas. **[Medium, simulasi layar tanpa kalibrasi; metrik CIE76 lebih kasar dari CIEDE2000]** Ini **bukan** pengganti uji dengan orang yang buta warna.

| Set | Normal | Protan | Deutan | Tritan | Catatan |
|---|---|---|---|---|---|
| Status Studio Terang (v2.0) | 54,1 | 19,9 | 14,0 | 39,9 | Membaik dari v1.1 |
| Status Studio Terang (v1.1, `#A82C16`) | 39,0 | 12,0 | **2,5** | 42,8 | Hampir vs Koreksi hampir identik pada deuteranopia |
| Status Studio Gelap dan Stage | 49,5 | 23,5 | 22,3 | 37,6 | Aman |
| Grafik 4 seri, terang | 30,8 | 14,7 | 10,5 | 18,8 | Masih rendah di deutan; wajib penanda kedua |
| Grafik 4 seri, gelap | 36,5 | 18,5 | 11,6 | 17,8 | Sama |
| Aksen `accent-700` vs Tercapai (terang) | 16,4 | 16,2 | 15,5 | **6,0** | Rendah pada tritanopia; lihat 4.1 |

### 4.8 Warna Grafik (Dashboard)

Palet empat seri **(baru di v2.0; v1.1 tidak mendefinisikan multi-seri)**: tiga hue + satu netral untuk pembanding.

| Seri | Terang | Gelap | Pemakaian disarankan |
|---|---|---|---|
| S1 | `#0F766E` | `#2DD4BF` | Seri utama (mis. sisi yang dilatih, minggu ini) |
| S2 | `#2563EB` | `#60A5FA` | Perbandingan (mis. sisi sebaliknya) |
| S3 | `#BE185D` | `#FB7185` | Seri ketiga (jarang dipakai) |
| S4 (netral) | `#64748B` | `#94A3B8` | **Pembanding/baseline** (minggu lalu, rata-rata populasi) |

Aturan:
- **Warna seri tidak pernah membawa makna status.** Status tetap lewat bentuk + kata (4.4). S3 sengaja dibuat berbeda dari warna Koreksi, tetapi masih satu keluarga hue; itu risiko kebingungan yang dicatat dan harus diuji (16 #6).
- Seri dibedakan **juga** oleh gaya garis (S1 padat, S2 putus-putus panjang, S3 titik-titik, S4 padat tipis) dan penanda titik (bulat, kotak, segitiga, belah ketupat), plus **label langsung** di ujung garis. Legenda terpisah hanya cadangan.
- Maksimal **tiga seri berwarna** per grafik; S4 pembanding tidak dihitung.
- Semua warna seri lolos ≥ 3:1 untuk grafis di permukaan masing-masing (terang: 5,47 / 5,17 / 6,04 / 4,76; gelap: 9,26 / 6,78 / 6,40 / 6,72).

| Elemen | Warna | Catatan |
|---|---|---|
| Garis ROM (satu seri) | S1 | Pelabelan langsung di ujung garis |
| **Area fill** (baru) | S1 pada 18% → 0% opasitas, satu hue | Hanya di bawah seri tunggal; tidak ditumpuk |
| Batang | Warna seri, **ujung atas bulat** 4 px | Tinggi batang selalu dimulai dari nol |
| Pita target | `accent-50` (terang) / `accent-subtle` (gelap) | Bukan pembawa informasi tunggal; ada label "Target" |
| Garis safety ceiling | `ember-500` (terang) / `ember-400` (gelap), putus-putus | 3,56 di putih, lolos untuk grafis |
| Sesi anomali | Titik berongga ember + tooltip | Bentuk berbeda dari titik data biasa |
| Gridline | `border-subtle`, hanya horizontal | Dekoratif, minimal |
| Tooltip | Latar `text-900` (terang) / `surface-raised` (gelap), teks kontras tinggi | Isi tooltip **tidak** boleh jadi satu-satunya tempat angka penting |

Prinsip dari sumber yang saya baca: jika pengguna harus hover untuk memahami inti grafik, grafiknya gagal ([saasframe.io](https://www.saasframe.io/blog/the-anatomy-of-high-performance-saas-dashboard-design-2026-trends-patterns)). Karena itu nilai terakhir dan nilai puncak selalu dilabeli langsung.

---
## 5. Tipografi

### 5.1 Keluarga

| Peran | Font | Alasan |
|---|---|---|
| Therapist Dashboard | **Inter** (versi variabel) | Standar de facto produk SaaS, bobot lengkap, angka tabular untuk tabel. Cocok untuk data padat dan pembaca yang duduk dekat |
| Aplikasi Pasien (Studio) dan seluruh Stage | **Atkinson Hyperlegible Next** | Dirancang oleh Braille Institute untuk keterbacaan penglihatan rendah; huruf mirip (I/l/1, O/0) dibuat jelas berbeda. Cocok untuk Bu Ratna dan angka derajat |
| Angka berderet (tabel, KPI, log) | Font yang sama dengan permukaannya + `font-variant-numeric: tabular-nums` | Kolom angka lurus; angka KPI tidak "bergoyang" saat berubah |

Serif tidak dipakai: satu keluarga sans per permukaan.

**Yang berubah di v2.0 adalah ritme bobot dan tracking, bukan keluarga font.** Pola yang saya pakai: judul dan angka besar rapat (tracking negatif kecil) dan tegas (600); elemen UI (tombol, tab, item navigasi) bobot 500; isi bobot 400; keterangan kecil bobot 400 dengan warna `text-600`. Tujuannya hierarki yang terbaca sekilas tanpa menambah ukuran.

**Perlu verifikasi sebelum final** [Medium]: ketersediaan dan lisensi Inter dan Atkinson Hyperlegible Next (keduanya setahu saya OFL, tidak saya periksa langsung), kelengkapan glyph Bahasa Indonesia, apakah fitur OpenType tambahan Inter (mis. alternatif bentuk huruf) tersedia pada berkas yang dipakai (jangan diandalkan sebelum diuji), dan apakah I kapital / l kecil di Inter cukup mudah dibedakan untuk angka dan label klinis (jika tidak, pakai Atkinson di Dashboard juga, dan itu lebih sederhana).

Fallback: `system-ui, "Segoe UI", Roboto, sans-serif`. Muat font dengan `font-display: swap`; jangan blokir sesi karena font.

### 5.2 Skala Near-Field (Studio)

**Dashboard (Inter, terapis duduk)**

| Token | Ukuran / Line-height | Bobot / tracking | Pemakaian |
|---|---|---|---|
| `d-display` | 36 / 40 | 600, −2,5%, tabular | Angka KPI utama |
| `d-title` | 24 / 32 | 600, −1,5% | Judul halaman |
| `d-section` | 20 / 28 | 600, −1% | Judul dialog, laci, bagian besar |
| `d-heading` | 16 / 24 | 600 | Judul kartu (bergeser dari 18 px di v1.1: kartu bento lebih kecil dan lebih banyak) |
| `d-ui` | 14 / 20 | 500 | Tombol, tab, item navigasi, label formulir |
| `d-body` | 14 / 20 | 400 | Isi umum |
| `d-data` | 14 / 20 | 500, tabular | Sel tabel (minimum untuk terapis) |
| `d-caption` | 13 / 18 | 400 | Keterangan, tag, header kolom, petunjuk pintasan. **Lantai: tidak ada teks Dashboard di bawah 13 px** |

**Aplikasi Pasien, mode Studio (Atkinson, duduk)** (tidak berubah dari v1.1)

| Token | Ukuran / Line-height | Bobot | Pemakaian |
|---|---|---|---|
| `p-display` | 36 / 44 | 700 | Headline ringkasan sesi |
| `p-title` | 28 / 36 | 700 | Judul halaman |
| `p-heading` | 20 / 28 | 700 | Judul bagian |
| `p-body-lg` | 18 / 28 | 400 | Isi aplikasi pasien (**minimum untuk pasien**) |
| `p-body` | 16 / 24 | 400 | Hanya untuk keterangan sekunder yang bukan instruksi |

`d-caption` 13 px **tidak dipakai** di Aplikasi Pasien.
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

## 6. Spasi, Bentuk, Elevasi, Layout

### 6.1 Spasi dan Bentuk

| Aspek | Aturan |
|---|---|
| Basis spasi | 4 px; skala 4, 8, 12, 16, 24, 32, 48, 64, 96 |
| Radius | `r-sm` 6 (chip, badge, kbd, tag), `r-md` 10 (tombol, input), `r-lg` 16 (kartu), `r-xl` 20 (kanvas konten melayang, dialog, kartu bento unggulan), `r-full` hanya untuk kontrol bulat, avatar, dan pil filter. Panel HUD Stage tetap `r-panel` 16 |
| Radius bersarang | Radius elemen di dalam = radius luar − padding (mis. kartu 16 dengan padding 12 → elemen dalam 4–6). Jika hasilnya < 4, pakai 4 |
| Tinggi kontrol, **Aplikasi Pasien** | Minimum 48 px. Stage: kontrol layar minimum 120 × 120 px |
| Tinggi kontrol, **Dashboard** | 40 px default; 32 px kompak (opt-in, lihat 6.5 dan risiko 0.1 #10) |
| Fokus keyboard | Cincin 2 px `accent-700` (terang) / `accent-text` (gelap) + offset 2 px berlatar `surface`. Mendukung `forced-colors` (cincin jadi `Highlight`) |
| Garis ukur | Stroke 1,5 px (near-field), 6 px (Stage) |

### 6.2 Radius: Perubahan dari v1.1

v1.1 memakai radius kartu 12 px dan mencantumkan "kartu seragam 16 px dengan bayangan tebal" sebagai hal yang dihindari. v2.0 **menaikkan radius kartu ke 16 px**, tetapi tetap melarang bayangan tebal: permukaan kartu dibentuk oleh cincin tipis dan bayangan berlapis lembut (6.3). Alasan: sudut yang lebih besar dan bayangan lembut adalah ciri visual yang paling mudah dikenali dari produk SaaS terkini. [Medium, pengetahuan saya, tidak diverifikasi ke sumber]

### 6.3 Elevasi dan Permukaan Kartu

**Studio Terang** — cincin 1 px transparan + bayangan berlapis. Cincin menggantikan `border` agar tepi kartu tidak menambah ukuran dan bisa dianimasikan lewat bayangan.

| Token | Nilai | Dipakai untuk |
|---|---|---|
| `shadow-card` | `0 0 0 1px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04), 0 4px 12px -4px rgba(15,23,42,0.06)` | Kartu dan kanvas konten |
| `shadow-card-hover` | `0 0 0 1px rgba(15,23,42,0.10), 0 2px 4px rgba(15,23,42,0.06), 0 8px 20px -6px rgba(15,23,42,0.10)` | Kartu yang bisa diklik, saat hover/fokus |
| `shadow-popover` | `0 0 0 1px rgba(15,23,42,0.08), 0 8px 24px -4px rgba(15,23,42,0.12)` | Menu, popover, tooltip, palet perintah |
| `shadow-dialog` | `0 0 0 1px rgba(15,23,42,0.06), 0 24px 48px -12px rgba(15,23,42,0.22)` | Dialog, laci |

**Studio Gelap** — lapisan lebih tinggi lebih terang; cincin memakai `border-default`.

| Token | Nilai | Dipakai untuk |
|---|---|---|
| `shadow-card` | `0 0 0 1px var(--border-default), inset 0 1px 0 rgba(255,255,255,0.04)` | Kartu dan kanvas |
| `shadow-popover` | `0 0 0 1px var(--border-default), 0 12px 32px rgba(0,0,0,0.5)` | Menu, popover, dialog, laci (di atas `surface-raised`) |

**Stage:** tanpa bayangan; pakai lapisan warna (tidak berubah).

**Risiko yang harus diuji, bukan diasumsikan** [Medium]: kartu putih di atas `bg-app` `#F8FAFC` hanya berbeda 1,06:1; tepi kartu hampir seluruhnya dibawa cincin 6% dan bayangan. Pada panel laptop murah atau kecerahan rendah tepi ini bisa **lenyap**. Mitigasi: (1) `@media (prefers-contrast: more)` dan `forced-colors` mengganti cincin dengan border solid `border-default`/`CanvasText`; (2) uji pada setidaknya satu layar berkualitas rendah sebelum nilai alfa dikunci. Kartu bukan kontrol, jadi ini bukan kegagalan WCAG 1.4.11 selama batas tidak dipakai untuk memahami fungsi, tetapi tetap risiko keterbacaan.

### 6.4 Layout Dashboard

**Shell (≥ 1280 px)**
- Sidebar 256 px (rel 72 px) di atas `bg-app`, **tanpa border**; item aktif memakai `accent-50` + batang kiri 3 px + `aria-current="page"`.
- **Kanvas konten melayang:** panel `surface`, radius `r-xl` (20), `shadow-card`, inset 8 px dari tepi atas/kanan/bawah. Top bar 56 px berada **di dalam** kanvas.
- Di bawah 1280 px kanvas datar (tanpa inset dan tanpa radius) untuk menghemat lebar.
- Padding konten 24 px (≥ 1024 px) atau 16 px; lebar konten maksimum 1440 px [Low, tidak ada data; sesuaikan setelah pratinjau]. Tabel boleh selebar kanvas.

**Bento grid (halaman ringkasan)**
- 12 kolom, **gutter 16 px** (lebih rapat dari gutter formulir 24 px, agar kartu terbaca sebagai satu "papan").
- Tinggi baris mengikuti isi dengan tinggi minimum: kartu KPI 120–136 px, kartu menengah 280–320 px, kartu besar 360–420 px.
- **Aturan penempatan (menjawab risiko 0.1 #2):**
  1. Urutan DOM = urutan prioritas klinis. Penempatan visual **mengikuti** urutan DOM (tanpa trik `order` yang membuat urutan fokus keyboard berbeda dari urutan baca; WCAG 1.3.2 dan 2.4.3).
  2. Kartu **Perlu perhatian** selalu pertama, di kiri atas, dan paling lebar di barisnya.
  3. Kartu unggulan (`r-xl`, 20 px) maksimal **satu** per halaman, dan hanya untuk kartu yang menjadi tindakan utama halaman.
  4. Kartu tren/grafik di bawah kartu tindakan, bukan di atasnya.
- Titik henti: ≥ 1280: KPI 3 kolom × 4; kartu menengah 7 + 5; grafik 8 + 4. 1024–1279: KPI 6 × 2; kartu lain 12 atau 6 + 6. < 1024: satu kolom bertumpuk sesuai urutan DOM.

**Kepadatan (baru)** — pilihan per pengguna, disimpan di profil:

| Tingkat | Baris tabel | Kontrol | Catatan |
|---|---|---|---|
| Nyaman | 56 px | 44 px | Bawaan jika perangkat sentuh terdeteksi |
| Standar | 48 px | 40 px | **Bawaan** |
| Kompak | 40 px | 32 px | Opt-in. Hanya jika perangkat terapis dipastikan non-sentuh (Bagian 16 #10) |

### 6.5 Catatan Target Klik

Batas minimum WCAG 2.2 untuk target adalah 24 px (SC 2.5.8; perlu verifikasi ke spesifikasi W3C). Kontrol 32 px memenuhi, tetapi di tablet atau pada pengguna dengan tremor terlalu kecil. **PRD tidak menjelaskan perangkat terapis; ini perlu dikonfirmasi** [Low].

---
## 7. Ikon dan Overlay Kerangka

- **Ikon fungsional:** set garis konsisten, stroke 1,75 px pada kanvas 24 px (varian 16 dan 20 px dengan stroke 1,5 px untuk tabel dan badge), ujung bulat, tanpa isian. Ikon latihan (bahu, lutut, siku, batang tubuh) digambar sebagai figur garis dengan sendi relevan ditandai titik. Jika memakai library ikon terbuka (mis. Lucide atau Phosphor), lisensi dan ketersediaan ikon medis perlu diverifikasi.
- **Overlay kerangka (FR-5.1)** (tidak berubah):
  - Tulang: garis 6 px dengan ujung bulat. Warna mengikuti status segmen (Bagian 4.4).
  - Sendi: bulat (Tercapai), belah ketupat (Hampir), segitiga (Koreksi), ukuran 20 px.
  - Sendi yang sedang diukur diberi cincin luar tipis agar jelas mana yang dinilai.
  - Landmark berkepercayaan rendah (<0,5, PRD 7.4) digambar sebagai titik berongga dan pudar, bukan dihilangkan, supaya pasien paham kenapa sistem ragu.
- **Video pasien:** diredam ke ±35% kecerahan di belakang kerangka agar garis menonjol. Ada sakelar "tampilkan kamera / hanya kerangka". Pada mode hanya-kerangka, tidak ada gambar tubuh yang tampil sama sekali, selaras prinsip privasi.

---

## 8. Motion

| Token | Durasi | Easing | Dipakai untuk |
|---|---|---|---|
| `motion-instant` | 80 ms | linear | Perubahan status kecil |
| `motion-quick` | 160 ms | `cubic-bezier(0.2, 0, 0, 1)` | Hover, fokus, chip, tombol, indikator tab |
| `motion-standard` | 240 ms | sama | Transisi panel, dialog, laci, toast masuk, palet perintah |
| `motion-slow` | 400 ms | `cubic-bezier(0.3, 0, 0, 1)` | Perpindahan antar langkah sesi |

Aturan:
- Tidak ada pantulan (bounce/overshoot) di UI klinis.
- **Indikator tab/segmented control meluncur** antar item (`motion-quick`, hanya `transform` dan lebar). Dengan `prefers-reduced-motion`: pindah langsung.
- **Dialog, menu, palet perintah:** fade + geser ≤ 8 px (atau skala 0,98 → 1). **Laci samping:** geser 24 px + fade, `motion-standard`. **Toast:** fade + geser 8 px; bertumpuk maksimal tiga.
- **Kartu bento saat pertama dimuat:** muncul bergantian (stagger 40 ms, maksimal enam kartu) hanya pada pemuatan halaman pertama dalam sesi; **tidak** dipicu setiap pergantian filter. Jika data sudah ada, jangan menunda tampilnya angka demi animasi.
- **Tidak ada count-up** pada angka KPI atau ROM (lihat 3.2). Angka tampil langsung dengan nilai akhirnya.
- Skeleton loading memakai kilau pelan (siklus 1,5 detik); dengan `prefers-reduced-motion` menjadi blok statis.
- Repetisi tervalidasi (Stage): cincin di sekitar hitungan berdenyut sekali (skala 1,0 → 1,06 → 1,0, 320 ms) disertai nada naik. Tanpa konfeti.
- **Target ROM tidak pernah bergerak di tengah set** (PRD 6.3.3). Ketika target berubah di antara set, tanda target bergeser perlahan (400 ms) dengan label "Target 95° → 100°" selama 3 detik, supaya pasien tidak bingung.
- `prefers-reduced-motion`: semua denyut/geser/stagger diganti perubahan opasitas atau warna; game tetap bisa dimainkan karena gerakan game berasal dari tubuh pasien, bukan animasi UI.
- Frame budget: animasi UI di Stage hanya properti `transform` dan `opacity`, karena CPU/GPU dibagi dengan inferensi pose. Di Dashboard, bayangan dan cincin kartu **tidak dianimasikan terus-menerus** (hanya transisi hover satu kali). [Medium, tidak diukur]

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

Semua komponen Studio memakai token Bagian 4 dan 6 (terang dan gelap untuk Dashboard). Komponen Stage memakai token Stage dan tidak mengikuti gaya kartu SaaS. **Bagian 10.1 tidak berubah substansinya dari v1.1** (hanya nama token bayangan dan radius mengikuti Bagian 6); pembaruan v2.0 ada di 10.2 dan 10.3.

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
- Isian berubah warna dan bentuk ujung sesuai status (Bagian 4.4). Ini menerjemahkan logika adaptive difficulty dan safety ceiling PRD menjadi satu gambar yang bisa dipahami sekilas.
- Tanda skala memakai warna teks sekunder (di Studio `text-500`, di Stage `stage-muted`), bukan warna track (lihat catatan 4.6).
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

Semua komponen di bagian ini memakai token Bagian 4 dan 6, tersedia di **Studio Terang dan Studio Gelap**. Huruf komponen dipertahankan dari v1.1 agar rujukan lama tetap berlaku; komponen baru memakai huruf baru (U, V, W).

**Q. App Shell (diperbarui di v2.0)**
- **Sidebar** 256 px (rel 72 px) di atas `bg-app`, tanpa border: logo, **pemilih ruang kerja/klinik** (jika multi-klinik; PRD belum menyebutnya, tandai opsional), navigasi utama (Ringkasan, Pasien, Resep, Laporan, Pengaturan), kotak masuk dengan lencana jumlah, lencana peran di bawah. Grup navigasi boleh diciutkan. Item aktif: latar `accent-50` (terang) / `accent-subtle` (gelap), teks `accent-700` / `accent-text`, **plus** batang kiri 3 px dan `aria-current="page"` (bukan warna saja).
- **Kanvas konten melayang** (≥ 1280 px, Bagian 6.4). **Top bar** 56 px di dalam kanvas: breadcrumb, **kolom pencarian dengan petunjuk pintasan `Ctrl K`**, tombol kotak masuk, pemilih tema (Terang/Gelap/Ikuti sistem), menu akun. Blur latar diperbolehkan hanya di top bar dengan fallback solid.
- **Header halaman:** judul `d-title`, deskripsi satu baris `text-600`, aksi utama di kanan (maksimal satu tombol berisi per halaman), di atas wash `accent-50 → bg-app` yang halus (3.2).

**R. Kartu Statistik (KPI) (diperbarui di v2.0)**
- Label `d-caption` `text-600` (dengan ikon 16 px), nilai `d-display` tabular tracking rapat, perubahan dengan **panah + kata** ("naik 6° dibanding minggu lalu"), **sparkline** 7–28 hari di kanan bawah (garis 1,5 px S1, tanpa sumbu, titik terakhir ditandai).
- Perubahan berwarna netral secara default. Warna status dipakai hanya untuk hal yang melewati ambang yang ditetapkan terapis, dan selalu disertai alasan. Tidak ada gradien pada angka dan **tidak ada animasi hitung naik**.
- Kartu bisa diklik untuk membuka daftar pasien yang membentuk angka itu (tujuan jelas: "Lihat 3 pasien"), dengan `shadow-card-hover` dan cincin fokus.
- Tag "Estimasi kamera" pada kartu yang menampilkan ROM (temuan #8).
- Kondisi: memuat (skeleton berbentuk angka + sparkline), kosong ("—" dengan penjelasan, bukan 0), galat (ikon + teks + coba lagi).

**J. Tabel Pasien (Triage, FR-D.1) (diperbarui di v2.0)**
- **Struktur:** header lengket (`surface-muted`, `d-caption` 600 `text-600`, `aria-sort` pada kolom terurut), baris 48 px (40 kompak, 56 nyaman), hover `surface-muted`, baris terpilih `accent-50` plus kotak centang terisi. Kolom pertama (nama) dan kotak centang lengket pada gulir horizontal.
- **Kolom:** penanda prioritas, nama + diagnosis singkat (avatar inisial **netral**, bukan warna acak yang menyerupai status), adherence 4 minggu (sparkline), perubahan ROM (derajat), tren kompensasi (panah + kata), sesi terakhir.
- **Setiap tanda prioritas wajib disertai alasannya dalam kalimat**, contoh "Adherence turun 3 sesi berturut". Tidak ada skor risiko kotak-hitam, karena Pak Dedi tidak percaya data yang tidak bisa ia telusuri. Badge prioritas: ikon + kata ("Perlu perhatian"), bukan titik warna. Urutan default: butuh perhatian dulu, lalu menurut sesi terakhir.
- **Bilah alat di atas tabel (baru):** pencarian, **pil filter** (`r-full`) dengan jumlah hasil, pemilih kolom, pemilih kepadatan, dan **Tampilan tersimpan** (tab: "Semua pasien", "Perlu perhatian", "Minggu ini", ditambah tampilan buatan pengguna). Tampilan tersimpan menyimpan filter, urutan, kolom, dan kepadatan. Perubahan yang belum disimpan ditandai dengan titik **dan** teks "Belum disimpan".
- **Aksi massal (baru):** memilih ≥ 1 baris memunculkan **bilah aksi melayang** di bawah kanvas (`surface-raised`, `shadow-popover`, `r-lg`): "3 dipilih · Ubah resep · Kirim pengingat · Ekspor · Batal". Bilah ini muncul tanpa mengaburkan tabel, bisa dijangkau keyboard (Tab dari baris), dan diumumkan pembaca layar (`role="region"`, `aria-label`). **Aksi yang mengubah resep massal wajib dialog konfirmasi yang menampilkan daftar pasien terdampak** (keselamatan).
- **Aksi baris:** tombol "Buka" selalu terlihat; menu "⋯" berlabel `aria-label`. Aksi lain boleh muncul di hover **dan** `:focus-within`; pada sentuh selalu terlihat.
- **Panel detail samping (baru):** klik baris membuka laci kanan (440 px, `surface-raised`) berisi ringkasan pasien, sesi terakhir, dan tautan "Buka profil lengkap". Esc menutup; fokus kembali ke baris. Pada layar < 1024 px, laci menjadi halaman penuh.
- **Paginasi** (bukan gulir tak berujung), jumlah baris per halaman bisa dipilih. Keadaan kosong, memuat, galat: 10.2.T.

**K. Grafik ROM (FR-D.2) (diperbarui di v2.0)**
- Garis per gerakan memakai palet 4.8 (S1 bawaan), **area fill satu-hue memudar**, pita target, dan **garis safety ceiling** putus-putus ember. Penanda sesi anomali (Risiko #8) sebagai titik berongga ember dengan tooltip.
- Pelabelan langsung di ujung garis dan pada nilai puncak; gridline horizontal minimal; sumbu Y dimulai dari nilai yang bermakna secara klinis dengan label sumbu terlihat; **kontrol rentang waktu** sebagai segmented control (7 hari, 4 minggu, 12 minggu, Semua).
- Selalu ada tag **"Estimasi kamera"** di judul grafik (temuan #8). Dibungkus kartu `r-lg`. Tooltip mengikuti kursor dan **juga** dapat dibuka dengan keyboard (panah kiri/kanan antar titik).
- Tabel data alternatif ("Lihat sebagai tabel") tersedia untuk pembaca layar dan ekspor.

**L. Heatmap Adherence (FR-D.2)**
- Kalender dengan **empat** keadaan sel: selesai (isian `accent-700`), sebagian (setengah), **terlewat** (silang tipis), **tidak dijadwalkan** (kosong, tanpa tanda). Membedakan hari istirahat dari hari terlewat penting agar pasien tidak tampak lebih tidak patuh dari kenyataannya. Sel berukuran minimal 24 px dan punya `aria-label` ("12 Okt: selesai").
**M. Formulir Resep (FR-D.3, Risiko #10)**
- Tata letak dua kolom: formulir di kiri, pratinjau di kanan (lengket).
- Bidang: jenis latihan, target ROM, **batas aman maksimum (safety ceiling)**, ROM minimum fungsional, repetisi × set, level awal, frekuensi mingguan.
- Usulan: safety ceiling **tanpa nilai bawaan dan wajib diisi**; tanpa batas aman, algoritma adaptif tidak punya pagar (6.3.4). Ini usulan desain, perlu persetujuan klinis.
- Validasi kewajaran berupa **peringatan lunak** (kotak `ember-50`/kuning dengan ikon dan kalimat penjelas), bukan blokir (sesuai PRD): "Target 150° lebih tinggi dari rentang umum untuk frozen shoulder. Lanjutkan jika sudah sesuai penilaian Anda."
- Pratinjau: ROM Arc Gauge yang menampilkan target, minimum, dan ceiling yang sedang diatur, sehingga kesalahan ketik terlihat.
- Ringkasan perubahan sebelum simpan (dialog `shadow-dialog`): "Perubahan berlaku pada sesi berikutnya pasien." Setelah simpan, toast sukses boleh hilang otomatis; **kesalahan simpan tidak**.

**N. Tinjauan Sesi (FR-D.4)**
- Lajur waktu berisi chip repetisi (Bagian 10.1.F) dengan jejak sudut di bawahnya. Repetisi kompensasi diberi anotasi otomatis; klik membuka panel detail samping (sudut puncak, tempo, sendi penyebab).
- Tidak ada pemutar video di v1 (temuan #5). Jika replay kerangka disetujui kelak, ruang untuk panel ini dicadangkan di tata letak.

**O. Catatan Klinis vs Data Otomatis (FR-D.5)**
- Data otomatis: latar `surface-muted`, tag "Otomatis".
- Catatan terapis: latar `surface`, garis kiri 3 px `accent-700`, nama dan waktu penulis. Dua gaya ini tidak boleh dicampur dalam satu kartu.

**P. Peran dan Akses (FR-D.6)**
- Lencana peran (Admin, Terapis, Staf baca-saja). Kontrol yang tidak diizinkan ditampilkan nonaktif dengan alasan ("Hanya terapis yang dapat mengubah resep"), bukan disembunyikan, supaya perilaku RBAC bisa dimengerti. Jejak audit akses disajikan sebagai daftar kronologis sederhana.

**T. Keadaan Sistem: Kosong, Memuat, Galat (diperbarui di v2.0)**
- **Memuat:** skeleton yang bentuknya meniru isi (baris tabel, kartu statistik, sparkline). Jangan menampilkan angka nol sambil memuat.
- **Kosong (ber-CTA):** ilustrasi garis kecil bermotif busur (satu-satunya tempat motif dipakai sebagai dekorasi), satu kalimat penjelas, **satu aksi utama**. Contoh: "Belum ada sesi minggu ini. Pasien akan muncul di sini setelah menyelesaikan latihan." + tombol "Atur pengingat".
- **Galat:** kotak inline di dekat sumbernya dengan ikon + kata + tindakan; tidak pernah hanya toast.
- **Banner halaman:** untuk keadaan yang memengaruhi seluruh halaman (offline, sinkron tertunda). Menetap sampai keadaan berubah; ikon + teks; tidak hilang sendiri.
- **Toast:** hanya untuk konfirmasi sukses non-kritikal, hilang setelah 5 detik, bertumpuk maksimal tiga, dapat dijeda saat hover/fokus, boleh membawa satu aksi ("Urungkan"), dan dibacakan pembaca layar (`role="status"`). Pojok kanan bawah kanvas.

**U. Palet Perintah (baru di v2.0; v1.1 hanya menyebutnya opsional)**
- **Pemicu:** `Ctrl/Cmd K` atau klik kolom pencarian di top bar. `Esc` menutup dan mengembalikan fokus ke pemicu.
- **Tampilan:** dialog 560 px, `surface-raised`, `r-xl`, `shadow-popover`; kolom ketik 48 px; hasil dikelompokkan **Aksi, Navigasi, Pasien**; setiap baris: ikon 16 px, label, petunjuk pintasan (chip `kbd`, 13 px).
- **Isi awal (belum mengetik):** hanya Aksi dan Navigasi (mis. "Buat resep", "Buka kotak masuk", "Ganti tema"). **Tidak ada nama pasien** sebelum ≥ 2 huruf diketik, dan tidak ada daftar "pasien terakhir dilihat" (layar bersama, orang yang mengintip).
- **Hasil pasien:** nama + ID saja, tanpa diagnosis. Membuka pasien lewat palet **dicatat di jejak audit** sama seperti membuka profil biasa.
- **Riwayat:** kueri pasien tidak disimpan; hanya perintah (Aksi/Navigasi) boleh muncul sebagai "Terbaru".
- **Batas:** palet hanya **membuka** layar atau dialog tujuan. Tidak ada aksi yang mengubah resep atau menghapus data yang langsung dieksekusi dari palet.
- **Pintasan huruf tunggal** (mis. `G` lalu `P`) hanya aktif saat fokus tidak berada di kolom isian, dan dapat dimatikan di Pengaturan (WCAG 2.1.4; perlu verifikasi ke spesifikasi).
- **Aksesibilitas:** `role="combobox"` dengan daftar hasil; jumlah hasil diumumkan ("5 hasil").
- **Belum divalidasi:** apakah terapis akan memakainya. Keputusan Bagian 16 #12.

**V. Kotak Masuk (baru di v2.0)**
- **Tempat:** ikon lonceng di top bar membuka laci kanan 440 px; halaman penuh "Kotak masuk" di sidebar.
- **Tiga jenis:** **Keselamatan** (pasien menekan Berhenti/Nyeri, anomali ROM), **Perlu tindakan** (adherence turun, resep kedaluwarsa), **Informasi** (sinkron selesai).
- **Item keselamatan** selalu di bagian paling atas, berlatar `ember-50`/`ember-tint`, ikon + kata "Keselamatan". **Tidak bisa dihapus atau ditandai baca massal**; harus **"Diakui"** satu per satu, dan pengakuan (siapa, kapan) dicatat di jejak audit. Tidak hilang otomatis. Lencana jumlah di sidebar menghitung item yang belum diakui.
- **Isi berupa kalimat fakta** tanpa menyalahkan: "Pak A menekan Berhenti saat Fleksi Bahu, set 2, pukul 14.32. Target otomatis diturunkan ke level 1." + tombol "Buka sesi".
- **Status ganda dibedakan dengan ikon + kata:** Belum dibaca, Dibaca, Diakui.
- **Belum didefinisikan di PRD:** bagaimana terapis diberi tahu secara langsung (push, email, atau hanya di dalam aplikasi) dan apakah ada target waktu respons. Hanya notifikasi dalam aplikasi yang dispesifikasikan di sini. Keputusan Bagian 16 #14.

**W. Alasan Prioritas Otomatis (baru di v2.0, opsional)**
- Kemasan modern untuk kalimat alasan di 10.2.J: setiap baris "Perlu perhatian" menampilkan alasan, **dasar data** ("3 sesi terakhir: 2, 1, 1 dari 3 dijadwalkan"), tag **"Otomatis"** (FR-D.5), dan tautan "Lihat data".
- **Berbasis aturan yang bisa ditelusuri.** PRD tidak mendefinisikan fitur "insight" generatif. Dokumen ini tidak menambahkan ringkasan buatan model bahasa; jika kelak ada, wajib berlabel "Otomatis", menunjukkan dasar datanya, dan tidak memakai ikon kilau.

---

### 10.3 Primitif UI Umum (baru di v2.0)

Semua primitif tersedia di Studio Terang dan Studio Gelap, dan di tiga kepadatan. Varian pasien (Studio) memakai tinggi 48 px dan teks 18 px.

| Komponen | Spesifikasi | Catatan aksesibilitas |
|---|---|---|
| **Tombol** | Varian: *utama* (isi `accent-700`/`accent-fill`, garis cahaya dalam `inset 0 1px 0 rgba(255,255,255,0.16)`), *sekunder* (`surface` + cincin `border-control`), *ghost* (tanpa latar, hover `surface-muted`), *destruktif* (isi koreksi, hanya di dialog konfirmasi). `r-md`, tinggi 40/32, `d-ui`. Status: hover, pressed, fokus, memuat (spinner di dalam + label tetap), nonaktif | Nonaktif disertai **alasan terlihat** (10.2.P); ikon-saja wajib `aria-label` dan tooltip |
| **Input, select, combobox** | Latar `surface`, border 1 px `border-control`, `r-md`, tinggi 40. Fokus: cincin 2 px aksen. Galat: border koreksi + ikon + teks bantu di bawah | Label selalu terlihat (bukan hanya placeholder); teks galat memuat tindakan |
| **Checkbox, radio, switch** | Kotak 20 px (target 40 px dengan area klik label). Switch menampilkan **teks Hidup/Mati**, bukan hanya posisi | Switch memakai `role="switch"` |
| **Tab dan segmented control** | Tab bergaris bawah dengan **indikator meluncur** (3 px, `accent-700`); segmented berlatar `surface-muted` dengan penanda `surface` meluncur dan `shadow-card` | Panah kiri/kanan berpindah; `role="tablist"`; tab aktif punya `aria-selected` |
| **Badge/chip** | Status: tint + ikon 16 px + kata, `r-sm`. Netral: `surface-muted`. Filter: pil `r-full`, dengan jumlah | Tidak pernah titik warna saja |
| **Avatar** | Inisial di lingkaran netral (`surface-muted`, teks `text-700`); tidak memakai warna status | Nama lengkap di `aria-label` |
| **Tooltip** | Muncul setelah 400 ms hover atau saat fokus; latar `text-900` (terang) / `surface-raised` (gelap); maksimal dua baris | Bukan satu-satunya tempat informasi penting; dapat ditutup dengan `Esc` |
| **Menu/popover** | `surface-raised`, `r-lg`, `shadow-popover`, item 36 px, pemisah `border-subtle` | Panah atas/bawah, `Esc` menutup, fokus kembali |
| **Dialog** | `surface-raised`, `r-xl`, `shadow-dialog`, `overlay`; lebar 480/640 px; judul `d-section`; aksi utama kanan bawah | Fokus terjebak di dalam dialog; `Esc` menutup kecuali dialog konfirmasi keselamatan |
| **Laci samping** | Lebar 440 px, `surface-raised`, `shadow-dialog`; fokus masuk saat dibuka | Dapat ditutup dengan `Esc` dan tombol tutup berlabel |
| **Breadcrumb** | `d-caption`, pemisah ikon `›`, item terakhir `aria-current` | Pada layar sempit diciutkan jadi "…" dengan menu |
| **Paginasi** | "‹ Sebelumnya · Halaman 2 dari 9 · Berikutnya ›" + pilih jumlah baris | Posisi diumumkan; target ≥ 32 px |
| **Pemilih rentang tanggal** | Preset: 7 hari, 4 minggu, 12 minggu, Kustom | Tanggal dapat diketik; kalender dapat dioperasikan keyboard |
| **Chip `kbd`** | `d-caption`, `surface-muted`, `r-sm`, border `border-default` | Hanya pelengkap; aksi harus tetap dapat dicapai tanpa pintasan |
| **Skeleton** | Blok `surface-muted` dengan kilau pelan | Statis pada `prefers-reduced-motion`; `aria-busy` pada wadah |
| **Progress** | Batang 8 px `r-full` atau cincin; selalu disertai teks angka | Tidak hanya warna |

## 11. Tata Letak

### 11.1 Tata Letak Per Langkah (Alur Pasien)

*(Tidak berubah dari v1.1.)*

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


### 11.2 Tata Letak Halaman Dashboard (baru di v2.0, ≥ 1280 px)

Wireframe teks; belum dirender. Urutan DOM = urutan baca = urutan prioritas klinis (6.4).

**a. Ringkasan (bento)**

```
┌ Sidebar ┐ ┌ Kanvas konten (r-xl, melayang) ────────────────────────────┐
│ ▣ Logo  │ │ Top bar:  Ringkasan  ›        [ Cari pasien…  Ctrl K ] 🔔 ◐ ◉ │
│         │ │─────────────────────────────────────────────────────────────│
│ Ringkasan│ │ Selamat siang, [nama terapis]          [ Buat resep ] │
│ Pasien  │ │ Ringkasan minggu ini (wash accent-50 → bg-app)               │
│ Resep   │ │                                                              │
│ Laporan │ │ ┌KPI──┐ ┌KPI──┐ ┌KPI──┐ ┌KPI──┐   ← 4 × 3 kolom, sparkline  │
│ Pengat. │ │ │Aktif│ │Adher│ │Perlu│ │ΔROM │                             │
│ ─────── │ │ └─────┘ └─────┘ └─────┘ └─────┘                             │
│ Kotak   │ │ ┌ Perlu perhatian (7 kol) ──────┐ ┌ Adherence 4 mgg (5 kol)─┐│
│ masuk ③ │ │ │ ⚠ Pak A  Adherence turun 3 …  │ │  heatmap / batang        ││
│         │ │ │ ⚠ Bu B   Kompensasi naik …    │ │                          ││
│ Peran   │ │ │ [Lihat semua 7 pasien]        │ │                          ││
│         │ │ └────────────────────────────────┘ └──────────────────────────┘│
│         │ │ ┌ Tren ROM (8 kol) ──────────────┐ ┌ Aktivitas terbaru (4) ──┐│
│         │ │ │ garis + area, "Estimasi kamera"│ │ daftar kronologis        ││
│         │ │ └────────────────────────────────┘ └──────────────────────────┘│
└─────────┘ └─────────────────────────────────────────────────────────────┘
```

**b. Daftar Pasien + laci detail**

```
┌ Kanvas ─────────────────────────────────────────────────────────────────┐
│ Pasien                                              [ + Tambah pasien ] │
│ [Semua][Perlu perhatian ②][Minggu ini]  + tampilan   ⌕ cari  ▤ kolom  ≡ │
│ ─────────────────────────────────────────────────────────────────────── │
│ ☐ Nama / diagnosis     Prioritas          Adherence   ΔROM   Sesi akhir │
│ ☑ (AB) Pak A  Bahu     ⚠ Perlu perhatian  ▁▃▂▁       −3°    Kemarin     │
│ ☐ (BC) Bu B   Lutut    ✓ Stabil           ▅▆▇▇       +6°    Hari ini    │
│                                            ┌ Laci (440 px) ──────────┐   │
│  Halaman 1 dari 9  ‹ ›                      │ Pak A · ringkasan      │   │
│ ┌ 1 dipilih · Ubah resep · Kirim pengingat · Batal ┐ ← bilah melayang   │
└─────────────────────────────────────────────────────────────────────────┘
```

**c. Detail pasien**

```
Pasien › Pak A                        ⚠ Perlu perhatian   [ Ubah resep ]
Fleksi bahu · frozen shoulder · Estimasi kamera
[ Ringkasan ][ Sesi ][ Resep ][ Catatan ][ Riwayat akses ]  ← indikator meluncur
┌ KPI ROM puncak ┐ ┌ KPI Akurasi ┐ ┌ KPI Rep valid ┐   (3 × 4 kolom)
┌ Grafik ROM 4 minggu (8 kol) ─────────┐ ┌ Catatan terapis (4 kol) ───────┐
│ target, ceiling, anomali             │ │ garis kiri aksen + nama + waktu │
└──────────────────────────────────────┘ └─────────────────────────────────┘
┌ Tinjauan sesi terakhir (12 kol): lajur chip repetisi + jejak sudut ──────┐
```

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

- Kontras mengikuti tabel 4.6 (AA terpenuhi untuk semua pasangan teks yang dipakai di **kedua tema** Studio dan di Stage). Pasangan yang gagal ditandai dan dilarang untuk teks (`text-500` di `surface-muted` pada tema terang, `ember-500`).
- Dua modalitas untuk semua umpan balik kritikal: visual (bentuk + teks) dan audio.
- Skala ukuran pengguna 1,0 / 1,25 / 1,5 untuk seluruh Stage dan UI pasien.
- Fokus keyboard terlihat: cincin 2 px dengan offset 2 px di kedua tema (5,47 di putih; 10,06 di `bg-app` gelap).
- Pembaca layar untuk seluruh DOM; label ARIA pada gauge ("Sudut bahu 112 derajat, target 120, batas aman 140"). Item navigasi aktif memakai `aria-current`; tabel memakai `aria-sort`; tab memakai `aria-selected`; bilah aksi massal dan kotak masuk memakai region berlabel.
- **Urutan fokus = urutan baca = urutan DOM** pada bento grid (6.4). Penempatan visual tidak boleh memakai `order` yang mengubah urutan itu.
- `prefers-reduced-motion` dihormati (Bagian 8), termasuk skeleton, indikator tab, dan stagger kartu.
- `prefers-contrast: more` dan `forced-colors`: cincin kartu diganti border solid; cincin fokus memakai warna sistem.
- `prefers-color-scheme`: tema Dashboard mengikuti sistem secara bawaan; pilihan eksplisit pengguna menang.
- Tidak ada konten berkedip lebih dari 3 kali per detik.
- Target klik: Pasien ≥ 48 px; Dashboard ≥ 32 px (ambang minimum WCAG 2.2 adalah 24 px, perlu verifikasi ke spesifikasi).
- Pintasan keyboard huruf tunggal dapat dimatikan (10.2.U).
- Grafik punya alternatif tabel; informasi penting tidak hanya di tooltip (4.8).
- Mode kontras tinggi sebagai varian token (rencana, belum didefinisikan angka di draft ini).

**Perlu diuji dengan manusia, bukan hanya dihitung:** keterbacaan 2 m, pembedaan tiga status pada buta warna (termasuk Koreksi crimson baru di Studio Terang), pembedaan aksen teal dari status "Tercapai", keterlihatan tepi kartu pada layar laptop murah, kejelasan gestur Berhenti, terdengarnya nada pada speaker laptop murah, dan **apakah terapis benar-benar memakai palet perintah, tampilan tersimpan, dan mode gelap**.

---

## 15. Token (Cuplikan Siap Pakai)

Sumber tunggal sebaiknya berupa JSON token dan diekspor ke CSS dan Unity (alat seperti Style Dictionary dapat dipakai; verifikasi kecocokan dengan pipeline tim). Nama token **semantik** sehingga tema gelap hanya menimpa nilai. Cuplikan ini belum dijalankan di peramban; **perlakukan sebagai spesifikasi, bukan kode yang sudah teruji.**

```css
:root {
  color-scheme: light;

  /* Neutral (slate) */
  --bg-app:#F8FAFC; --surface:#FFFFFF; --surface-raised:#FFFFFF; --surface-muted:#F1F5F9;
  --border-subtle:#E2E8F0;   /* dekoratif saja */
  --border-default:#CBD5E1;  /* dekoratif saja */
  --border-control:#7C8CA3;  /* kontrol interaktif, >= 3:1 */
  --text-900:#0F172A; --text-700:#334155; --text-600:#475569;
  --text-500:#64748B;        /* hanya di --surface / --bg-app, >= 14px */
  --overlay:rgba(15,23,42,0.45);

  /* Accent (teal) */
  --accent-50:#F0FDFA; --accent-100:#CCFBF1;
  --accent-600:#0D9488;      /* grafis non-teks saja */
  --accent-700:#0F766E; --accent-800:#115E59; --accent-900:#134E4A;
  --accent-text:var(--accent-700);
  --accent-subtle:var(--accent-50);
  --accent-fill:var(--accent-700);
  --accent-fill-hover:var(--accent-800);
  --accent-fill-pressed:var(--accent-900);
  --on-accent:#FFFFFF;

  /* Ember (target / perhatian) */
  --ember-50:#FFF7ED; --ember-400:#FB923C;
  --ember-500:#EA580C;       /* grafis non-teks saja */
  --ember-600:#C2410C;
  --ember-tint:var(--ember-50);
  --ember-text:var(--ember-600);
  --ember-graphic:var(--ember-500);

  /* Status (terang) */
  --status-reach:#0B6B4A; --status-reach-bg:#ECFDF5;
  --status-near:#7A5200;  --status-near-bg:#FFFBEB;
  --status-comp:#9F1239;  --status-comp-bg:#FFF1F2;   /* v2.0: crimson (v1.1: #A82C16) */
  --stop-bg:#9F1239; --on-stop:#FFFFFF;

  /* Grafik (S1-S3 berwarna, S4 netral pembanding) */
  --chart-1:#0F766E; --chart-2:#2563EB; --chart-3:#BE185D; --chart-4:#64748B;

  /* Type */
  --font-dashboard:"Inter", system-ui, "Segoe UI", Roboto, sans-serif;
  --font-patient:"Atkinson Hyperlegible Next", system-ui, "Segoe UI", Roboto, sans-serif;

  /* Space & shape */
  --space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px;
  --space-6:24px; --space-8:32px; --space-12:48px; --space-16:64px; --space-24:96px;
  --r-sm:6px; --r-md:10px; --r-lg:16px; --r-xl:20px; --r-full:9999px;

  /* Elevation (terang: cincin + bayangan berlapis) */
  --shadow-card:0 0 0 1px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04), 0 4px 12px -4px rgba(15,23,42,0.06);
  --shadow-card-hover:0 0 0 1px rgba(15,23,42,0.10), 0 2px 4px rgba(15,23,42,0.06), 0 8px 20px -6px rgba(15,23,42,0.10);
  --shadow-popover:0 0 0 1px rgba(15,23,42,0.08), 0 8px 24px -4px rgba(15,23,42,0.12);
  --shadow-dialog:0 0 0 1px rgba(15,23,42,0.06), 0 24px 48px -12px rgba(15,23,42,0.22);

  /* Density (Dashboard) */
  --row-h:48px; --control-h:40px;      /* standar */
  --control-patient:48px;

  /* Focus */
  --focus-ring:0 0 0 2px var(--surface), 0 0 0 4px var(--accent-700);

  /* Motion */
  --ease:cubic-bezier(0.2,0,0,1);
  --dur-instant:80ms; --dur-quick:160ms; --dur-std:240ms; --dur-slow:400ms;
}

[data-density="comfortable"] { --row-h:56px; --control-h:44px; }
[data-density="compact"]     { --row-h:40px; --control-h:32px; }

/* Studio Gelap (Dashboard saja). Salin blok yang sama ke
   @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ... } } */
[data-theme="dark"] {
  color-scheme: dark;
  --bg-app:#0B1220; --surface:#121B2C; --surface-raised:#18233A; --surface-muted:#1A2640;
  --border-subtle:#1F2A3F; --border-default:#2A3750; --border-control:#6B7C96;
  --text-900:#F1F5F9; --text-700:#CBD5E1; --text-600:#A5B4C8; --text-500:#8B9BB2;
  --overlay:rgba(0,0,0,0.6);

  --accent-text:#2DD4BF; --accent-subtle:#163541;
  --accent-fill:#14B8A6; --accent-fill-hover:#2DD4BF; --accent-fill-pressed:#11A99B;
  --on-accent:#042F2E;

  --ember-tint:#332C2E; --ember-text:#FB923C; --ember-graphic:#FB923C;

  --status-reach:#4FD6A5; --status-reach-bg:#1B353D;
  --status-near:#F5C04A;  --status-near-bg:#323230;
  --status-comp:#FF7A5C;  --status-comp-bg:#332833;
  --stop-bg:#FF7A5C; --on-stop:#13211F;

  --chart-1:#2DD4BF; --chart-2:#60A5FA; --chart-3:#FB7185; --chart-4:#94A3B8;

  --shadow-card:0 0 0 1px var(--border-default), inset 0 1px 0 rgba(255,255,255,0.04);
  --shadow-card-hover:0 0 0 1px var(--border-control), inset 0 1px 0 rgba(255,255,255,0.06);
  --shadow-popover:0 0 0 1px var(--border-default), 0 12px 32px rgba(0,0,0,0.5);
  --shadow-dialog:0 0 0 1px var(--border-default), 0 24px 48px rgba(0,0,0,0.6);
  --focus-ring:0 0 0 2px var(--surface), 0 0 0 4px var(--accent-text);
}

[data-surface="stage"] {   /* tidak berubah dari v1.1 */
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

@media (prefers-contrast: more), (forced-colors: active) {
  :root, [data-theme="dark"] {
    --shadow-card:0 0 0 1px CanvasText;
    --shadow-card-hover:0 0 0 2px CanvasText;
  }
}
@media (prefers-reduced-motion: reduce) {
  * { animation-duration:0.01ms !important; transition-duration:0.01ms !important; }
}
```

---

## 16. Daftar Keputusan yang Dibutuhkan Sebelum Finalisasi

Keputusan 1–10 dibawa dari v1.1 (#9 dan #11 disesuaikan); 13–16 baru di v2.0.

| # | Keputusan | Pemilik | Mengapa menghambat |
|---|---|---|---|
| 1 | Gestur/suara Berhenti: layak secara teknis dan disetujui klinis? | ML + Clinical Advisory | Risiko keselamatan #9 tidak tertutup tanpa ini |
| 2 | Replay kerangka di dashboard: boleh menyimpan deret landmark? | Privasi/Compliance | Menentukan isi Tinjauan Sesi |
| 3 | Target latensi realistis berdasarkan pengukuran prototipe | Engineering | Menentukan seberapa "refleks" mekanik game boleh dibuat |
| 4 | Peringkat antarpasien di Challenge Mode: ada atau tidak? | Clinical Advisory | Menentukan desain leaderboard |
| 5 | Safety ceiling wajib diisi tanpa nilai bawaan? | Clinical Advisory + Product | Menentukan formulir resep |
| 6 | Uji lapangan 2 m dengan pengguna lansia dan **uji buta warna sungguhan** (Koreksi crimson vs Hampir, teal vs Tercapai, palet 4 seri) | UX Research | Mengunci skala Stage dan palet status/grafik. Simulasi saya hanya perkiraan |
| 7 | Lisensi dan ketersediaan font, set glyph | Design + Legal | Mengunci tipografi |
| 8 | Aset logo "busur goniometer" dan wordmark (terang dan gelap) | Design | Belum dibuat |
| 9 | Inter untuk Dashboard, atau satu keluarga (Atkinson) untuk semua? Cek pembedaan I/l dan lisensi | Design + Frontend | Menentukan beban muat dan konsistensi |
| 10 | Perangkat terapis (laptop saja atau juga tablet)? | Product | Menentukan kepadatan Kompak, sidebar rel, ukuran target |
| 11 | **Studio Gelap untuk Dashboard: dikerjakan di v1 atau ditunda?** (Rekomendasi saya: token sudah disiapkan; implementasi komponen ditunda jika kapasitas Frontend terbatas, karena menggandakan permukaan uji) | Product + Design | Menentukan perlu tidaknya uji dua tema |
| 12 | Palet perintah, tampilan tersimpan, dan sidebar: sesuai alur kerja terapis? (10.2.Q/J/U belum divalidasi dengan pengguna) | UX Research | Mencegah membangun fitur yang tidak dipakai |
| 13 | **Warna Koreksi berbeda antar-permukaan** (crimson di Studio Terang, coral di Stage/Studio Gelap): diterima, atau satukan ke satu hue (mis. crimson di Stage juga, perlu hitung ulang kontras Stage)? | Design + UX Research | Konsistensi vs keterbedaan buta warna |
| 14 | **Bagaimana terapis diberi tahu kejadian Berhenti/Nyeri** (dalam aplikasi saja, email, push) dan target waktu respons? | Clinical Advisory + Product | Menentukan isi Kotak Masuk dan klaim keselamatan |
| 15 | **Palet perintah dan pencarian**: apakah pencarian nama pasien lewat palet boleh, dan bagaimana dicatat di jejak audit? | Privasi/Compliance | 10.2.U |
| 16 | **Aksi massal** pada tabel: apakah mengubah resep untuk banyak pasien sekaligus diizinkan klinis? Jika tidak, hapus dari bilah aksi | Clinical Advisory | 10.2.J |

---

## 17. Peta Migrasi Token v1.1 → v2.0

| Token v1.1 | Token v2.0 | Catatan |
|---|---|---|
| `bg-app`, `surface`, `surface-muted` | sama | Tema terang tidak berubah |
| (tidak ada) | `surface-raised` | Popover, dialog, laci. Terang = `surface`; gelap lebih terang |
| `border-subtle`, `border-default`, `border-control` | sama | Dekoratif vs kontrol tetap dibedakan |
| `accent-50` / `-700` / `-800` / `-900` | sama | Ditambah `accent-100`, `accent-600` |
| (tidak ada) | `accent-text`, `accent-subtle`, `accent-fill(-hover/-pressed)`, `on-accent` | Token semantik; pada tema terang sama dengan `accent-700` dan seterusnya |
| `ember-50/400/500/600` | sama | Ditambah `ember-tint`, `ember-text`, `ember-graphic` |
| `status-comp` `#A82C16`, bg `#FEF2F2` | `status-comp` **`#9F1239`**, bg **`#FFF1F2`** | Keterbedaan deutan 2,5 → 14,0 (4.7). Hanya Studio Terang |
| `stop-bg` `#A82C16` | `stop-bg` `#9F1239` | Mengikuti Koreksi |
| `--r-sm/md/lg/xl` 6/8/12/16 | **6/10/16/20** | Kartu 12 → 16; tombol/input 8 → 10; kanvas/dialog 16 → 20 |
| `--shadow-xs/sm/md/lg` | `--shadow-card`, `-card-hover`, `-popover`, `-dialog` | Cincin 1 px + bayangan berlapis |
| `--control-dash` 40, `--control-dash-compact` 32 | `--control-h` (44/40/32) dan `--row-h` (56/48/40) | Tiga kepadatan |
| `d-display` 32/40; `d-heading` 18/28 | `d-display` 36/40; `d-heading` 16/24; + `d-section`, `d-ui` | Ritme bobot baru |
| (tidak ada) | `--chart-1` … `--chart-4` | Palet grafik 4 seri |
| Stage tokens | tidak berubah | |
| `Bagian 3 "Batas Gaya SaaS"` | diperbarui | Relaksasi gradien terbatas; larangan baru: count-up, hover-only, infinite scroll |

---

## 18. Langkah Berikutnya yang Disarankan

1. Anda review dokumen ini, terutama Bagian 0.1, 3, 4.7 (temuan buta warna), 10.2.U–V, dan 16.
2. Setelah disetujui: ekspor token ke JSON, buat **halaman pratinjau HTML** (swatch terang dan gelap, tipografi, ROM Arc Gauge, chip repetisi, kartu statistik, tabel pasien dengan laci, app shell melayang, bento Ringkasan, palet perintah). **Kesan "kekinian" baru bisa dinilai pada tahap ini**; sampai sekarang semuanya masih teks.
3. Uji pratinjau pada layar laptop biasa (bukan hanya monitor bagus) untuk memastikan tepi kartu terlihat (6.3).
4. Uji buta warna sungguhan dan uji lapangan 2 m (Bagian 16 #6).
5. Spesifikasi handoff untuk tim Frontend dan Unity.

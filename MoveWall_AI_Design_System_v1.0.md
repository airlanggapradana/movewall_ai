# MoveWall AI — Design System v1.0 (Draft untuk Review)

| Field | Detail |
|---|---|
| Acuan | PRD MoveWall AI v1.0 (28 Juli 2026) |
| Status | Draft Markdown untuk review sebelum difinalkan (token JSON, preview HTML, handoff) |
| Cakupan | Aplikasi Pasien (shell web + gameplay) dan Therapist Dashboard |
| Bahasa UI | Bahasa Indonesia (default), struktur siap i18n |

Label kepercayaan dipakai pada klaim yang tidak bisa saya buktikan dari PRD: **[High]**, **[Medium]**, **[Low]**. Angka kontras di Bagian 4 dihitung langsung dengan rumus WCAG, bukan perkiraan.

---

## 0. Temuan PRD yang Mengubah Keputusan Desain (Baca Dulu)

Ini bukan kritik atas kualitas PRD, tapi celah yang kalau dibiarkan membuat design system terlihat bagus di Figma lalu gagal di ruang tamu pasien. Urut dari yang paling berdampak.

| # | Temuan | Dampak desain | Confidence |
|---|---|---|---|
| 1 | **Tombol "Stop/Nyeri" via 1 klik (Risiko #9) tidak bisa dijangkau pasien yang berdiri 1,5–2,5 m dari laptop (FR-5.2).** Pasien tidak memegang mouse. | Perlu pemicu tanpa sentuhan: gestur (silang tangan di dada, tahan 1 detik), perintah suara, dan tombol layar besar sebagai cadangan. Detail di 10.1. Gestur harus divalidasi klinis dan diuji false-positive. | High (logika), Medium (kelayakan teknis suara berbahasa Indonesia, perlu verifikasi) |
| 2 | **Seluruh navigasi non-gameplay mengasumsikan klik**, padahal pasien bergerak. Kalibrasi sudah hands-free secara alami, tapi "mulai misi", "lanjut set", "selesai" belum. | Pola "tahan pose untuk konfirmasi" (pose-to-confirm) dan auto-advance berpenghitung mundur. Mouse/keyboard tetap ada untuk fase duduk (pre-flight, ringkasan). | High |
| 3 | **Target latensi <30 ms (8.1) secara aritmetika tidak mungkin** pada webcam 30 fps: satu interval frame saja sudah ±33 ms, belum termasuk inferensi, bridge JS↔Unity, dan render. | Desain tidak boleh bergantung pada kontrol "twitch". Mekanik game memakai jendela toleransi (tahan, bukan refleks), avatar mengikuti sudut yang dihaluskan. Target latensi sebaiknya direvisi ke angka yang diukur dari prototipe. | High (aritmetika), Low (angka pengganti, saya tidak punya data, perlu pengukuran) |
| 4 | **Kode warna hijau/kuning/merah (FR-5.1) sendirian tidak aksesibel** untuk buta warna merah-hijau dan terlalu mengandalkan nada "salah" pada lansia. | Setiap status wajib punya penanda kedua: bentuk sendi, label, atau pola. Palet digeser (hijau ke arah teal, merah ke arah coral) untuk memperbesar jarak. Perlu uji simulasi CVD. | High (prinsip), Medium (palet baru belum disimulasikan, perlu verifikasi) |
| 5 | **Persona Pak Dedi minta "video/replay gerakan bermasalah" (4.3)**, sementara 8.2 melarang video/pose mentah keluar perangkat. FR-D.4 hanya menyebut breakdown per repetisi. | Desain memakai grafik sudut per repetisi plus anotasi, bukan replay. Replay kerangka (stick figure) hanya bisa jika tim privasi menyetujui penyimpanan deret landmark. Dashboard tidak boleh menjanjikan replay sebelum keputusan itu. | High |
| 6 | **FR-6.4 menyarankan "Coba tingkatkan level besok"**, tapi level dan safety ceiling adalah wewenang terapis (6.3.4). | Teks ringkasan tidak boleh mendorong pasien menaikkan beban sendiri. Contoh kalimat diganti di Bagian 13. | High |
| 7 | **Leaderboard di Challenge Mode** memberi insentif memaksakan gerakan pada populasi pasca-cedera, meski ada hard-cap. | Default: bandingkan dengan diri sendiri. Peringkat antarpasien hanya opt-in dan harus disetujui Clinical Advisory Board. Ini rekomendasi desain, bukan fakta klinis. | Medium |
| 8 | **ROM ditampilkan dari kamera 2D monokuler**, padahal Lampiran B menyatakan belum ada validasi vs goniometer. | Tampilkan derajat sebagai bilangan bulat (tanpa desimal), beri tag "Estimasi kamera" di dashboard, dan jangan pakai kata "clinical-grade" di antarmuka. | High |
| 9 | **"Google ML Kit" disebut sebagai opsi pose engine**, padahal untuk target Windows/macOS browser yang relevan adalah MediaPipe. ML Kit adalah SDK Android/iOS. | Tidak mengubah visual, tapi memengaruhi spesifikasi overlay skeleton. Tolong dikonfirmasi tim ML. | High |
| 10 | **Teks kecil mustahil dibaca dari 2 m**, padahal HUD biasanya penuh teks. PRD mengakui ini di FR-5.2 tapi tidak menurunkannya jadi aturan ukuran. | Skala tipografi Stage dengan lantai ukuran keras (Bagian 5.2) dan batas elemen HUD. | Medium (angka berasal dari aturan praktis, perlu uji pada laptop 13–15 inci) |

Dua hal yang saya **tidak** ubah karena itu keputusan bisnis/klinis: skema monetisasi (Lampiran B-4) dan klaim akurasi klinis (Lampiran B-2).

---

## 1. Prinsip Desain

1. **Gerakan adalah antarmuka.** Saat pasien bergerak, layar hanya menjawab tiga pertanyaan: sudah sampai mana, apakah benar, berapa lagi. Semua yang lain disembunyikan.
2. **Aman lebih penting dari menang.** Batas aman (safety ceiling) digambar sebagai bagian dari alat ukur, bukan peringatan tambahan. Tidak ada elemen visual yang merayakan melewati target secara berlebihan.
3. **Terbaca dari dua meter.** Ada dua mode ukuran: *near-field* (duduk, ±50 cm) dan *far-field* (berdiri, ±2 m). Elemen far-field punya lantai ukuran dan tidak boleh jatuh ke ukuran near-field.
4. **Tidak pernah hanya warna.** Setiap status = warna + bentuk + kata (dan suara untuk status kritikal).
5. **Tenang, bukan kekanak-kanakan.** Persona kita berusia 29 dan 58. Game boleh menyenangkan tanpa maskot kartun dan konfeti.
6. **Jujur soal ketidakpastian.** Ini estimasi dari kamera. Antarmuka tidak menampilkan presisi palsu.
7. **Data otomatis dan penilaian manusia selalu terlihat berbeda.** Terapis harus bisa membedakan "kata sistem" dan "kata saya" dalam sekali lihat (FR-D.5).

---

## 2. Konsep Identitas: "Goniometer"

Goniometer adalah alat ukur sudut sendi yang dipakai fisioterapis. Itu pusat identitas visual karena produk ini, pada intinya, mengukur sudut.

- **Motif inti: busur ukur.** Busur 0–180° dengan garis skala halus dan satu titik penanda target. Muncul sebagai: logo, ROM gauge, indikator loading, dan pembatas bagian.
- **Garis, bukan isian.** Antarmuka didominasi garis tipis, skala, dan angka besar. Isian warna padat disimpan untuk status dan aksi utama sehingga warna selalu bermakna.
- **Dua suasana, satu keluarga:**
  - **Studio** (terang, kertas hangat): dashboard terapis dan layar pasien saat duduk.
  - **Stage** (gelap, tenang): layar gameplay. Gelap supaya overlay kerangka dan game menonjol dan cahaya layar tidak menyilaukan di ruang redup.

Logo: busur setengah lingkaran dengan satu tanda target berwarna ember, di samping wordmark "MoveWall" (huruf sans, bobot 700, tracking −1%). Aset logo final perlu dibuat terpisah; di dokumen ini hanya spesifikasi konsep.

---

## 3. Anti-Template (Yang Sengaja Kita Hindari)

- Gradien ungu-biru dan "aurora blob" sebagai identitas.
- Ikon kilau/✨ untuk menandai "AI". Fitur AI di sini tidak perlu ditonjolkan; yang ditonjolkan adalah hasil ukur.
- Glassmorphism di atas video kamera. Alasan fungsional: kontras teks di atas video tidak bisa dijamin, dan blur boleh membebani GPU yang sudah memikul inferensi + WebGL. [Medium, tidak diukur]
- Grid kartu seragam dengan sudut 16 px, bayangan lembut, dan angka bergradien.
- Konfeti, emoji sebagai ikon fungsional, maskot kartun.
- Satu keluarga font bawaan yang paling umum untuk semua teks.
- Angka desimal pada ROM (presisi palsu, lihat temuan #8).
- Warna merah sebagai "hukuman". Merah/coral dipakai sebagai sinyal koreksi, bahasanya tetap suportif.

---

## 4. Warna

### 4.1 Studio (terang)

| Token | Hex | Peran |
|---|---|---|
| `bone-50` | `#F8F5EF` | Latar utama |
| `bone-100` | `#F0EBE1` | Permukaan sekunder, panel |
| `bone-200` | `#E3DCCD` | Pemisah, latar chip |
| `bone-300` | `#CFC6B3` | Garis dekoratif saja (tidak untuk batas kontrol) |
| `edge-strong` | `#8C8472` | Batas input/kontrol interaktif |
| `ink-900` | `#13211F` | Teks utama |
| `ink-700` | `#34443F` | Teks isi |
| `ink-600` | `#4A5B56` | Teks sekunder |
| `ink-500` | `#5C6B66` | Teks tersier (batas terendah yang dipakai untuk teks) |
| `primary-600` | `#17594F` | Aksi utama, tautan, fokus |
| `primary-700` | `#0F443C` | Hover/pressed aksi utama |
| `primary-50` | `#E4EFEA` | Latar terpilih/informasional ringan |
| `ember-600` | `#C2410C` | Aksen energi: target, penanda penting, tombol sekunder berisi |
| `ember-400` | `#F07A4F` | Isian aksen dengan teks `ink-900` di atasnya |
| `ember-500` | `#E4572E` | Hanya grafis non-teks (garis, ikon besar) |

Primary adalah hijau-teal tua (kesan klinis yang hangat, bukan biru rumah sakit). Ember adalah satu-satunya warna "hangat" dan sengaja langka, supaya setiap kemunculannya berarti: ini target atau ini yang perlu perhatian.

### 4.2 Stage (gelap, untuk gameplay)

| Token | Hex | Peran |
|---|---|---|
| `stage-900` | `#0E1514` | Latar |
| `stage-800` | `#162321` | Panel HUD (solid, bukan transparan) |
| `stage-700` | `#1F312E` | Pemisah, track gauge |
| `stage-text` | `#F2EFE8` | Teks utama |
| `stage-muted` | `#A9B5B0` | Teks sekunder |

### 4.3 Warna Status Gerakan (semantik, tiga set)

| Status | Light (teks di Studio) | Stage (garis/isian di gelap) | Penanda kedua (wajib) |
|---|---|---|---|
| **Tercapai** (ROM sesuai target) | `#0B6B4A` | `#4FD6A5` | Sendi bulat penuh, garis tebal, kata "Tercapai" |
| **Hampir** (mendekati target) | `#7A5200` | `#F5C04A` | Sendi belah ketupat, garis putus-putus halus, kata "Hampir" |
| **Koreksi** (kompensasi/postur) | `#A82C16` | `#FF7A5C` | Sendi segitiga, garis ganda, kata "Koreksi postur" |

Nama status di UI memakai **Tercapai / Hampir / Koreksi**, bukan "Benar/Salah", karena label pertama membingkai pasien sebagai sedang berproses.

### 4.4 Warna Sistem

| Peran | Studio | Stage |
|---|---|---|
| Berhenti/Nyeri (aksi darurat) | isi `#A82C16`, teks putih | isi `#FF7A5C`, teks `#13211F` |
| Info/sinkron | `primary-600` | `#4FD6A5` |
| Peringatan | `#7A5200` | `#F5C04A` |

### 4.5 Kontras Terverifikasi (dihitung dengan rumus WCAG 2.x)

| Pasangan | Rasio | Ambang | Lolos |
|---|---|---|---|
| `ink-900` di `bone-50` | 15,26 | 4,5 | Ya |
| `ink-600` di `bone-50` | 6,60 | 4,5 | Ya |
| `ink-600` di `bone-100` | 6,05 | 4,5 | Ya |
| `ink-500` di `bone-50` | 5,15 | 4,5 | Ya |
| `primary-600` di `bone-50` | 7,49 | 4,5 | Ya |
| Putih di `primary-600` | 8,14 | 4,5 | Ya |
| Putih di `primary-700` | 10,98 | 4,5 | Ya |
| Putih di `ember-600` | 5,18 | 4,5 | Ya |
| `ink-900` di `ember-400` | 6,01 | 4,5 | Ya |
| Putih di `ember-500` | **3,68** | 4,5 | **Tidak**, karena itu `ember-500` tidak boleh membawa teks putih |
| Status Tercapai (light) di `bone-50` | 6,00 | 4,5 | Ya |
| Status Hampir (light) di `bone-50` | 6,36 | 4,5 | Ya |
| Status Koreksi (light) di `bone-50` | 6,35 | 4,5 | Ya |
| Putih di `#A82C16` (tombol Berhenti, Studio) | 6,92 | 4,5 | Ya |
| `stage-text` di `stage-900` | 16,10 | 4,5 | Ya |
| `stage-muted` di `stage-900` | 8,74 | 4,5 | Ya |
| `stage-muted` di `stage-800` | 7,65 | 4,5 | Ya |
| Tercapai (stage) di `stage-900` | 10,12 | 3 (grafis) / 4,5 (teks) | Ya |
| Hampir (stage) di `stage-900` | 11,02 | sama | Ya |
| Koreksi (stage) di `stage-900` | 7,21 | sama | Ya |
| `ink-900` di isian `#4FD6A5` | 9,09 | 4,5 | Ya |
| `edge-strong` di `bone-50` | 3,41 | 3 (non-teks) | Ya |
| `bone-300` di `bone-50` | **1,56** | 3 (non-teks) | **Tidak**, karena itu hanya dekoratif |

**Belum diverifikasi:** keterbedaan tiga warna status di bawah simulasi buta warna (protanopia/deuteranopia). Inilah alasan penanda kedua bersifat wajib, bukan opsional.

---

## 5. Tipografi

### 5.1 Keluarga

| Peran | Font | Alasan |
|---|---|---|
| UI, data, seluruh Stage | **Atkinson Hyperlegible Next** | Dirancang oleh Braille Institute untuk keterbacaan penglihatan rendah; huruf mirip (I/l/1, O/0) dibuat jelas berbeda. Cocok untuk Bu Ratna dan angka derajat. |
| Judul halaman dashboard, headline ringkasan sesi | **Newsreader** (serif) | Memberi nuansa catatan klinis yang hangat; hanya di near-field, tidak pernah di Stage. |
| Angka berderet (tabel, log) | Atkinson dengan `font-variant-numeric: tabular-nums` | Kolom angka lurus. |

**Perlu verifikasi sebelum final:** ketersediaan dan lisensi kedua font di Google Fonts (keduanya setahu saya berlisensi OFL, tapi saya tidak memeriksa langsung), serta kelengkapan glyph Bahasa Indonesia dan bobot yang dibutuhkan. [Medium]

Fallback: `system-ui, "Segoe UI", Roboto, sans-serif` dan `Georgia, serif`. Muat font dengan `font-display: swap`; jangan blokir sesi karena font.

### 5.2 Skala Near-Field (Studio)

| Token | Ukuran / Line-height | Bobot | Pemakaian |
|---|---|---|---|
| `display-lg` | 40 / 48 | Newsreader 500 | Judul ringkasan sesi |
| `title` | 28 / 36 | Newsreader 500 | Judul halaman |
| `heading` | 20 / 28 | Atkinson 700 | Judul bagian |
| `body-lg` | 18 / 28 | Atkinson 400 | Isi aplikasi pasien (minimum untuk pasien) |
| `body` | 16 / 24 | Atkinson 400 | Isi umum |
| `data` | 14 / 20 | Atkinson 500, tabular | Tabel dashboard (minimum untuk terapis) |
| `caption` | 13 / 18 | Atkinson 400 | Keterangan, tag. **Tidak dipakai di aplikasi pasien.** |

### 5.3 Skala Far-Field (Stage, baca dari ±2 m)

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
| Radius | `r-sm` 4 (input, chip), `r-md` 8 (kartu, tombol), `r-lg` 16 (panel besar), `r-full` hanya untuk kontrol bulat dan avatar |
| Kartu | Batas 1 px `bone-200` + latar `bone-100`; tanpa bayangan standar |
| Elevasi | Satu bayangan saja untuk lapisan melayang (menu, dialog): `0 8px 24px rgba(19,33,31,0.12)`. Stage: tanpa bayangan, pakai lapisan warna |
| Target sentuh/klik | Studio min 48 × 48 px. Stage: kontrol layar min 120 × 120 px |
| Grid dashboard | 12 kolom, gutter 24, lebar konten maks 1280 px |
| Garis ukur | Stroke 1,5 px (near-field), 6 px (Stage) |

---

## 7. Ikon dan Overlay Kerangka

- **Ikon fungsional:** set garis konsisten, stroke 1,75 px pada kanvas 24 px, ujung bulat, tanpa isian. Ikon latihan (bahu, lutut, siku, batang tubuh) digambar sebagai figur garis dengan sendi relevan ditandai titik.
- **Overlay kerangka (FR-5.1):**
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
| `motion-quick` | 160 ms | `cubic-bezier(0.2, 0, 0, 1)` | Hover, fokus, chip |
| `motion-standard` | 240 ms | sama | Transisi panel, dialog |
| `motion-slow` | 400 ms | `cubic-bezier(0.3, 0, 0, 1)` | Perpindahan antar langkah sesi |

Aturan:
- Tidak ada pantulan (bounce/overshoot) di UI klinis.
- Repetisi tervalidasi: cincin di sekitar hitungan berdenyut sekali (skala 1,0 → 1,06 → 1,0, 320 ms) disertai nada naik. Tanpa konfeti.
- **Target ROM tidak pernah bergerak di tengah set** (PRD 6.3.3). Ketika target berubah di antara set, tanda target bergeser perlahan (400 ms) dengan label "Target 95° → 100°" selama 3 detik, supaya pasien tidak bingung.
- `prefers-reduced-motion`: semua denyut/geser diganti perubahan opasitas atau warna; game tetap bisa dimainkan karena gerakan game berasal dari tubuh pasien, bukan animasi UI.
- Frame budget: animasi UI di Stage hanya properti `transform` dan `opacity`, karena CPU/GPU dibagi dengan inferensi pose. [Medium]

---

## 9. Desain Audio

PRD menegaskan audio wajib (FR-5.2), jadi audio diperlakukan sebagai bagian dari design system, bukan tambahan.

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

### 10.1 Aplikasi Pasien

**A. Kontrol Darurat "Berhenti" (menjawab Risiko #9)**
- Tiga jalur, aktif bersamaan sepanjang sesi:
  1. **Gestur:** kedua lengan disilang di dada, tahan 1 detik. Cincin kemajuan muncul di tengah layar selama penahanan; lepas sebelum penuh = batal. Perlu uji false-positive dengan gerakan latihan yang sebenarnya. [perlu validasi klinis dan teknis]
  2. **Suara:** "Berhenti". Syarat: pengenalan ucapan on-device dalam Bahasa Indonesia. **Kelayakan perlu diverifikasi** dan tidak boleh mengirim audio ke server (bertentangan dengan 8.2).
  3. **Tombol layar:** 128 × 128 px, pojok kanan bawah, isian koreksi, label "BERHENTI" dengan sublabel "Terasa nyeri". Bisa dijangkau oleh pendamping atau saat pasien sudah dekat.
- Efek: sesi langsung jeda, tampilan menenangkan ("Istirahat dulu. Tidak apa-apa."), target turun ke level termudah (PRD 6.3.5), dan kejadian dicatat untuk terapis.

**B. Daftar Periksa Pra-sesi (FR-1.2, FR-1.3)**
- Empat baris: Kamera, Izin kamera, Cahaya, Ruang. Status: menunggu (lingkaran kosong), baik (centang), perhatian (segitiga), gagal (silang). Setiap baris selalu punya kalimat tindakan, bukan kode.
- Contoh: "Ruangan agak gelap. Nyalakan lampu di depan Anda."
- Tombol "Mulai" tetap aktif pada status *perhatian* (jangan memblokir pasien karena cahaya yang masih cukup), nonaktif hanya pada *gagal*.

**C. Siluet Kalibrasi (FR-2.1 sampai 2.6)**
- Garis siluet 6 px; netral (`stage-muted`) → hampir (kuning) → terkunci (hijau) + cincin kemajuan 3 detik (FR-2.4).
- Dua kurung di tepi atas dan bawah layar menandai rentang tinggi tubuh ideal 60–85% (FR-2.2), supaya "jarak ideal" bisa dilihat, bukan hanya didengar.
- Instruksi jarak: satu kata raksasa dengan panah ("MUNDUR ↓"), sinkron dengan audio.
- Setelah 45 detik gagal: panel tutorial singkat muncul tanpa menghentikan kamera; tombol "Coba lagi" tanpa batas.

**D. Pose-to-Confirm**
- Cincin yang terisi selama pose tahan (2 detik) untuk memulai misi atau lanjut set. Mengganti klik pada fase berdiri. Selalu ada alternatif keyboard (Spasi) untuk pendamping.

**E. ROM Arc Gauge (komponen penanda produk)**
- Setengah lingkaran 0–180° dengan skala halus.
- Lapisan, dari dalam ke luar: *track* netral → *isian capaian* (sudut saat ini) → **tanda target** (ember, jarum tebal) → **minimum fungsional** (takik kecil) → **zona di atas safety ceiling** diarsir diagonal dan tidak pernah terisi.
- Angka sudut besar di tengah, bilangan bulat, tanpa desimal.
- Isian berubah warna dan bentuk ujung sesuai status (Bagian 4.3). Ini menerjemahkan logika adaptive difficulty dan safety ceiling PRD menjadi satu gambar yang bisa dipahami sekilas.
- Ukuran Stage: diameter ≥ 360 px. Studio: 160–240 px.

**F. Chip Repetisi**
| Status | Bentuk | Warna | Label |
|---|---|---|---|
| Valid | Lingkaran penuh + centang | Tercapai | "Valid" |
| Parsial | Lingkaran setengah isi | Hampir | "Parsial" |
| Kompensasi | Cincin dengan garis diagonal | Koreksi | "Kompensasi" |

**G. Hitungan dan Set**
- Satu angka besar `stage-metric` ("7") dengan "dari 10" memakai `stage-label`. Titik-titik kecil di bawahnya memperlihatkan riwayat chip rep dalam set.

**H. Indikator Sinkron (FR-6.3, Risiko #7)**
- Empat keadaan: "Tersimpan di perangkat", "Menyinkronkan…", "Tersinkron", "Belum tersinkron, akan dicoba lagi". Ikon + teks, tidak pernah berupa titik warna saja. Tidak pernah memakai bahasa yang menimbulkan rasa data hilang.

**I. Ringkasan Sesi (FR-6.1, 6.2)**
- Headline serif satu kalimat berfakta ("ROM bahu rata-rata 112° hari ini"). Di bawahnya: tiga angka utama (ROM puncak, akurasi, repetisi valid) dan grafik tren sederhana dengan garis target.
- Kartu "Catatan dari kamera" memuat jumlah repetisi kompensasi dalam bahasa suportif.
- Tanpa skor game yang dominan; skor ditampilkan di baris sekunder agar yang menonjol adalah hasil klinis.
- Kalori: opsional, kecil, berlabel "perkiraan".

### 10.2 Therapist Dashboard

**J. Baris Pasien (Triage, FR-D.1)**
- Kolom: penanda prioritas, nama + diagnosis singkat, adherence 4 minggu (sparkline), perubahan ROM (derajat), tren kompensasi (panah + kata), sesi terakhir.
- **Setiap tanda prioritas wajib disertai alasannya dalam kalimat**, contoh "Adherence turun 3 sesi berturut". Tidak ada skor risiko kotak-hitam, karena Pak Dedi tidak percaya data yang tidak bisa ia telusuri.
- Urutan default: butuh perhatian dulu, lalu menurut sesi terakhir. Bisa difilter.

**K. Grafik ROM (FR-D.2)**
- Garis tunggal per gerakan, satu warna (`primary-600`), pita target (`primary-50`) dan **garis safety ceiling** putus-putus ember. Penanda sesi anomali (Risiko #8) sebagai titik berongga ember dengan tooltip.
- Pelabelan langsung di ujung garis, gridline minimal, sumbu Y dimulai dari nilai yang bermakna secara klinis dengan label sumbu terlihat.
- Selalu ada tag **"Estimasi kamera"** di judul grafik (temuan #8).

**L. Heatmap Adherence (FR-D.2)**
- Kalender dengan **empat** keadaan sel: selesai (isian primary), sebagian (setengah), **terlewat** (silang tipis), **tidak dijadwalkan** (kosong, tanpa tanda). Membedakan hari istirahat dari hari terlewat penting agar pasien tidak tampak lebih tidak patuh dari kenyataannya.

**M. Formulir Resep (FR-D.3, Risiko #10)**
- Bidang: jenis latihan, target ROM, **batas aman maksimum (safety ceiling)**, ROM minimum fungsional, repetisi × set, level awal, frekuensi mingguan.
- Usulan: safety ceiling **tanpa nilai bawaan dan wajib diisi**; tanpa batas aman, algoritma adaptif tidak punya pagar (6.3.4). Ini usulan desain, perlu persetujuan klinis.
- Validasi kewajaran berupa **peringatan lunak** berwarna kuning dengan kalimat penjelas, bukan blokir (sesuai PRD): "Target 150° lebih tinggi dari rentang umum untuk frozen shoulder. Lanjutkan jika sudah sesuai penilaian Anda."
- Pratinjau samping: ROM Arc Gauge yang menampilkan target, minimum, dan ceiling yang sedang diatur, sehingga kesalahan ketik terlihat.
- Ringkasan perubahan sebelum simpan: "Perubahan berlaku pada sesi berikutnya pasien."

**N. Tinjauan Sesi (FR-D.4)**
- Lajur waktu berisi chip repetisi (Bagian 10.1.F) dengan jejak sudut di bawahnya. Repetisi kompensasi diberi anotasi otomatis; klik membuka kartu detail (sudut puncak, tempo, sendi penyebab).
- Tidak ada pemutar video di v1 (temuan #5). Jika replay kerangka disetujui kelak, ruang untuk panel ini dicadangkan di tata letak.

**O. Catatan Klinis vs Data Otomatis (FR-D.5)**
- Data otomatis: latar `bone-100`, tag "Otomatis".
- Catatan terapis: latar putih, garis kiri 3 px `primary-600`, nama dan waktu penulis. Dua gaya ini tidak boleh dicampur dalam satu kartu.

**P. Peran dan Akses (FR-D.6)**
- Lencana peran (Admin, Terapis, Staf baca-saja). Kontrol yang tidak diizinkan ditampilkan nonaktif dengan alasan ("Hanya terapis yang dapat mengubah resep"), bukan disembunyikan, supaya perilaku RBAC bisa dimengerti. Jejak audit akses disajikan sebagai daftar kronologis sederhana.

---

## 11. Tata Letak Per Langkah (Alur Pasien)

| Langkah | Mode | Tata letak inti |
|---|---|---|
| 1. Mulai Sesi | Studio, near-field | Daftar misi hari ini (kartu besar) + daftar periksa pra-sesi |
| 2. Kalibrasi | Stage, far-field | Kamera penuh, siluet, kurung rentang, instruksi satu kata, tes pendengaran |
| 3. Main Misi | Stage | Game penuh; HUD solid di tepi: hitungan (kiri atas), ROM gauge (kanan atas), cue (tengah bawah), tombol Berhenti (kanan bawah) |
| 4. Analisis Gerak | Stage | Kerangka berwarna di atas video redup, tanpa teks tambahan |
| 5. Umpan Balik | Stage | Cue ≤ 2 detik, nada, denyut cincin |
| 6. Ringkasan | Studio, near-field | Headline serif, tiga angka, grafik tren, status sinkron |

Perpindahan Stage ↔ Studio memakai transisi `motion-slow` dengan jeda napas 600 ms supaya pasien yang baru berhenti bergerak sempat menyesuaikan.

Rekomendasi implementasi: **hanya elemen gameplay yang dirender di Unity.** Pra-sesi, kalibrasi teks, ringkasan, pengaturan, dan seluruh dashboard dirender sebagai DOM biasa karena kanvas WebGL tidak terbaca pembaca layar dan sulit diperbesar. [Medium, praktik umum, perlu dikonfirmasi tim Game Dev]

---

## 12. Arah Visual Game

- **Gaya:** diagram kinetik. Lapisan bentuk datar, garis tipis, tekstur butir halus, tanpa gradien mengilap. Palet dari token Stage ditambah satu warna aksen per dunia (mis. teal laut, ocher gurun, biru malam).
- **Karakter:** tidak ada maskot. Pahlawan adalah **kerangka garis pasien sendiri** yang tumbuh menjadi bentuk sesuai mekanik (sayap garis untuk fleksi bahu, busur untuk abduksi). Ini menghemat aset, memperkuat rasa "gerakanku adalah kontrol", dan menghindari infantilisasi pada Bu Ratna.
- **Rintangan/target:** bentuk geometris sederhana yang kontras dengan latar, ukuran besar, jumlah di layar dibatasi (maks tiga sekaligus).
- **Pemetaan PRD 6.1:** Shoulder Flexion → glider yang naik; Abduction → menangkap benda kiri/kanan; Squat → menyelam menembus blok; Elbow Flexion → menarik tuas; Trunk Rotation → membelokkan kendaraan. Isyarat visual setiap gerakan selalu menampilkan **ROM gauge**, jadi pasien melihat sudutnya, bukan hanya efek game.
- **Mode (5.2):** Story (dunia berurutan), Training (tanpa skor, hanya gauge), Challenge (garis personal-best sebagai "hantu" yang dikejar, default bandingkan dengan diri sendiri), Daily Quest (satu kartu harian dengan ring penyelesaian).

---

## 13. Suara dan Nada Penulisan (Microcopy, Bahasa Indonesia)

Prinsip: tenang, singkat, konkret, tidak menggurui, tidak berlebihan memuji. Sapaan netral "Anda"; pasien dapat memilih nama panggilan.

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

Aturan: satu tanda seru per layar paling banyak; tidak ada istilah teknis ("landmark", "confidence", "ROM" di sisi pasien; gunakan "sudut gerak" atau "seberapa tinggi lengan terangkat" sesuai konteks).

---

## 14. Aksesibilitas (Ringkas, Mengacu PRD 8.4)

- Kontras mengikuti tabel 4.5 (AA terpenuhi untuk semua pasangan teks yang dipakai; AAA untuk teks utama).
- Dua modalitas untuk semua umpan balik kritikal: visual (bentuk + teks) dan audio.
- Skala ukuran pengguna 1,0 / 1,25 / 1,5 untuk seluruh Stage dan UI pasien.
- Fokus keyboard terlihat: cincin 3 px `primary-600` dengan offset 2 px di Studio.
- Pembaca layar untuk seluruh DOM; label ARIA pada gauge ("Sudut bahu 112 derajat, target 120, batas aman 140").
- `prefers-reduced-motion` dihormati (Bagian 8).
- Tidak ada konten berkedip lebih dari 3 kali per detik.
- Mode kontras tinggi sebagai varian token (rencana, belum didefinisikan angka di draft ini).

**Perlu diuji dengan manusia, bukan hanya dihitung:** keterbacaan 2 m, pembedaan tiga status pada buta warna, kejelasan gestur Berhenti, dan terdengarnya nada pada speaker laptop murah.

---

## 15. Token (Cuplikan Siap Pakai)

Sumber tunggal sebaiknya berupa JSON token dan diekspor ke CSS dan Unity (alat seperti Style Dictionary dapat dipakai; verifikasi kecocokan dengan pipeline tim). Cuplikan CSS berikut menunjukkan pemetaannya.

```css
:root {
  /* Studio */
  --bone-50:#F8F5EF; --bone-100:#F0EBE1; --bone-200:#E3DCCD; --bone-300:#CFC6B3;
  --edge-strong:#8C8472;
  --ink-900:#13211F; --ink-700:#34443F; --ink-600:#4A5B56; --ink-500:#5C6B66;
  --primary-50:#E4EFEA; --primary-600:#17594F; --primary-700:#0F443C;
  --ember-400:#F07A4F; --ember-500:#E4572E; --ember-600:#C2410C;

  /* Status (light) */
  --status-reach:#0B6B4A; --status-near:#7A5200; --status-comp:#A82C16;

  /* Type */
  --font-ui:"Atkinson Hyperlegible Next", system-ui, "Segoe UI", Roboto, sans-serif;
  --font-serif:"Newsreader", Georgia, serif;

  /* Space & shape */
  --space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px; --space-6:24px; --space-8:32px;
  --r-sm:4px; --r-md:8px; --r-lg:16px;

  /* Motion */
  --ease:cubic-bezier(0.2,0,0,1);
  --dur-instant:80ms; --dur-quick:160ms; --dur-std:240ms; --dur-slow:400ms;
}

[data-surface="stage"] {
  --bg:#0E1514; --panel:#162321; --track:#1F312E;
  --text:#F2EFE8; --muted:#A9B5B0;
  --status-reach:#4FD6A5; --status-near:#F5C04A; --status-comp:#FF7A5C;
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
| 6 | Uji lapangan 2 m dengan pengguna lansia dan simulasi buta warna | UX Research | Mengunci skala Stage dan palet status |
| 7 | Lisensi dan ketersediaan font, set glyph | Design + Legal | Mengunci tipografi |
| 8 | Aset logo "busur goniometer" dan wordmark | Design | Belum dibuat |

---

## 17. Langkah Berikutnya yang Disarankan

1. Anda review dokumen ini (terutama Bagian 0 dan 16).
2. Setelah disetujui: ekspor token ke JSON, buat halaman pratinjau HTML (swatch, tipografi, ROM Arc Gauge, chip repetisi, siluet kalibrasi dalam dua suasana), lalu spesifikasi handoff untuk tim Frontend dan Unity.

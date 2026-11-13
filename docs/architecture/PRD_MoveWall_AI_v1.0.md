# Product Requirements Document (PRD)
# MoveWall AI — Platform Tele-Rehabilitasi Interaktif Berbasis Computer Vision

---

## 1. Document Information & Version Control

| Field | Detail |
|---|---|
| Nama Produk | MoveWall AI |
| Jenis Dokumen | Product Requirements Document (PRD) |
| Versi Dokumen | 1.0 |
| Status | Draft — Ready for Engineering Review |
| Tanggal Diterbitkan | 28 Juli 2026 |
| Disusun Oleh | Principal Product Manager — HealthTech & Computer Vision |
| Klasifikasi Dokumen | Internal / Confidential |
| Target Pembaca | Engineering (Frontend, ML/CV, Backend, Game Dev), Clinical Advisory Board, QA, Design, Business/Compliance |

### 1.1 Riwayat Revisi

| Versi | Tanggal | Penulis | Deskripsi Perubahan |
|---|---|---|---|
| 0.1 | — | PM Team | Draft awal konsep produk |
| 1.0 | 28 Jul 2026 | Principal PM | Finalisasi arsitektur tele-rehab berbasis laptop webcam, penyesuaian algoritma ROM, penambahan spesifikasi Therapist Dashboard |

### 1.2 Dokumen Terkait
- Clinical Validation Protocol (terpisah)
- Technical Architecture Design Document (TADD) — Engineering
- Data Privacy & HIPAA Compliance Assessment
- UX Research Report — Home Rehabilitation Usability Study

---

## 2. Executive Summary & Value Proposition

### 2.1 Latar Belakang Masalah

Kepatuhan (adherence) pasien terhadap program fisioterapi rumahan secara historis sangat rendah — mayoritas pasien berhenti melakukan latihan mandiri dalam 4–6 minggu karena kurangnya umpan balik real-time, motivasi, dan pengawasan objektif dari terapis. Di sisi lain, solusi rehabilitasi berbasis Computer Vision yang ada di pasar saat ini umumnya bergantung pada perangkat keras mahal (kamera depth/3D seperti Kinect/RealSense, atau instalasi proyektor khusus klinik), sehingga hanya dapat diakses di fasilitas klinis dan tidak scalable untuk penggunaan rumahan (home-based tele-rehabilitation).

### 2.2 Solusi: MoveWall AI

MoveWall AI adalah platform rehabilitasi fisioterapi interaktif berbasis gamifikasi yang mengonversi pergerakan tubuh pasien — ditangkap secara real-time melalui webcam laptop standar (2D RGB, tanpa depth sensor) — menjadi *game controller* fisik. Dengan memanfaatkan on-device pose estimation (Google ML Kit / BlazePose–MediaPipe) dan game engine Unity/WebGL, pasien menjalani sesi terapi dalam bentuk misi permainan yang menstimulasi gerakan terapeutik spesifik (Shoulder Flexion, Abduction, Squat, dll.), sambil sistem secara objektif mengukur Range of Motion (ROM), akurasi gerakan, dan repetisi.

### 2.3 Diferensiasi Utama

1. **Zero Special Hardware** — Cukup laptop + webcam bawaan/eksternal, tidak memerlukan sensor depth atau proyektor.
2. **On-Device Edge AI** — Pemrosesan pose estimation dilakukan lokal di perangkat pasien, menjaga privasi data biometrik dan meniadakan latensi jaringan pada loop analisis gerak.
3. **Clinical-Grade Objectivity** — ROM dihitung secara matematis (vektor & trigonometri), bukan estimasi subjektif, sehingga hasilnya dapat diaudit dan direview klinis.
4. **Closed-Loop Care** — Terapis dapat meresepkan target ROM/level secara remote melalui Therapist Dashboard dan memantau progres berbasis data objektif.

### 2.4 Value Proposition per Stakeholder

| Stakeholder | Value Proposition |
|---|---|
| Pasien | Terapi rumahan yang tidak membosankan, umpan balik instan, rasa pencapaian melalui gamifikasi |
| Fisioterapis | Visibilitas objektif terhadap kepatuhan & progres pasien tanpa perlu tatap muka setiap sesi |
| Fasilitas Kesehatan/Payer | Menurunkan biaya kunjungan klinik berulang, meningkatkan outcome melalui data adherence yang terukur |

---

## 3. Product Goals & Success Metrics

### 3.1 North Star Metric (NSM)

> **Weekly Therapeutic Engagement Score (WTES)** — jumlah repetisi gerakan tervalidasi klinis (valid reps, ROM tercapai sesuai target terapis) yang diselesaikan pasien per minggu, dinormalisasi terhadap resep terapis.

NSM ini dipilih karena secara simultan merepresentasikan *engagement* (pasien mau bermain) dan *clinical value* (gerakan yang dilakukan valid secara terapeutik), bukan sekadar waktu penggunaan aplikasi.

### 3.2 Metrik Klinis (Clinical Outcome Metrics)

| Metrik | Definisi | Target |
|---|---|---|
| ROM Improvement Rate | Delta rata-rata ROM (derajat) pasien dari baseline ke sesi ke-N | ≥10° peningkatan dalam 4 minggu (kondisi tergantung diagnosa) |
| Exercise Accuracy Score | % repetisi yang memenuhi threshold ROM & postur yang diresepkan terapis | ≥85% pada sesi minggu ke-3 |
| Prescription Adherence Rate | % sesi yang diselesaikan sesuai jadwal yang diresepkan terapis | ≥70% |
| Compensatory Movement Incidence | Frekuensi terdeteksinya gerakan kompensasi (mis. mengangkat bahu saat fleksi siku) | Tren menurun per minggu |

### 3.3 Metrik Produk & Retensi

| Metrik | Definisi | Target |
|---|---|---|
| D1/D7/D30 Retention | % pasien yang kembali pada hari 1/7/30 | D7 ≥ 60%, D30 ≥ 40% |
| Session Completion Rate | % sesi yang dimulai dan diselesaikan hingga Session Summary | ≥80% |
| Time-to-First-Valid-Rep | Waktu dari Start Session hingga repetisi valid pertama tercatat | <90 detik |
| Calibration Success Rate | % percobaan kalibrasi yang berhasil tanpa perlu bantuan CS | ≥90% |
| Churn setelah Sesi Buruk | % pasien yang tidak kembali setelah sesi dengan skor rendah/error teknis | Dipantau sebagai leading indicator kegagalan produk |

### 3.4 Metrik Bisnis Fisioterapis (Dashboard)

- Jumlah pasien aktif dipantau per terapis per minggu.
- Waktu rata-rata terapis untuk mereview 1 pasien (target: <3 menit/pasien/minggu berkat visualisasi data).
- Tingkat penyesuaian preskripsi (menunjukkan engagement terapis terhadap dashboard).

---

## 4. User Personas

### 4.1 Persona Pasien — "Bu Ratna, 58 Tahun, Pasca Frozen Shoulder"

- **Konteks:** Menjalani rehabilitasi mandiri di rumah, 3x/minggu sesuai resep terapis, tidak terlalu melek teknologi.
- **Kebutuhan:** UI besar dan jelas, instruksi audio (karena sering tidak melihat layar dari jarak jauh saat bergerak), sesi singkat (10–15 menit) agar tidak lelah.
- **Frustrasi Utama:** Takut melakukan gerakan salah tanpa pengawasan, mudah menyerah jika aplikasi terasa rumit/error.
- **Kondisi Fisik:** ROM terbatas, gerakan lambat, sensitif terhadap nyeri — sistem harus mendeteksi *tidak memaksa* melampaui batas nyaman.

### 4.2 Persona Pasien — "Adit, 29 Tahun, Pasca Cedera ACL Lutut (Atlet Amatir)"

- **Konteks:** Termotivasi tinggi, ingin kembali beraktivitas cepat, familiar dengan game.
- **Kebutuhan:** Tantangan progresif (Challenge Mode), leaderboard/skor, kontrol presisi tinggi untuk squat/lunge.
- **Frustrasi Utama:** Bosan jika latihan terasa repetitif dan "kurang menantang"; ingin melihat data kuantitatif progres.

### 4.3 Persona Terapis — "Pak Dedi, Fisioterapis Klinik Rehabilitasi"

- **Konteks:** Menangani 40–60 pasien aktif, waktu terbatas untuk memantau tiap pasien secara manual.
- **Kebutuhan:** Dashboard ringkas dengan alert prioritas (pasien yang butuh perhatian), kemampuan mereskripsi target ROM/level jarak jauh tanpa perlu sesi tatap muka.
- **Frustrasi Utama:** Tidak percaya pada data self-report pasien; butuh data objektif dan dapat diaudit (grafik ROM historis, video/replay gerakan bermasalah).

---

## 5. Detailed Functional Requirements

### 5.1 Patient Flow — 6 Langkah Utama

#### Step 1 — Start Session
- **FR-1.1:** Sistem menampilkan daftar misi/latihan yang telah diresepkan terapis untuk hari tersebut (jika ada), atau opsi Free Play jika tidak ada resep aktif.
- **FR-1.2:** Sistem melakukan pre-flight check otomatis: deteksi ketersediaan kamera, izin akses kamera, dan kualitas pencahayaan minimum (brightness threshold).
- **FR-1.3:** Jika perangkat tidak memenuhi syarat minimum (resolusi kamera, frame rate), sistem menampilkan pesan non-teknis yang actionable (mis. "Pencahayaan ruangan terlalu gelap, coba nyalakan lampu tambahan").

#### Step 2 — Calibration (Ruang & Jarak Webcam)
- **FR-2.1 Kalibrasi Jarak:** Sistem menampilkan silhouette/outline tubuh di layar dan meminta pasien memposisikan diri hingga 33 landmark BlazePose terdeteksi penuh dalam frame (full-body atau upper-body sesuai jenis latihan).
- **FR-2.2 Validasi Jarak Ideal:** Sistem menghitung rasio tinggi bounding-box tubuh terhadap tinggi frame kamera; jarak ideal dikonfirmasi bila rasio berada dalam rentang 60–85% tinggi frame (dapat dikonfigurasi per jenis latihan — full body butuh jarak lebih jauh ±2–2.5m, upper body ±1–1.5m).
- **FR-2.3 Audio Guidance:** Instruksi kalibrasi disampaikan via audio ("Mundur sedikit", "Maju sedikit", "Sempurna, tahan posisi") karena pasien mungkin tidak selalu fokus membaca teks di layar saat mengatur posisi tubuh.
- **FR-2.4 Deteksi Ruang:** Sistem memverifikasi tidak ada oklusi signifikan pada area gerak (mis. furnitur menghalangi anggota badan yang diperlukan) melalui pemeriksaan confidence score landmark selama 3 detik observasi.
- **FR-2.5 Baseline Capture:** Setelah kalibrasi sukses, sistem merekam pose netral (neutral/rest pose) pasien sebagai baseline referensi sudut sendi untuk sesi tersebut.
- **FR-2.6 Timeout & Retry:** Jika kalibrasi gagal setelah 45 detik, sistem menawarkan tutorial visual singkat (video demo posisi ideal) dan opsi retry tanpa batas.

#### Step 3 — Play Mission (Game)
- **FR-3.1:** Game merender karakter/avatar yang dikendalikan oleh pemetaan landmark tubuh pasien terhadap parameter game (lihat Section 6).
- **FR-3.2:** Setiap misi memiliki target gerakan spesifik (sudut ROM target, jumlah repetisi, tempo) yang diambil dari resep terapis atau preset default berdasarkan jenis cedera.
- **FR-3.3:** Game loop berjalan pada target 30 FPS minimum untuk menjaga persepsi responsivitas kontrol gerak.

#### Step 4 — Real-Time Motion Analysis
- **FR-4.1:** Setiap frame, sistem mengekstrak koordinat 33 landmark dan menghitung sudut sendi relevan menggunakan algoritma vektor (lihat Section 7).
- **FR-4.2:** Sistem mengklasifikasikan setiap repetisi ke dalam status: `Valid Rep`, `Partial Rep` (ROM tidak mencapai target minimum), atau `Invalid/Compensatory Rep` (terdeteksi pola kompensasi).
- **FR-4.3:** Sistem men-tracking tempo gerakan (kecepatan angular) untuk mendeteksi gerakan yang terlalu cepat/eksplosif yang berisiko cedera ulang (relevan pasca-operasi).

#### Step 5 — Instant Audio/Visual Feedback & Adaptive Difficulty
- **FR-5.1 Visual Feedback:** Overlay skeleton pada video pasien dengan color-coding: hijau (ROM tercapai), kuning (mendekati target), merah (kompensasi/postur salah).
- **FR-5.2 Audio Feedback (Jarak 2 Meter):** Karena pasien umumnya berjarak 1.5–2.5m dari laptop saat bergerak (tidak dapat membaca teks kecil), seluruh feedback kritikal WAJIB disampaikan via audio dengan spesifikasi:
  - Volume minimum tervalidasi terdengar jelas pada jarak 2m di ruangan rumah tangga standar (ambient noise ~40-50dB).
  - Durasi cue pendek (<2 detik) agar tidak mengganggu ritme gerakan, contoh: "Bagus!", "Naik sedikit lagi", "Pelan-pelan".
  - Cue dibedakan dengan sound-design non-verbal (chime naik = repetisi berhasil, chime turun = perlu perbaikan) untuk aksesibilitas pasien lansia/gangguan pendengaran teks.
  - Prioritas antrian audio: peringatan keselamatan (mis. "Hati-hati, jangan terlalu jauh") > koreksi postur > feedback motivasi, agar tidak terjadi tumpang tindih audio.
- **FR-5.3 Adaptive Difficulty:** Sistem menyesuaikan target ROM/kecepatan misi secara dinamis berdasarkan performa 3–5 repetisi terakhir (algoritma detail di Section 6.3).

#### Step 6 — Session Summary
- **FR-6.1:** Menampilkan ringkasan: ROM maksimum/rata-rata dicapai per gerakan, Accuracy Score (%), total Reps (valid/partial/invalid), skor game, durasi sesi, kalori estimasi (opsional, non-klinis).
- **FR-6.2:** Perbandingan otomatis terhadap sesi sebelumnya (tren naik/turun) ditampilkan sebagai grafik sederhana.
- **FR-6.3:** Data sesi disinkronkan otomatis ke backend/Therapist Dashboard begitu koneksi internet tersedia (queue offline-first, lihat Section 8.3).
- **FR-6.4:** Sistem memberikan rekomendasi non-diagnostik (mis. "Hebat! Coba tingkatkan level besok" atau "Istirahat cukup sebelum sesi berikutnya") — tanpa memberikan saran medis yang menggantikan keputusan terapis.

### 5.2 Game Modes

| Mode | Deskripsi | Tujuan Klinis |
|---|---|---|
| **Story Mode** | Narasi berjenjang dengan progresi misi, cocok untuk pasien baru membangun kebiasaan | Membangun adherence jangka panjang melalui motivasi naratif |
| **Training Mode** | Latihan bebas tanpa tekanan skor, fokus pada pengulangan gerakan dasar | Onboarding gerakan baru, latihan dasar sesuai resep |
| **Challenge Mode** | Target waktu/skor tinggi, leaderboard, kesulitan meningkat cepat | Pasien dengan progres lanjut, meningkatkan intensitas terkontrol |
| **Daily Quest** | Misi harian singkat (5–10 menit) dengan reward, dirancang untuk kebiasaan konsisten | Mendorong retensi harian dan kepatuhan jadwal terapi |

### 5.3 Therapist Dashboard (Web Portal)

- **FR-D.1 Patient List & Triage:** Daftar pasien dengan indikator prioritas otomatis (mis. adherence menurun, ROM stagnan, tingkat compensatory movement tinggi) agar terapis fokus pada kasus berisiko.
- **FR-D.2 Grafik Progres Individual:** Visualisasi time-series ROM per jenis gerakan, accuracy trend, dan adherence calendar heatmap.
- **FR-D.3 Preskripsi Remote:** Terapis dapat mengatur/mengubah: jenis latihan, target ROM (derajat), jumlah repetisi/set, level kesulitan awal, dan frekuensi mingguan — perubahan tersinkronisasi ke aplikasi pasien pada sesi berikutnya.
- **FR-D.4 Review Sesi Detail:** Terapis dapat membuka log sesi tertentu untuk melihat breakdown per repetisi, termasuk anotasi otomatis pada repetisi yang terdeteksi kompensasi.
- **FR-D.5 Catatan Klinis:** Terapis dapat menambahkan catatan kualitatif per sesi/pasien (disimpan terpisah dari data otomatis sistem).
- **FR-D.6 Multi-Klinik/Role Management:** Dukungan struktur organisasi (admin klinik, terapis, akses read-only untuk staf pendukung) dengan role-based access control (RBAC).

---

## 6. Game Mechanics & Adaptive Difficulty Algorithm Specifications

### 6.1 Prinsip Pemetaan Gerak ke Kontrol Game

Setiap jenis latihan terapeutik dipetakan ke mekanik kontrol game spesifik agar gerakan yang dibutuhkan secara klinis selalu menjadi satu-satunya cara untuk maju dalam permainan (tidak bisa "dicurangi" dengan gerakan lain):

| Latihan Klinis | Sudut Sendi yang Diukur | Mekanik Game |
|---|---|---|
| Shoulder Flexion | Sudut bahu (hip–shoulder–elbow/wrist) pada bidang sagital | Mengangkat "sayap" karakter untuk terbang/menghindar rintangan di atas |
| Shoulder Abduction | Sudut bahu pada bidang frontal | Merentangkan tangan untuk "menangkap" objek di kiri/kanan layar |
| Squat | Sudut lutut (hip–knee–ankle) & sudut hip | Menekan/menghancurkan blok di bawah, karakter "menyelam" |
| Elbow Flexion | Sudut siku (shoulder–elbow–wrist) | Menarik tuas/pedang virtual |
| Trunk Rotation | Sudut rotasi bahu relatif terhadap panggul (proyeksi 2D) | Mengarahkan kendaraan/karakter berbelok |

### 6.2 Struktur Skor

`Session Score = (Σ Valid Rep Points) + (ROM Bonus) + (Consistency Bonus) − (Compensation Penalty)`

- **Valid Rep Points:** Poin dasar per repetisi yang memenuhi threshold ROM minimum & tempo wajar.
- **ROM Bonus:** Bonus proporsional jika ROM melebihi target namun masih dalam batas aman (dibatasi hard-cap sesuai profil cedera pasien untuk mencegah over-stretching).
- **Consistency Bonus:** Diberikan jika variasi ROM antar-repetisi dalam satu set rendah (menandakan kontrol motorik stabil).
- **Compensation Penalty:** Pengurangan skor (bukan blocking) saat gerakan kompensasi terdeteksi, agar pasien tetap termotivasi namun mendapat sinyal koreksi.

### 6.3 Algoritma Adaptive Difficulty

Sistem menggunakan pendekatan **Rolling Performance Window** (window = 5 repetisi terakhir):

1. Hitung `Success Rate (SR)` = jumlah Valid Rep / total rep dalam window.
2. Hitung `Average ROM Achievement Ratio (ARAR)` = rata-rata (ROM aktual / ROM target) dalam window.
3. Logika penyesuaian setiap akhir set (bukan per-repetisi, untuk menghindari perubahan target yang membingungkan mid-set):
   - Jika `SR ≥ 90%` dan `ARAR ≥ 1.05` → naikkan target ROM sebesar +5% (dibatasi oleh ROM maksimum aman yang ditetapkan terapis) dan tingkatkan kecepatan/kompleksitas misi.
   - Jika `SR` berada di rentang `70%–90%` → pertahankan level (zona optimal — "flow zone").
   - Jika `SR < 70%` → turunkan target ROM sebesar −5–10% dan perlambat tempo misi, tanpa pernah turun di bawah ROM minimum fungsional yang ditetapkan terapis.
4. **Safety Ceiling:** Target ROM adaptif tidak pernah melampaui batas maksimum yang dikonfigurasi terapis di Dashboard (FR-D.3), terlepas dari performa pasien — mencegah risiko over-exertion pasca-cedera.
5. **Pain/Fatigue Signal Override:** Jika pasien menekan tombol "Stop/Nyeri" atau sistem mendeteksi penurunan tempo drastis (>40% dari baseline) yang konsisten dengan fatigue, algoritma langsung menurunkan target ke level termudah pada sesi berjalan, terlepas dari hasil kalkulasi SR/ARAR.

---

## 7. Technical & Mathematical Specifications

### 7.1 Pipeline Pemrosesan (High-Level)

```
Webcam Frame (RGB) 
   → BlazePose/ML Kit Inference (on-device) 
   → 33 Landmark Coordinates (x, y, z*, visibility_score) 
   → Vector Angle Calculation Module 
   → ROM Classification & Rep Counting 
   → Game State Update (Unity/WebGL bridge) 
   → Render + Audio Feedback
```
*z-coordinate dari BlazePose bersifat estimasi relatif (bukan depth sensor sebenarnya) — digunakan sebagai sinyal pendukung, bukan primer, mengingat keterbatasan akurasi pada kamera RGB monokuler.

### 7.2 Algoritma Perhitungan ROM (Vektor & Trigonometri)

Untuk menghitung sudut sendi (misalnya sudut siku dibentuk oleh titik Bahu–Siku–Pergelangan Tangan), sistem menggunakan pendekatan **Dot Product** dari dua vektor yang berpangkal pada titik sendi (vertex):

**Langkah Kalkulasi:**

1. Definisikan tiga landmark: `A` (proksimal, mis. Bahu), `B` (vertex/titik sendi, mis. Siku), `C` (distal, mis. Pergelangan Tangan).
2. Bentuk dua vektor dari vertex `B`:
   - `Vektor BA = (Ax − Bx, Ay − By)`
   - `Vektor BC = (Cx − Bx, Cy − By)`
3. Hitung **Dot Product**:
   - `Dot(BA, BC) = (BAx × BCx) + (BAy × BCy)`
4. Hitung **Magnitudo (panjang)** masing-masing vektor:
   - `|BA| = √(BAx² + BAy²)`
   - `|BC| = √(BCx² + BCy²)`
5. Hitung **Cosinus sudut** antar vektor:
   - `cos(θ) = Dot(BA, BC) / (|BA| × |BC|)`
6. Hitung sudut dalam **Radian** menggunakan fungsi **Arccos**:
   - `θ_radian = arccos(cos(θ))`
7. Konversi Radian ke **Derajat**:
   - `θ_derajat = θ_radian × (180 / 3.14159)`

**Catatan Implementasi:**
- Nilai `cos(θ)` harus di-*clamp* ke rentang `[-1, 1]` sebelum dimasukkan ke fungsi `arccos()` untuk menghindari error `NaN` akibat floating-point rounding saat koordinat mendekati collinear.
- Untuk gerakan yang memerlukan referensi bidang tubuh (mis. Shoulder Abduction vs Flexion, yang secara visual mirip pada kamera 2D single-view), sistem menggunakan **vektor referensi tambahan** (mis. garis horizontal bahu kiri-kanan sebagai bidang frontal referensi) untuk membedakan bidang gerak, dikombinasikan dengan estimasi z-relatif BlazePose sebagai sinyal sekunder.
- Perhitungan dilakukan pada koordinat yang telah dinormalisasi terhadap resolusi frame (0.0–1.0) agar konsisten lintas resolusi kamera.

### 7.3 Rep Counting — State Machine

Repetisi dihitung menggunakan finite state machine berbasis histeresis sudut untuk menghindari "hitungan ganda" akibat noise landmark:

- **State: `RESTING`** → sudut berada dekat baseline netral (dalam toleransi ±X°).
- **Transisi ke `ASCENDING`** saat sudut melewati threshold awal gerakan (mis. >20° dari baseline).
- **State: `PEAK_HOLD`** → sudut mencapai/mendekati target ROM, divalidasi jika bertahan minimal 2 frame berturut (anti-spike noise).
- **Transisi ke `DESCENDING`** → sudut kembali menurun melewati threshold histeresis (lebih rendah dari threshold naik, mis. <15° dari baseline) untuk menghindari flicker di sekitar titik batas.
- **State kembali ke `RESTING`** → repetisi dihitung sah (`Valid Rep`) jika `PEAK_HOLD` tercapai; dihitung `Partial Rep` jika siklus selesai tanpa mencapai threshold minimum.

### 7.4 Penanganan Oklusi & Low-Confidence Landmark (BlazePose)

Karena berbasis kamera RGB monokuler tanpa depth sensor, oklusi (mis. tangan menghalangi tangan lain, tubuh keluar frame parsial) adalah risiko teknis signifikan. Strategi mitigasi:

1. **Visibility/Confidence Score Filtering:** Setiap landmark BlazePose disertai *visibility score* (0–1). Landmark dengan skor di bawah threshold (mis. <0.5) ditandai *low-confidence* dan **tidak digunakan langsung** untuk kalkulasi sudut kritikal pada frame tersebut.
2. **Temporal Smoothing (Filter Kalman/One-Euro Filter):** Koordinat landmark difilter secara temporal untuk mengurangi jitter frame-ke-frame, sekaligus melakukan interpolasi jangka pendek saat terjadi kehilangan deteksi sesaat (1–3 frame).
3. **Graceful Degradation:** Jika oklusi berlangsung >N frame berturut (mis. 500ms), sistem:
   - Menghentikan sementara progres skor game (bukan meng-*invalid*-kan repetisi yang sedang berjalan secara langsung).
   - Memberi feedback audio non-alarmis: "Kembali ke posisi tengah layar" atau "Pastikan tangan terlihat kamera".
4. **Symmetry Fallback:** Untuk latihan bilateral (mis. kedua bahu), jika satu sisi tubuh teroklusi, sistem dapat menggunakan data sisi tubuh yang tidak teroklusi sebagai sinyal sekunder untuk estimasi kasar, namun **tidak mencatatnya sebagai repetisi valid** — hanya untuk menjaga kontinuitas visual game agar tidak "freeze" mendadak.
5. **Kalibrasi Ulang Otomatis:** Jika confidence rendah terjadi terus-menerus (>10 detik), sistem menawarkan re-kalibrasi jarak/posisi tanpa menghentikan sesi secara paksa.

### 7.5 Arsitektur Teknis Ringkas

| Layer | Teknologi |
|---|---|
| Pose Estimation | Google ML Kit Pose Detection (mobile-optimized) / MediaPipe BlazePose (web/desktop) — 33 landmark, on-device |
| Game Rendering | Unity (WebGL build target untuk distribusi browser-based, minim instalasi) |
| Bridge Layer | JavaScript↔Unity WebGL interop / native plugin untuk streaming data landmark ke Unity runtime per frame |
| Backend | Cloud service (session metadata, aggregate metrics, resep terapis) — **bukan** video/pose raw stream |
| Sinkronisasi | Offline-first local storage (IndexedDB/local cache) dengan sync queue saat online |
| Dashboard Terapis | Web portal (React/Vue-based, terpisah dari game client) |

---

## 8. Non-Functional Requirements

### 8.1 Performa & Latensi

| Requirement | Spesifikasi |
|---|---|
| **End-to-End Motion-to-Feedback Latency** | **<30ms** dari frame capture hingga update state game (di luar transmisi jaringan, karena pemrosesan on-device) — kritikal agar kontrol gerak terasa responsif seperti game konvensional. |
| Frame Processing Rate | Minimum 30 FPS pada perangkat kelas menengah (CPU dual/quad-core standar laptop konsumen 5 tahun terakhir) |
| Graceful Degradation pada Perangkat Rendah | Jika FPS turun di bawah 20, sistem otomatis menurunkan resolusi input inference (tanpa menurunkan resolusi render game) untuk mempertahankan responsivitas kontrol |
| Cold Start Time | Model pose estimation harus siap inferensi dalam <5 detik setelah aplikasi dibuka |

### 8.2 Keamanan & Privasi (Security/HIPAA Compliance)

1. **On-Device Processing Principle:** Seluruh pemrosesan video mentah dan ekstraksi landmark dilakukan **sepenuhnya on-device**. Frame video **tidak pernah** dikirim/disimpan ke server — hanya data terstruktur turunan (sudut sendi, skor, metrik agregat) yang disinkronkan ke cloud.
2. **Data Minimization:** Backend hanya menyimpan data numerik/metrik hasil analisis, bukan biometrik mentah (tidak ada penyimpanan citra wajah/tubuh pasien di server).
3. **Enkripsi:** Data in-transit menggunakan TLS 1.2+; data at-rest terenkripsi (AES-256) pada database backend, termasuk data resep terapis dan hasil sesi.
4. **Kepatuhan Regulasi:** Arsitektur dirancang selaras prinsip HIPAA (untuk pasar AS) — access control berbasis peran, audit log akses data pasien (siapa mengakses data pasien mana, kapan), Business Associate Agreement (BAA) dengan vendor cloud. Untuk pasar Indonesia, turut mengacu pada UU Perlindungan Data Pribadi (UU PDP) terkait data kesehatan sebagai kategori data pribadi spesifik.
5. **Consent Management:** Persetujuan eksplisit pasien terkait penggunaan kamera dan tujuan pengolahan data ditampilkan sebelum sesi pertama, dapat ditarik kembali (right to withdraw) kapan saja dari pengaturan akun.
6. **Retensi Data:** Kebijakan retensi data sesi historis dikonfigurasi sesuai regulasi wilayah operasi, dengan opsi penghapusan data atas permintaan pasien (right to erasure).

### 8.3 Reliabilitas & Ketersediaan (Home Use Context)

- **Offline-First Design:** Sesi latihan tetap dapat berjalan penuh tanpa koneksi internet aktif (model on-device tidak butuh koneksi real-time); data sesi di-queue lokal dan disinkronkan otomatis saat konektivitas tersedia.
- **Kompatibilitas Perangkat:** Mendukung webcam bawaan/eksternal standar (minimum resolusi 720p, 30fps) pada sistem operasi Windows/macOS dengan browser modern (untuk build WebGL) tanpa instalasi driver tambahan.
- **Pencahayaan Adaptif:** Sistem melakukan normalisasi kecerahan dasar untuk mentoleransi variasi kondisi pencahayaan rumah tangga (bukan studio terkontrol).

### 8.4 Aksesibilitas

- Kontras warna UI memenuhi standar WCAG AA minimum, mengingat sebagian target pengguna adalah lansia.
- Ukuran font dan elemen UI dapat diperbesar (mengingat jarak pandang pasien dari layar bisa >1.5m selama gerakan aktif).
- Seluruh feedback kritikal tersedia dalam modalitas ganda (visual + audio) sesuai FR-5.2, untuk pasien dengan keterbatasan sensorik parsial.

---

## 9. Risks, Edge Cases & Mitigation Strategies

| # | Risiko/Edge Case | Dampak | Strategi Mitigasi |
|---|---|---|---|
| 1 | Akurasi pose estimation 2D menurun pada gerakan yang melibatkan rotasi sumbu depth (mis. membedakan flexion vs abduction murni dari kamera tunggal) | Kesalahan klasifikasi ROM, feedback klinis tidak akurat | Kombinasi vektor referensi bidang tubuh + validasi klinis threshold konservatif; disclaimer bahwa sistem adalah alat bantu, bukan pengganti asesmen klinis langsung |
| 2 | Pencahayaan rumah buruk / backlighting dari jendela | Landmark tidak terdeteksi, sesi frustrasi bagi pasien | Pre-flight brightness check (FR-1.2), panduan audio real-time untuk reposisi, mode "low-light tolerant" pada model inference |
| 3 | Pasien lansia kesulitan proses kalibrasi mandiri | Drop-off sebelum sesi pertama dimulai | Video tutorial visual, retry tanpa batas, fallback ke panduan telepon/CS untuk sesi onboarding pertama |
| 4 | Pasien memaksakan gerakan melebihi batas aman demi skor tinggi (gamification risk) | Risiko cedera ulang | Safety Ceiling pada Adaptive Difficulty (Section 6.3.4) yang tidak bisa dilewati algoritma; ROM Bonus dibatasi hard-cap dari resep terapis |
| 5 | Perangkat webcam berkualitas rendah/resolusi di bawah minimum | Deteksi landmark tidak stabil | Pre-flight device capability check, pesan non-teknis dengan rekomendasi solusi (mis. pindah posisi, ganti webcam eksternal murah) |
| 6 | Ruangan sempit tidak memungkinkan jarak ideal untuk latihan full-body | Kalibrasi gagal berulang | Mode latihan alternatif "confined space" dengan ROM target disesuaikan untuk jarak lebih dekat, fokus pada gerakan upper-body |
| 7 | Kehilangan koneksi internet saat sesi berlangsung | Ketakutan pasien data sesi hilang | Offline-first architecture (Section 8.3), indikator visual "tersimpan lokal, akan sinkron otomatis" |
| 8 | Pasien menyalahgunakan sistem untuk mendapat skor tanpa gerakan valid (mis. menaruh boneka di depan kamera) | Data adherence palsu memengaruhi keputusan klinis terapis | Continuous landmark plausibility check (mis. validasi proporsi tubuh & gerak natural manusia), flagging sesi anomali untuk review terapis |
| 9 | Pasien dengan kondisi nyeri akut selama sesi | Risiko cedera lanjutan jika sistem terus mendorong repetisi | Tombol "Stop/Nyeri" selalu visible & dapat diakses via 1 klik, override langsung ke Adaptive Difficulty (FR Section 6.3.5) |
| 10 | Terapis salah menetapkan target ROM (human error input) di Dashboard | Preskripsi tidak sesuai kondisi klinis pasien | Validasi range input wajar berdasarkan jenis diagnosa (soft warning, bukan hard block, karena keputusan klinis tetap wewenang terapis) |
| 11 | Variasi bentuk tubuh/pakaian longgar memengaruhi akurasi landmark | Kesalahan pengukuran sudut sendi | Panduan pakaian yang direkomendasikan (kontras dengan latar, tidak terlalu longgar) pada tahap onboarding; model BlazePose dievaluasi terhadap variasi morfologi tubuh dalam clinical validation protocol terpisah |
| 12 | Anak-anak/pengguna non-target menggunakan akun pasien lain | Data sesi tidak valid untuk keputusan klinis | Opsional: face/identity soft-check di awal sesi (bukan biometrik disimpan, hanya validasi lokal), atau reliance pada login akun per sesi |

---

## Lampiran A — Daftar Istilah

- **ROM (Range of Motion):** Rentang sudut gerak sendi, diukur dalam derajat.
- **Landmark:** Titik koordinat anatomis tubuh yang dideteksi model pose estimation (33 titik pada BlazePose).
- **Valid Rep:** Repetisi gerakan yang memenuhi threshold ROM minimum dan pola gerak yang benar secara klinis.
- **Compensatory Movement:** Gerakan substitusi yang tidak diinginkan untuk "mengakali" pencapaian target (mis. mengangkat bahu untuk membantu fleksi siku).
- **On-Device Processing:** Pemrosesan data (dalam hal ini video & pose) yang dilakukan sepenuhnya di perangkat pengguna, tanpa mengirim data mentah ke server.

## Lampiran B — Open Questions untuk Engineering & Clinical Review

1. Apakah diperlukan model kustom terlatih tambahan (fine-tuning) di atas BlazePose default untuk populasi pasien geriatri dengan postur atipikal?
2. Bagaimana strategi validasi klinis formal (uji akurasi ROM MoveWall AI dibandingkan goniometer manual) sebelum klaim "clinical-grade" dapat digunakan dalam materi pemasaran?
3. Apakah dibutuhkan mode kamera eksternal ganda (multi-angle) sebagai upgrade path opsional untuk kasus klinis kompleks di masa depan?
4. Skema monetisasi/lisensi Therapist Dashboard (per-klinik vs per-pasien) — di luar cakupan PRD ini, memerlukan input Business/Finance.

---

*Dokumen ini adalah acuan requirement tingkat produk. Spesifikasi implementasi mendalam (API contracts, skema database, arsitektur infrastruktur cloud) akan dituangkan dalam Technical Architecture Design Document (TADD) terpisah oleh tim Engineering.*

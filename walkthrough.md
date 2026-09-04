# MoveWall AI — System Architecture & Mission 1 Archer Character Upgrade

## Ringkasan Eksekutif

Dokumentasi ini merangkum pemahaman arsitektur sistem **MoveWall AI** (sistem tele-rehabilitasi interaktif berbasis Computer Vision dan proyeksi dinding) serta implementasi perombakan visual dan fisik pada **karakter pemanah (Archer)** di **Misi 1: Apple Archer** (`game-ui/app.js`).

---

## 1. Arsitektur Sistem MoveWall AI

Sistem MoveWall AI dirancang dengan prinsip **Edge-First Computation**, di mana pemrosesan video dan inferensi biomekanika berjalan 100% di sisi klien (komputer pasien/klinik), sehingga menjaga privasi dan latensi minimal (<33ms @ 30 FPS).

```mermaid
graph TB
    subgraph Client ["Client (Laptop Pasien / Ruang Terapi)"]
        Cam["📷 Webcam Capture<br/>getUserMedia (30 FPS)"] --> MP["🤖 Pose Estimation<br/>MediaPipe BlazePose / Tasks Vision"]
        MP --> Filter["📐 Landmark Filtering<br/>One-Euro / EMA Smoothing + Interp"]
        Filter --> ROM["📊 Motion & ROM Engine<br/>Vector Math (Hip-Shoulder-Wrist)"]
        ROM --> StateMachine["⚙️ Rep State Machine<br/>Rest → Concentric → Hold → Eccentric"]
        StateMachine --> Adaptive["🧠 Adaptive Difficulty Engine<br/>Target ROM: 30° s.d. 165°"]
        Adaptive --> Projection["🎮 Interactive Projection Engine<br/>HTML5 Canvas 2D / WebGL (1280x720)"]
    end

    subgraph Hardware ["Hardware Interaktif"]
        Projection --> Projector["📽️ Proyektor Dinding"]
        Projector --> Wall["🧱 Dinding Interaktif / Permukaan Latihan"]
        Patient["🧍 Pasien (Gerakan Tubuh / Bahu)"] -. Ditangkap .-> Cam
        Wall -. Visual Feedback .-> Patient
    end

    subgraph Backend ["Backend & Cloud Layer (Opsional/Sync)"]
        StateData["Aggregated Metrics (Skor, ROM, Akurasi)"] --> API["REST API / WebSocket (FastAPI)"]
        API --> DB[("SQLite / Encrypted DB")]
        API --> Dashboard["👨‍⚕️ Therapist Dashboard (Web SPA)"]
    end

    Projection -. Event Sinkronisasi .-> StateData
```

### Komponen Utama Arsitektur:

1. **Computer Vision & Kinematic Pipeline (`edge_pipeline.py`)**:
   - **`landmark_filter.py`**: Melakukan temporal filtering (One-Euro / EMA filter) untuk meredam jitter landmark tanpa menambah lag, serta interpolasi short-term jika terjadi oklusi sementara (grace period hingga 15 frame).
   - **`angle_calculator.py`**: Menghitung sudut anatomis sendi secara deterministik. Pada Misi 1 (Shoulder Flexion / Elevasi), sudut dihitung dari vektor *shoulder-hip* terhadap vektor *shoulder-wrist*, dilengkapi koreksi rasio aspek kamera.
   - **`rep_state_machine.py`**: Mengontrol siklus repetisi terapi: `REST` $\rightarrow$ `CONCENTRIC` $\rightarrow$ `HOLD` (verifikasi tahanan 2,0 detik pada sudut target) $\rightarrow$ `ECCENTRIC` $\rightarrow$ `COMPLETED`.
   - **`adaptive_engine.py`**: Menyesuaikan tingkat kesulitan secara adaptif berdasarkan kualitas gerakan (smoothness, compensation, hold stability).

2. **Interactive Projection Layer (`game-ui/`)**:
   - Menggunakan kanvas resolusi tinggi yang diproyeksikan ke dinding.
   - **Misi 1 — Apple Archer**: Pasien mengangkat lengan untuk membidik apel virtual di dahan pohon pada sudut ROM target (Level 1: 30°, 45°, 60°, 75°, 90°; Level 2: 105°, 120°, 135°, 150°, 165°).
   - **Misi 2 — Restore the Garden**: Pasien meraih pot tanaman untuk menyiram tanaman pada berbagai koordinat ketinggian dinding.

---

## 2. Perubahan Karakter pada Misi 1 (Apple Archer)

Karakter pemanah sebelumnya digambar dengan bentuk garis dan poligon kaku (tongkat datar, tanpa anatomi alami, tanpa perlengkapan memanah). Telah dilakukan **perombakan total (visual, animasi, proporsi, dan perlengkapan)** pada fungsi `drawArcher()` di [game-ui/app.js](file:///c:/Users/ASUS/Documents/gitmovewall/game-ui/app.js):

### A. Animasi Pernapasan & Dinamika Angin (Breathing & Idle Sway)
- Ditambahkan pernapasan dinamis sinusoidal (`Math.sin(t * 0.0028)`) yang membuat dada, bahu, dan kepala bergerak naik-turun halus secara natural.
- Ditambahkan ayunan angin halus pada ujung bulu topi dan jubah pemanah selaras dengan dedaunan kebun apel.

### B. Anatomi & Postur Memanah Atletis (Archer Stance)
- **Kaki Belakang (Left Leg)**: Kaki penopang dengan paha dan betis berkontur celana ranger kelabu gelap (`#1b2938`), ditekuk stabil menahan tarikan busur.
- **Kaki Depan (Right Leg)**: Kaki tumpuan depan yang kokoh menghadap target apel.
- **Sepatu Bot Kulit (Leather Boots)**: Dilengkapi lipatan kerah bot (*turnover cuffs*) cokelat tua dan sol yang menapak di tanah dengan bayangan kontak (*ground contact shadow*).

### C. Kostum Ranger & Perlengkapan Memanah
- **Tunic & Rompi**: Jubah ranger hijau zamrud berpola gradien (`#1d472c` ke `#275e3a`) dengan bordir emas di kerah dan keliman, dipadukan rompi kulit (*leather jerkin*) berkancing tali silang.
- **Sabuk & Pouch**: Sabuk kulit lebar dengan gesper kuningan poles serta kantong utilitas (*utility pouch*) di pinggul.
- **Quiver & Anak Panah**: Tabung anak panah kulit bersabuk selempang diagonal melintasi dada dengan cincin kuningan. Dari atas tabung mencuat 3 anak panah dengan bulu fletching rapi (merah, emas, hijau) di belakang punggung.

### D. Wajah & Topi Robin Hood / Ranger
- **Ekspresi Wajah Fokus**: Profil rahang dan dagu yang tegas, mata berfokus tajam menatap lurus ke arah target apel, serta alis miring konsentrasi.
- **Topi Berbulu (Bycocket Cap)**: Topi pemanah klasik warna hijau dengan pinggiran belakang melengkung ke atas, dihiasi bulu plume panjang (putih & merah marun) yang melambai tertiup angin.

### E. Lengan, Vambrace & Kinematika Busur
- **Bow Arm (Lengan Depan Pembidik)**: 
  - Elevasi sendi bahu bergerak dinamis mengikuti sudut ROM pasien (`game.controlAngle`) dari 0° hingga 165°.
  - Dilengkapi **Vambrace / Arm-Guard kulit** dengan pelat pelindung dan tali gesper kuningan untuk melindungi lengan dari benturan tali busur.
- **Draw Arm (Lengan Belakang Penarik Tali)**:
  - Siku ditarik tinggi ke belakang dengan sarung jari (*shooting tab*) yang menahan tali busur di dekat pipi/dagu (*anchor point* alami).
  - Saat menahan target (`holdRatio`), tangan penarik mundur lebih dalam menciptakan ketegangan fisik.
- **Recurve Bow & String**:
  - Busur kayu berlaminasi dengan lekukan recurve realistis dan nock tanduk di ujungnya.
  - Saat posisi *hold*, kedua ujung busur melengkung ke dalam menahan beban regangan (*limb flex*).
  - Tali busur ditarik membentuk sudut V tajam tepat di tangan penarik.
- **Anak Panah pada Busur**:
  - Anak panah kayu cedar menempel pada *arrow shelf* di gagang busur, membentang dari tangan penarik maju menembus busur dengan mata panah baja bodkin mengkilap yang mengarah tepat ke target apel.

### F. Integrasi Kinematika Tembakan & Guide
- Fungsi `getBowGripNorm()` ditambahkan agar lintasan proyeksi panah (`fireArrowAtTarget`) dan garis pandu bidikan (`drawReachGuide`) bermula tepat dari genggaman busur pemanah, bukan dari titik statis.

---

## 3. Checklist Task yang Diselesaikan

- [x] **Mempelajari Arsitektur Sistem**: Analisis mendalam terhadap pipeline Edge CV (`edge_pipeline.py`, `landmark_filter.py`, `angle_calculator.py`, `rep_state_machine.py`, `adaptive_engine.py`) dan Game Projection Layer (`game-ui/`).
- [x] **Perombakan Visual Karakter Misi 1**: Mengganti karakter stickman/poligon sederhana dengan karakter pemanah berbusur recurve lengkap, jubah ranger, topi bulu, tabung panah, dan vambrace pelindung lengan.
- [x] **Animasi & Fisika Responsif**: Implementasi animasi napas idle, dinamika angin, lekukan elastis busur saat ditarik (*hold tension*), serta hentakan balik tali panah saat lepas (*release recoil*).
- [x] **Penyelarasan Kinematika Bidikan**: Koordinasi antara sudut ROM bahu pasien dengan sudut elevasi lengan busur dan titik lepas anak panah.
- [x] **Perbaikan Anomali Background**: Menghapus artefak elips bayangan/highlight putih kabur (`drawSceneDepth`) yang melayang di atas pohon apel latar belakang dan memastikan efek kedalaman prosedural hanya aktif jika background gambar referensi tidak tersedia.
- [x] **Verifikasi Browser & Visual Inspection**: Pengujian live di peramban tanpa error konsol dan validasi tangkapan layar tampilan kanvas.
- [x] **Pembaruan Walkthrough & Dokumentasi Task**: Penyusunan arsitektur sistem dan detail perubahan teknis pada file walkthrough ini.

---

## 4. Perbaikan Anomali Background (Translucent Canopy Ellipse)

### Masalah yang Ditemukan:
Pada tampilan background kebun apel, terlihat sebuah bayangan lonjong/elips putih transparan yang melayang di atas dahan pohon apel sebelah kanan (seperti noda/kabut abu-abu).

### Penyebab:
Fungsi `drawSceneDepth()` di `game-ui/app.js` semula dirancang untuk kanvas prosedural fallback (sebelum adanya foto background realistis). Di dalamnya terdapat pemanggilan elips statis:
```javascript
ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
ctx.ellipse(width * 0.78, height * 0.37, width * 0.23, height * 0.13, -0.08, 0, Math.PI * 2);
```
Fungsi ini sebelumnya dipanggil tanpa memeriksa `hasReferenceScene`, sehingga elips tersebut digambar menimpa gambar background realistis.

### Solusi:
1. Menghapus elips statis tersebut dari `drawSceneDepth()`.
2. Memasukkan pemanggilan `drawSceneDepth(width, height)` ke dalam blok `if (!hasReferenceScene)` di fungsi `draw()`, sehingga saat gambar referensi `orchardBackground` aktif, tidak ada efek prosedural yang menimpa kejernihan gambar asli.

---

## 5. Hasil Verifikasi Visual

Tampilan kanvas setelah perombakan karakter dan perbaikan anomali background:

![Verifikasi Karakter Pemanah dan Perbaikan Background Misi 1](C:/Users/ASUS/.gemini/antigravity-ide/brain/6e90442f-6619-4195-8c77-b1fa5790c11c/bg_tree_anomaly_fix_verify_1788445071145.png)

### Catatan Pengujian:
- **Status Server**: Berjalan lancar di `http://localhost:3000`.
- **Background**: Bersih, alami, tanpa artefak/noda kabut transparan di atas pohon.
- **Error Konsol**: 0 error (bersih).
- **Interaksi Kamera & Bidikan**: HUD ROM meter, reticle pengarah sudut, dan elevasi busur bergerak responsif dan proporsional.

---

## Task_2: Therapist Assessment System

### Ringkasan Perubahan

Tiga fitur baru berhasil diimplementasikan:

1. **Halaman Login Therapist** (`game-ui/login.html`) — Entry point baru sistem
2. **Assessment Form Dialog** — Pop-up form di akhir setiap misi (Mission 1 & 2)
3. **Backend API** (`game-ui/backend/`) — Node.js + Express + Prisma ORM + PostgreSQL

---

### Backend Architecture (`game-ui/backend/`)

#### File yang Dibuat:

| File | Deskripsi |
|------|-----------|
| `server.js` | Express server dengan semua API endpoints |
| `prisma/schema.prisma` | Prisma schema dengan model Therapist & Assessment |
| `package.json` | Dependencies: express, prisma, bcryptjs, jsonwebtoken, cors |
| `.env` | Dummy PostgreSQL URI + JWT secret |

#### API Endpoints:

| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| `GET`  | `/api/health` | — | Health check |
| `POST` | `/api/auth/login` | — | Login terapis |
| `POST` | `/api/auth/register` | — | Registrasi terapis |
| `GET`  | `/api/auth/me` | JWT | Ambil data terapis login |
| `POST` | `/api/assessment` | JWT | Simpan assessment pasien |
| `GET`  | `/api/assessments` | JWT | List semua assessment terapis |
| `GET`  | `/api/assessment/:id` | JWT | Detail assessment |
| `POST` | `/api/dev/seed` | — | Seed dummy therapist |

#### Prisma Schema:

**Therapist** (tabel `therapists`):
- `id`, `name`, `username` (unique), `password` (bcrypt hashed)
- `email`, `specialization`, `licenseNumber`, `phoneNumber`
- `role` (enum: USER / THERAPIST), `isActive`, `createdAt`, `updatedAt`

**Assessment** (tabel `assessments`):
- `id`, `therapistId` (FK)
- `patientName`, `patientAge`
- `painAbduction`, `painFlexion`, `painExternalRotation`, `painInternalRotation`, `painExtension` (Boolean)
- `notes` (optional text)
- `missionId`, `sessionScore`, `sessionHits`, `sessionLevel`, `sessionTime`
- `createdAt`

#### Cara Menjalankan Backend:
```bash
cd game-ui/backend
npm install
# Pastikan PostgreSQL berjalan & update DATABASE_URL di .env
npx prisma migrate dev --name init
node server.js
# POST /api/dev/seed  untuk seed dummy therapist01 / movewall2026
```

---

### Login Page (`game-ui/login.html`)

**Desain Premium Glassmorphism:**
- Background animasi dengan 3 orbs berwarna (biru, hijau, ungu) yang bergerak floating
- Grid pattern subtle overlay
- Card glassmorphism dark dengan blur backdrop
- Input fields dengan icon, toggle show/hide password
- Error alert dengan animasi shake, success alert dengan redirect otomatis
- Demo credentials ditampilkan di footer card

**Alur Auth:**
1. Buka sistem → diredirect ke `login.html` (jika belum ada `mw_token` di sessionStorage)
2. Input username + password → `POST /api/auth/login`
3. Sukses → simpan JWT token + therapist info ke `sessionStorage`
4. Redirect ke `index.html` (Mission 1)

**Dummy Credentials (setelah seed):**
- Username: `therapist01`
- Password: `movewall2026`

---

### Assessment Form Dialog — Mission 1 & 2

**Fields yang Ada:**

| Field | Type | Required |
|-------|------|----------|
| Nama Lengkap Pasien | Text input | Ya |
| Usia Pasien | Number input (1–120) | Ya |
| Nyeri Fleksi Bahu | Checkbox | Tidak |
| Nyeri Abduksi Bahu | Checkbox | Tidak |
| Nyeri Rotasi Eksternal | Checkbox | Tidak |
| Nyeri Rotasi Internal | Checkbox | Tidak |
| Nyeri Ekstensi Bahu | Checkbox | Tidak |
| Catatan Terapis | Textarea | Tidak (opsional) |

**Alur Assessment:**
1. Misi selesai → muncul Mission Complete overlay
2. Klik tombol **"Isi Assessment"** (hijau) di overlay
3. Assessment form modal muncul dengan animasi slide-in
4. Badge terapis (dari sessionStorage) ditampilkan di atas form
5. Isi form → klik **"Simpan Assessment"**
6. Loading state → `POST /api/assessment` dengan JWT token
7. Sukses → tampil animasi ✅ success state
8. Data tersimpan ke PostgreSQL via Prisma

**UX Detail:**
- Close dengan tombol ✕, tombol Batal, atau klik backdrop
- Scroll form jika konten panjang (max-height 90vh)
- Custom checkbox dengan visual check mark saat dipilih
- Card checklist berubah warna merah muda saat nyeri dicentang
- Validation inline sebelum submit

---

### File yang Diubah/Dibuat:

| File | Status | Perubahan |
|------|--------|-----------|
| `game-ui/backend/server.js` | ✅ BARU | Express API server |
| `game-ui/backend/prisma/schema.prisma` | ✅ BARU | Prisma schema |
| `game-ui/backend/package.json` | ✅ BARU | Backend dependencies |
| `game-ui/backend/.env` | ✅ BARU | Database URI + JWT secret |
| `game-ui/login.html` | ✅ BARU | Halaman login therapist |
| `game-ui/index.html` | ✅ MODIFIKASI | + tombol assessment + modal assessment |
| `game-ui/mission2.html` | ✅ MODIFIKASI | + tombol assessment + modal assessment |
| `game-ui/app.js` | ✅ MODIFIKASI | + auth guard + assessment dialog logic |
| `game-ui/mission2.js` | ✅ MODIFIKASI | + auth guard + assessment dialog logic |
| `game-ui/styles.css` | ✅ MODIFIKASI | + login page styles + assessment modal styles |

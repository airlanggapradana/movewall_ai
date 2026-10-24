<div align="center">

<img src="./MoveWall_AI_Rehab_Logo__1_transparent.png" alt="MoveWall AI Logo" width="220" />

# MoveWall AI

### Platform Tele-Rehabilitasi & Fisioterapi Interaktif Berbasis Proyeksi Dinding dan Edge Computer Vision

[![Vercel Deployment](https://img.shields.io/badge/Vercel-Live%20App-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://movewall-ai.vercel.app)
[![Railway Backend](https://img.shields.io/badge/Railway-API%20Active-0B0D0E?style=for-the-badge&logo=railway&logoColor=white)](https://movewallai-production.up.railway.app/api/health)
[![Neon Database](https://img.shields.io/badge/Neon-PostgreSQL%20Serverless-00E599?style=for-the-badge&logo=postgresql&logoColor=black)](https://neon.tech)
[![MediaPipe](https://img.shields.io/badge/MediaPipe-Tasks%20Vision-007FFF?style=for-the-badge&logo=google&logoColor=white)](https://developers.google.com/mediapipe)
[![Node.js](https://img.shields.io/badge/Node.js-22%20LTS-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](#lisensi)

<p align="center">
  <a href="https://movewall-ai.vercel.app"><b>🚀 Buka Live Web App</b></a> •
  <a href="https://movewallai-production.up.railway.app/api/health"><b>🚂 Status Backend API</b></a> •
  <a href="#-akses-cepat--kredensial-demo"><b>🔑 Kredensial Demo</b></a> •
  <a href="#-panduan-instalasi--menjalankan-lokal"><b>⚙️ Panduan Menjalankan</b></a> •
  <a href="#-arsitektur-sistem"><b>🏗️ Arsitektur</b></a>
</p>

</div>

---

## 📌 Daftar Isi

- [Ringkasan Eksekutif](#-ringkasan-eksekutif)
- [Fitur Utama & Misi Permainan](#-fitur-utama--misi-permainan)
  - [Misi 1: Apple Archer (Shoulder Flexion)](#-misi-1-apple-archer-shoulder-flexion)
  - [Misi 2: Garden Keeper (Shoulder Reaching & Hand Tracking)](#-misi-2-garden-keeper-shoulder-reaching--hand-tracking)
  - [Portal Asesmen & Dashboard Klinis Terapis](#-portal-asesmen--dashboard-klinis-terapis)
- [Arsitektur Sistem](#-arsitektur-sistem)
- [Teknologi yang Digunakan](#-teknologi-yang-digunakan)
- [Akses Cepat & Kredensial Demo](#-akses-cepat--kredensial-demo)
- [Panduan Instalasi & Menjalankan Lokal](#-panduan-instalasi--menjalankan-lokal)
  - [1. Frontend Web App (`game-ui/`)](#1-frontend-web-app-game-ui)
  - [2. Backend API Service (`game-ui/backend/`)](#2-backend-api-service-game-uibackend)
  - [3. Pipeline Python Edge CV (Riset & Demo Lokal)](#3-pipeline-python-edge-cv-riset--demo-lokal)
- [Struktur Direktori Repositori](#-struktur-direktori-repositori)
- [Referensi REST API](#-referensi-rest-api)
- [Formula Biomekanika & Logika Repetisi](#-formula-biomekanika--logika-repetisi)
- [Kontrol Keyboard Selama Latihan](#-kontrol-keyboard-selama-latihan)
- [Lisensi](#-lisensi)

---

## 📖 Ringkasan Eksekutif

**MoveWall AI** adalah platform tele-rehabilitasi fisioterapi interaktif yang mengubah latihan fisik menjadi permainan berbasis misi (*gamified therapeutic exercises*). Sistem ini dirancang untuk memfasilitasi proses pemulihan motorik anggota gerak atas (khususnya sendi bahu pasca *rotator cuff tear*, *frozen shoulder*, *stroke hemiparesis*, maupun pasca-operasi) melalui proyeksi dinding atau layar monitor.

### Nilai Utama Sistem:
1. **Zero Special Hardware**: Bekerja dengan webcam standar (2D RGB tanpa sensor depth atau hardware eksternal mahal).
2. **Edge-First Computation**: Estimasi pose tubuh dan komputasi sudut kinematika dieksekusi 100% di sisi klien (WebAssembly & Canvas 2D/WebGL), menjaga latensi minimal (<33ms @ 60 FPS) serta melindungi privasi data biometrik pasien.
3. **Objektivitas Klinis**: Pengukuran *Range of Motion* (ROM) dan ritme repetisi dihitung secara matematis melalui vektor deterministik, bukan estimasi subjektif.
4. **Closed-Loop Care**: Terhubung langsung ke portal dokter/fisioterapis untuk memantau toleransi nyeri ROM, riwayat sesi longitudinal, dan generator dokumen rekam medis resmi format PDF standar rumah sakit.

---

## 🎮 Fitur Utama & Misi Permainan

```
                        ┌──────────────────────────────────────────────┐
                        │                 MOVEWALL AI                  │
                        └───────┬──────────────────────────────┬───────┘
                                │                              │
                ┌───────────────┴───────────────┐              │
                ▼                               ▼              ▼
       🎯 MISI 1: APPLE ARCHER         🌿 MISI 2: GARDEN KEEPER  📊 CLINICAL DASHBOARD
       • Shoulder Flexion 30°-165°     • Shoulder Reaching       • Global Clinic KPIs
       • Karakter Pemanah Recurve      • Hand Open/Close Track   • ROM Pain Matrix (5 Arah)
       • Rep State Machine (Hold 3s)   • Lv 1: Sekuensial        • Riwayat Sesi Longitudinal
       • Form Asesmen Nyeri            • Lv 2: Mode Acak Dinamis • 1-Click PDF Medical Report
                                       • Deteksi "Sangat Sembuh" • Billing Midtrans Gateway
```

### 🎯 Misi 1: Apple Archer (Shoulder Flexion)
- **Tujuan Klinis**: Melatih elevasi sagital bahu (*Shoulder Flexion*) dan stabilitas ritme skapulohumeral.
- **Mekanika Latihan**: Pasien mengangkat lengan untuk mengarahkan busur panah ke apel virtual pada target sudut ROM tertentu:
  - **Level 1 (5 hit)**: Target sudut bertahap: `30°`, `45°`, `60°`, `75°`, `90°`.
  - **Level 2 (5 hit)**: Target sudut elevasi lanjut: `105°`, `120°`, `135°`, `150°`, `165°`.
- **Karakter & Fisika**: Visual karakter pemanah (*Archer*) dengan kostum ranger realistis, tabung panah (*quiver*), *vambrace* pelindung lengan, animasi napas dinamis, ketegangan busur elastis saat *hold*, serta hentakan anak panah proporsional.
- **Verifikasi Repetisi**: Pasien wajib menahan posisi bidikan selama **3,0 detik** pada toleransi sudut target sebelum anak panah ditembakkan dan repetisi dihitung valid.

### 🌿 Misi 2: Garden Keeper (Shoulder Reaching & Hand Tracking)
- **Tujuan Klinis**: Melatih koordinasi motorik, fleksibilitas jangkauan (*reaching*), dan fungsi membuka/menutup telapak tangan (*hand grasping*).
- **Mekanika Latihan**: Menggunakan **MediaPipe Hand Landmarker** untuk mendeteksi posisi tangan dan status membuka telapak tangan guna memancarkan air virtual dari gembor penyiram pot bunga:
  - **Level 1 (Mode Terstruktur)**: Menyiram 6 pot secara sekuensial sepanjang busur sudut `65°` hingga `138°`.
  - **Level 2 (Mode Acak Dinamis)**: Pasien diuji dengan stimulasi sasaran acak (*randomized perturbation*). Pot target aktif memancarkan aura *beacon* bercahaya dan dipandu oleh garis kompas direksional.
- **Biomarker Klinis "Sangat Sembuh"**: Jika pasien berhasil menyelesaikan Level 2 (total 12 pot) dengan stabil, sistem otomatis mendeklarasikan status pemulihan fungsional penuh (**Status Pemulihan: Sangat Sembuh**) dan menyematkan rekomendasi klinis ke form asesmen.

### 📊 Portal Asesmen & Dashboard Klinis Terapis
- **Portal Login Glassmorphism**: Akses terproteksi JWT token untuk dokter dan fisioterapis.
- **Formulir Asesmen Pasca-Sesi**: Form dialog otomatis di akhir setiap misi untuk mencatat keluhan rasa nyeri pada 5 gerakan anatomis bahu:
  1. *Shoulder Flexion* (Fleksi Bahu)
  2. *Shoulder Abduction* (Abduksi Bahu)
  3. *External Rotation* (Rotasi Eksternal)
  4. *Internal Rotation* (Rotasi Internal)
  5. *Shoulder Extension* (Ekstensi Bahu)
- **Global KPI & Direktori Pasien**: Metrik agregat klinik (total pasien, total sesi, rata-rata skor, akurasi target, prevalensi nyeri) dengan filter pencarian nama pasien real-time.
- **Generator Laporan PDF Medis**: Ekspor dokumen rekam medis resmi berformat A4 standar rumah sakit via `html2pdf.js` dalam 1 klik (memuat kop rekam medis unik `MW-xxxxxx`, grafik evaluasi ROM, rekapitulasi sesi, serta kolom tanda tangan terapis).
- **Integrasi Pembayaran Midtrans**: Modul langganan klinik (*subscription billing*) terintegrasi dengan Snap API Midtrans.

---

## 🏗️ Arsitektur Sistem

MoveWall AI menerapkan arsitektur terdistribusi berbasis **Edge Computing + Cloud Backend**:

```mermaid
graph TB
    subgraph Client ["1. Edge Client Layer (Browser & WebAssembly)"]
        Cam["📷 Webcam Capture (30 FPS RGB)"]
        MP["🤖 MediaPipe Tasks Vision (BlazePose & Hand Landmarker WASM)"]
        Filter["📐 Landmark Temporal Filter & Interpolation"]
        ROM["📊 Deterministic ROM Engine (Hip-Shoulder-Wrist Vector)"]
        FSM["⚙️ Rep State Machine (Rest → Concentric → Hold → Eccentric)"]
        Canvas["🎮 HTML5 Canvas 2D / WebGL Renderer (60 FPS)"]
        
        Cam --> MP --> Filter --> ROM --> FSM --> Canvas
    end

    subgraph Hardware ["2. Hardware Interaktif"]
        Canvas --> Projector["📽️ Proyektor Dinding / Monitor Klinik"]
        Projector --> Wall["🧱 Dinding Interaktif"]
        Patient["🧍 Pasien"] -. Ditangkap Kamera .-> Cam
        Wall -. Umpan Balik Visual .-> Patient
    end

    subgraph Cloud ["3. Cloud Infrastructure & Database"]
        Vercel["⚡ Vercel Edge Hosting<br/>movewall-ai.vercel.app"]
        Railway["🚂 Railway API Service<br/>movewallai-production.up.railway.app"]
        Neon[("🐘 Neon Cloud Serverless PostgreSQL<br/>Prisma 7 ORM Connection Pool")]
        Midtrans["💳 Midtrans Payment Gateway<br/>Snap API & Webhook"]
        
        Vercel -. Static Frontend .-> Client
        Client -- "POST /api/assessment (JWT)" --> Railway
        Railway <--> Neon
        Railway <--> Midtrans
    end

    subgraph Portal ["4. Portal Analitik & Pelaporan"]
        Dash["👨‍⚕️ Clinical Dashboard (dashboard.html)"]
        PDF["📄 Hospital-Grade PDF Generator (html2pdf.js)"]
        Railway --> Dash --> PDF
    end
```

---

## 💻 Teknologi yang Digunakan

| Kategori | Komponen & Pustaka | Keterangan |
|---|---|---|
| **Computer Vision (Edge)** | `@mediapipe/tasks-vision`, `BlazePose`, `HandLandmarker` | Pemrosesan landmark tubuh & tangan 100% di browser via WebAssembly |
| **Frontend & Graphics** | Vanilla HTML5 Canvas 2D, WebGL, Modern CSS3 | Rendering 60 FPS bebas overhead virtual DOM framework |
| **Desain Antarmuka** | Dark Clinical Glassmorphism Design System (v2.0) | Palet warna medis kontras tinggi, typography Atkinson Hyperlegible Next & Inter |
| **Backend API** | Node.js (v22 LTS), Express.js, JWT, CORS Guard | REST API untuk autentikasi, pencatatan rekam medis, dan analitik klinis |
| **Database & ORM** | Neon Serverless PostgreSQL, Prisma ORM 7.10 | Model data `Therapist`, `Assessment`, dan `Subscription` dengan PgBouncer pooling |
| **Reporting & Export** | `html2pdf.js`, Custom CSS Print A4 Sheet | Pembuatan dokumen rekam medis legal siap cetak / arsip digital |
| **Payment Gateway** | Midtrans Snap API | Transaksi perpanjangan langganan klinik 30 hari otomatis |
| **Cloud Hosting** | **Vercel** (Frontend) & **Railway** (Backend API) | Arsitektur cloud production dengan global CDN dan auto HTTPS |
| **Python Research CV** | Python 3.10+, OpenCV, MediaPipe Tasks Python | Modul acuan riset biomekanika dan simulasi CLI di folder root |

---

## 🔑 Akses Cepat & Kredensial Demo

Sistem production telah live dan dapat diuji langsung melalui browser tanpa instalasi lokal:

| Layanan | Tautan / Informasi |
|---|---|
| **Frontend Web App (Live)** | [https://movewall-ai.vercel.app](https://movewall-ai.vercel.app) |
| **Portal Login Terapis** | [https://movewall-ai.vercel.app/login](https://movewall-ai.vercel.app/login) |
| **Dashboard Analitik Klinis** | [https://movewall-ai.vercel.app/dashboard](https://movewall-ai.vercel.app/dashboard) |
| **Misi 1: Apple Archer** | [https://movewall-ai.vercel.app/index.html](https://movewall-ai.vercel.app/index.html) |
| **Misi 2: Garden Keeper** | [https://movewall-ai.vercel.app/mission2](https://movewall-ai.vercel.app/mission2) |
| **Backend API Health** | [https://movewallai-production.up.railway.app/api/health](https://movewallai-production.up.railway.app/api/health) |

### Akun Uji Coba Terapis (Pre-seeded):
- **Username**: `therapist01`
- **Password**: `movewall2026`
- **Nama Dokter**: *Dr. Rina Setiawati, Sp.KFR* (Spesialis Kedokteran Fisik & Rehabilitasi)
*(Tersedia tombol autofill "Demo Login" pada halaman login)*

---

## ⚙️ Panduan Instalasi & Menjalankan Lokal

### Prasyarat Sistem
- **Node.js**: Versi `>= 22.12.0` (diperlukan untuk kompatibilitas runtime Prisma 7)
- **Git** & **Web Browser Modern** (Google Chrome, Microsoft Edge, atau Firefox dengan dukungan WebAssembly & Webcam)
- **Python** (Opsional untuk modul pipeline riset di root): Python 3.10 s.d. 3.12

---

### 1. Frontend Web App (`game-ui/`)

Frontend MoveWall AI dibangun tanpa bundler berat sehingga dapat dijalankan menggunakan local HTTP server apapun:

```bash
# Masuk ke direktori game-ui
cd game-ui

# Menggunakan Node HTTP server
npx serve . -p 3000

# ATAU menggunakan Python simple server
python -m http.server 3000
```

Buka peramban pada alamat:
- Login Portal: `http://localhost:3000/login.html`
- Misi 1 (Apple Archer): `http://localhost:3000/index.html`
- Misi 2 (Garden Keeper): `http://localhost:3000/mission2.html`
- Dashboard Admin: `http://localhost:3000/dashboard.html`

> [!NOTE]
> Secara default, frontend telah terkonfigurasi untuk berkomunikasi langsung ke production Railway backend (`https://movewallai-production.up.railway.app`). Jika Anda ingin menghubungkannya ke backend lokal, sesuaikan variabel URL API pada baris awal masing-masing berkas `.js`.

---

### 2. Backend API Service (`game-ui/backend/`)

```bash
# Masuk ke direktori backend
cd game-ui/backend

# Pasang dependensi
npm install

# Buat file konfigurasi lingkungan (.env)
cp .env.example .env
```

Sesuaikan isi file `.env`:
```env
DATABASE_URL="postgresql://user:password@host:5432/movewall_db?sslmode=require"
DIRECT_URL="postgresql://user:password@host:5432/movewall_db?sslmode=require"
JWT_SECRET="kunci_rahasia_jwt_anda"
PORT=3001
```

Sinkronkan database dan jalankan server:
```bash
# Generate Prisma Client & jalankan migrasi
npx prisma generate
npx prisma db push

# (Opsional) Jalankan seeding akun dokter & riwayat pasien demo
npm run seed

# Jalankan server API
npm start
# Server berjalan di http://localhost:3001
```

---

### 3. Pipeline Python Edge CV (Riset & Demo Lokal)

Untuk bereksperimen dengan pipeline biomekanika Python murni yang ada pada root repositori:

```bash
# Pasang dependensi computer vision Python
pip install opencv-python mediapipe numpy

# Jalankan demo interaktif CLI (simulasi sudut, rep state machine, adaptive engine)
python interactive_demo.py

# Jalankan demo pelacakan kamera real-time dengan overlay ROM
python camera_demo.py
```

---

## 📁 Struktur Direktori Repositori

```
movewall/
├── MoveWall_AI_Rehab_Logo__1_transparent.png  # Logo resmi MoveWall AI (transparent)
├── vercel.json                                # Konfigurasi routing & header Vercel root
├── walkthrough.md                             # Dokumentasi komprehensif seluruh task & sistem
│
├── game-ui/                                   # ── FRONTEND EDGE WEB APP ──
│   ├── login.html                             # Portal autentikasi terapis glassmorphism
│   ├── dashboard.html                         # Portal dashboard analitik klinis terapis
│   ├── dashboard.js                           # Logika dashboard, KPI agregat & ekspor PDF
│   ├── index.html                             # Misi 1: Apple Archer (Shoulder Flexion)
│   ├── app.js                                 # Engine visual pemanah, MediaPipe pose, FSM
│   ├── mission2.html                          # Misi 2: Garden Keeper (Shoulder Reaching)
│   ├── mission2.js                            # Engine penyiram bunga, MediaPipe hand, Mode Acak
│   ├── styles.css                             # Central Clinical Glassmorphism Design System v2.0
│   ├── vercel.json                            # Konfigurasi header & routing frontend Vercel
│   ├── assets/                                # Aset gambar, audio BGM, model .task MediaPipe
│   │   ├── pose_landmarker.task               # Model MediaPipe BlazePose
│   │   └── hand_landmarker.task               # Model MediaPipe Hand Landmarker
│   └── backend/                               # ── BACKEND API SERVICE ──
│       ├── server.js                          # Express.js REST API, Auth JWT, Midtrans, Stats
│       ├── package.json                       # Konfigurasi dependensi Node 22 & Prisma 7
│       ├── railway.json                       # Deployment config untuk Railway cloud
│       ├── prisma/
│       │   ├── schema.prisma                  # Skema database (Therapist, Assessment, Sub)
│       │   └── seed.js                        # Seeder dummy therapist & 12 rekam sesi pasien
│       └── prisma.config.ts                   # Konfigurasi Prisma 7 datasource connection
│
├── edge_pipeline.py                           # ── CORE PYTHON CV & BIOMECHANICS ──
├── landmark_filter.py                         # One-Euro & EMA filter + 15 frame occlusion grace
├── angle_calculator.py                        # Kalkulator sudut sendi anatomis berbasis vektor
├── rep_state_machine.py                       # Finite State Machine siklus repetisi terapi
├── adaptive_engine.py                         # Closed-loop Adaptive Difficulty & ROM Adjustment
├── camera_demo.py                             # Demo kamera real-time dengan MediaPipe Tasks
└── interactive_demo.py                        # Demo interaktif CLI untuk pengujian logika FSM
```

---

## 📡 Referensi REST API

Layanan backend MoveWall AI menyediakan endpoints REST API terstruktur untuk integrasi dashboard web dan aplikasi klien:

| Metode | Endpoint | Autentikasi | Deskripsi |
|:---:|---|:---:|---|
| `GET` | `/api/health` | Publik | Status kesehatan server dan timestamp UTC |
| `POST` | `/api/auth/login` | Publik | Autentikasi terapis; mengembalikan JWT token |
| `POST` | `/api/auth/register` | Publik | Registrasi akun fisioterapis baru |
| `GET` | `/api/auth/me` | JWT Token | Mendapatkan profil terapis yang sedang login |
| `POST` | `/api/assessment` | JWT Token | Menyimpan data hasil sesi latihan & evaluasi nyeri ROM |
| `GET` | `/api/assessments` | JWT Token | Mengambil daftar riwayat asesmen yang dibuat terapis |
| `GET` | `/api/dashboard/stats` | JWT Token | Agregasi KPI klinik: total pasien, total sesi, rata-rata skor, prevalensi nyeri |
| `GET` | `/api/patients` | JWT Token | Daftar pasien unik beserta usia dan jumlah sesi selesai |
| `GET` | `/api/patients/:name/summary` | JWT Token | Analisis mendalam per pasien: metrik, histori sesi, matriks nyeri |
| `GET` | `/api/patients/:name/report` | JWT Token | Payload data lengkap untuk perakitan dokumen rekam medis PDF |
| `POST` | `/api/subscription/create-transaction` | JWT Token | Meminta Snap Token Midtrans untuk perpanjangan langganan klinik |
| `POST` | `/api/subscription/notification` | Publik | Webhook penerima status pembayaran otomatis dari Midtrans |
| `POST` | `/api/dev/seed` | Publik (Dev) | Mengisi data dummy terapis dan rekam medis pasien |

---

## 📐 Formula Biomekanika & Logika Repetisi

### 1. Perhitungan Sudut ROM Bahu (Shoulder Flexion / Elevasi)
Sudut sendi bahu dihitung secara deterministik menggunakan dot product dua vektor anatomis:
- Vektor Referensi Batang Tubuh: $\vec{v}_1 = \mathbf{P}_{\text{hip}} - \mathbf{P}_{\text{shoulder}}$
- Vektor Elevasi Lengan: $\vec{v}_2 = \mathbf{P}_{\text{wrist}} - \mathbf{P}_{\text{shoulder}}$

$$\theta = \arccos\left(\frac{\vec{v}_1 \cdot \vec{v}_2}{\|\vec{v}_1\| \|\vec{v}_2\|}\right) \times \frac{180^\circ}{\pi}$$

Sistem menyertakan koreksi aspek rasio kamera horizontal:vertikal (4:3 atau 16:9) agar sudut lengan horizontal terbaca presisi mendekati 90 derajat.

### 2. Siklus Finite State Machine (FSM) Repetisi
```
[REST] ──(Sudut naik > baseline)──> [CONCENTRIC] ──(Mencapai target sudut)──> [HOLD]
                                                                                │
                                                                   (Tahan 3 detik stabil)
                                                                                │
[COMPLETED] <──(Kembali ke posisi awal)── [ECCENTRIC] <─────────────────────────┘
```
- **`REST`**: Pasien dalam posisi rileks (lengan di samping tubuh).
- **`CONCENTRIC`**: Pasien mengangkat lengan menuju sasaran.
- **`HOLD`**: Pasien mempertahankan lengan di zona toleransi target ($\pm 8^\circ$) selama durasi target (3 detik).
- **`ECCENTRIC`**: Pasien menurunkan kembali lengan ke baseline secara terkontrol.
- **`COMPLETED`**: Repetisi sah tercatat; poin dan akurasi diperbarui.

---

## ⌨️ Kontrol Keyboard Selama Latihan

Saat jendela permainan aktif, terapis atau pasien dapat memanfaatkan pintasan tombol keyboard berikut:

| Tombol | Fungsi |
|:---:|---|
| **`Space`** | Menjeda (*Pause*) atau Melanjutkan (*Resume*) sesi latihan |
| **`R`** | Mengulang level yang sedang aktif (*Restart Level*) |
| **`N`** | Tombol Cepat Nyeri (*Pain Trigger*): Menghentikan repetisi jika timbul nyeri mendadak |
| **`Esc`** | Menutup modal dialog / kembali ke beranda |

---

## 📄 Lisensi

Proyek ini dilisensikan di bawah [MIT License](LICENSE). Seluruh hak cipta dan pengembangan ditujukan untuk kemajuan teknologi rehabilitasi medik dan fisioterapi berbasis teknologi terbuka.

<div align="center">
  <sub>Dikembangkan dengan fokus pada kenyamanan pasien dan ketelitian klinis fisioterapi.</sub>
</div>

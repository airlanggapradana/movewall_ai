## Overview

Pelajari seluruh arsitektur pada sistem terlebih dahulu, lalu lakukan deployment penuh pada **Backend API Service & Database Layer** ke infrastruktur cloud production (**Railway + Neon Serverless PostgreSQL**). Konfigurasikan Prisma ORM 7, env database pooling, CORS policy, health check endpoint, serta hubungkan seluruh antarmuka frontend (`login.html`, `dashboard.html`, `index.html`, `mission2.html`) ke backend Railway yang aktif di cloud.

---

## Target Fitur & Spesifikasi

### 1. Cloud Database Infrastructure (Neon Serverless PostgreSQL)
- **Database Engine**: PostgreSQL v16+ Serverless di Neon.
- **Connection Strings**:
  - `DATABASE_URL`: Connection string dengan pooling (`-pooler`) untuk performa tinggi transaksi API.
  - `DIRECT_URL`: Direct connection string untuk eksekusi migrasi skema database Prisma (`prisma migrate deploy`).
- **Skema & Relasi Database**:
  - Model `Therapist` (tabel `therapists`): Identitas terapis, lisensi SIP, username unik, password terenkripsi bcrypt, email, spesialisasi, status akun.
  - Model `Assessment` (tabel `assessments`): Riwayat latihan pasien, checklist 5 gerakan nyeri ROM (fleksi, abduksi, rotasi eksternal, rotasi internal, ekstensi), skor, hits, level kesulitan adaptif, catatan terapis, relasi FK ke terapis penanggung jawab.

### 2. Cloud Backend Service (Railway Platform)
- **Deployment Platform**: Railway Service (`movewall_ai`).
- **Runtime & Builder**:
  - **Node.js**: Versi `>= 22.12.0` (ditetapkan pada field `engines` di `package.json` untuk kompatibilitas penuh engine Prisma 7).
  - **Builder**: Nixpacks dengan build command `npm install` dan run command `npm start`.
  - **Konfigurasi Railway**: File `railway.json` dengan restart policy `ON_FAILURE`.
- **Prisma ORM 7 Configuration**:
  - `prisma.config.ts`: Konfigurasi deklaratif Prisma 7 mendefinisikan datasource URL (`env("DATABASE_URL")`), directUrl (`env("DIRECT_URL")`), serta path migrasi dan seed script.
  - `prisma/schema.prisma`: Generator client `prisma-client-js` dan provider `postgresql`.
- **Production URL**:
  - Domain publik: `https://movewallai-production.up.railway.app`
  - Health check endpoint: `GET /api/health` menghasilkan status `ok`, nama layanan, dan timestamp real-time.

### 3. Keamanan & Kebijakan CORS
- **CORS Allowlist Dynamic**:
  - Mendukung semua subdomain frontend di Vercel (`*.vercel.app`) dan Railway (`*.up.railway.app`).
  - Mendukung seluruh port lokal (`localhost` dan `127.0.0.1` port 3000, 5173, 5500, 8080, dsb.) via regex pattern matching untuk fleksibilitas pengujian terapis dan developer.
  - Menangani preflight OPTIONS request dengan status `204 No Content` dan credentials `true`.

### 4. Dynamic Seeding & Verifikasi Akun
- **Endpoint Dev Seed**: `POST /api/dev/seed` untuk mengeksekusi inisialisasi dataset demo terapis dan riwayat rekam medis pasien secara dinamis di database Neon cloud.
- **Akun Bawaan (Verified Demo Credentials)**:
  - Terapis 1: `therapist01` / `movewall2026` (Dr. Rina Setiawati, Sp.KFR — Spesialis Rehabilitasi Bahu & Ekstremitas Atas)
  - Terapis 2: `therapist02` / `movewall2026` (Budi Wicaksono, S.Ft., Ftr — Fisioterapis Muskuloskeletal)
- **Dataset Pasien Demo**: 4 profil pasien (Budi Santoso, Siti Rahmawati, Hendra Wijaya, Dewi Anggraini) dengan 12 sesi rekam jejak asesmen longitudinal.

### 5. Integrasi Frontend ke Backend Cloud
- Seluruh frontend web app (`login.html`, `dashboard.js`, `app.js`, `mission2.js`) disinkronkan secara terpadu:
  - Default cloud origin mengarah ke `https://movewallai-production.up.railway.app`.
  - Mendukung override dinamis via `sessionStorage.getItem("mw_backend_url")` atau `window.MOVEWALL_BACKEND_URL`.
  - Mendukung fallback mode lokal (`mw_use_local_backend = "true"`) jika diinginkan pengujian offline.

---

## Matriks Verifikasi Deployment

| Komponen | Endpoint / Tes | Status | Keterangan |
|---|---|---|---|
| **Railway Deployment** | Build & Deploy Nixpacks (Node 22) | ✅ LULUS | Status Active/Healthy di Railway |
| **Neon PostgreSQL** | Koneksi SSL Pooler & Direct | ✅ LULUS | Database tersambung tanpa timeout |
| **API Health Check** | `GET /api/health` | ✅ LULUS | Mengembalikan `200 OK` + JSON timestamp |
| **Database Dynamic Seeding** | `POST /api/dev/seed` | ✅ LULUS | 2 Terapis & 12 Asesmen berhasil di-insert |
| **Autentikasi JWT** | `POST /api/auth/login` | ✅ LULUS | Mengembalikan signed JWT token (8h validity) |
| **CORS Flexibility** | Preflight OPTIONS (port 3000, 5500, vercel) | ✅ LULUS | Headers CORS disetujui tanpa 500 error |
| **Frontend Sync** | `login.html`, `dashboard.js`, `app.js`, `mission2.js` | ✅ LULUS | Terhubung ke Railway cloud secara default |

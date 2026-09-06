## Overview

Pelajari seluruh arsitektur pada sistem terlebih dahulu, lalu bangun **Dashboard Admin / Portal Klinis Terapis** yang menyajikan statistik data per pasien secara komprehensif, evaluasi asesmen Range of Motion (ROM), riwayat latihan longitudinal, serta fitur ekspor laporan rekam medis dalam format PDF siap cetak untuk setiap pasien.

---

## Target Fitur & Spesifikasi

### 1. Dashboard Admin & Ringkasan Metrik Global
- **Top KPI Cards**:
  - Total Pasien Terdaftar Aktif di bawah pengawasan terapis.
  - Total Sesi Latihan Rehabilitasi (distribusi Misi 1: Apple Archer dan Misi 2: Garden Keeper).
  - Rata-rata Skor Sesi dan akurasi rata-rata target hits.
  - Tingkat Prevalensi Keluhan Nyeri ROM (%) dan rasio sesi bebas nyeri.

### 2. Analisis & Statistik Data per Pasien
- **Direktori Pasien**:
  - Pencarian pasien secara real-time berdasarkan nama.
  - Filter status pasien (Semua, Keluhan Nyeri, Bebas Nyeri).
  - Profil demografis pasien: Nama lengkap, usia, total sesi terlaksana, serta tanggal sesi pertama dan terakhir.
- **Checklist Nyeri per Gerakan ROM (Shoulder Biomechanics)**:
  - Fleksi Bahu (*Shoulder Flexion / Elevasi Sagital*).
  - Abduksi Bahu (*Shoulder Abduction / Elevasi Koronal*).
  - Rotasi Eksternal Bahu (*External Rotation*).
  - Rotasi Internal Bahu (*Internal Rotation*).
  - Ekstensi Bahu (*Shoulder Extension*).
  - Visualisasi baris progres warna dinamis sesuai tingkat keparahan/frekuensi keluhan.
- **Progresivitas Skor & Performa**:
  - Visualisasi grafik batang skor sesi berturut-turut beserta level kesulitan dan target hits.

### 3. Riwayat Pasien Longitudinal (Session & Assessment History)
- Tabel kronologis interaktif seluruh riwayat latihan pasien:
  - Nomor Sesi (Sesi #1, #2, dst.)
  - Tanggal & Waktu pelaksanaan sesi
  - Badge Misi (`M1 Apple Archer` vs `M2 Garden Keeper`)
  - Tingkat Kesulitan (*Adaptive Level*)
  - Target Hits & Total Skor
  - Status Keluhan Nyeri ROM (chip penanda gerakan atau badge *Bebas Nyeri*)
  - Catatan Klinis Terapis (*Therapist Notes*)

### 4. Ekspor Laporan Rekam Medis PDF per Pasien
- Generator PDF klinis berformat A4 standar rumah sakit/klinik fisioterapi dengan 1 klik:
  - Kop resmi *MoveWall AI Clinical Tele-Rehabilitation Report*.
  - ID Rekam Medis unik dan stempel *Verified Clinical Record*.
  - Identitas lengkap pasien & identitas terapis penanggung jawab (Nama, Gelar, No. SIP / Lisensi, Kontak).
  - Ringkasan eksekutif metrik latihan dan toleransi biomekanika.
  - Tabel evaluasi klinis nyeri per gerakan ROM beserta status toleransi gerak.
  - Tabel rekam jejak lengkap seluruh sesi latihan.
  - Kotak rekomendasi terapi lanjutan dan blok tanda tangan legal terapis.

---

## Tech Stack & Arsitektur
- **Backend API**: Node.js + Express + Prisma ORM + PostgreSQL (`movewall_db`).
  - `GET /api/dashboard/stats` (Agregasi metrik klinik)
  - `GET /api/patients` (Daftar pasien unik terapis)
  - `GET /api/patients/:name/summary` (Deep analytics & riwayat pasien)
  - `GET /api/patients/:name/report` (Payload terstruktur laporan PDF)
- **Frontend UI**: Vanilla HTML5, CSS3 Glassmorphism (Dark Clinical Theme), JavaScript ES6+.
- **PDF Engine**: Client-side high-fidelity rendering via `html2pdf.js` dengan layout cetak formal.
- **Keamanan / Auth**: JWT Guard (`mw_token`) terhubung ke sesi login terapis.

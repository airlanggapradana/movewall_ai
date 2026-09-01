# MOVEWALL-AI

## 1. Konsep Utama

MOVEWALL-AI mengubah latihan terapeutik menjadi permainan berbasis misi dengan tujuan meningkatkan keterlibatan pasien selama latihan.

Pada prototipe awal, MOVEWALL-AI difokuskan pada latihan yang melibatkan **gerakan bahu** dan dapat terdiri dari beberapa misi. Setiap misi dirancang berdasarkan tujuan terapeutik tertentu, sehingga aktivitas permainan bukan dibuat secara acak.

> **Game task = therapeutic movement yang dikemas dalam bentuk permainan.**

## 2. Misi Permainan

### 🍎 Misi 1 – Pick the Apple

Pasien diminta meraih buah apel virtual yang muncul pada berbagai ketinggian.

**Aturan gameplay prototipe Apple Archer:**
- Target apel mengikuti target ROM dalam derajat dan berpindah vertikal sesuai sudut target.
- Level 1 berisi 5 hit dengan urutan target ROM: 30, 45, 60, 75, 90 derajat.
- Setiap target harus ditahan selama 3 detik pada jendela sudut target sebelum panah ditembakkan dan hit dihitung.
- Setelah hit ke-5, Level 2 dimulai dengan urutan target ROM: 105, 120, 135, 150, 165 derajat.
- Level 2 juga berisi 5 hit, sehingga total Misi 1 adalah 10 hit sebelum tombol lanjut ke Misi 2 ditampilkan.
- Perhitungan ROM kontrol menggunakan sudut vektor bahu-pinggul terhadap bahu-pergelangan tangan, dengan koreksi aspect ratio kamera agar posisi tangan horizontal terbaca lebih dekat ke 90 derajat.

**Target terapeutik:**
- Shoulder flexion / elevasi
- Reaching
- Akurasi gerakan

### 🌱 Misi 2 – Restore the Garden

Pasien mengarahkan tangannya menuju berbagai target untuk menyiram tanaman virtual.

**Target terapeutik:**
- Shoulder flexion
- Reaching
- Kontrol gerakan

### 🪟 Misi 4 – Clean the Window

Pasien mengikuti lintasan visual tertentu yang muncul pada dinding.

**Target terapeutik:**
- Gerakan bahu multidireksional
- Koordinasi
- Kontrol gerakan

## 3. Keterkaitan Game dengan Tujuan Terapeutik

Tujuan permainan disesuaikan dengan tujuan terapeutik. Setiap aktivitas permainan merepresentasikan gerakan atau kemampuan yang ingin dilatih dalam terapi.

Dengan pendekatan tersebut, permainan berfungsi sebagai media untuk mengemas gerakan terapeutik menjadi aktivitas yang lebih interaktif.

## 4. Sistem Proyeksi Interaktif

Lingkungan permainan MOVEWALL-AI ditampilkan menggunakan **proyektor** yang memproyeksikan permainan ke permukaan dinding.

### Konfigurasi Dasar

```text
Kamera
   ↓
Pasien
   ↓
Dinding interaktif

Proyektor → Dinding
```

### Komponen dan Fungsinya

| Komponen | Fungsi |
|---|---|
| Kamera | Menangkap gerakan pasien |
| Proyektor | Menampilkan lingkungan permainan ke dinding |
| Dinding interaktif | Menjadi permukaan tempat lingkungan permainan diproyeksikan |
| Pasien | Berinteraksi dengan permainan menggunakan gerakan tubuh |

Pasien berinteraksi dengan lingkungan permainan menggunakan gerakan tubuh tanpa memerlukan controller konvensional.

## 5. Pemantauan Performa

MOVEWALL-AI dirancang untuk merekam performa pasien selama setiap sesi latihan.

Parameter pengukuran yang direncanakan meliputi:

| Parameter | Pengukuran |
|---|---|
| **Range of Motion** | Sudut gerakan maksimal |
| **Akurasi** | Persentase target yang berhasil dicapai |
| **Kualitas gerakan** | Kesesuaian lintasan / kriteria gerakan |
| **Completion** | Jumlah misi yang berhasil diselesaikan |
| **Performance** | Skor permainan |
| **Progression** | Perubahan performa antar sesi |

## 6. Dashboard Fisioterapis

Data performa pasien dapat ditampilkan melalui **dashboard fisioterapis**. Dashboard tersebut ditujukan untuk membantu proses pemantauan perkembangan pasien dari waktu ke waktu.

Informasi yang direncanakan untuk dipantau mencakup:
- Range of Motion
- Akurasi
- Kualitas gerakan
- Jumlah misi yang diselesaikan
- Skor permainan
- Perubahan performa antar sesi

## 7. Ringkasan Sistem

Secara keseluruhan, konsep MOVEWALL-AI pada dokumen ini terdiri dari tiga bagian utama:

1. **Game-based therapeutic exercise** — latihan terapeutik dikemas sebagai misi permainan.
2. **Interactive projection** — permainan diproyeksikan ke dinding dan pasien berinteraksi menggunakan gerakan tubuh yang ditangkap kamera.
3. **Performance monitoring** — performa pasien direkam berdasarkan beberapa parameter dan dapat ditampilkan melalui dashboard fisioterapis.

> Catatan: Dokumen sumber hanya menjelaskan konsep awal MOVEWALL-AI, empat contoh misi, sistem proyeksi interaktif, serta parameter pemantauan performa. Detail implementasi teknis, algoritma AI/computer vision, arsitektur perangkat lunak, spesifikasi perangkat keras, dan desain dashboard secara rinci belum dijelaskan dalam dokumen sumber.

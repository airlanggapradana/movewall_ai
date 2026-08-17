# MOVEWALL-AI

## 1. Konsep Utama

MOVEWALL-AI mengubah latihan terapeutik menjadi permainan berbasis misi dengan tujuan meningkatkan keterlibatan pasien selama latihan.

Pada prototipe awal, MOVEWALL-AI difokuskan pada latihan yang melibatkan **gerakan bahu** dan dapat terdiri dari beberapa misi. Setiap misi dirancang berdasarkan tujuan terapeutik tertentu, sehingga aktivitas permainan bukan dibuat secara acak.

> **Game task = therapeutic movement yang dikemas dalam bentuk permainan.**

## 2. Misi Permainan

### 🍎 Misi 1 – Pick the Apple

Pasien diminta meraih buah apel virtual yang muncul pada berbagai ketinggian.

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

### 💡 Misi 3 – Hang the Lantern

Pasien harus meraih lentera virtual yang muncul pada berbagai arah.

**Target terapeutik:**
- Elevasi bahu
- Abduksi / scaption
- Directional reaching

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

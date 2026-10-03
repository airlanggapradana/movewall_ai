## Overview

Pelajari seluruh arsitektur pada sistem terlebih dahulu, lalu lakukan pengembangan pada **Misi 2: Garden Keeper (Restore the Garden)** dengan menambahkan sistem **Level 2 (Mode Acak / Randomized Dynamic Challenge)**. Pada Level 2, urutan pot tanaman yang harus disiram muncul secara **acak (randomized)**, sehingga menguji kemampuan adaptasi motorik, koordinasi reflek, dan proprioception dinamis pasien. Jika pasien berhasil menuntaskan Level 2 ini, sistem secara klinis mendeteksi bahwa pasien **"Sudah Sangat Sembuh" (High Functional Recovery / Fully Recovered)**.

---

## Target Fitur & Spesifikasi

### 1. Struktur Level Misi 2: Level 1 vs Level 2
- **Level 1 (Mode Terstruktur / Sekuensial - Pemanasan & Kalibrasi ROM)**:
  - Pasien menyiram pot secara berurutan (*predictable trajectory*) di sepanjang busur setengah lingkaran (*ROM arc*).
  - Alur gerak terprediksi untuk pemanasan sendi bahu (*warm-up*) dan pembiasaan rentang gerak dari sudut rendah ke tinggi (65° → 142°).
  - Target: 6 pot sekuensial.
- **Level 2 (Mode Acak / Randomized Dynamic Challenge - Uji Pemulihan Penuh)**:
  - Pasien menyiram pot dengan urutan target yang dipilih secara **acak (shuffled / randomized dynamic picking)** dari sisa pot yang belum disiram.
  - Pasien dipaksa menggerakkan lengan secara spontan melompati berbagai kuadran ROM (misal: dari elevasi 65° mendadak naik ke 142°, lalu ke 95°, lalu ke 128°, dst.) tanpa pola sekuensial.
  - Menguji *rapid motor planning*, kontrol neuromuskular dinamis, dan ketiadaan kompensasi postur tubuh.
  - Target: 6 pot acak (atau seluruh sisa pot di taman).

### 2. Mekanisme Gameplay & Locking Target Acak
- **Single Active Target Locking**:
  - Pada Level 2, hanya **1 pot acak** yang aktif sebagai sasaran sah pada satu waktu.
  - Pot-pot lain berstatus *locked/dormant* (air tidak akan mengisi pot non-target meskipun didekati gembor).
  - Memberikan feedback visual dan teks jika pasien mencoba menyiram pot yang salah: *"Fokus ke target acak saat ini di sudut X°"*.
- **Visual Target Beacon & Prompt Acak**:
  - Pot target acak ditandai dengan efek visual khusus:
    - *Pulsing Neon Glow & Aura Beacon* (warna amber/cyan cerah dengan partikel memancar).
    - Badge sudut ROM target acak dinamis: `🎯 TARGET ACAK: X°`.
    - Garis pandu atau panah penunjuk arah (*target compass*) dari posisi pointer gembor menuju pot target acak.
- **Transisi Target Instan**:
  - Begitu pot target acak terisi 100%, pot tersebut mekar, menghasilkan partikel perayaan, dan sistem memilih target acak berikutnya secara instan dari daftar pot yang belum disiram.

### 3. Deteksi Klinis "Sangat Sembuh" (High Functional Recovery)
- **Kriteria Deteksi**:
  - Pasien berhasil menyelesaikan seluruh target di Level 2 dalam batas waktu sesi tanpa memicu tombol nyeri (*pain stop*).
  - Skor performa dan akurasi dinilai berdasarkan kestabilan *holding ROM* pada sudut-sudut acak.
- **Visual Feedback & Celebration**:
  - Tampil HUD Banner & Audio Chime: *"Luar Biasa! Pasien Terdeteksi Sangat Sembuh (Full Motor Recovery)"*.
  - Modal Selesai Misi (*Mission Complete Modal*) menampilkan badge emas eksklusif:
    - 🏆 **Status Pemulihan: SANGAT SEMBUH**
    - Subtitle: *"Pasien menunjukkan kontrol neuromuskular dan rentang gerak (ROM) bahu optimal pada stimulasi acak multi-sudut tanpa kompensasi."*
- **Integrasi Rekam Medis & Form Assessment Terapis**:
  - Saat dialog form assessment dibuka setelah Misi 2 Level 2 selesai:
    - Field `sessionLevel` otomatis tercatat sebagai `2`.
    - Kolom Catatan Terapis (*Therapist Notes*) otomatis terisi saran klinis (*suggested clinical note*): *"Pasien berhasil menyelesaikan Misi 2 Level 2 (Mode Acak) dengan akurasi optimal. Biomekanika bahu dan kontrol motorik terdeteksi SANGAT SEMBUH (High Functional Recovery)."*
    - Data tersimpan ke database PostgreSQL melalui Prisma ORM dan langsung tercatat pada Dashboard Admin & Laporan Rekam Medis PDF.

### 4. Kontrol Level & Fleksibilitas Pengujian
- Tombol pemilih level (*Level Switcher Button*) di control bar atau header: `Level 1 (Teratur)` dan `Level 2 (Acak)` agar terapis atau penguji dapat langsung memilih atau menguji Level 2 secara fleksibel.
- Dukungan tombol *Ulangi Level* (*Restart Level*) yang menghormati mode acak Level 2 saat dimuat ulang.

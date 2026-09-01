# Smart Wall Climbing — AI Engine User Guide

Smart Wall Climbing adalah sistem terapi interaktif untuk anak-anak dengan Autism Spectrum Disorder (ASD). Dokumentasi ini berisi petunjuk lengkap untuk menginstal, mengonfigurasi, dan menjalankan komponen **AI Engine** (FastAPI + OpenCV + MediaPipe Tasks API + Pygame-CE).

---

## 1. Prasyarat Sistem

Sebelum memulai, pastikan sistem Anda memenuhi persyaratan berikut:

- **OS**: Windows (Direkomendasikan), macOS, atau Linux.
- **Python**: Python 3.8 s.d. 3.14.
- **Kamera**: Webcam USB eksternal atau kamera terintegrasi (diposisikan menghadap dinding panjat dari depan).
- **Proyektor**: Terhubung ke komputer sebagai layar tambahan (Extended Display) dengan resolusi target **1920x1080**.

---

## 2. Struktur Direktori Proyek

```
untitled_project/
├── ai_engine/
│   ├── main.py             # File utama (Entry Point) untuk menjalankan server & game
│   ├── config.py           # Konfigurasi sistem (resolusi, radius tabrakan, JWT, dll)
│   ├── requirements.txt    # Daftar dependensi Python
│   ├── api/                # REST API & WebSocket handler (FastAPI)
│   ├── core/               # OpenCV, MediaPipe, Collision, Scoring, Analytics, & Voice
│   ├── db/                 # Koneksi SQLite & Database Model (SQLAlchemy ORM)
│   ├── game/               # Logic Game, Pygame rendering & Session Manager
│   └── utils/              # Kalibrasi kamera-proyektor & logging
```

---

## 3. Instalasi

Ikuti langkah-langkah berikut untuk memasang dependensi:

1. Buka terminal atau PowerShell di folder utama proyek:
   ```bash
   cd d:\Informatika\Projekan\untitled_project
   ```

2. Pasang semua pustaka yang terdaftar di `requirements.txt`:
   ```bash
   pip install -r ai_engine/requirements.txt
   ```

   *Catatan: Jika Anda menggunakan Python 3.14+, sistem akan secara otomatis menggunakan `pygame-ce` (Community Edition) yang kompatibel penuh dengan Python versi terbaru.*

---

## 4. Cara Menjalankan

Masuk ke folder root `untitled_project` dan jalankan script `main.py` menggunakan CLI flags yang sesuai:

### A. Mode API Saja (Tanpa Layar Game & Kamera)
Cocok untuk pengembangan frontend, integrasi dashboard web, atau pengujian database REST API.
```bash
python -m ai_engine.main --api-only
```
- **API Base URL**: `http://127.0.0.1:8000`
- **Dokumentasi API (Swagger UI)**: `http://127.0.0.1:8000/docs`

### B. Mode Penuh (Game Window + Kamera + API Server)
Menjalankan FastAPI backend secara background, sekaligus membuka jendela game Pygame secara fullscreen untuk diproyeksikan ke dinding.
```bash
python -m ai_engine.main
```

### C. Mode Uji Jendela (Game Windowed + Kamera + API Server)
Sama seperti mode penuh, namun layar game Pygame tidak fullscreen (berupa jendela biasa) sehingga memudahkan debugging di satu layar monitor.
```bash
python -m ai_engine.main --windowed
```

---

## 5. Autentikasi & Akun Bawaan

Saat pertama kali dijalankan, sistem secara otomatis membuat database SQLite lokal (`ai_engine/smart_wall_climbing.db`) dan membuat satu akun Administrator bawaan:

- **Email**: `admin@smartwall.local`
- **Password**: `admin123`

Gunakan akun ini di Swagger UI (`/docs`) pada tombol **Authorize** di kanan atas untuk menguji endpoint yang dilindungi JWT token.

---

## 6. Integrasi REST API Penting

Sistem menyediakan endpoints FastAPI lengkap yang dapat dikonsumsi oleh dashboard web:

- `POST /api/login`: Mengirim email + password untuk mendapatkan JWT Token.
- `GET /api/children`: Mendapatkan daftar anak yang aktif menjalani terapi.
- `POST /api/children`: Menambahkan data anak baru.
- `GET /api/children/{id}/progress`: Mendapatkan ringkasan statistik, persentase peningkatan, dan grafik historis sesi terapi anak.
- `POST /api/session/start`: Memulai sesi terapi baru dengan mengonfigurasi jenis game, stage, tingkat kesulitan, dan durasi.
- `POST /api/session/{id}/pause`: Menjeda sesi game yang sedang berjalan.
- `POST /api/session/{id}/resume`: Melanjutkan sesi game yang sedang dijeda.
- `POST /api/session/{id}/end`: Menghentikan sesi game secara manual dan menyimpan statistik skor/akurasi ke database.

---

## 7. Pemantauan Real-time via WebSocket

Untuk memantau gerakan anak secara real-time di Dashboard, buat koneksi WebSocket ke alamat berikut:
```
ws://127.0.0.1:8000/ws/live
```

### Jenis Event yang Dikirimkan (JSON format):
1. **`pose_update`**: Mengirimkan koordinat sendi tubuh anak (skala piksel proyektor) secara real-time.
2. **`collision_detected`**: Dikirim ketika anggota tubuh (tangan/kaki) menyentuh target di dinding panjat.
   ```json
   {
     "event": "collision_detected",
     "data": {
       "target": "5",
       "body_part": "rightHand",
       "correct": true,
       "points": 110
     }
   }
   ```
3. **`score_update`**: Mengirim perubahan skor terbaru, tingkat akurasi (%), dan combo streak.
4. **`timer_update`**: Mengirimkan sisa waktu bermain sesi terapi dalam hitungan detik.

---

## 8. Kontrol Keyboard dalam Game

Saat jendela game (Pygame window) sedang aktif, terapis dapat menekan tombol keyboard berikut untuk mengontrol sesi secara manual:

| Tombol | Aksi |
|:---:|---|
| **`P`** | Menjeda game (Pause) / Melanjutkan game (Resume) |
| **`S`** | Menghentikan sesi terapi saat itu juga dan menyimpan hasilnya (Stop) |
| **`ESC`**| Keluar dari aplikasi AI Engine dan menutup semua jendela |

---

## 9. Aturan Web Game Misi 1

Pada prototipe `game-ui`, Misi 1 Apple Archer memakai target ROM berurutan:

- Level 1: 30, 45, 60, 75, 90 derajat untuk 5 hit.
- Level 2: 105, 120, 135, 150, 165 derajat untuk 5 hit.
- Setiap target apel harus ditahan selama 3 detik sebelum panah ditembakkan dan hit dihitung.
- Total penyelesaian Misi 1 adalah 10 hit, lalu pemain dapat lanjut ke Misi 2.
- Posisi apel dipetakan dari derajat ROM target, dan kalkulasi ROM memakai vektor bahu-pinggul ke bahu-pergelangan tangan dengan koreksi aspect ratio kamera.

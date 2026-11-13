# 🛠️ MoveWall AI Development Scripts

Kumpulan skrip pembantu untuk menjalankan lingkungan pengembangan lokal MoveWall AI secara otomatis.

---

## 📜 Daftar Skrip

| Skrip | Deskripsi |
|---|---|
| `run-dev.js` | Unified dev runner Node.js. Menjalankan Frontend (port 3000) dan Backend (port 3001) secara paralel dalam 1 terminal. Di-trigger via `npm run dev`. |
| `start-dev.ps1` | PowerShell launcher untuk menjalankan `node scripts/run-dev.js` dengan penanganan path otomatis. |
| `start-dev-dual.bat` | Batch script Windows untuk membuka terminal Frontend dan Backend di 2 jendela terpisah secara paralel. |

---

## 💡 Cara Pakai Praktis

Cukup jalankan dari root repositori:
```bash
npm run dev
```
atau klik dua kali berkas `start-dev.bat` pada root repositori.


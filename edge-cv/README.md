# 🧠 MoveWall AI — Edge CV & Biomechanics Pipeline

Modul Python murni untuk riset, simulasi, dan prototipe pelacakan biomekanika fisioterapi MoveWall AI.

---

## 📂 Komponen Modul

| Modul | Deskripsi |
|---|---|
| `angle_calculator.py` | Komputasi sudut sendi anatomis 2D/3D berbasis *dot product* vektor |
| `landmark_filter.py` | One-Euro & EMA filter untuk landmark MediaPipe + penanganan oklusi kamera (grace period 15 frame) |
| `rep_state_machine.py` | Finite State Machine (FSM) siklus repetisi terapi (`REST` ➔ `CONCENTRIC` ➔ `HOLD` ➔ `ECCENTRIC` ➔ `COMPLETED`) |
| `adaptive_engine.py` | Closed-loop adaptive difficulty engine untuk penyesuaian target ROM berbasis performa set |
| `edge_pipeline.py` | Orchestrator pipeline lengkap yang memproses 33 RawLandmarks menjadi payload frame |
| `interactive_demo.py` | Demo simulasi CLI interaktif untuk menguji FSM, pain trigger, dan adaptasi target ROM |
| `camera_demo.py` | Demo pelacakan kamera real-time dengan model `pose_landmarker.task` |
| `test_pipeline.py` | Suite pengujian otomatis untuk memverifikasi seluruh modul pipeline |

---

## 🚀 Cara Menjalankan

### 1. Pasang Dependensi
```bash
pip install -r requirements.txt
```

### 2. Jalankan Suite Pengujian
```bash
python test_pipeline.py
```

### 3. Jalankan Demo Interaktif CLI
```bash
python interactive_demo.py
```

### 4. Jalankan Demo Kamera Real-Time
```bash
python camera_demo.py
```
*(Model `pose_landmarker.task` akan otomatis dimuat dari `../game-ui/assets/` jika belum tersedia di folder ini)*


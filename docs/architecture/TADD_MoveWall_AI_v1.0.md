# Technical Architecture & Design Document (TADD)
# MoveWall AI — Sistem Tele-Rehabilitasi Berbasis Computer Vision

---

## 1. Document Information

| Field | Detail |
|---|---|
| Nama Dokumen | Technical Architecture & Design Document (TADD) |
| Produk Terkait | MoveWall AI |
| Dokumen Acuan | PRD_MoveWall_AI_v1.0.md |
| Versi | 1.0 |
| Status | Draft — Engineering Review |
| Target Pembaca | Engineering (CV/ML, Frontend/Game, Backend, DevOps), QA, Security |

### 1.1 Tujuan Dokumen
Dokumen ini menerjemahkan requirement fungsional & non-fungsional pada PRD menjadi desain teknis konkret: arsitektur sistem, desain komponen, kontrak antar-modul, skema data, dan spesifikasi algoritma yang siap diimplementasikan oleh tim engineering.

---

## 2. System Architecture Overview

### 2.1 Diagram Arsitektur Tingkat Tinggi

```
┌──────────────────────────────────────────────────────────────────────┐
│                         CLIENT (LAPTOP PASIEN)                        │
│                                                                        │
│  ┌───────────────┐   ┌───────────────────┐   ┌────────────────────┐  │
│  │   Webcam       │──▶│  Pose Estimation   │──▶│  Motion Analysis    │  │
│  │  Capture Layer │   │  Engine (BlazePose │   │  & ROM Engine       │  │
│  │  (getUserMedia)│   │  / ML Kit, WASM/JS)│   │  (Vector Math Core) │  │
│  └───────────────┘   └───────────────────┘   └──────────┬─────────┘  │
│                                                          │            │
│                                                          ▼            │
│                                              ┌────────────────────┐  │
│                                              │  Rep State Machine  │  │
│                                              │  + Adaptive         │  │
│                                              │  Difficulty Engine  │  │
│                                              └──────────┬─────────┘  │
│                                                          │            │
│                                                          ▼            │
│  ┌───────────────┐   ┌───────────────────┐   ┌────────────────────┐  │
│  │  Audio Cue     │◀──│  Game State Bridge │◀──│  Unity WebGL        │  │
│  │  Manager       │   │  (JS ↔ Unity)      │   │  Runtime (Game Loop)│  │
│  └───────────────┘   └───────────────────┘   └────────────────────┘  │
│                                                                        │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │      Local Persistence Layer (IndexedDB) — Offline-First Queue   │  │
│  └───────────────────────────────┬────────────────────────────────┘  │
└──────────────────────────────────┼────────────────────────────────────┘
                                    │  HTTPS (metrik agregat saja,
                                    │  TIDAK ADA frame video/raw pose)
                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│                          BACKEND (CLOUD)                              │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────────────┐     │
│  │  API Gateway /  │  │  Session &     │  │  Prescription &        │     │
│  │  Auth Service   │  │  Metrics       │  │  Care Plan Service     │     │
│  │  (OAuth2/JWT)   │  │  Service       │  │                        │     │
│  └───────────────┘  └───────────────┘  └───────────────────────┘     │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────────────┐     │
│  │  Notification   │  │  Analytics /   │  │  Audit Log Service     │     │
│  │  Service        │  │  Reporting     │  │  (HIPAA compliance)    │     │
│  └───────────────┘  └───────────────┘  └───────────────────────┘     │
│                          ┌───────────────────┐                        │
│                          │  Primary DB         │                        │
│                          │  (Encrypted, AES-256)│                       │
│                          └───────────────────┘                        │
└──────────────────────────────────┬───────────────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │   Therapist Dashboard (Web)     │
                    │   React/Vue SPA + Chart Engine  │
                    └───────────────────────────────┘
```

### 2.2 Prinsip Desain Utama

1. **Edge-First Computation** — Seluruh pipeline vision (capture → pose inference → ROM calc → rep counting) berjalan 100% di client. Backend tidak pernah menerima frame video atau raw landmark stream.
2. **Loose Coupling via Event Bridge** — Modul CV (JS/WASM) dan Game Engine (Unity WebGL) berkomunikasi melalui kontrak event terdefinisi, bukan dependensi langsung, agar tim CV dan tim Game Dev dapat bekerja paralel.
3. **Offline-First, Sync-Later** — Semua state kritikal (progres sesi, hasil rep) ditulis ke local storage terlebih dahulu; sinkronisasi backend bersifat eventual-consistency.
4. **Deterministic Core, Adaptive Shell** — Algoritma matematis ROM bersifat deterministic & testable secara unit; hanya lapisan adaptive difficulty yang stateful terhadap histori performa.

---

## 3. Component Design

### 3.1 Pose Estimation Engine

| Aspek | Spesifikasi |
|---|---|
| Library | MediaPipe BlazePose (WASM/WebGL runtime) untuk target web/desktop |
| Model Variant | `BlazePose Full` (33 landmark) — trade-off antara akurasi vs performa dipilih dibanding `Lite`/`Heavy` untuk keseimbangan pada laptop kelas menengah |
| Input | Frame RGB dari `getUserMedia`, di-downscale ke resolusi inference tetap (mis. 256×256) terlepas dari resolusi kamera asli, untuk menjaga FPS stabil |
| Output per Frame | Array 33 objek `{ x, y, z, visibility }`, dinormalisasi 0.0–1.0 terhadap frame |
| Threading | Dijalankan di Web Worker terpisah dari main thread rendering untuk mencegah UI blocking |

**Interface Kontrak (Output Event):**
```typescript
interface PoseFrame {
  timestamp: number;        // epoch ms, untuk sinkronisasi dengan game loop
  landmarks: Landmark[];    // panjang tetap 33
  frameConfidence: number;  // rata-rata visibility seluruh landmark
}

interface Landmark {
  id: LandmarkId;           // enum: NOSE, LEFT_SHOULDER, RIGHT_ELBOW, dst.
  x: number; y: number; z: number;
  visibility: number;       // 0.0 - 1.0
}
```

### 3.2 Motion Analysis & ROM Engine

Modul ini murni computational (tidak stateful lintas sesi), menerima `PoseFrame` dan mengeluarkan sudut sendi terhitung.

**Interface:**
```typescript
interface JointAngleResult {
  jointType: JointType;         // e.g. LEFT_ELBOW, SHOULDER_FLEXION
  angleDegrees: number;
  confidence: number;           // diturunkan dari visibility landmark terkait
  isOccluded: boolean;          // true jika confidence < OCCLUSION_THRESHOLD
}

function calculateJointAngle(
  pointA: Landmark, pointVertex: Landmark, pointC: Landmark
): JointAngleResult;
```

**Pseudocode Inti (sesuai Section 7.2 PRD):**
```
function calculateJointAngle(A, B, C):
    vBA = { x: A.x - B.x, y: A.y - B.y }
    vBC = { x: C.x - B.x, y: C.y - B.y }

    dot = (vBA.x * vBC.x) + (vBA.y * vBC.y)
    magBA = sqrt(vBA.x^2 + vBA.y^2)
    magBC = sqrt(vBC.x^2 + vBC.y^2)

    if magBA == 0 or magBC == 0:
        return ERROR_DEGENERATE_VECTOR   # titik berimpit, skip frame

    cosTheta = dot / (magBA * magBC)
    cosTheta = clamp(cosTheta, -1.0, 1.0)   # guard floating-point

    thetaRadian = arccos(cosTheta)
    thetaDegree = thetaRadian * (180 / 3.14159)

    confidence = min(A.visibility, B.visibility, C.visibility)
    isOccluded = confidence < OCCLUSION_THRESHOLD   # default 0.5

    return { angleDegrees: thetaDegree, confidence, isOccluded }
```

**Smoothing Layer:** Output mentah diteruskan melalui **One-Euro Filter** (per joint, per sesi) sebelum dikonsumsi state machine, dengan parameter `min_cutoff` dan `beta` yang dapat dituning per jenis latihan (gerakan lambat pasca-operasi butuh smoothing lebih agresif dibanding gerakan atletik cepat).

### 3.3 Rep Counting State Machine

Implementasi literal dari FSM di Section 7.3 PRD, sebagai modul independen per joint yang sedang dipantau dalam misi aktif.

```typescript
enum RepState { RESTING, ASCENDING, PEAK_HOLD, DESCENDING }

interface RepConfig {
  baselineAngle: number;
  ascendThreshold: number;   // derajat dari baseline untuk mulai dihitung "bergerak"
  targetAngle: number;       // ROM target dari resep/adaptive engine
  descendHysteresis: number; // threshold turun, lebih rendah dari ascendThreshold
  minPeakHoldFrames: number; // default 2
}

class RepStateMachine {
  state: RepState = RepState.RESTING;
  peakHoldFrameCount: number = 0;

  onNewAngle(angle: number, config: RepConfig): RepEvent | null {
    // transisi state sesuai spesifikasi PRD 7.3
    // mengembalikan RepEvent: VALID_REP | PARTIAL_REP | null
  }
}
```

### 3.4 Adaptive Difficulty Engine

Stateful per sesi, menyimpan rolling window 5 repetisi terakhir.

```typescript
interface PerformanceWindow {
  reps: RepResult[];   // max length 5, FIFO
}

function evaluateDifficultyAdjustment(window: PerformanceWindow, currentTarget: number, safetyBounds: {min: number, max: number}): DifficultyAdjustment {
  const SR = validRepCount(window) / window.reps.length;
  const ARAR = average(window.reps.map(r => r.actualROM / r.targetROM));

  let newTarget = currentTarget;
  if (SR >= 0.9 && ARAR >= 1.05) {
    newTarget = currentTarget * 1.05;
  } else if (SR < 0.7) {
    newTarget = currentTarget * 0.925; // -7.5% (tengah rentang -5% s.d -10%)
  }
  // clamp ke batas aman dari resep terapis
  newTarget = clamp(newTarget, safetyBounds.min, safetyBounds.max);
  return { newTarget, tempoAdjustment: deriveTempoAdjustment(SR) };
}
```

**Override Keselamatan:** Fungsi ini dipanggil di akhir setiap set. Namun `PainStopOverride` (tombol Stop/Nyeri atau deteksi fatigue tempo) memiliki jalur eksekusi terpisah dengan prioritas lebih tinggi, dapat memicu penurunan target kapan saja di luar siklus evaluasi akhir-set.

### 3.5 Game State Bridge (JS ↔ Unity WebGL)

Karena pipeline CV berjalan di JavaScript/WASM (browser) sedangkan game logic/rendering berjalan di Unity WebGL runtime, dibutuhkan bridge komunikasi dua arah:

| Arah | Mekanisme | Payload |
|---|---|---|
| JS → Unity | `unityInstance.SendMessage(gameObject, method, jsonPayload)` | `JointAngleResult[]`, `RepEvent`, `DifficultyAdjustment` per frame/event |
| Unity → JS | `.jslib` plugin exposing `window.postMessage` callback | Event: `SessionStarted`, `MissionCompleted`, `ScoreUpdated`, `PainButtonPressed` |

**Desain Kontrak Event (JSON Schema ringkas):**
```json
{
  "event": "JOINT_ANGLE_UPDATE",
  "timestamp": 1732345678123,
  "data": {
    "joint": "LEFT_SHOULDER_FLEXION",
    "angleDegrees": 72.4,
    "isOccluded": false
  }
}
```

Frekuensi pengiriman event dibatasi (throttled) mengikuti game loop tick (target 30Hz) agar tidak membanjiri message-passing bridge, yang merupakan salah satu risiko utama terhadap requirement latensi <30ms.

### 3.6 Audio Cue Manager

Modul terpisah dari game engine agar cue keselamatan dapat diputar bahkan jika game rendering mengalami hiccup.

- **Priority Queue:** `SAFETY (P0) > CORRECTION (P1) > MOTIVATIONAL (P2)`. Audio P0 selalu menginterupsi/mendahului P1/P2 yang sedang antre.
- **Debounce:** Cue sejenis tidak diputar ulang dalam window <1.5 detik untuk menghindari spam audio saat sudut berosilasi di sekitar threshold.
- **Preloading:** Seluruh aset audio cue dimuat saat loading screen sesi (bukan on-demand fetch) untuk menghindari delay pemutaran saat momen kritikal.

### 3.7 Local Persistence & Sync Layer

```typescript
interface SessionRecord {
  localId: string;              // UUID generated client-side
  patientId: string;
  missionId: string;
  startedAt: number;
  completedAt: number | null;
  reps: RepResult[];
  romSummary: RomSummary;
  syncStatus: "PENDING" | "SYNCED" | "FAILED";
}
```

- Disimpan di **IndexedDB** (bukan localStorage — kapasitas & kemampuan query lebih sesuai untuk data terstruktur sesi).
- Sync worker berjalan di background, retry dengan **exponential backoff** saat koneksi tidak stabil (khas kondisi rumah tangga).
- Data yang dikirim ke backend **hanya metrik hasil kalkulasi** (`RomSummary`, `RepResult[]` berisi angle & timestamp, bukan landmark mentah) — selaras requirement privasi Section 8.2 PRD.

---

## 4. Backend Service Design

### 4.1 Daftar Microservice

| Service | Tanggung Jawab |
|---|---|
| Auth Service | Autentikasi pasien & terapis (OAuth2/JWT), RBAC (Section FR-D.6) |
| Session & Metrics Service | Menerima & menyimpan `SessionRecord` teragregasi dari client |
| Prescription/Care Plan Service | CRUD resep terapis (jenis latihan, target ROM, level, frekuensi) — sumber kebenaran untuk `safetyBounds` di Adaptive Difficulty Engine |
| Analytics/Reporting Service | Agregasi time-series untuk grafik Dashboard (ROM trend, adherence heatmap) |
| Notification Service | Pengingat jadwal latihan, alert terapis untuk pasien berisiko |
| Audit Log Service | Mencatat setiap akses data pasien untuk kepatuhan HIPAA/UU PDP |

### 4.2 Skema Data Inti (Ringkas)

```
Patient (id, name, dob, clinicId, activeCarePlanId)
Therapist (id, name, clinicId, role)
CarePlan (id, patientId, therapistId, exerciseType, targetROMMin, targetROMMax, targetReps, frequencyPerWeek, createdAt, updatedAt)
SessionSummary (id, patientId, carePlanId, startedAt, completedAt, avgROM, maxROM, accuracyScore, validReps, partialReps, invalidReps, deviceInfo)
RepDetail (id, sessionSummaryId, jointType, angleDegrees, repStatus, timestampOffset)
AuditLog (id, actorId, actorRole, action, targetPatientId, timestamp)
```

### 4.3 Kontrak API Utama (Ringkas)

```
POST /v1/sessions/sync
  Body: SessionRecord[]  (batch, mendukung queue offline)
  Auth: Bearer JWT (patient scope)

GET /v1/patients/{id}/progress?range=30d
  Response: time-series ROM & accuracy untuk Dashboard

PUT /v1/care-plans/{id}
  Body: { exerciseType, targetROMMin, targetROMMax, targetReps, frequencyPerWeek }
  Auth: Bearer JWT (therapist scope), tercatat di Audit Log

GET /v1/care-plans/active?patientId=
  Digunakan client saat Start Session (FR-1.1) untuk mengambil misi harian
```

---

## 5. Sequence Diagram — Alur Sesi Utama

```
Pasien       Client(CV Engine)      Client(Game/Unity)      Local DB      Backend
  |                 |                       |                  |            |
  |--Start Session->|                       |                  |            |
  |                 |--fetch active plan-------------------------------->  |
  |                 |<---------------------- care plan JSON ------------- |
  |--Kalibrasi----->|--landmark stream----->|                  |          |
  |                 |--validasi jarak/pose-->|                  |          |
  |<--audio cue-----|                       |                  |          |
  |--Play Mission-->|                       |--init game loop->|          |
  |  (gerak fisik)  |--pose frame (30fps)-->|                  |          |
  |                 |--joint angle calc     |                  |          |
  |                 |--rep state machine    |                  |          |
  |                 |--JOINT_ANGLE_UPDATE-->|--update visual-->|          |
  |<--audio/visual feedback----------------|                  |          |
  |                 |--end of set-->adaptive difficulty eval   |          |
  |                 |                       |--new target------|          |
  |--Selesai Misi-->|                       |--MISSION_DONE--->|--write local->|
  |                 |                       |                  |--sync (async)->|
  |<--Session Summary (dari local cache, instan)---------------|          |
```

---

## 6. Deployment & Infrastructure

| Aspek | Pendekatan |
|---|---|
| Distribusi Client | Web app (Unity WebGL build di-embed dalam SPA) — meminimalkan instalasi, cukup buka browser |
| CDN | Aset game (WebGL build, model BlazePose `.tflite`/`.wasm`) disajikan via CDN untuk load time optimal |
| Backend Hosting | Containerized microservices (mis. Kubernetes) dengan auto-scaling berbasis load Session Sync & Dashboard API |
| Observability | Client-side error/performance telemetry (FPS drop, calibration failure rate) dikirim terpisah dari data klinis, dengan opt-in eksplisit |
| CI/CD | Pipeline terpisah untuk (a) Unity build, (b) CV/WASM module, (c) backend services — versi model pose estimation di-pin per rilis untuk mencegah regresi akurasi ROM tanpa validasi klinis ulang |

---

## 7. Testing Strategy

| Level | Fokus |
|---|---|
| Unit Test | Fungsi matematis murni: `calculateJointAngle`, clamp cosinus, konversi radian-derajat, FSM rep counting (dengan data landmark sintetis/fixture) |
| Integration Test | Bridge JS↔Unity — memastikan `JointAngleResult` diterjemahkan konsisten menjadi state game |
| Simulation/Replay Test | Rekaman video anonim gerakan terapeutik standar diputar ulang melalui pipeline untuk regresi akurasi ROM saat update model BlazePose |
| Performance Test | Validasi latensi end-to-end <30ms dan FPS ≥30 pada matriks perangkat referensi (low/mid/high-end laptop) |
| Clinical Validation Test | (Terpisah, melibatkan Clinical Advisory Board) — perbandingan hasil ROM sistem vs goniometer manual pada subjek riil |

---

*Dokumen ini merupakan turunan teknis dari PRD_MoveWall_AI_v1.0.md. Detail skema database penuh, IaC (Infrastructure as Code), dan API spec lengkap (OpenAPI) akan disusun sebagai dokumen implementasi terpisah oleh masing-masing tim engineering.*

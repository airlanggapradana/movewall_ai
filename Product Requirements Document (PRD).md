# Product Requirements Document (PRD)

# Smart Wall Climbing
### AI-Powered Interactive Wall Climbing Therapy for Children with Autism Spectrum Disorder (ASD)

**Version:** 1.0  
**Status:** Draft  
**Author:** Rangga  
**Tech Stack:** Python + OpenCV + Next.js

---

# 1. Overview

Smart Wall Climbing adalah sebuah sistem terapi interaktif berbasis Computer Vision yang menggabungkan aktivitas wall climbing dengan game edukasi yang diproyeksikan ke dinding menggunakan projector.

Berbeda dengan wall climbing konvensional, sistem ini mampu mendeteksi posisi tangan dan kaki pemain secara real-time menggunakan kamera dan Computer Vision, kemudian memberikan instruksi interaktif seperti mencari angka, huruf, warna, maupun bentuk geometri.

Target utama sistem adalah membantu meningkatkan:

- Kemampuan motorik
- Koordinasi tubuh
- Sensorik
- Konsentrasi
- Kemampuan kognitif
- Kepercayaan diri

khususnya bagi anak dengan Autism Spectrum Disorder (ASD).

---

# 2. Problem Statement

Anak dengan ASD sering mengalami:

- Kesulitan koordinasi motorik
- Gangguan sensorik
- Sulit mempertahankan fokus
- Gerakan repetitif
- Kesulitan melakukan aktivitas fisik yang melibatkan koordinasi tangan dan kaki

Terapi konvensional masih memiliki beberapa keterbatasan:

- Kurang menarik
- Tidak memiliki pencatatan progress otomatis
- Tidak adaptif terhadap perkembangan anak
- Tidak memiliki data objektif selama terapi berlangsung

---

# 3. Solution

Membangun sistem Smart Wall Climbing yang terdiri dari:

- Interactive Projection
- Computer Vision Tracking
- AI-assisted Game Engine
- Therapist Dashboard
- Progress Analytics

Seluruh permainan diproyeksikan ke dinding.

Kamera akan mendeteksi posisi tubuh pemain menggunakan OpenCV sehingga pemain cukup menyentuh target pada dinding menggunakan tangan maupun kaki.

---

# 4. Goals

## Primary Goals

- Membuat terapi lebih menyenangkan
- Meningkatkan kemampuan motorik
- Melatih koordinasi
- Meningkatkan fokus
- Memberikan data perkembangan yang objektif

---

## Secondary Goals

- Mengurangi pekerjaan manual terapis
- Menyediakan laporan perkembangan
- Adaptasi tingkat kesulitan secara otomatis

---

# 5. Target Users

## Primary

- Anak ASD usia 4–12 tahun

## Secondary

- Terapis
- Psikolog
- Orang tua
- Klinik terapi
- Sekolah inklusi

---

# 6. Technology Stack

---

## AI Engine

Python

Framework:

- FastAPI

Libraries:

- OpenCV
- MediaPipe
- NumPy
- SciPy
- OpenCV-Contrib
- pyttsx3
- gTTS
- Pydantic

Optional

- PyTorch
- TensorFlow

---

## Web Dashboard

Next.js 15

- App Router
- TypeScript
- TailwindCSS
- Shadcn/UI
- React Query
- Zustand
- Socket.IO Client
- Chart.js

---

## Database

PostgreSQL

ORM

- Prisma

---

## Realtime

- WebSocket
- Socket.IO

---

## Storage

- Local Storage
- AWS S3 (optional)

---

# 7. System Architecture

```
                        Camera
                           │
                           ▼
                 Python AI Engine
           OpenCV + MediaPipe + FastAPI
                           │
             Pose Detection Engine
                           │
             Collision Detection Engine
                           │
                Game Logic Engine
                           │
             Session Data & Analytics
                           │
        ┌──────────────────┴──────────────────┐
        ▼                                     ▼
 Next.js Dashboard                     Projector Display
```

---

# 8. Core Modules

## 8.1 Authentication

Roles

- Admin
- Therapist

Features

- Login
- Logout
- Session Management

---

## 8.2 Child Management

Data

- Name
- Age
- Gender
- Diagnosis
- Therapy Notes
- Parent Information

---

## 8.3 Game Management

Manage

- Stages
- Difficulty
- Game Type
- Voice Instruction
- Duration

---

## 8.4 Therapy Session

Therapist can:

- Select child
- Select game
- Start therapy
- Pause
- Resume
- Finish

---

## 8.5 Live Monitoring

Display

- Camera Feed
- Body Skeleton
- Current Instruction
- Score
- Accuracy
- Remaining Time

---

## 8.6 Reports

Generate

- Daily
- Weekly
- Monthly
- Child Progress

---

# 9. AI Engine Modules

---

## Pose Detection

Purpose

Track

- Head
- Shoulder
- Elbows
- Hands
- Hips
- Knees
- Feet

Technology

- OpenCV
- MediaPipe Pose

Output

```json
{
  "leftHand": [320,180],
  "rightHand": [520,220],
  "leftFoot": [280,640],
  "rightFoot": [510,650]
}
```

---

## Collision Detection

Determine whether

Hand or Foot touches target.

Algorithm

```
Distance(Point A, Point B)

↓

Radius Checking

↓

Collision

↓

Success
```

---

## Voice Engine

Responsibilities

Speak

Examples

```
Find number 6

Find red color

Find letter A

Excellent!

Good Job!
```

Libraries

- pyttsx3
- gTTS

---

## Stage Generator

Generate

- Random Targets
- Random Position
- Random Instruction

Constraints

- No overlapping objects
- Reachable by child
- Adjustable difficulty

---

## Score Engine

Calculate

- Accuracy
- Time
- Combo
- Mistakes

---

## Analytics Engine

Calculate

- Average Reaction Time
- Completion Rate
- Accuracy Trend
- Improvement

---

# 10. Game Modes

---

## Number Game

Instruction

```
Find Number 5
```

Stage 1

One number

Stage 2

Two numbers

Stage 3

Three numbers

---

## Letter Game

Instruction

```
Find Letter C
```

---

## Color Game

Instruction

```
Touch Blue Color
```

---

## Shape Game

Instruction

```
Find Triangle
```

Supported Shapes

- Circle
- Triangle
- Square
- Rectangle
- Star

---

# 11. Gameplay Flow

```
Start Session

↓

Countdown

↓

Voice Instruction

↓

Player Moves

↓

Pose Tracking

↓

Collision Detection

↓

Correct?

↓

Yes

↓

Score

↓

Next Instruction

↓

Finish

↓

Generate Report
```

---

# 12. Dashboard Features

## Home

- Today's Sessions
- Active Therapists
- Total Children
- Average Accuracy

---

## Child Profile

Display

- Therapy History
- Average Score
- Improvement
- Notes

---

## Live Session

Realtime

- Camera
- Skeleton
- Target
- Accuracy
- Timer

---

## Reports

Charts

- Weekly Progress
- Monthly Progress
- Accuracy
- Reaction Time

---

# 13. Database Design

## User

| Field | Type |
|--------|------|
| id | UUID |
| name | String |
| email | String |
| password | String |
| role | Enum |

---

## Child

| Field | Type |
|--------|------|
| id | UUID |
| name | String |
| age | Integer |
| gender | Enum |
| diagnosis | Text |

---

## Session

| Field | Type |
|--------|------|
| id | UUID |
| childId | UUID |
| therapistId | UUID |
| duration | Integer |
| score | Integer |
| accuracy | Float |

---

## Game

| Field | Type |
|--------|------|
| id | UUID |
| type | Enum |
| stage | Integer |
| duration | Integer |

---

## Session Result

| Field | Type |
|--------|------|
| id | UUID |
| sessionId | UUID |
| reactionTime | Float |
| success | Boolean |
| target | String |

---

# 14. API Design

## Authentication

```
POST /api/login
POST /api/logout
```

---

## Child

```
GET /api/children
POST /api/children
PUT /api/children/{id}
DELETE /api/children/{id}
```

---

## Session

```
POST /api/session/start

POST /api/session/end

GET /api/session/history
```

---

## Live

```
WebSocket

ws://localhost:8000/ws/live
```

---

# 15. Realtime Events

```
pose_update

score_update

target_update

timer_update

session_start

session_end

collision_detected
```

---

# 16. Performance Requirements

Pose Detection

Target

30 FPS

---

Latency

<100 ms

---

API Response

<300 ms

---

Dashboard

Realtime

---

# 17. Security

- JWT Authentication
- HTTPS
- Password Hashing
- Role-based Access
- Session Validation

---

# 18. Future AI Features

## Adaptive Difficulty

AI automatically increases or decreases difficulty based on

- Accuracy
- Reaction Time
- Number of Mistakes

---

## Personalized Therapy

AI recommends

- Best Game
- Best Duration
- Best Difficulty

for each child.

---

## Therapist Recommendation

Generate

- Progress Summary
- Weak Motor Areas
- Recommended Next Exercise

---

# 19. MVP Scope

Included

- Login
- Child Management
- Live Pose Detection
- Number Game
- Letter Game
- Shape Game
- Color Game
- Voice Instruction
- Realtime Dashboard
- Session History
- Progress Report

---

Excluded

- Multi-camera Support
- Machine Learning Personalization
- Cloud Synchronization
- Mobile Application
- Facial Emotion Detection
- Gesture Recognition
- Remote Therapy

---

# 20. Success Metrics (KPIs)

Technical

- Pose Detection Accuracy ≥95%
- Collision Detection Accuracy ≥95%
- FPS ≥30
- API Response <300ms

Clinical

- Increased Average Session Completion
- Reduced Average Reaction Time
- Increased Accuracy Score
- Increased Therapy Participation

---

# 21. Future Roadmap

## Phase 1

- MVP
- Pose Tracking
- Interactive Games

---

## Phase 2

- Adaptive Difficulty
- AI Analytics
- Better Reports

---

## Phase 3

- Multi-player
- Multi-camera
- Cloud Dashboard
- Therapist Recommendation AI
- Machine Learning Progress Prediction
- Parent Mobile App
# 🎯 ObjectDet.AI v2 — Object Detection System
### YOLOv8 × COCO-80 × OpenCV × Live Camera × Flask

---

## 🗂️ Project Structure

```
object-detection-system/
│
├── backend/                     # Flask REST API
│   ├── app.py                   # Main server (8 API routes)
│   ├── detector.py              # YOLOv8 engine (image + live frame)
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── .env.example
│   └── utils/
│       ├── response_utils.py
│       └── file_utils.py
│
├── frontend/                    # 5-page Web UI
│   ├── index.html               ← Image upload detection
│   ├── camera.html              ← 📷 LIVE webcam detection
│   ├── batch.html               ← Multi-image batch
│   ├── classes.html             ← COCO class explorer
│   ├── docs.html                ← API documentation
│   ├── css/style.css
│   └── js/
│       ├── api.js               ← All API calls
│       ├── ui.js                ← Shared UI helpers
│       ├── main.js              ← Image page logic
│       └── camera.js            ← Live camera engine
│
├── scripts/
│   └── download_coco.py         ← Dataset downloader
│
├── data/
│   └── coco/                    ← ✅ PUT DATASET HERE
│       ├── images/
│       │   ├── train2017/
│       │   └── val2017/
│       └── annotations/
│           ├── instances_train2017.json
│           └── instances_val2017.json
│
├── docker-compose.yml
├── nginx.conf
├── setup.sh
└── README.md
```

---

## 📥 COCO Dataset — Kahan Rakhen?

```
object-detection-system/
└── data/
    └── coco/          ← Yahan rakho (auto-created)
        ├── images/
        │   └── val2017/     ← validation images
        └── annotations/
            └── instances_val2017.json
```

### Download karne ka tarika:

```bash
# Option 1: Script se (recommended)
python scripts/download_coco.py --samples 100   # quick test (100 images)
python scripts/download_coco.py --full          # full val set ~1 GB

# Option 2: Manual
# 1. https://cocodataset.org/#download par jao
# 2. "2017 Val images" download karo  → extract karo data/coco/images/val2017/
# 3. "2017 Train/Val annotations" download karo → extract karo data/coco/annotations/
```

---

## ⚡ Quick Start

```bash
# 1. Setup (ek baar)
bash setup.sh

# 2. API start karo
source venv/bin/activate
cd backend && python app.py

# 3. Frontend open karo
cd frontend && python3 -m http.server 8080
# Browser mein: http://localhost:8080
```

---

## 📷 Live Camera — Kaise Kaam Karta Hai

```
Browser Webcam (getUserMedia)
        │
        ▼ Every 100ms (10 FPS)
Canvas.toDataURL() → JPEG base64
        │
        ▼ POST /api/detect/frame
Flask API → YOLOv8 → OpenCV annotation
        │
        ▼ Response: annotated frame + detections JSON
Browser Canvas → drawImage() → real-time overlay
```

**Keyboard Shortcuts:**
- `Space` → Snapshot
- `S` → Start camera
- `X` → Stop camera

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/info` | Model info |
| POST | `/api/detect/image` | Single image |
| POST | `/api/detect/frame` | **Live frame (base64)** |
| POST | `/api/detect/batch` | Up to 10 images |
| GET | `/api/classes` | COCO classes |
| GET | `/api/stats` | Server stats |

---

## 🧠 YOLOv8 Models

| Model | Size | mAP | Speed |
|-------|------|-----|-------|
| yolov8n | 6MB | 37.3 | fastest |
| yolov8s | 22MB | 44.9 | fast |
| yolov8m | 50MB | 50.2 | balanced |
| yolov8l | 84MB | 52.9 | accurate |
| yolov8x | 131MB | 53.9 | most accurate |

Change in `backend/.env`: `YOLO_MODEL=yolov8s.pt`

---

## 🐳 Docker

```bash
docker-compose up --build
# → http://localhost:8080
```

# 🚀 ObjectDet.AI v2

### Real-Time Object Detection System

**YOLOv8 × COCO-80 × OpenCV × Flask × Live Webcam**

---

## 📌 Overview

**ObjectDet.AI v2** is a full-stack, real-time object detection system built using YOLOv8 and the COCO dataset.

### ✨ Features

* 📷 Live webcam detection (real-time)
* 🖼️ Image upload detection
* 📦 Batch image processing
* 📊 COCO class explorer
* 🌐 REST API (Flask)
* 🐳 Docker support

---

## 🏗️ Project Structure

```
object-detection-system/
│
├── backend/
│   ├── app.py
│   ├── detector.py
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── .env.example
│   └── utils/
│
├── frontend/
│   ├── index.html
│   ├── camera.html
│   ├── batch.html
│   ├── classes.html
│   ├── docs.html
│   ├── css/
│   └── js/
│
├── scripts/
│   └── download_coco.py
│
├── data/
│   └── coco/
│
├── docker-compose.yml
├── nginx.conf
├── setup.sh
└── README.md
```

---

## 📥 Dataset Setup (COCO)

Place dataset here:

```
data/coco/
├── images/
│   └── val2017/
└── annotations/
    └── instances_val2017.json
```

### 🔽 Download

```bash
# Quick test (100 images)
python scripts/download_coco.py --samples 100

# Full dataset (~1GB)
python scripts/download_coco.py --full
```

Or download manually from:
https://cocodataset.org/#download

---

## ⚡ Quick Start

### 1. Setup

```bash
bash setup.sh
```

### 2. Start Backend

```bash
source venv/bin/activate
cd backend
python app.py
```

### 3. Start Frontend

```bash
cd frontend
python3 -m http.server 8080
```

Open in browser:

```
http://localhost:8080
```

---

## 📷 Live Camera Flow

```
Webcam → Frame Capture → Base64 → API → YOLOv8 → OpenCV → Browser
```

### ⌨️ Controls

* Space → Snapshot
* S → Start camera
* X → Stop camera

---

## 📡 API Endpoints

| Method | Endpoint          | Description     |
| ------ | ----------------- | --------------- |
| GET    | /api/health       | Health check    |
| GET    | /api/info         | Model info      |
| POST   | /api/detect/image | Image detection |
| POST   | /api/detect/frame | Live detection  |
| POST   | /api/detect/batch | Batch detection |
| GET    | /api/classes      | COCO classes    |
| GET    | /api/stats        | Server stats    |

---

## 🧠 YOLOv8 Models

| Model   | Size  | Speed    |
| ------- | ----- | -------- |
| yolov8n | 6MB   | Fastest  |
| yolov8s | 22MB  | Fast     |
| yolov8m | 50MB  | Balanced |
| yolov8l | 84MB  | Accurate |
| yolov8x | 131MB | Best     |

Change model in:

```
backend/.env
```

```
YOLO_MODEL=yolov8s.pt
```

---

## 🐳 Docker

```bash
docker-compose up --build
```

Open:

```
http://localhost:8080
```

---

## 🛠️ Tech Stack

* Backend: Flask, OpenCV, YOLOv8
* Frontend: HTML, CSS, JavaScript
* Deployment: Docker, Nginx

---

## 📄 License

MIT License

---

## 🤝 Contributing

Pull requests are welcome. For major changes, open an issue first.

---

## 💡 Future Improvements

* GPU support
* Video detection
* Object tracking
* Cloud deployment

---

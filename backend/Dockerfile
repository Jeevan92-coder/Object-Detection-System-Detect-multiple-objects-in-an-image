FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx libglib2.0-0 libsm6 libxext6 libxrender-dev gcc curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && pip install --no-cache-dir -r requirements.txt
COPY . .
RUN mkdir -p uploads results models logs
RUN python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')" || true
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=10s --retries=3 CMD curl -f http://localhost:5000/api/health || exit 1
CMD ["gunicorn","--bind","0.0.0.0:5000","--workers","2","--timeout","120","app:app"]

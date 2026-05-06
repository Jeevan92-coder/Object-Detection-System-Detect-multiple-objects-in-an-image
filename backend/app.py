"""
app.py — Object Detection System v2
Flask REST API with YOLOv8 + Live Camera Frame Support
"""

import os, io, uuid, time, base64, logging
from pathlib import Path
from datetime import datetime, timezone

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename

from detector import ObjectDetector
from utils.response_utils import success_response, error_response
from utils.file_utils import allowed_file, cleanup_old_files, get_file_size_mb

# ── Logging ────────────────────────────────────────────────────
log_dir = Path("logs")
log_dir.mkdir(exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.FileHandler("logs/app.log"), logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

# ── App ────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app, origins=["*"])

BASE_DIR       = Path(__file__).parent
UPLOAD_FOLDER  = BASE_DIR / "uploads"
RESULTS_FOLDER = BASE_DIR / "results"

for d in [UPLOAD_FOLDER, RESULTS_FOLDER]:
    d.mkdir(parents=True, exist_ok=True)

app.config.update(
    UPLOAD_FOLDER        = str(UPLOAD_FOLDER),
    RESULTS_FOLDER       = str(RESULTS_FOLDER),
    MAX_CONTENT_LENGTH   = 50 * 1024 * 1024,
    SECRET_KEY           = os.getenv("SECRET_KEY", "ods-v2-key"),
    START_TIME           = datetime.now(timezone.utc).isoformat(),
)

# ── Detector ───────────────────────────────────────────────────
detector = ObjectDetector(
    model_name  = os.getenv("YOLO_MODEL", "yolov8n.pt"),
    device      = os.getenv("DEVICE", "cpu"),
    conf_thresh = float(os.getenv("CONF_THRESHOLD", "0.25")),
    iou_thresh  = float(os.getenv("IOU_THRESHOLD", "0.45")),
)
logger.info("Detector ready")

# ── Root / Health / Info ────────────────────────────────────────
@app.route("/")
def root():
    return jsonify({"service":"Object Detection System v2","status":"running","timestamp":datetime.now(timezone.utc).isoformat()})

@app.route("/api/health")
def health():
    return jsonify({"status":"healthy","model":detector.model_name,"device":detector.device,"classes":len(detector.class_names),"timestamp":datetime.now(timezone.utc).isoformat()})

@app.route("/api/info")
def info():
    return jsonify({"model":detector.model_name,"device":detector.device,"conf_threshold":detector.conf_thresh,"iou_threshold":detector.iou_thresh,"total_classes":len(detector.class_names),"classes":detector.class_names,"version":"2.0"})

@app.route("/api/classes")
def get_classes():
    search = request.args.get("search","").lower()
    classes = [{"id":i,"name":n} for i,n in enumerate(detector.class_names) if search in n.lower()]
    return jsonify({"total":len(classes),"classes":classes})

# ── Single Image Detection ──────────────────────────────────────
@app.route("/api/detect/image", methods=["POST"])
def detect_image():
    try:
        if "image" not in request.files:
            return error_response("No image file provided", 400)
        file = request.files["image"]
        if not file.filename or not allowed_file(file.filename, {"jpg","jpeg","png","bmp","webp"}):
            return error_response("Unsupported or missing file", 415)

        file_id  = uuid.uuid4().hex[:12]
        filename = secure_filename(f"{file_id}_{file.filename}")
        fp       = os.path.join(app.config["UPLOAD_FOLDER"], filename)
        file.save(fp)

        conf           = float(request.form.get("confidence", detector.conf_thresh))
        iou            = float(request.form.get("iou",        detector.iou_thresh))
        filter_classes = request.form.getlist("classes") or None

        t0     = time.perf_counter()
        result = detector.detect_image(fp, conf=conf, iou=iou, filter_classes=filter_classes,
                                       save_result=True, output_dir=str(RESULTS_FOLDER))
        result["inference_time_ms"] = round((time.perf_counter()-t0)*1000, 2)
        result["file_id"]           = file_id
        result["original_filename"] = file.filename

        logger.info(f"Image: {result['total_objects']} objects in {result['inference_time_ms']}ms")
        return success_response("Detection complete", result)

    except Exception as exc:
        logger.exception("Detection failed")
        return error_response(str(exc), 500)


# ── LIVE CAMERA FRAME Detection ─────────────────────────────────
# Accepts a base64-encoded JPEG frame from browser webcam
@app.route("/api/detect/frame", methods=["POST"])
def detect_frame():
    """
    Expects JSON: { "frame": "<base64 jpeg>", "confidence": 0.25, "iou": 0.45 }
    Returns detection results + annotated frame as base64 for real-time overlay.
    """
    try:
        import cv2
        import numpy as np

        body = request.get_json(force=True)
        if not body or "frame" not in body:
            return error_response("Missing 'frame' field", 400)

        # Decode base64 frame
        frame_b64 = body["frame"]
        if "," in frame_b64:           # strip data-url prefix
            frame_b64 = frame_b64.split(",", 1)[1]

        img_bytes = base64.b64decode(frame_b64)
        nparr     = np.frombuffer(img_bytes, np.uint8)
        image     = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if image is None:
            return error_response("Could not decode frame", 400)

        conf           = float(body.get("confidence", detector.conf_thresh))
        iou            = float(body.get("iou",        detector.iou_thresh))
        filter_classes = body.get("classes") or None
        include_frame  = bool(body.get("include_frame", True))

        t0       = time.perf_counter()
        result   = detector.detect_frame(
            image,
            conf=conf,
            iou=iou,
            filter_classes=filter_classes,
            include_frame=include_frame,
        )
        elapsed  = round((time.perf_counter()-t0)*1000, 2)

        result["inference_time_ms"] = elapsed
        return success_response("Frame processed", result)

    except Exception as exc:
        logger.exception("Frame detection failed")
        return error_response(str(exc), 500)


# ── Batch Detection ─────────────────────────────────────────────
@app.route("/api/detect/batch", methods=["POST"])
def detect_batch():
    try:
        files = request.files.getlist("images")
        if not files:              return error_response("No images provided", 400)
        if len(files) > 10:        return error_response("Max 10 images per batch", 400)

        conf     = float(request.form.get("confidence", detector.conf_thresh))
        iou      = float(request.form.get("iou",        detector.iou_thresh))
        batch_id = uuid.uuid4().hex[:8]
        results  = []

        for f in files:
            if not allowed_file(f.filename, {"jpg","jpeg","png","bmp","webp"}):
                results.append({"filename":f.filename,"error":"Unsupported type"})
                continue
            fid   = uuid.uuid4().hex[:8]
            fname = secure_filename(f"{fid}_{f.filename}")
            fp    = os.path.join(app.config["UPLOAD_FOLDER"], fname)
            f.save(fp)
            t0  = time.perf_counter()
            res = detector.detect_image(fp, conf=conf, iou=iou, save_result=True, output_dir=str(RESULTS_FOLDER))
            res["inference_time_ms"] = round((time.perf_counter()-t0)*1000, 2)
            res["original_filename"] = f.filename
            results.append(res)

        return success_response("Batch complete", {"batch_id":batch_id,"total_images":len(files),"results":results})
    except Exception as exc:
        logger.exception("Batch failed")
        return error_response(str(exc), 500)


# ── Serve files ─────────────────────────────────────────────────
@app.route("/api/results/<filename>")
def get_result(filename):  return send_from_directory(app.config["RESULTS_FOLDER"], filename)

@app.route("/api/uploads/<filename>")
def get_upload(filename):  return send_from_directory(app.config["UPLOAD_FOLDER"], filename)

@app.route("/api/stats")
def stats():
    ups = list(UPLOAD_FOLDER.glob("*"))
    res = list(RESULTS_FOLDER.glob("*.jpg")) + list(RESULTS_FOLDER.glob("*.png"))
    return jsonify({"total_uploads":len(ups),"total_results":len(res),"model":detector.model_name,"uptime_since":app.config["START_TIME"]})

@app.route("/api/admin/cleanup", methods=["DELETE"])
def cleanup():
    d = cleanup_old_files(UPLOAD_FOLDER, 24) + cleanup_old_files(RESULTS_FOLDER, 24)
    return jsonify({"deleted_files":d})

# ── Error handlers ──────────────────────────────────────────────
@app.errorhandler(413)
def too_large(e): return error_response("File too large (max 50 MB)", 413)
@app.errorhandler(404)
def not_found(e): return error_response("Not found", 404)

if __name__ == "__main__":
    port  = int(os.getenv("PORT", 5000))
    debug = os.getenv("DEBUG","false").lower() == "true"
    logger.info(f"ODS v2 API starting on port {port}")
    app.run(host="0.0.0.0", port=port, debug=debug)

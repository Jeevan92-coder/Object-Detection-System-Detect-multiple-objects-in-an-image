"""
detector.py v2 — YOLOv8 Object Detection Engine
Supports: image files, raw numpy frames (webcam), base64 output
"""

import os, cv2, uuid, logging, base64
import numpy as np
from pathlib import Path
from typing import List, Optional, Dict, Any
from dataclasses import dataclass, asdict

logger = logging.getLogger(__name__)

# ── COCO 80 classes ────────────────────────────────────────────
COCO_CLASSES = [
    "person","bicycle","car","motorcycle","airplane","bus","train","truck","boat",
    "traffic light","fire hydrant","stop sign","parking meter","bench","bird","cat",
    "dog","horse","sheep","cow","elephant","bear","zebra","giraffe","backpack",
    "umbrella","handbag","tie","suitcase","frisbee","skis","snowboard","sports ball",
    "kite","baseball bat","baseball glove","skateboard","surfboard","tennis racket",
    "bottle","wine glass","cup","fork","knife","spoon","bowl","banana","apple",
    "sandwich","orange","broccoli","carrot","hot dog","pizza","donut","cake",
    "chair","couch","potted plant","bed","dining table","toilet","tv","laptop",
    "mouse","remote","keyboard","cell phone","microwave","oven","toaster","sink",
    "refrigerator","book","clock","vase","scissors","teddy bear","hair drier","toothbrush",
]

# Vivid color palette — one per class
PALETTE = [
    (255,56,56),(255,157,151),(255,112,31),(255,178,29),(207,210,49),(72,249,10),
    (146,204,23),(61,219,134),(26,147,52),(0,212,187),(44,153,168),(0,194,255),
    (52,69,147),(100,115,255),(0,24,236),(132,56,255),(82,0,133),(203,56,255),
    (255,149,200),(255,55,199),
]

def cls_color(cid: int): return PALETTE[cid % len(PALETTE)]


@dataclass
class Detection:
    class_id  : int
    class_name: str
    confidence: float
    bbox      : Dict[str, int]
    bbox_norm : Dict[str, float]
    area_px   : int
    center    : Dict[str, int]
    def to_dict(self): return asdict(self)


class ObjectDetector:
    def __init__(self, model_name="yolov8n.pt", device="cpu",
                 conf_thresh=0.25, iou_thresh=0.45):
        self.model_name  = model_name
        self.device      = device
        self.conf_thresh = conf_thresh
        self.iou_thresh  = iou_thresh
        self.class_names = COCO_CLASSES
        self._model      = None
        self._mock       = False
        self._load()

    def _load(self):
        try:
            from ultralytics import YOLO
            self._model = YOLO(self.model_name)
            self._model.to(self.device)
            logger.info(f"YOLOv8 '{self.model_name}' loaded on {self.device}")
        except ImportError:
            logger.warning("ultralytics not installed - mock mode active")
            self._mock = True
        except Exception as e:
            logger.error(f"Model load failed: {e} — mock mode")
            self._mock = True

    # ── Infer on numpy array ───────────────────────────────────
    def _infer(self, image: np.ndarray, conf: float, iou: float) -> List[Detection]:
        if self._mock:
            return self._mock_dets(*image.shape[:2][::-1])   # w,h
        h, w = image.shape[:2]
        results = self._model.predict(image, conf=conf, iou=iou, verbose=False)
        dets = []
        for r in results:
            for box in r.boxes:
                cid  = int(box.cls[0])
                cnf  = float(box.conf[0])
                x1,y1,x2,y2 = map(int, box.xyxy[0].tolist())
                dets.append(Detection(
                    class_id   = cid,
                    class_name = self.class_names[cid] if cid < len(self.class_names) else f"cls_{cid}",
                    confidence = round(cnf, 4),
                    bbox       = {"x1":x1,"y1":y1,"x2":x2,"y2":y2},
                    bbox_norm  = {"x1":round(x1/w,4),"y1":round(y1/h,4),"x2":round(x2/w,4),"y2":round(y2/h,4)},
                    area_px    = (x2-x1)*(y2-y1),
                    center     = {"x":(x1+x2)//2,"y":(y1+y2)//2},
                ))
        return dets

    # ── Detect from file path ──────────────────────────────────
    def detect_image(self, image_path: str, conf=None, iou=None,
                     filter_classes=None, save_result=False, output_dir="results") -> Dict[str, Any]:
        conf = conf or self.conf_thresh
        iou  = iou  or self.iou_thresh
        image = cv2.imread(image_path)
        if image is None: raise ValueError(f"Cannot read: {image_path}")
        h, w = image.shape[:2]

        dets = self._infer(image, conf, iou)
        if filter_classes:
            fl   = [c.lower() for c in filter_classes]
            dets = [d for d in dets if d.class_name.lower() in fl]

        annotated = self._draw(image.copy(), dets)

        result_url = None
        if save_result:
            os.makedirs(output_dir, exist_ok=True)
            fn  = f"result_{uuid.uuid4().hex[:8]}.jpg"
            out = os.path.join(output_dir, fn)
            cv2.imwrite(out, annotated, [cv2.IMWRITE_JPEG_QUALITY, 92])
            result_url = f"/api/results/{fn}"

        summary = {}
        for d in dets: summary[d.class_name] = summary.get(d.class_name, 0) + 1

        return {
            "total_objects"   : len(dets),
            "detections"      : [d.to_dict() for d in dets],
            "class_summary"   : summary,
            "image_size"      : {"width":w,"height":h},
            "result_image_url": result_url,
            "model"           : self.model_name,
            "conf_threshold"  : conf,
            "iou_threshold"   : iou,
            "mock_mode"       : self._mock,
        }

    # ── Detect from raw frame (webcam) ─────────────────────────
    def detect_frame(self, image: np.ndarray, conf=None, iou=None,
                     filter_classes=None, include_frame=True) -> Dict[str, Any]:
        """
        Real-time frame detection.
        Returns annotated frame as base64 JPEG + detections list.
        """
        conf = conf or self.conf_thresh
        iou  = iou  or self.iou_thresh
        h, w = image.shape[:2]

        dets = self._infer(image, conf, iou)
        if filter_classes:
            fl   = [c.lower() for c in filter_classes]
            dets = [d for d in dets if d.class_name.lower() in fl]

        frame_b64 = None
        if include_frame:
            annotated = self._draw(image.copy(), dets, live=True)
            # Encoding full annotated frame each request is expensive.
            _, buf    = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 80])
            frame_b64 = base64.b64encode(buf).decode("utf-8")

        summary = {}
        for d in dets: summary[d.class_name] = summary.get(d.class_name, 0) + 1

        return {
            "total_objects"  : len(dets),
            "detections"     : [d.to_dict() for d in dets],
            "class_summary"  : summary,
            "frame_b64"      : frame_b64,      # annotated JPEG as base64
            "image_size"     : {"width":w,"height":h},
            "mock_mode"      : self._mock,
        }

    # ── Draw annotations ───────────────────────────────────────
    def _draw(self, img: np.ndarray, dets: List[Detection], live=False) -> np.ndarray:
        for det in dets:
            color        = cls_color(det.class_id)
            b            = det.bbox
            x1,y1,x2,y2 = b["x1"],b["y1"],b["x2"],b["y2"]

            # Semi-transparent fill
            overlay = img.copy()
            cv2.rectangle(overlay, (x1,y1), (x2,y2), color, -1)
            cv2.addWeighted(overlay, 0.08, img, 0.92, 0, img)

            # Solid border (2px)
            cv2.rectangle(img, (x1,y1), (x2,y2), color, 2)

            # Corner markers (extra polish)
            ln = 12
            cv2.line(img, (x1,y1), (x1+ln,y1), color, 3)
            cv2.line(img, (x1,y1), (x1,y1+ln), color, 3)
            cv2.line(img, (x2,y1), (x2-ln,y1), color, 3)
            cv2.line(img, (x2,y1), (x2,y1+ln), color, 3)
            cv2.line(img, (x1,y2), (x1+ln,y2), color, 3)
            cv2.line(img, (x1,y2), (x1,y2-ln), color, 3)
            cv2.line(img, (x2,y2), (x2-ln,y2), color, 3)
            cv2.line(img, (x2,y2), (x2,y2-ln), color, 3)

            # Label
            label = f" {det.class_name}  {det.confidence:.0%}"
            (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.52, 1)
            ty = max(y1 - 6, th + 8)
            cv2.rectangle(img, (x1, ty-th-6), (x1+tw+4, ty+4), color, -1)
            cv2.putText(img, label, (x1+2, ty-1),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.52, (0,0,0), 1, cv2.LINE_AA)

        # HUD bar (live mode)
        if live:
            h, w = img.shape[:2]
            bar_h = 32
            bar   = img[0:bar_h, 0:w].copy()
            cv2.rectangle(img, (0,0), (w,bar_h), (0,0,0), -1)
            cv2.addWeighted(bar, 0.3, img[0:bar_h,0:w], 0.7, 0, img[0:bar_h,0:w])
            hud = f"YOLOv8  |  {len(dets)} objects  |  COCO-80"
            cv2.putText(img, hud, (8, 21),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.52, (0,230,255), 1, cv2.LINE_AA)
        else:
            cv2.putText(img, "ObjectDet.AI | YOLOv8 + COCO",
                        (10, img.shape[0]-10),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.38, (180,180,180), 1, cv2.LINE_AA)
        return img

    # ── Mock detections ────────────────────────────────────────
    def _mock_dets(self, w, h) -> List[Detection]:
        import random; random.seed(99)
        objs = [("person",0,.91),("car",2,.87),("dog",16,.79),("laptop",63,.95),("bottle",39,.72)]
        out  = []
        for name, cid, conf in objs:
            x1 = random.randint(0, w//2); y1 = random.randint(0, h//2)
            x2 = min(x1+random.randint(60,180),w); y2 = min(y1+random.randint(60,160),h)
            out.append(Detection(cid,name,conf,
                                 {"x1":x1,"y1":y1,"x2":x2,"y2":y2},
                                 {"x1":round(x1/w,4),"y1":round(y1/h,4),"x2":round(x2/w,4),"y2":round(y2/h,4)},
                                 (x2-x1)*(y2-y1),{"x":(x1+x2)//2,"y":(y1+y2)//2}))
        return out

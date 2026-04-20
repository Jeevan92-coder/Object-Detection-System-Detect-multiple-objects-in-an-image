#!/usr/bin/env python3
"""
scripts/download_coco.py — COCO 2017 Dataset Downloader
========================================================

DATASET FOLDER STRUCTURE (auto-created):
─────────────────────────────────────────
object-detection-system/
└── data/
    └── coco/                        ← yahan rakho dataset
        ├── images/
        │   ├── train2017/           ← 118K training images (~18 GB)
        │   └── val2017/             ← 5K validation images (~1 GB)
        └── annotations/
            ├── instances_train2017.json    ← training labels
            ├── instances_val2017.json      ← validation labels
            └── captions_val2017.json

USAGE:
  python scripts/download_coco.py                    # 100 val samples (default)
  python scripts/download_coco.py --samples 500      # 500 val images
  python scripts/download_coco.py --full val         # full val set (~1 GB)
  python scripts/download_coco.py --full train       # full train set (~18 GB)
  python scripts/download_coco.py --ann-only         # annotations only
"""

import os, sys, json, time, zipfile, argparse, urllib.request
from pathlib import Path
from tqdm import tqdm

DATA_DIR = Path(__file__).parent.parent / "data" / "coco"

URLS = {
    "val_images"   : "http://images.cocodataset.org/zips/val2017.zip",
    "train_images" : "http://images.cocodataset.org/zips/train2017.zip",
    "annotations"  : "http://images.cocodataset.org/annotations/annotations_trainval2017.zip",
}

class Progress(tqdm):
    def update_to(self, b=1, bs=1, ts=None):
        if ts: self.total=ts
        self.update(b*bs-self.n)

def dl(url, dest, desc=""):
    dest=Path(dest); dest.parent.mkdir(parents=True,exist_ok=True)
    if dest.exists(): print(f"  ✅ Already: {dest.name}"); return
    print(f"  ⬇️  {desc or dest.name}")
    with Progress(unit="B",unit_scale=True,miniters=1,desc=desc[:30]) as t:
        urllib.request.urlretrieve(url, dest, reporthook=t.update_to)

def unzip(zp, dest):
    print(f"  📦 Extracting {Path(zp).name}…")
    with zipfile.ZipFile(zp,"r") as z: z.extractall(dest)
    print(f"  ✅ Done")

def main():
    p=argparse.ArgumentParser(description="Download COCO 2017")
    p.add_argument("--split",    default="val", choices=["train","val"])
    p.add_argument("--samples",  type=int, default=100)
    p.add_argument("--full",     action="store_true")
    p.add_argument("--ann-only", action="store_true")
    a=p.parse_args()

    print("="*55)
    print("  COCO 2017 Dataset Downloader — ObjectDet.AI")
    print("="*55)
    print(f"  Save path : {DATA_DIR}")
    print(f"  Split     : {a.split}")
    print(f"  Mode      : {'Full download' if a.full else f'Sample ({a.samples} images)'}")
    print("="*55)

    ann_dir = DATA_DIR/"annotations"
    ann_dir.mkdir(parents=True, exist_ok=True)

    # 1. Annotations
    ann_zip = DATA_DIR/"annotations_trainval2017.zip"
    dl(URLS["annotations"], ann_zip, "Annotations")
    if not (ann_dir/"instances_val2017.json").exists():
        unzip(ann_zip, DATA_DIR)

    if a.ann_only:
        print("\n✅ Annotations ready. Run with --split to download images.")
        return

    ann_file = ann_dir/f"instances_{a.split}2017.json"
    print(f"\n📖 Loading {ann_file.name}…")
    with open(ann_file) as f: coco=json.load(f)
    print(f"   Images: {len(coco['images']):,} | Annotations: {len(coco['annotations']):,} | Classes: {len(coco['categories'])}")

    # Top classes
    from collections import Counter
    cat_map={c["id"]:c["name"] for c in coco["categories"]}
    counts=Counter(a2["category_id"] for a2 in coco["annotations"])
    print("\n📊 Top-10 classes:")
    for cid,cnt in counts.most_common(10):
        bar="█"*int(cnt/counts.most_common(1)[0][1]*20)
        print(f"   {cat_map[cid]:<20} {cnt:>7,}  {bar}")

    img_dir = DATA_DIR/"images"/f"{a.split}2017"

    if a.full:
        zip_path = DATA_DIR/f"{a.split}2017.zip"
        dl(URLS[f"{a.split}_images"], zip_path, f"{a.split.capitalize()} Images")
        unzip(zip_path, DATA_DIR/"images")
    else:
        # Download sample images individually
        img_dir.mkdir(parents=True, exist_ok=True)
        base = f"http://images.cocodataset.org/{a.split}2017"
        imgs = coco["images"][:a.samples]
        print(f"\n📥 Downloading {len(imgs)} sample images…")
        ok=0
        for i,img in enumerate(imgs):
            dest=img_dir/img["file_name"]
            if dest.exists(): ok+=1; continue
            try: urllib.request.urlretrieve(f"{base}/{img['file_name']}", dest); ok+=1
            except: pass
            if (i+1)%25==0: print(f"   {i+1}/{len(imgs)} downloaded…")
        print(f"  ✅ {ok}/{len(imgs)} images saved → {img_dir}")

    # Metadata
    meta={"split":a.split,"images":len(coco["images"]),"annotations":len(coco["annotations"]),
          "categories":[{"id":c["id"],"name":c["name"]} for c in coco["categories"]],
          "local_path":str(img_dir),"ann_path":str(ann_file)}
    with open(DATA_DIR/"meta.json","w") as f: json.dump(meta,f,indent=2)

    print(f"\n🎉 Done! Metadata: {DATA_DIR/'meta.json'}")
    print("\nNext steps:")
    print("  cd backend && python app.py   ← start API")
    print("  python scripts/evaluate_coco.py  ← run mAP evaluation")

if __name__=="__main__": main()

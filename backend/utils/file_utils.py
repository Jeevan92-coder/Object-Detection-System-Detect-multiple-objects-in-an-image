# utils/file_utils.py
import os, time
from pathlib import Path

def allowed_file(filename, allowed=None):
    allowed = allowed or {"jpg","jpeg","png","bmp","webp"}
    return "." in filename and filename.rsplit(".",1)[1].lower() in allowed

def get_file_size_mb(path):
    return os.path.getsize(path) / 1048576

def cleanup_old_files(folder, max_age_hours=24):
    cutoff = max_age_hours * 3600; now = time.time(); deleted = 0
    for f in Path(folder).glob("*"):
        if f.is_file() and (now - f.stat().st_mtime) > cutoff:
            try: f.unlink(); deleted += 1
            except: pass
    return deleted

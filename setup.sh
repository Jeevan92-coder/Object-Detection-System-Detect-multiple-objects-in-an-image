#!/usr/bin/env bash
# ObjectDet.AI v2 — One-Command Setup
set -e
CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RESET='\033[0m'; BOLD='\033[1m'
info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[ OK ]${RESET}  $*"; }

echo -e "${CYAN}${BOLD}"
echo "  ╔══════════════════════════════════════════╗"
echo "  ║  ObjectDet.AI v2 — Setup Script         ║"
echo "  ║  YOLOv8 + COCO + Live Camera + Flask    ║"
echo "  ╚══════════════════════════════════════════╝"
echo -e "${RESET}"

command -v python3 >/dev/null || { echo "Python 3.9+ required"; exit 1; }
info "Python: $(python3 --version)"

info "Creating directories…"
mkdir -p backend/{uploads,results,models,logs} data/coco/{images,annotations}
success "Directories ready"

info "Setting up virtual environment…"
[ -d venv ] || python3 -m venv venv
source venv/bin/activate && pip install --upgrade pip -q
success "venv ready"

info "Installing dependencies…"
pip install -r backend/requirements.txt -q
success "Dependencies installed"

[ -f backend/.env ] || { cp backend/.env.example backend/.env; success "Created .env"; }

info "Pre-downloading YOLOv8n model…"
python3 -c "from ultralytics import YOLO; YOLO('yolov8n.pt')" 2>/dev/null && success "YOLOv8n ready" || echo "  Will download on first run"

echo ""
echo -e "${GREEN}${BOLD}══════════════════════════════════════════════${RESET}"
echo -e "${GREEN}${BOLD}  ✅  Setup complete!${RESET}"
echo -e "${GREEN}${BOLD}══════════════════════════════════════════════${RESET}"
echo ""
echo -e "${CYAN}  1. Start API:${RESET}"
echo "     source venv/bin/activate"
echo "     cd backend && python app.py"
echo ""
echo -e "${CYAN}  2. Open frontend:${RESET}"
echo "     cd frontend && python3 -m http.server 8080"
echo "     → http://localhost:8080"
echo ""
echo -e "${CYAN}  3. Download COCO data:${RESET}"
echo "     python scripts/download_coco.py --samples 100"
echo ""
echo -e "${CYAN}  4. Live Camera:${RESET}"
echo "     → http://localhost:8080/camera.html"
echo ""

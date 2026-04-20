#!/bin/bash

echo ""
echo " =========================================="
echo "   ODS v2 - Object Detection System"
echo " =========================================="
echo ""

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

# Create venv if not exists
if [ ! -d "venv" ]; then
    echo " [1/3] Virtual environment nahi mila, bana raha hoon..."
    python3 -m venv venv
    if [ $? -ne 0 ]; then
        echo " ERROR: Python3 nahi mila! Install karo pehle."
        exit 1
    fi
    echo " Virtual environment ban gaya!"
    echo ""
    echo " [2/3] Dependencies install ho rahi hain (5-10 min lag sakte hain)..."
    source venv/bin/activate
    pip install -r backend/requirements.txt
    echo " Dependencies install ho gayi!"
else
    echo " [1/3] Virtual environment mila ✓"
    source venv/bin/activate
fi

echo ""
echo " [2/3] Flask Backend start ho raha hai (port 5000)..."
cd "$PROJECT_DIR/backend"
python app.py &
BACKEND_PID=$!
echo " Backend PID: $BACKEND_PID"

# Wait for Flask to boot
sleep 3

echo " [3/3] Frontend server start ho raha hai (port 8080)..."
cd "$PROJECT_DIR/frontend"
python3 -m http.server 8080 &
FRONTEND_PID=$!
echo " Frontend PID: $FRONTEND_PID"

sleep 1

echo ""
echo " =========================================="
echo "  Dono servers chal rahe hain!"
echo " =========================================="
echo ""
echo "  Frontend  -->  http://localhost:8080"
echo "  Backend   -->  http://localhost:5000"
echo "  API Health-->  http://localhost:5000/api/health"
echo ""
echo "  Ctrl+C dabao — dono servers band ho jayenge"
echo ""

# Open browser
if command -v xdg-open &> /dev/null; then
    xdg-open http://localhost:8080
elif command -v open &> /dev/null; then
    open http://localhost:8080
fi

# Wait and handle Ctrl+C
trap "echo ''; echo ' Servers band ho rahe hain...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" SIGINT SIGTERM

wait
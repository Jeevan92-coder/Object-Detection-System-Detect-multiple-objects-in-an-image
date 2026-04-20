@echo off
setlocal enabledelayedexpansion
title ODS v2 - Object Detection System
color 0A

chcp 65001 > nul 2>&1

echo.
echo  ==========================================
echo    ODS v2 - Object Detection System
echo  ==========================================
echo.

set "PROJECT_DIR=%~dp0"
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"

set "BACKEND_DIR=%PROJECT_DIR%\backend"
set "FRONTEND_DIR=%PROJECT_DIR%\frontend"
set "VENV_PYTHON=%PROJECT_DIR%\venv\Scripts\python.exe"
set "VENV_ACTIVATE=%PROJECT_DIR%\venv\Scripts\activate.bat"

if not exist "%PROJECT_DIR%\venv\" (
    echo  [1/3] Virtual environment bana raha hoon...
    python -m venv "%PROJECT_DIR%\venv"
    if errorlevel 1 (
        echo  ERROR: Python nahi mila!
        pause
        exit /b 1
    )
    call "%VENV_ACTIVATE%"
    echo  [2/3] Dependencies install ho rahi hain, wait karo...
    pip install -r "%BACKEND_DIR%\requirements.txt"
) else (
    echo  [1/3] Virtual environment ready
    call "%VENV_ACTIVATE%"
)

echo.
echo  [2/3] Backend start ho raha hai...
start "ODS Backend" cmd /k "chcp 65001 > nul && cd /d "%BACKEND_DIR%" && "%VENV_PYTHON%" -W ignore app.py"

timeout /t 4 /nobreak > nul

echo  [3/3] Frontend start ho raha hai...
start "ODS Frontend" cmd /k "cd /d "%FRONTEND_DIR%" && "%VENV_PYTHON%" -m http.server 8080"

timeout /t 3 /nobreak > nul

echo.
echo  ==========================================
echo   Done! Dono servers chal rahe hain
echo  ==========================================
echo.
echo   Browser:  http://localhost:8080
echo   API:      http://localhost:5000
echo.
start http://localhost:8080
pause
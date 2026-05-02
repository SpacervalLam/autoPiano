@echo off
echo ========================================
echo   AutoPiano - Launching with Python
echo ========================================
echo.

python launch.py

if errorlevel 1 (
    echo.
    echo [ERROR] Failed to start. Please check Python is installed.
    pause
)
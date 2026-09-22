@echo off
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Python not found. Please install Python 3.10 or newer.
  echo Download: https://www.python.org/downloads/
  pause
  exit /b 1
)

echo Starting AI Study Planner...
echo Keep this window open while using the app.
start /min "" python server.py
timeout /t 2 /nobreak >nul
start "" http://127.0.0.1:8000

echo.
echo If the browser did not open, please visit: http://127.0.0.1:8000
echo Close this window to stop the app.
pause

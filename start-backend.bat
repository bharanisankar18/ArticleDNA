@echo off
title ArticleDNA server
cd /d "%~dp0backend"

if not exist ".venv\Scripts\python.exe" (
  echo First run: setting up Python packages...
  python -m venv .venv
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt
)

if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo Created backend\.env - add your API keys to it, then run this file again.
  pause
  exit /b
)

echo.
echo  ArticleDNA server is running at http://localhost:8000
echo  Keep this window open while you use the extension. Close it to stop.
echo.
".venv\Scripts\python.exe" -m uvicorn main:app --host 127.0.0.1 --port 8000
pause

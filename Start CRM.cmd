@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\local-demo.ps1" start
if errorlevel 1 (
  pause
  exit /b 1
)
start "" "http://localhost:5173"

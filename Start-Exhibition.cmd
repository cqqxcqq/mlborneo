@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 22.12 or newer is required.
  pause
  exit /b 1
)
echo Open http://127.0.0.1:4173 in your exhibition browser.
echo Keep this window open while the exhibition is running.
node scripts\serve.mjs
pause

@echo off
TITLE MoveWall AI - Dev Server
cd /d "%~dp0"

echo ====================================================
echo    MoveWall AI - Unified Dev Runner
echo ====================================================
echo.

node scripts/run-dev.js
pause


@echo off
TITLE MoveWall AI - Dual Launcher
cd /d "%~dp0"

echo ====================================================
echo    MoveWall AI - Dual Window Launcher
echo ====================================================
echo Membuka Frontend dan Backend di 2 jendela terpisah...
echo.

start "MoveWall Backend (Port 3001)" cmd /k "cd /d "%~dp0game-ui\backend" && echo [MoveWall Backend] Menjalankan server... && npm run dev"
timeout /t 2 /nobreak >nul
start "MoveWall Frontend (Port 3000)" cmd /k "cd /d "%~dp0game-ui" && echo [MoveWall Frontend] Menjalankan static server... && npm run dev"

echo Jendela Backend dan Frontend berhasil dibuka!
echo Tutup jendela masing-masing saat ingin menghentikan service.
echo.
pause


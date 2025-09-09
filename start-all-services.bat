@echo off
echo Starting Pizza Platform Services...
echo.

:: Get the current directory (Pizza project folder)
set PROJECT_DIR=%~dp0

:: Start Backend using existing script
echo Starting Backend Server...
start "Pizza Backend" cmd /c "cd /d "%PROJECT_DIR%" && start-backend.bat"

:: Wait a moment before starting frontend
timeout /t 2 /nobreak >nul

:: Start Frontend using existing script
echo Starting Frontend Server...
start "Pizza Frontend" cmd /c "cd /d "%PROJECT_DIR%" && start-frontend.bat"

:: Wait a moment before starting tunnel
timeout /t 3 /nobreak >nul

:: Start Cloudflare Tunnel in new window
echo Starting Cloudflare Tunnel...
start "Cloudflare Tunnel" cmd /k "cd /d "%PROJECT_DIR%" && cloudflared-windows-amd64.exe tunnel --config config.yml run"

:: Show status
echo.
echo ================================
echo Pizza Platform Services Started!
echo ================================
echo.
echo Backend:  http://localhost:7000
echo Frontend: http://localhost:3000
echo.
echo Public URLs (via Cloudflare Tunnel):
echo App: https://app.pizzabit.io
echo API: https://api.pizzabit.io
echo.
echo Press any key to exit this window...
pause >nul
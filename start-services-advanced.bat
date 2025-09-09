@echo off
title Pizza Platform - Service Launcher
color 0A

echo.
echo  ╔═══════════════════════════════════════╗
echo  ║        Pizza Platform Launcher        ║
echo  ╚═══════════════════════════════════════╝
echo.

:: Get the current directory
set PROJECT_DIR=%~dp0

:: Check if required files exist
if not exist "%PROJECT_DIR%package.json" (
    echo ❌ package.json not found!
    echo    Make sure you're running this from the Pizza project folder
    goto :error
)

if not exist "%PROJECT_DIR%frontend" (
    echo ❌ Frontend folder not found!
    goto :error
)

if not exist "%PROJECT_DIR%config.yml" (
    echo ❌ Cloudflare config.yml not found!
    echo    Make sure you've set up the tunnel configuration
    goto :error
)

if not exist "%PROJECT_DIR%cloudflared-windows-amd64.exe" (
    echo ❌ cloudflared-windows-amd64.exe not found!
    echo    Make sure cloudflared is in the project folder
    goto :error
)

echo ✅ All required files found
echo.

:: Kill any existing processes (optional cleanup)
echo 🔄 Cleaning up any existing processes...
taskkill /F /IM node.exe 2>nul
taskkill /F /IM cloudflared-windows-amd64.exe 2>nul
timeout /t 1 /nobreak >nul

:: Start Backend using existing script
echo 🚀 Starting Backend Server...
start "🍕 Pizza Backend (Port 7000)" cmd /c "cd /d "%PROJECT_DIR%" && start-backend.bat"

:: Wait and check if backend started
timeout /t 3 /nobreak >nul

:: Start Frontend using existing script
echo 🌐 Starting Frontend Server...
start "🍕 Pizza Frontend (Port 3000)" cmd /c "cd /d "%PROJECT_DIR%" && start-frontend.bat"

:: Wait before starting tunnel
timeout /t 4 /nobreak >nul

:: Start Cloudflare Tunnel
echo ☁️ Starting Cloudflare Tunnel...
start "🍕 Pizza Tunnel" cmd /k "title Pizza Cloudflare Tunnel & color 0D & cd /d "%PROJECT_DIR%" & echo Starting Cloudflare Tunnel... & echo Connecting app.pizzabit.io and api.pizzabit.io & echo. & cloudflared-windows-amd64.exe tunnel --config config.yml run"

:: Show final status
timeout /t 2 /nobreak >nul
cls
echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║           🍕 Services Started! 🍕            ║
echo  ╚══════════════════════════════════════════════╝
echo.
echo  📍 LOCAL DEVELOPMENT:
echo     Backend:  http://localhost:7000
echo     Frontend: http://localhost:3000
echo.
echo  🌐 PUBLIC ACCESS (via Cloudflare Tunnel):
echo     App: https://app.pizzabit.io
echo     API: https://api.pizzabit.io
echo.
echo  💡 TIPS:
echo     • Check each terminal window for startup status
echo     • Backend should show "Pizza Platform Backend running on port 7000"
echo     • Frontend should show "serving at http://localhost:3000"
echo     • Tunnel should show "INF Registered tunnel connection"
echo.
echo  🛑 To stop all services: Close all terminal windows or run stop-services.bat
echo.
echo Press any key to exit this launcher...
pause >nul
goto :end

:error
echo.
echo ❌ Setup incomplete. Please fix the issues above and try again.
echo.
pause
goto :end

:end
@echo off
title Pizza Platform - Service Stopper
color 0C

echo.
echo  ╔═══════════════════════════════════════╗
echo  ║        Stopping Pizza Services        ║
echo  ╚═══════════════════════════════════════╝
echo.

echo 🛑 Stopping all Pizza Platform services...
echo.

:: Stop Node.js processes (Backend and Frontend)
echo Stopping Node.js processes...
taskkill /F /IM node.exe 2>nul
if %errorlevel% == 0 (
    echo ✅ Node.js processes stopped
) else (
    echo ℹ️ No Node.js processes were running
)

:: Stop Cloudflare tunnel
echo Stopping Cloudflare tunnel...
taskkill /F /IM cloudflared-windows-amd64.exe 2>nul
if %errorlevel% == 0 (
    echo ✅ Cloudflare tunnel stopped
) else (
    echo ℹ️ No Cloudflare tunnel was running
)

:: Stop any serve processes
echo Stopping serve processes...
taskkill /F /IM serve.exe 2>nul >nul

echo.
echo ✅ All Pizza Platform services have been stopped!
echo.
echo Press any key to exit...
pause >nul
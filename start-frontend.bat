@echo off
echo ===============================================
echo 🍕 PIZZA PLATFORM - Frontend Server Startup 🚀
echo ===============================================
echo.

REM Check if we're in the correct directory
if not exist "frontend" (
    echo ❌ Error: frontend folder not found!
    echo Please make sure you're running this from the Pizza project root directory.
    pause
    exit /b 1
)

echo 📁 Navigating to frontend directory...
cd frontend

echo.
echo 🌐 Starting frontend server...
echo ===============================================

REM Option 1: Try npx serve (recommended) - REMOVED -s flag to fix routing
echo [1] Attempting to start with 'npx serve'...
where npx >nul 2>&1
if %ERRORLEVEL% == 0 (
    echo ✅ npx found! Starting server with serve...
    echo 🌍 Pizza Platform Main Site: http://localhost:3000
    echo 🏠 Platform Dashboard: http://localhost:3000/platform-index.html
    echo 👤 Customer Login: http://localhost:3000/pages/customer-login.html
    echo 🏢 Business Login: http://localhost:3000/pages/business-login.html
    echo 📝 Press Ctrl+C to stop the server
    echo.
    echo 🚀 Opening Pizza Platform Main Site in 3 seconds...
    timeout /t 3 /nobreak >nul
    start http://localhost:3000
    npx serve . -l 3000
    goto :end
)

REM Option 2: Try http-server
echo [2] Attempting to start with 'npx http-server'...
npx http-server --version >nul 2>&1
if %ERRORLEVEL% == 0 (
    echo ✅ http-server available! Starting server...
    echo 🌍 Pizza Platform Main Site: http://localhost:8080
    echo 🏠 Platform Dashboard: http://localhost:8080/platform-index.html
    echo 👤 Customer Login: http://localhost:8080/pages/customer-login.html
    echo 🏢 Business Login: http://localhost:8080/pages/business-login.html
    echo 📝 Press Ctrl+C to stop the server
    echo.
    echo 🚀 Opening Pizza Platform Main Site in 3 seconds...
    timeout /t 3 /nobreak >nul
    start http://localhost:8080
    npx http-server . -p 8080 -c-1
    goto :end
)

REM Option 3: Try Python (if available)
echo [3] Attempting to start with Python...
where python >nul 2>&1
if %ERRORLEVEL% == 0 (
    echo ✅ Python found! Starting Python HTTP server...
    echo 🌍 Pizza Platform Main Site: http://localhost:8000
    echo 🏠 Platform Dashboard: http://localhost:8000/platform-index.html
    echo 👤 Customer Login: http://localhost:8000/pages/customer-login.html
    echo 🏢 Business Login: http://localhost:8000/pages/business-login.html
    echo 📝 Press Ctrl+C to stop the server
    echo.
    echo 🚀 Opening Pizza Platform Main Site in 3 seconds...
    timeout /t 3 /nobreak >nul
    start http://localhost:8000
    python -m http.server 8000
    goto :end
)

REM Option 4: Try Node.js simple server
echo [4] Attempting to create Node.js server...
where node >nul 2>&1
if %ERRORLEVEL% == 0 (
    echo ✅ Node.js found! Creating simple server...
    echo const http = require('http'); > temp_server.js
    echo const fs = require('fs'); >> temp_server.js
    echo const path = require('path'); >> temp_server.js
    echo const server = http.createServer((req, res) =^> { >> temp_server.js
    echo   let filePath = '.' + req.url; >> temp_server.js
    echo   if (filePath === './') filePath = './index.html'; >> temp_server.js
    echo   const extname = path.extname(filePath); >> temp_server.js
    echo   let contentType = 'text/html'; >> temp_server.js
    echo   if (extname === '.css') contentType = 'text/css'; >> temp_server.js
    echo   if (extname === '.js') contentType = 'text/javascript'; >> temp_server.js
    echo   if (extname === '.jpg' ^|^| extname === '.jpeg') contentType = 'image/jpeg'; >> temp_server.js
    echo   if (extname === '.png') contentType = 'image/png'; >> temp_server.js
    echo   fs.readFile(filePath, (err, content) =^> { >> temp_server.js
    echo     if (err) { res.writeHead(404); res.end('File not found'); return; } >> temp_server.js
    echo     res.writeHead(200, { 'Content-Type': contentType }); >> temp_server.js
    echo     res.end(content, 'utf-8'); >> temp_server.js
    echo   }); >> temp_server.js
    echo }); >> temp_server.js
    echo server.listen(3000, () =^> console.log('🍕 Pizza Frontend running at http://localhost:3000')); >> temp_server.js
    
    echo 🌍 Pizza Platform Main Site: http://localhost:3000
    echo 📝 Press Ctrl+C to stop the server
    echo.
    echo 🚀 Opening Pizza Platform Main Site in 3 seconds...
    timeout /t 3 /nobreak >nul
    start http://localhost:3000
    node temp_server.js
    del temp_server.js >nul 2>&1
    goto :end
)

REM If all options fail
echo ❌ No suitable server found!
echo.
echo 📋 To run the frontend, you need one of the following:
echo    • Node.js with npx (recommended): npm install -g serve
echo    • Python: Available from python.org
echo    • Any HTTP server of your choice
echo.
echo 💡 Quick setup:
echo    1. Install Node.js from nodejs.org
echo    2. Run: npm install -g serve
echo    3. Run this script again
echo.
echo 🌐 Alternative: Open frontend/index.html directly in your browser
echo    (Note: Some features may not work without a proper server)
pause
goto :end

:end
echo.
echo ===============================================
echo 🛑 Frontend server stopped
echo 💡 Run this script again to restart
echo ===============================================
cd ..
pause
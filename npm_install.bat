@echo off
echo ============================================================
echo  Noesis Health — Installing Server Dependencies
echo ============================================================
echo.

cd /d "%~dp0server"
echo Installing packages: pg, ioredis, rate-limit-redis, eslint...
echo.

call npm install pg ioredis rate-limit-redis
if errorlevel 1 (
  echo [ERROR] npm install failed. Make sure Node.js is installed.
  pause
  exit /b 1
)

echo.
echo Installing dev dependency: eslint...
call npm install --save-dev eslint
if errorlevel 1 (
  echo [WARNING] eslint install failed - not critical
)

echo.
echo ============================================================
echo  Done! All dependencies installed.
echo ============================================================
pause

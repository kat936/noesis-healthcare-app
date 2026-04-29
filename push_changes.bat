@echo off
echo ============================================================
echo  Noesis Health — Committing and Pushing to GitHub
echo ============================================================
echo.

cd /d "%~dp0"

echo Adding all changes...
git add -A

echo.
echo Committing...
git commit -m "fix: null guards, toast error handlers, Stripe success toast + plan refresh, .toFixed() guards, divide-by-zero guard in scrub rate"

echo.
echo Pushing to GitHub...
git push origin main

if errorlevel 1 (
  echo.
  echo [ERROR] Push failed. You may need to authenticate.
  echo Try running: git push origin main
  echo and enter your GitHub credentials when prompted.
) else (
  echo.
  echo ============================================================
  echo  All changes pushed to GitHub successfully!
  echo ============================================================
)
pause

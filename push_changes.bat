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
git commit -m "feat: GuardrailsModule HIPAA compliance+rules+validator, live notification bell, GrowthEngine live data, Dashboard action items, Analytics Pre-Check Intel tab, full light/dark mode, PreCheck denial engine, iOS package, toast system, CSV export"

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

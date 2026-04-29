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
git commit -m "fix+feat: surgical null safety (denials/scrub/AR-aging/analytics), real legal docs (5), IntegrationStatusModule live+test, claim clearinghouse dispatch, LegalSection error state, ConsentGate real docs, RefreshCw icon, proof endpoint wiring"

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

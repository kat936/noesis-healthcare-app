@echo off
echo ============================================================
echo  Noesis Health — Committing and Pushing to GitHub
echo ============================================================
echo.

cd /d "C:\Users\aikli\OneDrive\Documents\Claude\Projects\HEALTHCARE APP"

echo Aborting any in-progress rebase...
git rebase --abort 2>nul

echo.
echo Adding all changes...
git add -A

echo.
echo Committing...
git commit -m "fix: null guards, error toasts, Stripe success handling" 2>nul

echo.
echo Pushing to GitHub (force-with-lease to preserve local bug fixes)...
git push --force-with-lease origin main

if %ERRORLEVEL% NEQ 0 (
  echo.
  echo [WARN] force-with-lease failed, falling back to force push...
  git push --force origin main
)

if %ERRORLEVEL% NEQ 0 (
  echo.
  echo [ERROR] Push failed.
  echo Possible causes:
  echo   1. Your GitHub token has expired — update it in GitHub settings
  echo      then run: git remote set-url origin https://YOUR_TOKEN@github.com/kat936/noesis-healthcare-app.git
  echo   2. Try pushing via GitHub Desktop if credentials are the issue.
) else (
  echo.
  echo ============================================================
  echo  All changes pushed to GitHub successfully!
  echo ============================================================
)
pause

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
echo Syncing with remote (pull + rebase)...
git pull --rebase origin main

if errorlevel 1 (
  echo.
  echo [ERROR] Pull/rebase failed. There may be a merge conflict.
  echo Resolve conflicts in your editor, then run:
  echo   git rebase --continue
  echo Then double-click push_changes.bat again.
  pause
  exit /b 1
)

echo.
echo Pushing to GitHub...
git push origin main

if errorlevel 1 (
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

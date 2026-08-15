@echo off
setlocal
cd /d "%~dp0"
echo Starting Kuula local development environment...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0RUN_KUULA_LOCAL.ps1"
if errorlevel 1 (
  echo.
  echo Kuula did not start successfully. Review the error above.
  pause
)
endlocal

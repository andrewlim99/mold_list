@echo off
setlocal
setlocal EnableDelayedExpansion
pushd "%~dp0"
set "APP_DIR=%~dp0Mold Program\Dashboard App"
set "SERVER_PS1=%APP_DIR%\mold_shared_server.ps1"
set "DASHBOARD_URL=http://127.0.0.1:3212/mold_dashboard.html"
set "HEALTH_URL=http://127.0.0.1:3212/api/health"
set "POWERSHELL_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"

echo Starting Mold shared server...
echo Dashboard URL: !DASHBOARD_URL!
echo Shared data file: !APP_DIR!\mold_shared_rows.json

if not exist "!SERVER_PS1!" (
  echo Server file not found: !SERVER_PS1!
  pause
  popd
  endlocal
  exit /b 1
)

!POWERSHELL_EXE! -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing '!HEALTH_URL!' | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  start "" /min "!POWERSHELL_EXE!" -NoProfile -ExecutionPolicy Bypass -Command "Set-Location -LiteralPath '%~dp0'; & '.\Mold Program\Dashboard App\mold_shared_server.ps1'"
  set "SERVER_READY="
  for /L %%I in (1,1,20) do (
    !POWERSHELL_EXE! -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing '!HEALTH_URL!' | Out-Null; exit 0 } catch { exit 1 }"
    if not errorlevel 1 (
      set "SERVER_READY=1"
      goto :server_ready
    )
    timeout /t 1 /nobreak >nul
  )
  :server_ready
  if not defined SERVER_READY (
    echo Shared server did not start correctly.
    echo Please keep this window open and contact Codex support.
    pause
    popd
    endlocal
    endlocal
    exit /b 1
  )
)
start "" "!DASHBOARD_URL!"
popd
endlocal
endlocal

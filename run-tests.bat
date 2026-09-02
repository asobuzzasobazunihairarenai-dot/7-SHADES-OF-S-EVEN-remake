@echo off
chcp 65001 >nul
rem 7 SHADES OF S:EVEN - test launcher (created from the in-app smoke test panel)
rem Put this file in the project folder (where package.json is).
rem You can also pass the number directly:  run-tests.bat 1
rem NOTE: keep this file ASCII-only. cmd.exe breaks batch files that contain Japanese text.
cd /d "%~dp0"
if not "%~1"=="" (
  call :run %~1
  exit /b
)
:menu
cls
echo ============================================
echo   7 SHADES OF S:EVEN   TEST LAUNCHER
echo ============================================
echo   1) Card effect test        - a few seconds
echo   2) Self play  2P  8 turns
echo   3) Self play  4P  8 turns
echo   4) Self play  2P  until someone wins
echo   5) Online auto match  2P
echo   6) Online auto match  4P
echo   7) Run 1 + 2 + 5
echo   0) Exit
echo.
rem set /p can drop input under chcp 65001, so use choice (single key press).
choice /c 12345670 /n /m "Press a number key: "
set "N=%errorlevel%"
rem 255 = choice failed (e.g. input was redirected and ran out). Exit instead of looping forever.
if "%N%"=="255" exit /b
if "%N%"=="0" exit /b
if "%N%"=="8" exit /b
call :run %N%
echo.
echo ---- done. press any key to go back to the menu ----
pause >nul
goto menu

:run
set "CMD="
if "%~1"=="1" set "CMD=node test/effects.mjs"
if "%~1"=="2" set "CMD=node test/smoke.mjs 2"
if "%~1"=="3" set "CMD=node test/smoke.mjs 4"
if "%~1"=="4" set "CMD=node test/smoke.mjs 2 --full"
if "%~1"=="5" set "CMD=node test/online-smoke.mjs 2"
if "%~1"=="6" set "CMD=node test/online-smoke.mjs 4"
if "%~1"=="7" set "CMD=node test/effects.mjs && node test/smoke.mjs 2 && node test/online-smoke.mjs 2"
if not defined CMD (
  echo Please choose a number from 1 to 7.
  exit /b 1
)
echo.
echo Running: %CMD%
echo.
call %CMD%
exit /b

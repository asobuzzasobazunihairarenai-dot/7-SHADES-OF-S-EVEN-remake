@echo off
chcp 65001 >nul
rem 7 SHADES OF S:EVEN — テストランチャー（アプリのスモークテスト画面から作成）
rem このファイルはプロジェクトのフォルダ（package.json があるところ）に置いてください。
rem 番号を引数で渡すこともできます: テスト.bat 1
cd /d "%~dp0"
if not "%~1"=="" (
  call :run %~1
  exit /b
)
:menu
cls
echo ============================================
echo   7 SHADES OF S:EVEN  テスト
echo ============================================
echo   1) カード効果テスト（数秒・いちばん手軽）
echo   2) 自己対戦テスト 2人（8ターン）
echo   3) 自己対戦テスト 4人（8ターン）
echo   4) 自己対戦テスト 2人（決着まで）
echo   5) オンライン自動対戦 2人
echo   6) オンライン自動対戦 4人
echo   7) 全部まとめて（1→2→5）
echo   0) 終了
echo.
rem set /p は UTF-8 のとき入力を取りこぼすことがあるので、1キーで選べる choice を使う。
choice /c 12345670 /n /m "番号のキーを押してください: "
set "N=%errorlevel%"
if "%N%"=="8" exit /b
call :run %N%
echo.
echo ---- 終わりました（何かキーを押すとメニューに戻ります）----
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
  echo 1〜7 の番号を指定してください。
  exit /b 1
)
echo.
echo ▶ %CMD%
echo.
call %CMD%
exit /b

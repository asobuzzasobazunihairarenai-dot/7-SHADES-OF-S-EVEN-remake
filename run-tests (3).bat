@echo off
rem 7 SHADES OF S:EVEN テストランチャー（アプリのスモークテスト画面から作成）
rem このファイルはプロジェクトのフォルダ（package.json があるところ）に置いてください。
rem 番号を引数で渡すこともできます: run-tests.bat 1
rem 【このファイルは Shift_JIS(CP932) です】バッチの中の日本語は cmd.exe が現在のコードページで
rem 読むため、UTF-8 で書くと行を途中で切って読み違えて壊れます。
for /f "tokens=2 delims=:" %%a in ('chcp') do set "OCP=%%a"
set "OCP=%OCP: =%"
chcp 932 >nul
cd /d "%~dp0"
if not "%~1"=="" (
  call :run %~1
  chcp %OCP% >nul
  exit /b
)
:menu
cls
echo ============================================
echo   7 SHADES OF S:EVEN  テスト
echo ============================================
echo   1) カード効果テスト  （数秒・いちばん手軽）
echo   2) 自己対戦テスト 2人（8ターン）
echo   3) 自己対戦テスト 4人（8ターン）
echo   4) 自己対戦テスト 2人（決着まで）
echo   5) オンライン自動対戦 2人
echo   6) オンライン自動対戦 4人
echo   7) まとめて実行（1と2と5）
echo   0) 終了
echo.
rem set /p は入力を取りこぼすことがあるので、1キーで選べる choice を使う。
choice /c 12345670 /n /m "番号のキーを1つ押してください: "
set "N=%errorlevel%"
rem 255 = choice が入力を読めなかった。無限ループしないようここで終了する。
if "%N%"=="255" ( chcp %OCP% >nul & exit /b )
if "%N%"=="8" ( chcp %OCP% >nul & exit /b )
rem 7 = run 1, 2 and 5 one by one (chaining them on a single line is unreliable)
if "%N%"=="7" (
  call :run 1
  call :run 2
  call :run 5
) else (
  call :run %N%
)
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
if not defined CMD (
  echo 1-6 の番号を指定してください。
  exit /b 1
)
echo.
echo 実行中: %CMD%
echo.
rem ここから先はテスト本体(node)の日本語出力のため UTF-8 に切り替える。
rem 【重要】切り替えた後の行は半角英数だけにすること（日本語だと読み違えて壊れる）。
chcp 65001 >nul
call %CMD%
echo.
echo Log file saved in: %~dp0test-logs
chcp 932 >nul
exit /b

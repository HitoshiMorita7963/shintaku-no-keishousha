@echo off
chcp 65001 >nul
title Shinkan Yousei Gakuen
cd /d "%~dp0"

rem ---- Node.js check ----
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js が見つかりません。
  echo https://nodejs.org/ja から LTS 版をインストールしてから、もう一度このファイルを開いてください。
  pause
  exit /b 1
)

rem ---- Prepare game data (first time only) ----
if not exist "game\generated\data.bundle.js" (
  echo ゲームデータを準備しています...
  node "tools\build-data.mjs"
  if errorlevel 1 (
    echo ゲームデータの準備に失敗しました。上のメッセージを確認してください。
    pause
    exit /b 1
  )
)

rem ---- Open the browser after 2 seconds, then start the server ----
start "" /b cmd /c "timeout /t 2 /nobreak >nul & start "" http://localhost:5173/"
echo.
echo 神官養成学園を起動します。ブラウザが開かない場合は http://localhost:5173/ を開いてください。
echo.
node "tools\serve.mjs"
pause

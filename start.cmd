@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 설치 후 다시 실행해 주세요.
  pause
  exit /b 1
)
if not exist "node_modules\kordoc\package.json" (
  echo 필요한 패키지가 없습니다. 인터넷이 가능한 개발 PC에서 npm.cmd ci를 실행해 주세요.
  pause
  exit /b 1
)
echo 브라우저에서 http://127.0.0.1:3210 을 열어 주세요.
node server.mjs
pause

@echo off
REM scripts/setup.bat
REM First-run setup script for Windows.
REM Run with : scripts\setup.bat

echo.
echo polybridge-mcp setup
echo ====================
echo.

REM Check Node.js
where node >nul 2>nul
if errorlevel 1 (
    echo Node.js is not installed. Please install Node.js ^>=20 from https://nodejs.org
    exit /b 1
)

for /f "tokens=1 delims=v." %%a in ('node -v') do set NODE_MAJOR=%%a
echo Node.js detected.

REM Install dependencies
echo.
echo Installing npm dependencies...
npm install

REM Copy config if it doesn't exist
if not exist "polybridge-mcp.config.json" (
    copy polybridge-mcp.config.example.json polybridge-mcp.config.json
    echo.
    echo Config file created : polybridge-mcp.config.json
    echo Edit it to enable the bridges you want to use.
) else (
    echo.
    echo Config file already exists : polybridge-mcp.config.json
)

REM Create workspace directory
if not exist "workspace" mkdir workspace
echo Workspace directory ready : .\workspace

REM Build TypeScript
echo.
echo Compiling TypeScript...
npm run build

echo.
echo Setup complete. Start the server with :
echo   npm run dev    (development mode with PTL logs)
echo   npm start      (production mode)
echo.

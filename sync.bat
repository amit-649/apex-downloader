@echo off
title ApexDownloader Sync Utility
:menu
cls
echo ===================================================
echo    ApexDownloader - Cookie Sync ^& Deploy Utility
echo ===================================================
echo.
echo  [1] Sync All Cookies (YouTube + Instagram) ^& Deploy
echo  [2] Sync YouTube Cookies Only ^& Deploy
echo  [3] Sync Instagram Cookies Only ^& Deploy
echo  [4] Trigger Vercel Production Deploy Only
echo  [5] Exit
echo.
set /p choice="Enter your choice (1-5): "

if "%choice%"=="1" (
    echo.
    echo Running All Cookies Sync ^& Deploy...
    node scripts/sync_cookies.js --both
    pause
    goto menu
)
if "%choice%"=="2" (
    echo.
    echo Running YouTube Cookies Sync ^& Deploy...
    node scripts/sync_cookies.js --youtube
    pause
    goto menu
)
if "%choice%"=="3" (
    echo.
    echo Running Instagram Cookies Sync ^& Deploy...
    node scripts/sync_cookies.js --instagram
    pause
    goto menu
)
if "%choice%"=="4" (
    echo.
    echo Triggering Vercel Deploy...
    node scripts/sync_cookies.js --sync-only
    pause
    goto menu
)
if "%choice%"=="5" (
    exit
)
echo Invalid choice. Please try again.
pause
goto menu

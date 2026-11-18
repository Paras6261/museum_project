@echo off
title ExhibitX Real-Life Camera AR & 3D Museum Server
echo.
echo  ================================================================
echo   ExhibitX - Real-Life Live Camera AR ^& 3D Museum (Zero GPS)
echo   Desktop Webcam URL : http://localhost:8080
echo   Mobile Camera AR   : https://^<your-LAN-IP^>:8443
echo  ================================================================
echo.
start "" "http://localhost:8080"
python "%~dp0server.py"
pause

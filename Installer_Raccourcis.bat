@echo off
setlocal
TITLE Platinum Media Center - Installation des raccourcis

echo ==================================================
echo   PLATINUM MEDIA CENTER - INSTALLATION RACCOURCIS
echo ==================================================
echo.

set "APP_DIR=%~dp0"
:: Retirer le slash final s'il existe
if "%APP_DIR:~-1%"=="\" set "APP_DIR=%APP_DIR:~0,-1%"

set "TARGET_BAT=%APP_DIR%\Lancer_Platinum.bat"

if not exist "%TARGET_BAT%" (
    echo [ERREUR] Le fichier Lancer_Platinum.bat est introuvable dans ce dossier :
    echo %APP_DIR%
    pause
    exit /b 1
)

set "ICON_FILE=%APP_DIR%\logo.ico"

echo [1/2] Creation du raccourci sur le Bureau...
powershell -NoProfile -Command ^
    "$ws = New-Object -ComObject WScript.Shell; " ^
    "$s = $ws.CreateShortcut([System.IO.Path]::Combine([Environment]::GetFolderPath('Desktop'), 'Platinium IPTV.lnk')); " ^
    "$s.TargetPath = '%TARGET_BAT%'; " ^
    "$s.WorkingDirectory = '%APP_DIR%'; " ^
    "$s.Description = 'Lancer Platinium IPTV'; " ^
    "if (Test-Path '%ICON_FILE%') { $s.IconLocation = '%ICON_FILE%,0' }; " ^
    "$s.Save()"

echo [2/2] Ajout dans le Menu Demarrer (shell:programs)...
powershell -NoProfile -Command ^
    "$ws = New-Object -ComObject WScript.Shell; " ^
    "$s = $ws.CreateShortcut([System.IO.Path]::Combine([Environment]::GetFolderPath('Programs'), 'Platinium IPTV.lnk')); " ^
    "$s.TargetPath = '%TARGET_BAT%'; " ^
    "$s.WorkingDirectory = '%APP_DIR%'; " ^
    "$s.Description = 'Lancer Platinium IPTV'; " ^
    "if (Test-Path '%ICON_FILE%') { $s.IconLocation = '%ICON_FILE%,0' }; " ^
    "$s.Save()"

echo.
echo ==================================================
echo [SUCCES] Raccourcis crees avec succes !
echo - Sur votre Bureau : 'Platinium IPTV'
echo - Dans le menu Demarrer (Applications)
echo ==================================================
echo.
pause

@echo off
TITLE Platinum Media Center - Lancement intelligent
echo --------------------------------------------------
echo      PLATINUM MEDIA CENTER - BOOT LOADER
echo --------------------------------------------------
echo.

:: 1. Verifier si Node.js est installe globalement
node -v >nul 2>&1
IF %ERRORLEVEL% EQU 0 (
    echo [OK] Node.js est present.
) ELSE (
    echo [ATTENTION] Node.js n'est pas installe sur ce PC.
    
    :: Verifier si on a deja telecharge la version portable locale
    IF NOT EXIST "node-portable\node.exe" (
        echo [TELECHARGEMENT] Recuperation de Node.js portable en cours...
        echo Cela peut prendre 1 a 2 minutes selon votre connexion, merci de patienter...
        powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.12.2/node-v20.12.2-win-x64.zip' -OutFile 'node-portable.zip'"
        
        echo [EXTRACTION] Installation de la version portable...
        powershell -Command "Expand-Archive -Path 'node-portable.zip' -DestinationPath '.' -Force"
        rename node-v20.12.2-win-x64 node-portable
        del node-portable.zip
    )
    
    echo [OK] Node.js portable est pret.
    :: Ajouter la version portable au PATH pour que l'ordinateur la trouve
    set "PATH=%CD%\node-portable;%PATH%"
)

:: 2. Installer les modules si manquants ou incomplets
IF NOT EXIST "node_modules\" (
    echo [INSTALLATION] Premier lancement detecte ! Telechargement des dependances...
    echo Cela prend un peu de temps la premiere fois...
    call npm install
    echo [OK] Dependances installees !
) ELSE IF NOT EXIST "node_modules\concurrently\" (
    echo [MISE A JOUR] Installation des outils de lancement manquants...
    call npm install
    echo [OK] Dependances mises a jour !
)

:: 3. Lancement
echo.
echo [LANCEMENT] Demarrage de l'application Platinum...
echo Ne fermez pas cette fenetre noire pendant que vous utilisez l'application.
echo --------------------------------------------------
call npm run dev:app

pause

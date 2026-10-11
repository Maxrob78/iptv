@echo off
setlocal enabledelayedexpansion
TITLE Platinum Media Center - Mise a jour

echo ==================================================
echo       PLATINUM MEDIA CENTER - MISE A JOUR
echo ==================================================
echo.

:: 1. Trouver Git
set "GIT_CMD=git"
where git >nul 2>&1
if %ERRORLEVEL% EQU 0 goto :git_ready

if exist "git-portable\cmd\git.exe" (
    set "GIT_CMD=%CD%\git-portable\cmd\git.exe"
    set "PATH=%CD%\git-portable\cmd;%PATH%"
    echo [OK] Git Portable detecte.
    goto :git_ready
)

if exist "C:\Program Files\Git\cmd\git.exe" (
    set "GIT_CMD=C:\Program Files\Git\cmd\git.exe"
    set "PATH=C:\Program Files\Git\cmd;%PATH%"
    echo [OK] Git standard detecte.
    goto :git_ready
)

if exist "%LOCALAPPDATA%\Programs\Git\cmd\git.exe" (
    set "GIT_CMD=%LOCALAPPDATA%\Programs\Git\cmd\git.exe"
    set "PATH=%LOCALAPPDATA%\Programs\Git\cmd;%PATH%"
    echo [OK] Git detecte dans AppData.
    goto :git_ready
)

echo [ATTENTION] Git n'est pas installe sur ce PC.
echo [TELECHARGEMENT] Recuperation de Git Portable (MinGit)...
echo Merci de patienter quelques secondes...

powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $wc = New-Object System.Net.WebClient; $wc.DownloadFile('https://github.com/git-for-windows/git/releases/download/v2.44.0.windows.1/MinGit-2.44.0-64-bit.zip', 'mingit.zip')"

if not exist "mingit.zip" (
    echo.
    echo [ERREUR] Echec du telechargement de Git portable.
    echo Verifiez votre connexion Internet.
    echo.
    pause
    exit /b 1
)

echo [EXTRACTION] Installation de Git Portable...
powershell -Command "Expand-Archive -Path 'mingit.zip' -DestinationPath 'git-portable' -Force"
del mingit.zip >nul 2>&1

set "GIT_CMD=%CD%\git-portable\cmd\git.exe"
set "PATH=%CD%\git-portable\cmd;%PATH%"
echo [OK] Git Portable installe avec succes !

:git_ready

:: Autoriser ce dossier dans Git (evite le blocage "dubious ownership" sur cle USB / FAT32 / autre utilisateur)
"%GIT_CMD%" config --global --add safe.directory "%CD:\=/%" >nul 2>&1
"%GIT_CMD%" config --global --add safe.directory "*" >nul 2>&1


:: 2. Verifier Node.js
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    if exist "node-portable\node.exe" (
        set "PATH=%CD%\node-portable;%PATH%"
    )
)

:: 3. Branche
set "CURRENT_BRANCH=master"
for /f "delims=" %%i in ('"%GIT_CMD%" branch --show-current 2^>nul') do set "CURRENT_BRANCH=%%i"
if "%CURRENT_BRANCH%"=="" set "CURRENT_BRANCH=master"

echo [1/4] Recherche des mises a jour sur GitHub (branche: %CURRENT_BRANCH%)...
"%GIT_CMD%" fetch origin %CURRENT_BRANCH% >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERREUR] Impossible de contacter GitHub ou de recuperer les mises a jour.
    echo ----------------------------------------------------------------------
    echo Verifiez :
    echo  1. Votre connexion Internet.
    echo  2. Que le depot GitHub est bien PUBLIC.
    echo ----------------------------------------------------------------------
    echo.
    pause
    exit /b 1
)

:: 4. Comparer commits
set "LOCAL_HASH="
set "REMOTE_HASH="
for /f "delims=" %%i in ('"%GIT_CMD%" rev-parse HEAD 2^>nul') do set "LOCAL_HASH=%%i"
for /f "delims=" %%i in ('"%GIT_CMD%" rev-parse origin/%CURRENT_BRANCH% 2^>nul') do set "REMOTE_HASH=%%i"

if "%LOCAL_HASH%"=="%REMOTE_HASH%" (
    echo.
    echo [OK] Vous etes deja sur la toute derniere version !
    echo.
    echo Dernier commit installe :
    "%GIT_CMD%" log -1 --pretty=format:"  - %%h : %%s (%%cr)"
    echo.
    echo ==================================================
    echo.
    pause
    exit /b 0
)

:: 5. Nouveaux commits
echo.
echo ==================================================
echo      NOUVELLE MISE A JOUR DISPONIBLE !
echo ==================================================
echo.
echo Nouveautes apportees par cette mise a jour :
echo.
"%GIT_CMD%" log HEAD..origin/%CURRENT_BRANCH% --pretty=format:"  - [%%h] %%s (%%cr)"
echo.
echo.
echo ==================================================
set /p "CONFIRM=Voulez-vous installer cette mise a jour maintenant ? (O/N) : "

if /i not "%CONFIRM%"=="O" (
    echo.
    echo [ANNULE] Mise a jour ignoree.
    echo.
    pause
    exit /b 0
)

echo.
echo [2/4] Telechargement des derniers fichiers...
"%GIT_CMD%" pull origin %CURRENT_BRANCH%
if %ERRORLEVEL% NEQ 0 (
    echo [ATTENTION] Conflit detecte. Alignement avec la version officielle...
    "%GIT_CMD%" stash >nul 2>&1
    "%GIT_CMD%" pull origin %CURRENT_BRANCH%
)

echo.
echo [3/4] Verification des dependances...
call npm install --prefer-offline --legacy-peer-deps

echo.
echo [4/4] Compilation de la nouvelle version...
call npm run build

echo.
echo ==================================================
echo [SUCCES] L'application a ete mise a jour avec succes !
echo Vous pouvez maintenant relancer l'application avec Lancer_Platinum.bat
echo ==================================================
echo.
pause

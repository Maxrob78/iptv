@echo off
setlocal enabledelayedexpansion
TITLE Platinum Media Center - Mise a jour

echo ==================================================
echo       PLATINUM MEDIA CENTER - MISE A JOUR
echo ==================================================
echo.

:: 1. Verifier et trouver Git ou installer Git Portable (MinGit)
set "GIT_EXE=git"
where git >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] Git standard detecte.
) else (
    if exist "git-portable\cmd\git.exe" (
        set "GIT_EXE=%CD%\git-portable\cmd\git.exe"
        set "PATH=%CD%\git-portable\cmd;%PATH%"
        echo [OK] Git Portable detecte.
    ) else if exist "C:\Program Files\Git\cmd\git.exe" (
        set "GIT_EXE=C:\Program Files\Git\cmd\git.exe"
        set "PATH=C:\Program Files\Git\cmd;%PATH%"
    ) else if exist "%LOCALAPPDATA%\Programs\Git\cmd\git.exe" (
        set "GIT_EXE=%LOCALAPPDATA%\Programs\Git\cmd\git.exe"
        set "PATH=%LOCALAPPDATA%\Programs\Git\cmd;%PATH%"
    ) else (
        echo [ATTENTION] Git n'est pas installe sur ce PC.
        echo [TELECHARGEMENT] Recuperation de Git Portable (MinGit)...
        echo Cela prend quelques secondes, merci de patienter...

        powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('https://github.com/git-for-windows/git/releases/download/v2.44.0.windows.1/MinGit-2.44.0-64-bit.zip', 'mingit.zip')"
        
        if not exist "mingit.zip" (
            echo [ERREUR] Echec du telechargement de Git portable. Verifiez votre connexion Internet.
            pause
            exit /b 1
        )

        echo [EXTRACTION] Installation de Git Portable...
        powershell -Command "Expand-Archive -Path 'mingit.zip' -DestinationPath 'git-portable' -Force"
        del mingit.zip >nul 2>&1

        set "GIT_EXE=%CD%\git-portable\cmd\git.exe"
        set "PATH=%CD%\git-portable\cmd;%PATH%"
        echo [OK] Git Portable installe avec succes !
    )
)

:: 2. Verifier Node.js
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    if exist "node-portable\node.exe" (
        set "PATH=%CD%\node-portable;%PATH%"
    )
)

:: 3. Detection de la branche active
for /f "tokens=*" %%b in ('"%GIT_EXE%" branch --show-current 2^>nul') do set CURRENT_BRANCH=%%b
if "%CURRENT_BRANCH%"=="" set CURRENT_BRANCH=master

echo [1/4] Recherche des mises a jour sur GitHub (branche: %CURRENT_BRANCH%)...
"%GIT_EXE%" fetch origin %CURRENT_BRANCH% >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERREUR] Impossible de contacter GitHub ou de recuperer les mises a jour.
    echo ----------------------------------------------------------------------
    echo Raisons possibles :
    echo  1. Pas de connexion Internet.
    echo  2. Le depot GitHub est PRIVE et ce PC n'a pas les identifiants d'acces.
    echo     (Rendez le depot Public sur GitHub pour que tout le monde puisse MAJ)
    echo ----------------------------------------------------------------------
    echo.
    pause
    exit /b 1
)

:: 4. Comparer les commits
for /f "tokens=*" %%a in ('"%GIT_EXE%" rev-parse HEAD 2^>nul') do set LOCAL_HASH=%%a
for /f "tokens=*" %%a in ('"%GIT_EXE%" rev-parse origin/%CURRENT_BRANCH% 2^>nul') do set REMOTE_HASH=%%a

if "%LOCAL_HASH%"=="%REMOTE_HASH%" (
    echo.
    echo [OK] Vous etes deja sur la toute derniere version !
    echo.
    echo Dernier commit installe :
    "%GIT_EXE%" log -1 --pretty=format:"  - %%h : %%s (%%cr)"
    echo.
    echo ==================================================
    pause
    exit /b 0
)

:: 5. Si des mises a jour existent, afficher la liste des nouveaux commits
echo.
echo ==================================================
echo      NOUVELLE MISE A JOUR DISPONIBLE !
echo ==================================================
echo.
echo Nouveautes apportees par cette mise a jour :
echo.
"%GIT_EXE%" log HEAD..origin/%CURRENT_BRANCH% --pretty=format:"  - [%%h] %%s (%%cr)"
echo.
echo.
echo ==================================================
set /p CONFIRM="Voulez-vous installer cette mise a jour maintenant ? (O/N) : "

if /i not "%CONFIRM%"=="O" (
    echo.
    echo [ANNULE] Mise a jour ignoree.
    pause
    exit /b 0
)

echo.
echo [2/4] Telechargement des derniers fichiers...
"%GIT_EXE%" pull origin %CURRENT_BRANCH%
if %ERRORLEVEL% NEQ 0 (
    echo [ATTENTION] Conflit detecte lors du telechargement.
    echo Alignement automatique avec la version officielle...
    "%GIT_EXE%" stash >nul 2>&1
    "%GIT_EXE%" pull origin %CURRENT_BRANCH%
)

echo.
echo [3/4] Verification des dependances...
call npm install --prefer-offline

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

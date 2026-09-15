@echo off
TITLE Platinum Media Center - Restauration des Donnees
echo ----------------------------------------------------------------------
echo      PLATINUM MEDIA CENTER - RESTAURATION DU COMPTE ET HISTORIQUE
echo ----------------------------------------------------------------------
echo.

if not exist "Sauvegarde_Donnees\iptv-netflix" (
    echo [ERREUR] Aucun dossier "Sauvegarde_Donnees\iptv-netflix" trouve !
    echo Assurez-vous d'avoir d'abord lance Sauvegarder_Mes_Donnees.bat sur votre ancien PC
    echo et d'avoir copie le dossier complet ici.
    echo.
    pause
    exit /b
)

echo Fermez Platinum Media Center s'il est ouvert.
echo Restauration de vos identifiants, favoris et historique en cours...
echo.

robocopy "Sauvegarde_Donnees\iptv-netflix" "%APPDATA%\iptv-netflix" /E /R:1 /W:1 >nul 2>&1

if %ERRORLEVEL% LEQ 7 (
    echo ----------------------------------------------------------------------
    echo [SUCCES] Vos donnees ont ete restaurees avec succes !
    echo Vos comptes, favoris, profils et historiques sont maintenant actifs sur ce PC.
    echo.
    echo Vous pouvez lancer l'application avec "Lancer_Platinum.bat".
    echo ----------------------------------------------------------------------
) else (
    echo [ERREUR] Un probleme est survenu pendant la restauration. Code: %ERRORLEVEL%
)

echo.
pause

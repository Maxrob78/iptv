@echo off
TITLE Platinum Media Center - Sauvegarde des Donnees
echo ----------------------------------------------------------------------
echo      PLATINUM MEDIA CENTER - SAUVEGARDE DU COMPTE ET DE L'HISTORIQUE
echo ----------------------------------------------------------------------
echo.

if not exist "%APPDATA%\iptv-netflix" (
    echo [ERREUR] Aucune donnee Platinum trouvee sur cet ordinateur.
    echo Assurez-vous d'avoir lance l'application au moins une fois.
    echo.
    pause
    exit /b
)

echo Fermeture recommandee de Platinum avant la sauvegarde.
echo Copie de vos identifiants, profils, favoris et historique en cours...
echo.

robocopy "%APPDATA%\iptv-netflix" "Sauvegarde_Donnees\iptv-netflix" /E /XD Cache "Code Cache" "DawnCache" "GPUCache" /R:1 /W:1 >nul 2>&1
if exist "config.local.json" (
    copy /Y "config.local.json" "Sauvegarde_Donnees\config.local.json" >nul 2>&1
)

:: Codes d'erreur robocopy de 0 a 7 indiquent un succes
if %ERRORLEVEL% LEQ 7 (
    echo ----------------------------------------------------------------------
    echo [SUCCES] Sauvegarde terminee avec succes !
    echo Le dossier "Sauvegarde_Donnees" a ete cree dans le dossier du projet.
    echo.
    echo Vous pouvez maintenant copier votre dossier de projet sur votre cle USB
    echo ou votre autre PC !
    echo ----------------------------------------------------------------------
) else (
    echo [ERREUR] Un probleme est survenu pendant la copie. Code: %ERRORLEVEL%
)

echo.
pause

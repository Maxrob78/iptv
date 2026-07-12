@echo off
TITLE Platinum Media Center - Demarrage
echo --------------------------------------------------
echo      PLATINUM MEDIA CENTER - BOOT LOADER
echo --------------------------------------------------
echo.
echo [1/2] Verification des dependances...
echo [2/2] Lancement des serveurs (Next.js + Electron)...
echo.
echo Appuyez sur une touche pour lancer ou fermez la fenetre.
echo --------------------------------------------------
pause > nul
npm run dev:app
pause

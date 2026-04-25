@echo off
setlocal
node --test openratiostudy.test.js
set EXIT_CODE=%ERRORLEVEL%
exit /b %EXIT_CODE%

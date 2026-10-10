@echo off
setlocal
cd /d "%~dp0"
title Ferias AGU - servidor local
set PORTA=5173

where node >nul 2>nul
if errorlevel 1 goto sem_node

if exist node_modules goto instalado
echo Primeira execucao: instalando dependencias, pode levar alguns minutos...
call npm install
if errorlevel 1 goto erro
:instalado

rem Porta fixa: o localStorage e por endereco. Outra porta = sessao vazia, entao avisamos em vez de trocar.
netstat -ano | findstr ":%PORTA% " | findstr "LISTENING" >nul
if not errorlevel 1 goto porta_ocupada

echo Gerando a versao de producao...
call npm run build
if errorlevel 1 goto erro

echo.
echo ============================================================
echo  App rodando em http://localhost:%PORTA%
echo  Feche esta janela para encerrar o servidor.
echo ============================================================
echo.
call npx vite preview --port %PORTA% --strictPort --open
pause
exit /b 0

:sem_node
echo.
echo [ERRO] Node.js nao foi encontrado neste computador.
echo Baixe e instale a versao LTS: https://nodejs.org/pt-br/download
echo Depois feche esta janela e execute o start.bat novamente.
echo.
pause
exit /b 1

:porta_ocupada
echo.
echo [AVISO] A porta %PORTA% ja esta em uso.
echo Se o app ja estiver aberto em outra janela, use http://localhost:%PORTA%
echo A porta NAO e trocada automaticamente: os dados ficam salvos no navegador
echo por endereco, e outra porta mostraria uma sessao vazia.
echo Feche o programa que usa a porta %PORTA% e execute o start.bat de novo.
echo.
start "" http://localhost:%PORTA%
pause
exit /b 1

:erro
echo.
echo [ERRO] Algo falhou acima. Leia a mensagem, corrija e tente novamente.
pause
exit /b 1

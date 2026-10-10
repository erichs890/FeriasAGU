#!/usr/bin/env sh
# Equivalente simples do start.bat para Linux/macOS.
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null || { echo "Node.js não encontrado: https://nodejs.org/pt-br/download"; exit 1; }
[ -d node_modules ] || npm install || exit 1
npm run build || exit 1
echo "App em http://localhost:5173 — Ctrl+C para encerrar."
npx vite preview --port 5173 --strictPort --open

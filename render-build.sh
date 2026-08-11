#!/usr/bin/env bash
set -e

# Install pnpm to a writable user directory (Render's /usr/bin is read-only)
npm install -g pnpm --prefix "$HOME/.npm-global"
export PATH="$HOME/.npm-global/bin:$PATH"

pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server run build

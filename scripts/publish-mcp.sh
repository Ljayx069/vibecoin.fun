#!/usr/bin/env bash
# Mirrors mcp/ to the standalone vibecoin-mcp repo so `npx github:thetriggeredkid-spec/vibecoin-mcp` works
# (npx needs package.json at the repo root). Run from the monorepo root after committing.
set -euo pipefail

REMOTE="${1:-https://github.com/thetriggeredkid-spec/vibecoin-mcp.git}"
BRANCH="mcp-publish"

git branch -D "$BRANCH" 2>/dev/null || true
git subtree split -P mcp -b "$BRANCH"
git push -f "$REMOTE" "$BRANCH:main"
git branch -D "$BRANCH"
echo "published mcp/ -> $REMOTE (main)"

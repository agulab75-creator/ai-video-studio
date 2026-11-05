#!/bin/sh
# Concatenates src/*.js into the single file you paste into Apps Script.
cd "$(dirname "$0")"
mkdir -p dist
cat src/01_config.js src/02_api.js src/03_store_insights.js src/04_listing.js src/05_matching.js src/06_content.js src/07_account_dashboards.js src/08_orchestrator.js src/09_setup_tools.js > dist/MetaUnifiedSync.gs
wc -l dist/MetaUnifiedSync.gs
node --check dist/MetaUnifiedSync.gs 2>&1 || true

set -e

cp data/tps.js functions/lib/hierarchy.js
(cd functions; npm run build)
firebase emulators:start

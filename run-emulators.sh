set -e

cp data/tps.js functions/lib/hierarchy.js
(cd functions; npm run build)
ng build
firebase emulators:start

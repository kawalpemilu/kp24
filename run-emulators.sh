set -e

(cd functions; npm run build)
ng build
firebase emulators:start

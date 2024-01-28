set -e

ng build

(cd functions; npm run build)

firebase deploy

set -e

ng build

cp src/assets/tps2.json functions/lib/
cp data/dpt.json functions/lib/

(cd functions; npm run build)

firebase deploy

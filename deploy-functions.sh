set -e

cp src/assets/tps.json functions/lib/
cp data/dpt.json functions/lib/

cd functions
npm run build
npm run deploy

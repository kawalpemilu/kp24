import * as admin from "firebase-admin";
import { fetch, getServingUrl, writeToStream } from "./serving_url";
import { LOKASI } from "./lokasi";
import { APPROVAL_STATUS, ImageMetadata, KPU_UID, KpuData, Lokasi, SamBot, UploadRequest } from "./interfaces";
import { uploadHandler } from "./upload_handler";

const baseServingUrl = 'http://lh3.googleusercontent.com';

admin.initializeApp();
const bucket = admin.storage().bucket('kp24-fd486.appspot.com');

const firestore = admin.firestore();

console.log("env", process.env.NODE_ENV);
if (process.env.NODE_ENV !== "production") throw new Error();

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection at:", reason);
});

async function getImageId(url: string) {
    const hash = crypto.subtle.digest("SHA-256", new TextEncoder().encode(url));
    const hashArray = new Uint8Array(await hash);
    const base64Hash = btoa(String.fromCharCode(...hashArray));
    const imageId = base64Hash.replace(/[^a-zA-Z0-9]/g, "");
    if (imageId.length < 20) throw new Error(imageId);
    return imageId.substring(0, 20);
}

async function fetchKpuData(id: string) {
  const kpuUrl = `https://sirekap-obj-data.kpu.go.id/pemilu/hhcw/ppwp/${
    id.substring(0, 2)}/${id.substring(0, 4)}/${id.substring(0, 6)}/${
    id.substring(0, 10)}/${id}.json`;
  try {
    return JSON.parse(await fetch(kpuUrl)) as KpuData;
  } catch (e) {
    return undefined;
  }
}

async function fetchSamBot(idDesa: string, tpsNo: string, filename: string) {
  const prefix = `https://43.252.138.9${1 + Math.floor(Math.random() * 4)}`;
  const url = `${prefix}/download/${idDesa}/${tpsNo}/${filename
    }?configFile=pilpres_2024_plano_halaman2.json&baseUrl=${baseServingUrl}`;
  try {
    return JSON.parse(await fetch(url, true)) as SamBot;
  } catch (e) {
    console.error(e);
    console.log('url', url);
    return undefined;
  }
}

async function uploadKpuAtDesa(idDesa: string) {
  const hRef = firestore.doc(`h/i${idDesa}`);
  const lokasi = (await hRef.get()).data() as Lokasi | undefined;
  if (!lokasi) throw new Error();
  for (const [tpsNo] of Object.entries(lokasi.aggregated)) {
    // if (agg[0].totalKpuTps) continue;
    const kpuData = await fetchKpuData(idDesa + tpsNo.padStart(3, '0'));
    if (!kpuData) continue;
    if (!kpuData.status_suara) continue;
    const imageUrl = kpuData.images[1];
    const imageId = await getImageId(imageUrl);
    const objName = `kpu_data/${idDesa}/${tpsNo}-${imageId}.jpg`;
    const f = bucket.file(objName);
    const [exists] = await f.exists();
    // TODO: support replace?
    if (!exists) await writeToStream(imageUrl, f.createWriteStream());
    const servingUrl = await getServingUrl(objName);
    if (!servingUrl.startsWith(baseServingUrl)) throw new Error(servingUrl);
    const filename = servingUrl.substring(baseServingUrl.length + 1) + '=s1280';
    const samBot = await fetchSamBot(idDesa, tpsNo, filename);
    if (!samBot) continue;

    const pas1 = kpuData.chart['100025'];
    const pas2 = kpuData.chart['100026'];
    const pas3 = kpuData.chart['100027'];
    if (pas1 === undefined) continue;
    console.log(tpsNo, pas1, pas2, pas3, imageId, imageUrl);

    const sanitized: UploadRequest = {
      idLokasi: idDesa + tpsNo,
      imageId,
      imageMetadata: {} as ImageMetadata,
      servingUrl,
      votes: [{
        uid: KPU_UID,
        pas1, pas2, pas3,
        updateTs: Date.now(),
        status: APPROVAL_STATUS.APPROVED,
      }],
      status: APPROVAL_STATUS.APPROVED,
      kpuData,
      samBot
    };
    const res = await uploadHandler(firestore, sanitized);
    if (!res) throw new Error();
    console.log('res', res, idDesa, tpsNo, pas1, pas2, pas3);
  }
}

(async () => {
  const parallelism = 5;
  const promises: Promise<void>[] = [];
  const desaIds = LOKASI.getDesaIds();
  for (let i = 0; i < desaIds.length; i++) {
    const idDesa = desaIds[i];
    const j = i % parallelism;

    if (!promises[j]) {
      promises[j] = uploadKpuAtDesa(idDesa).catch(e => {});
    } else {
      promises[j] = promises[j].then(() => uploadKpuAtDesa(idDesa).catch(e => {}));
    }
  }
  await Promise.all(promises);
})();

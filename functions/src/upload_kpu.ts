import * as admin from "firebase-admin";
import { fetch, getServingUrl, writeToStream } from "./serving_url";
import { LOKASI } from "./lokasi";
import { APPROVAL_STATUS, ImageMetadata, KPU_UID, KpuData, Lokasi, UploadRequest, aggregate, delayTime, recomputeAgg } from "./interfaces";
import { uploadHandler } from "./upload_handler";

const baseServingUrl = 'http://lh3.googleusercontent.com';
const debugIdDesa: string = '';

admin.initializeApp();
const bucket = admin.storage().bucket('kp24-fd486.appspot.com');

const firestore = admin.firestore();

console.log("env", process.env.NODE_ENV);
if (process.env.NODE_ENV !== "production") throw new Error();

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection at:", reason);
});

let totalNumUpdates = 0;

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

// async function fetchSamBot(idDesa: string, tpsNo: string, filename: string) {
//   const prefix = `https://43.252.138.9${1 + Math.floor(Math.random() * 4)}`;
//   const url = `${prefix}/download/${idDesa}/${tpsNo}/${filename
//     }?configFile=pilpres_2024_plano_halaman2.json&baseUrl=${baseServingUrl}`;
//   try {
//     return JSON.parse(await fetch(url, true)) as SamBot;
//   } catch (e) {
//     console.error(e);
//     console.log('url', url);
//     return undefined;
//   }
// }

async function uploadKpuDesa(idDesa: string) {
  const hRef = firestore.doc(`h/i${idDesa}`);
  const lokasi = ((await hRef.get()).data() as Lokasi) ||
               LOKASI.getPrestineLokasi(idDesa);
  // console.log(JSON.stringify(lokasi, null, 2));

  let numUpdates = 0, needRecompute = 0;
  if (!lokasi) throw new Error(idDesa);
  for (const [tpsNo, agg] of Object.entries(lokasi.aggregated)) {
    if (agg[0].totalKpuTps) {
      if (agg[0].totalCompletedTps == 0) {
        if (!agg[0].totalPendingTps) {
          needRecompute = 1;
          throw new Error(idDesa + ' ' + tpsNo);
        }
      }
      continue;
    }

    // Fetch KPU data
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
    // const filename = servingUrl.substring(baseServingUrl.length + 1) + '=s1280';

    // Fetch SamBot data [disabled for now]:
    // const samBot = await fetchSamBot(idDesa, tpsNo, filename);
    // if (!samBot) continue;

    // const kpuDataNumbers = {
    //   pas1: kpuData.chart['100025'],
    //   pas2: kpuData.chart['100026'],
    //   pas3: kpuData.chart['100027']
    // }

    // if (!samBot.outcome) {
    //   console.log('Incomplete', idDesa + tpsNo);
    //   continue;
    // }
    // const samBotNumbers = {
    //   pas1: samBot.outcome.anies,
    //   pas2: samBot.outcome.prabowo,
    //   pas3: samBot.outcome.ganjar,
    // }

    // const { pas1, pas2, pas3 } = samBot.outcome.confidence >= 0.7
    //   ? samBotNumbers
    //   : kpuDataNumbers;

    // if (pas1 === undefined) continue;
    // console.log(tpsNo, pas1, pas2, pas3, imageId, imageUrl);

    const sanitized: UploadRequest = {
      idLokasi: idDesa + tpsNo,
      imageId,
      imageMetadata: {} as ImageMetadata,
      servingUrl,
      votes: [{
        uid: KPU_UID,
        pas1: kpuData.chart['100025'],
        pas2: kpuData.chart['100026'],
        pas3: kpuData.chart['100027'],
        updateTs: Date.now(),
        status: APPROVAL_STATUS.APPROVED,
      }],
      status: APPROVAL_STATUS.APPROVED,
      kpuData,
      // samBot
    };
    if (sanitized.votes[0].pas1 === undefined) continue;
    if (sanitized.votes[0].pas2 === undefined) continue;
    if (sanitized.votes[0].pas3 === undefined) continue;
    const res = await uploadHandler(firestore, sanitized);
    if (!res) throw new Error();
    console.log('TPS', res, idDesa, tpsNo);
    numUpdates++;
  }

  if (needRecompute) {
    // Recompute all values in the desa.
    try {
      await delayTime(2000);
      const newLok = await firestore.runTransaction(async t => {
        const lokDesa = (await t.get(hRef)).data() as Lokasi;
        if (!lokDesa) throw new Error(idDesa);
        recomputeAgg(lokDesa);
        t.set(hRef, lokDesa);
        return lokDesa;
      });

      await firestore
        .collection("p")
        .add(aggregate(newLok));
  
      console.log('Recommputed Desa', idDesa);
    } catch (e) {
      console.error('Desa', idDesa, e);
    }
  }

  return numUpdates;
}

async function uploadKpuKec(idKec: string) {
  console.log('Processing kec', idKec);
  const hRef = firestore.doc(`h/i${idKec}`);
  const lokasi = ((await hRef.get()).data() as Lokasi) ||
               LOKASI.getPrestineLokasi(idKec);
  if (!lokasi) throw new Error(idKec);

  for (const [idDesa] of Object.entries(lokasi?.aggregated)) {
    if (debugIdDesa && !debugIdDesa.startsWith(idDesa)) continue;
    totalNumUpdates += await uploadKpuDesa(idDesa);
  }
}

async function uploadKpuKab(idKab: string) {
  console.log('Processing kab', idKab);
  const hRef = firestore.doc(`h/i${idKab}`);
  const lokasi = ((await hRef.get()).data() as Lokasi) ||
               LOKASI.getPrestineLokasi(idKab);
  if (!lokasi) throw new Error(idKab);

  for (const [idKec] of Object.entries(lokasi?.aggregated)) {
    if (debugIdDesa && !debugIdDesa.startsWith(idKec)) continue;
    await uploadKpuKec(idKec);
  }
}

async function uploadKpuProp(idProp: string) {
  console.log('Processing prop', idProp);
  const snap = await firestore.doc(`h/i${idProp}`).get();
  const lokasi = snap.data() as Lokasi | null;
  if (!lokasi) throw new Error();

  for (const [idKab] of Object.entries(lokasi?.aggregated)) {
    if (debugIdDesa && !debugIdDesa.startsWith(idKab)) continue;
    await uploadKpuKab(idKab);
  }
}

async function uploadKpuRoot() {
  const snap = await firestore.doc(`h/i`).get();
  const lokasi = snap.data() as Lokasi | null;
  if (!lokasi) throw new Error();

  const promises = [];
  for (const [idProp] of Object.entries(lokasi?.aggregated)) {
    if (idProp.startsWith('99')) continue;
    // if (idProp.startsWith('95')) continue;
    if (debugIdDesa && !debugIdDesa.startsWith(idProp)) continue;
    promises.push(uploadKpuProp(idProp));
  }
  console.log('Parallel', promises.length);
  await Promise.all(promises);
}

(async () => {
  await uploadKpuRoot();
  console.log('totalNumUpdates', totalNumUpdates);
})();

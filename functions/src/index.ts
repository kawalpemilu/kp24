import { onCall, CallableRequest } from "firebase-functions/v2/https";
import * as admin from 'firebase-admin';
import * as logger from "firebase-functions/logger";
import * as fs from "fs";
import {
  AggregateVotes, Hierarchy, Lokasi,
  UploadRequest,
  getChildrenIds, getParentNames
} from "./interfaces";

admin.initializeApp();
const firestore = admin.firestore();

const H = JSON.parse(
  fs.readFileSync("lib/hierarchy.js", "utf-8")) as Hierarchy;

const C = getChildrenIds(H);

function getSubLokasi(lokasi: Lokasi) {
  for (const suffixId of C[lokasi.id]) {
    const cid = lokasi.id + suffixId;
    lokasi.aggregated[cid] = {
      name: H.id2name[cid],
    } as AggregateVotes;
  }
  return lokasi;
}

function getTpsList(lokasi: Lokasi) {
  const [maxTpsNo, extBegin, extEnd] = H.tps[lokasi.id];
  for (let i = 1; i <= maxTpsNo; i++) {
    lokasi.aggregated[i] = {
      name: `${i}`,
    } as AggregateVotes;
  }
  if (extBegin) {
    for (let i = extBegin; i <= extEnd; i++) {
      lokasi.aggregated[i] = {
        name: `${i}`,
      } as AggregateVotes;
    }
  }
  return lokasi;
}

async function getTpsImages(lokasi: Lokasi) {
  const snapshot = await firestore.collection(`t/${lokasi.id}/p`).get();
  snapshot.forEach(doc => {
    lokasi.aggregated[doc.id] = doc.data() as AggregateVotes;
  });
  return lokasi;
}

async function getLatestVote(request: UploadRequest): Promise<AggregateVotes> {
  let latest: AggregateVotes | undefined = undefined;
  const lokasi: Lokasi = await getTpsImages(
    { id: request.tpsId, names: [], aggregated: {} });
  for (const agg of Object.values(lokasi.aggregated)) {
    if (!latest || latest.uploadTimeMs < agg.uploadTimeMs) {
      latest = agg;
    }
  }
  return {
    name: request.tpsId.substring(10),
    pas1: request.pas1,
    pas2: request.pas2,
    pas3: request.pas3,
    sah: request.sah,
    tidakSah: request.tidakSah,
    uploadTimeMs: Date.now(),
    // To be overriden.
    idLokasi: latest?.idLokasi ?? 'noImage',
    photoUrl: latest?.photoUrl ?? '',
    totalTps: 0,
    totalCompletedTps: 0,
  };
}

export const hierarchy = onCall(
  { cors: true },
  async (request: CallableRequest<{ id: string }>) => {
    let id = request.data.id;
    if (!(/^\d{0,13}$/.test(id))) id = '';
    const lokasi: Lokasi = { id, names: getParentNames(H, id), aggregated: {} };
    if (id.length > 10) return getTpsImages(lokasi);
    if (id.length === 10) return getTpsList(lokasi);
    return getSubLokasi(lokasi);
  });

/** https://firebase.google.com/docs/functions/callable?gen=2nd */
export const upload = onCall(
  { cors: true },
  async (request: CallableRequest<UploadRequest>) => {
    // TODO: add retry using tasks.
    const tpsId = request.data.tpsId;
    const tpsColRef = firestore.collection(`t/${tpsId}/p`);
    const latest = await getLatestVote(request.data);
    if (request.data.imageId?.length) {
      if (request.data.imageId !== 'preserve') {
        latest.idLokasi = request.data.imageId;
        const path = `uploads/${tpsId}/${request.auth?.uid}/${latest.idLokasi}`;
        logger.info("Get serving url", path);
        latest.photoUrl = await getServingUrl(path);
      }
      await tpsColRef.doc(latest.idLokasi).set(latest);
    }
    return latest;
  });

/**
 * Returns the optimized image serving url for the given object.
 * @param {string} objectName The object name in the storage bucket.
 * @return {string} The serving url of the object image.
 */
async function getServingUrl(objectName: string) {
  const path = encodeURIComponent(`kp24-fd486.appspot.com/${objectName}`);
  const data = await fetch(`https://kp24-fd486.et.r.appspot.com/gsu?path=${path}`);
  return data.startsWith("http") ? data : '';
}

import * as https from "https";
import * as http from "http";

/**
 * Fetches the content of the given url.
 * @param {string} url The url to be fetched.
 * @return {string} The content of the url.
 */
export function fetch(url: string) {
  return new Promise<string>((resolve, reject) => {
    https.get(url, (resp: http.IncomingMessage) => {
      let data = "";
      resp.on("data", (chunk: string) => {
        data += chunk;
      });
      resp.on("end", () => {
        resolve(data);
      });
    }).on("error", reject);
  });
}

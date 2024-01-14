import { onCall, CallableRequest } from "firebase-functions/v2/https";
import * as admin from 'firebase-admin';
import * as logger from "firebase-functions/logger";
import * as fs from "fs";
import {
  AggregateVotes, Hierarchy, Lokasi,
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
  const snapshot = await firestore.collection(`p/${lokasi.id}`).get();
  snapshot.forEach(doc => {
    lokasi.aggregated[doc.id] = { photoUrl: doc.data().photoUrl } as AggregateVotes;
  });
  return lokasi;
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
export const photos = onCall(
  { cors: true },
  async (request: CallableRequest<{ tpsId: string, imageId?: string }>) => {
    // TODO: add retry using tasks.
    const tpsId = request.data.tpsId;
    const tpsColRef = firestore.collection(`t/${tpsId}/p`);
    const imageId = request.data.imageId;
    if (!imageId) {
      const snapshot = await tpsColRef.get();
      let imageUrl = '';
      snapshot.forEach(doc => {
        console.log('dapet', doc.data());
        imageUrl = doc.data().photoUrl;
      });
      return imageUrl;
    } 
    const objectName = `uploads/${tpsId}/${request.auth?.uid}/${imageId}`;
    logger.info("Get serving url", objectName);
    const servingUrl = await getServingUrl(objectName);
    logger.info("GOT GSU: ", servingUrl);
    if (servingUrl.length == 0) return '';
    await tpsColRef.doc(imageId).set({ photoUrl: servingUrl });
    return servingUrl;
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

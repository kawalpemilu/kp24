import { onCall, CallableRequest } from "firebase-functions/v2/https";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { getFunctions } from "firebase-admin/functions";
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
    idLokasi: request.tpsId,
    name: request.tpsId.substring(10),
    pas1: request.pas1,
    pas2: request.pas2,
    pas3: request.pas3,
    sah: request.sah,
    tidakSah: request.tidakSah,
    uploadTimeMs: Date.now(),
    // To be overriden.
    imageId: latest?.imageId ?? 'noImageId',
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

    const hRef = firestore.doc(`h/i${id}`);
    const latest = (await hRef.get()).data() as Lokasi | undefined;
    if (latest) return latest;

    const lokasi: Lokasi = { id, names: getParentNames(H, id), aggregated: {} };
    if (id.length > 10) return getTpsImages(lokasi);
    if (id.length === 10) return getTpsList(lokasi);
    return getSubLokasi(lokasi);
  });

function isIdentical(a: AggregateVotes, b: AggregateVotes) {
  return a.pas1 === b.pas1
    && a.pas2 === b.pas2
    && a.pas3 === b.pas3
    && a.sah === b.sah
    && a.tidakSah === b.tidakSah;
}

function getParentId(id: string) {
  if (id.length > 10) return id.substring(0, 10);
  if (id.length > 6) return id.substring(0, 6);
  if (id.length > 4) return id.substring(0, 4);
  if (id.length > 2) return id.substring(0, 2);
  return '';
}

export const aggregate = onTaskDispatched<AggregateVotes>({
  retryConfig: {
    maxAttempts: 5,
    minBackoffSeconds: 60,
  },
  rateLimits: {
    maxConcurrentDispatches: 6,
  },
}, async (req) => {
  logger.log("Dispatched", JSON.stringify(req.data, null, 2));
  const idParent = getParentId(req.data.idLokasi);
  const hRef = firestore.doc(`h/i${idParent}`);
  const nextAgg = await firestore
    .runTransaction(async t => {
      let lokasi = (await t.get(hRef)).data() as Lokasi | undefined;
      if (!lokasi) {
        if (req.data.idLokasi.length > 10) {
          lokasi = getTpsList({
            id: idParent, names: getParentNames(H, idParent), aggregated: {} });
        } else {
          lokasi = getSubLokasi({
            id: idParent, names: getParentNames(H, idParent), aggregated: {} });
        }
      }

      let cid = req.data.idLokasi;
      if (cid.length > 10) {
        cid = cid.substring(10);
        req.data.totalCompletedTps = 1;
      }
      logger.log('lokasi', cid, JSON.stringify(lokasi, null, 2));

      const agg = lokasi.aggregated[cid];
      if (isIdentical(agg, req.data)) return null;
      req.data.name = agg.name; // Preserve the name.
      lokasi.aggregated[cid] = req.data;
      t.set(hRef, lokasi);

      const nextAgg = getAggregateVotes(idParent, req.data.uploadTimeMs);
      for (const cagg of Object.values(lokasi.aggregated)) {
        nextAgg.pas1 += cagg.pas1 ?? 0;
        nextAgg.pas2 += cagg.pas2 ?? 0;
        nextAgg.pas3 += cagg.pas3 ?? 0;
        nextAgg.sah += cagg.sah ?? 0;
        nextAgg.tidakSah += cagg.tidakSah ?? 0;
        nextAgg.totalCompletedTps += cagg.totalCompletedTps ?? 0;
      }
      return nextAgg;
    });

  if (idParent.length > 0 && nextAgg) {
    logger.log('Next TPS', idParent, JSON.stringify(nextAgg, null, 2));
    enqueueTask(nextAgg);
  }
});

function getAggregateVotes(idLokasi: string, uploadTimeMs: number): AggregateVotes {
  return {
    idLokasi,
    name:'',
    pas1: 0,
    pas2: 0,
    pas3: 0,
    sah: 0,
    tidakSah: 0,
    uploadTimeMs,
    totalTps: 0,
    totalCompletedTps: 0,
    imageId: "",
    photoUrl: ""
  };
}

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
        latest.imageId = request.data.imageId;
        const path = `uploads/${tpsId}/${request.auth?.uid}/${latest.imageId}`;
        logger.info("Get serving url", path);
        latest.photoUrl = await getServingUrl(path);
      }
      logger.info('Store Latest', JSON.stringify(latest));
      await tpsColRef.doc(latest.imageId).set(latest);
      await enqueueTask(latest);
    }
    return latest;
  });

async function enqueueTask(task: AggregateVotes) {
  const queue = getFunctions().taskQueue("aggregate");
  await queue.enqueue(task, {
    dispatchDeadlineSeconds: 60 * 5, // 5 minutes
    uri: await getFunctionUrl("aggregate"),
  });
}

import { GoogleAuth } from "google-auth-library";

let auth: any;

/**
 * Get the URL of a given v2 cloud function.
 * @param {string} name the function's name
 * @param {string} location the function's location
 * @return {Promise<string>} The URL of the function
 */
async function getFunctionUrl(name: string, location = "us-central1") {
  if (!auth) {
    auth = new GoogleAuth({
      scopes: "https://www.googleapis.com/auth/cloud-platform",
    });
  }
  const projectId = await auth.getProjectId();
  const url = "https://cloudfunctions.googleapis.com/v2beta/" +
    `projects/${projectId}/locations/${location}/functions/${name}`;

  const client = await auth.getClient();
  const res = await client.request({ url });
  const uri = res.data?.serviceConfig?.uri;
  if (!uri) {
    throw new Error(`Unable to retreive uri for function at ${url}`);
  }
  return uri;
}

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

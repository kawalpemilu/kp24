import {onCall, CallableRequest} from "firebase-functions/v2/https";
import {onTaskDispatched} from "firebase-functions/v2/tasks";
import {getFunctions} from "firebase-admin/functions";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import * as fs from "fs";
import {
  AggregateVotes, Hierarchy, Lokasi, TpsData,
  UploadRequest, getChildrenIds, getParentNames,
} from "./interfaces";

admin.initializeApp();
const firestore = admin.firestore();

const H = JSON.parse(
  fs.readFileSync("lib/hierarchy.js", "utf-8")) as Hierarchy;

const C = getChildrenIds(H);

/**
 * Constructs Lokasi object from hard-coded data.
 * @param {string} id The id of a location.
 * @return {Lokasi} The Lokasi object from hard-coded data.
 */
function getPrestineLokasi(id: string) {
  const lokasi: Lokasi = {id, names: getParentNames(H, id), aggregated: {}};
  if (id.length === 10) {
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
  } else {
    for (const suffixId of C[lokasi.id]) {
      const cid = lokasi.id + suffixId;
      lokasi.aggregated[cid] = {
        name: H.id2name[cid],
      } as AggregateVotes;
    }
  }
  return lokasi;
}

/**
 * Returns the TPS data stored in Firestore.
 * @param {string} id The id of the TPS location.
 * @return {TpsData} The TpsData of the id.
 */
async function getTpsData(id: string) {
  const snapshot = await firestore.collection(`t/${id}/p`).get();
  const tpsData: TpsData = {id, votes: {}};
  snapshot.forEach((doc) => {
    tpsData.votes[doc.id] = doc.data() as AggregateVotes;
  });
  return tpsData;
}

export const hierarchy = onCall(
  {cors: true},
  async (request: CallableRequest<{ id: string }>)
    : Promise<Lokasi | TpsData> => {
    let id = request.data.id;
    if (!(/^\d{0,13}$/.test(id))) id = "";

    const hRef = firestore.doc(`h/i${id}`);
    const latest = (await hRef.get()).data() as Lokasi | undefined;
    if (latest) return latest;

    return (id.length > 10) ? getTpsData(id) : getPrestineLokasi(id);
  });

/**
 * Check whether the number of votes in a and b are the same.
 * @param {AggregateVotes} a the first votes.
 * @param {AggregateVotes} b the second votes.
 * @return {boolean} True if they are the same.
 */
function isIdentical(a: AggregateVotes, b: AggregateVotes) {
  return a.pas1 === b.pas1 &&
    a.pas2 === b.pas2 &&
    a.pas3 === b.pas3 &&
    a.sah === b.sah &&
    a.tidakSah === b.tidakSah;
}

/**
 * Returns the parent id of a lokasi id.
 * @param {string} id the id to be queried.
 * @return {string} The id's parent.
 */
function getParentId(id: string) {
  if (id.length > 10) return id.substring(0, 10);
  if (id.length > 6) return id.substring(0, 6);
  if (id.length > 4) return id.substring(0, 4);
  if (id.length > 2) return id.substring(0, 2);
  return "";
}

/**
 * Check the type of the parameter and cast it.
 * @param {UploadRequest | AggregateVotes} x two possible types.
 * @return {boolean} The correct type.
 */
function isUploadRequest(x: UploadRequest | AggregateVotes)
  : x is UploadRequest {
  return x.idLokasi.length > 10;
}

/**
 * Converts the imageId into serving photoUrl.
 * @param {UploadRequest} u The upload request.
 * @return {Promise<AggregateVotes>} The processed image.
 */
async function processImageId(u: UploadRequest): Promise<AggregateVotes> {
  return {
    idLokasi: u.idLokasi,
    name: u.idLokasi.substring(10),
    pas1: u.pas1,
    pas2: u.pas2,
    pas3: u.pas3,
    sah: u.sah,
    tidakSah: u.tidakSah,
    uploadTimeMs: Date.now(),
    imageId: u.imageId,
    photoUrl: await getServingUrl(
      `uploads/${u.idLokasi}/${u.uid}/${u.imageId}`),
    totalTps: 0,
    totalCompletedTps: 1,
  };
}

const aggregateInternal = async (data: UploadRequest | AggregateVotes) => {
  logger.log("Dispatched", JSON.stringify(data, null, 2));

  let agg: AggregateVotes;
  if (isUploadRequest(data)) {
    agg = await processImageId(data);
    const tpsColRef = firestore.collection(`t/${agg.idLokasi}/p`);
    await tpsColRef.doc(data.imageId).set(agg);
  } else {
    agg = data;
  }

  const idParent = getParentId(agg.idLokasi);
  const hRef = firestore.doc(`h/i${idParent}`);
  const nextAgg = await firestore
    .runTransaction(async (t) => {
      let lokasi = (await t.get(hRef)).data() as Lokasi | undefined;
      if (!lokasi) lokasi = getPrestineLokasi(idParent);
      logger.log("Lokasi", JSON.stringify(lokasi, null, 2));

      const cid = isUploadRequest(agg) ?
        agg.idLokasi.substring(10) : agg.idLokasi;
      const old = lokasi.aggregated[cid];
      if (isIdentical(old, agg)) {
        logger.log("Identical", JSON.stringify(agg, null, 2));
        return null;
      }
      agg.name = old.name; // Preserve the name.
      lokasi.aggregated[cid] = agg;

      t.set(hRef, lokasi);

      const nextAgg: AggregateVotes = {
        idLokasi: idParent,
        name: "",
        pas1: 0,
        pas2: 0,
        pas3: 0,
        sah: 0,
        tidakSah: 0,
        uploadTimeMs: agg.uploadTimeMs,
        totalTps: 0,
        totalCompletedTps: 0,
        imageId: "",
        photoUrl: "",
      };
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
    logger.log("Next TPS", idParent, JSON.stringify(nextAgg, null, 2));
    enqueueTask(nextAgg);
  }
};

export const aggregate = onTaskDispatched<UploadRequest | AggregateVotes>({
  retryConfig: {
    maxAttempts: 5,
    minBackoffSeconds: 60,
  },
  rateLimits: {
    maxConcurrentDispatches: 6,
  },
}, async (request) => {
  return aggregateInternal(request.data);
});

/**
 * Returns true if the votes is between [0, 999].
 * @param {number} votes the votes to be checked.
 * @return {boolean} true if valid.
 */
function isValidVoteNumbers(votes: number) {
  if (isNaN(votes)) return false;
  return votes >= 0 && votes < 1000;
}

/** https://firebase.google.com/docs/functions/callable?gen=2nd */
export const upload = onCall(
  {cors: true},
  async (request: CallableRequest<UploadRequest>) => {
    if (!request.auth?.uid) return false;

    const idLokasi = request.data.idLokasi;
    if (!(/^\d{11,13}$/.test(idLokasi))) return false;

    const imageId = request.data.imageId;
    if (!(/^[A-Za-z0-9]{20}$/.test(imageId))) return false;

    const pas1 = Number(request.data.pas1);
    if (!isValidVoteNumbers(pas1)) return false;

    const pas2 = Number(request.data.pas2);
    if (!isValidVoteNumbers(pas2)) return false;

    const pas3 = Number(request.data.pas3);
    if (!isValidVoteNumbers(pas3)) return false;

    const sah = Number(request.data.sah);
    if (!isValidVoteNumbers(sah)) return false;

    const tidakSah = Number(request.data.tidakSah);
    if (!isValidVoteNumbers(tidakSah)) return false;

    const sanitized: UploadRequest = {
      idLokasi, uid: request.auth?.uid,
      imageId, pas1, pas2, pas3, sah, tidakSah,
    };
    await enqueueTask(sanitized);
    return true;
  });

/**
 * Schedules cloud task queue. It retries for 5 mins on error.
 * @param {UploadRequest | AggregateVotes} task the task to be scheduled.
 */
async function enqueueTask(task: UploadRequest | AggregateVotes) {
  if (process.env.FUNCTIONS_EMULATOR) {
    // For local development it's okay execute it now, rather than queuing.
    await aggregateInternal(task);
    return;
  }

  const queue = getFunctions().taskQueue("aggregate");
  await queue.enqueue(task, {
    dispatchDeadlineSeconds: 60 * 5, // 5 minutes
    uri: await getFunctionUrl("aggregate"),
  });
}

import {GoogleAuth} from "google-auth-library";

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
  const res = await client.request({url});
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
  return data.startsWith("http") ? data : "";
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

import {onCall, CallableRequest} from "firebase-functions/v2/https";
import {AggregateVotes, Lokasi, TpsData, UploadRequest} from "./interfaces";
import {getPrestineLokasi} from "./lokasi";
import {getServingUrl} from "./serving_url";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";

admin.initializeApp();
const firestore = admin.firestore();

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

    // At the TPS level, returns all user submitted photos + votes.
    if (id.length > 10) return getTpsData(id);

    // At Province, Kabupaten, Kecamatan, Desa level, returns the Hierarchy
    // along with the aggregated votes from Firestore (if exists).
    const hRef = firestore.doc(`h/i${id}`);
    const latest = (await hRef.get()).data() as Lokasi | undefined;
    if (latest) return latest;

    // Otherwise, returns the hard-coded hierarchy without any votes.
    return getPrestineLokasi(id);
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
    aggregateInternal(nextAgg);
  }
};

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
    await aggregateInternal(sanitized);
    return true;
  });


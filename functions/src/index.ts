import {onCall, CallableRequest} from "firebase-functions/v2/https";
import {AggregateVotes, ImageMetadata, Lokasi, TpsData, UploadRequest} from "./interfaces";
import {getPrestineLokasi} from "./lokasi";
import {uploadHandler} from "./upload_handler";

import * as admin from "firebase-admin";
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
  (request: CallableRequest<UploadRequest>) => {
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

    const m = request.data.imageMetadata;
    const imageMetadata: ImageMetadata = { l: Number(m.l), s: Number(m.s)};
    if (m.z) imageMetadata.z = Number(m.z);
    if (m.m) imageMetadata.m = m.m.substring(0, 50);
    if (m.o) imageMetadata.o = Number(m.o);
    if (m.y) imageMetadata.y = Number(m.y);
    if (m.x) imageMetadata.x = Number(m.x);

    const sanitized: UploadRequest = {
      idLokasi, uid: request.auth?.uid,
      imageId, pas1, pas2, pas3, sah, tidakSah,
      imageMetadata
    };
    return uploadHandler(firestore, sanitized);
  });

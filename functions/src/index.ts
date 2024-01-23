import {onCall, CallableRequest} from "firebase-functions/v2/https";
import {
  APPROVAL_STATUS,
  AggregateVotes, DEFAULT_MAX_UPLOADS, ImageMetadata, Lokasi, TpsData,
  USER_ROLE, UploadRequest, UserProfile, Votes,
} from "./interfaces";
import {getPrestineLokasi} from "./lokasi";
import {uploadHandler} from "./upload_handler";

import * as admin from "firebase-admin";
import {getServingUrl} from "./serving_url";
admin.initializeApp();
const firestore = admin.firestore();

// TODO list:
// - load testing
// - admin features (banning)
// - automaitc lapor kesalahan
// - poles UX nya

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

export const register = onCall(
  {cors: true},
  async (request: CallableRequest<void>): Promise<boolean> => {
    if (!request.auth) return false;

    const uRef = firestore.doc(`/u/${request.auth.uid}`);
    const user: UserProfile = {
      uid: request.auth.uid,
      name: request.auth.token.name,
      lowerCaseName: request.auth.token.name.toLowerCase(),
      email: request.auth.token.email ?? "",
      pic: request.auth.token.picture ?? "",
      createdTs: request.auth.token.iat * 1000,
      lastLoginTs: Date.now(),
      role: USER_ROLE.RELAWAN,
      uploads: {},
      uploadCount: 0,
      uploadMaxCount: DEFAULT_MAX_UPLOADS,
      nTps: 0,
      nKel: 0,
      reviewCount: 0,
    };
    try {
      await uRef.set(user);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  });

export const changeRole = onCall(
  {cors: true},
  async (request: CallableRequest<{ uid: string, role: USER_ROLE }>)
    : Promise<string> => {
    if (!request.auth?.uid) return "Not logged in";

    const adminRef = firestore.doc(`u/${request.auth.uid}`);
    const admin = (await adminRef.get()).data() as UserProfile | undefined;
    if (!admin || admin.role <= USER_ROLE.MODERATOR) return "peasants";
    if (request.data.role >= admin.role) return "generous";

    const userRef = firestore.doc(`u/${request.data.uid}`);
    const user = (await userRef.get()).data() as UserProfile | undefined;
    if (!user || user.role >= admin.role) return "nunjak";
    if (user.role === request.data.role) return "unchanged";

    user.role = request.data.role;
    await userRef.set(user);
    return "bravo";
  });

export const review = onCall(
  {cors: true},
  async (request: CallableRequest<{
       tpsId: string, imageId: string, votes: Votes }>)
      : Promise<boolean> => {
    if (!request.auth?.uid) return false;

    const v = request.data.votes;
    const pas1 = Number(v.pas1);
    if (!isValidVoteNumbers(pas1)) return false;

    const pas2 = Number(v.pas2);
    if (!isValidVoteNumbers(pas2)) return false;

    const pas3 = Number(v.pas3);
    if (!isValidVoteNumbers(pas3)) return false;

    const status = v.status;
    if (!status) return false;
    if (status !== APPROVAL_STATUS.APPROVED &&
         status !== APPROVAL_STATUS.REJECTED) return false;
    const sanitized: UploadRequest = {
      idLokasi: request.data.tpsId,
      imageId: request.data.imageId,
      imageMetadata: {} as ImageMetadata, servingUrl: "",
      votes: [{
        uid: request.auth.uid,
        pas1, pas2, pas3,
        createdTs: Date.now(),
        status,
      }],
      status,
    };
    return uploadHandler(firestore, sanitized);
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

    const vs = request.data.votes;
    if (!vs?.length || vs.length > 1) return false;
    const pas1 = Number(vs[0].pas1);
    if (!isValidVoteNumbers(pas1)) return false;

    const pas2 = Number(vs[0].pas2);
    if (!isValidVoteNumbers(pas2)) return false;

    const pas3 = Number(vs[0].pas3);
    if (!isValidVoteNumbers(pas3)) return false;

    const m = request.data.imageMetadata;
    const imageMetadata: ImageMetadata = {l: Number(m.l), s: Number(m.s)};
    if (m.z) imageMetadata.z = Number(m.z);
    if (m.m) imageMetadata.m = m.m.substring(0, 50);
    if (m.o) imageMetadata.o = Number(m.o);
    if (m.y) imageMetadata.y = Number(m.y);
    if (m.x) imageMetadata.x = Number(m.x);

    // Use the default image for local testing.
    const servingUrl = (process.env.FUNCTIONS_EMULATOR === "true") ?
      "https://kp24.web.app/assets/kp.png" :
      await getServingUrl(`uploads/${idLokasi}/${request.auth.uid}/${imageId}`);

    const sanitized: UploadRequest = {
      idLokasi, imageId, imageMetadata, servingUrl,
      votes: [{
        uid: request.auth.uid,
        pas1, pas2, pas3,
        createdTs: Date.now(),
        status: APPROVAL_STATUS.NEW,
      }],
      status: APPROVAL_STATUS.NEW,
    };
    return uploadHandler(firestore, sanitized);
  });

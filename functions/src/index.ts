import {onCall, CallableRequest} from "firebase-functions/v2/https";
import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {AuthData} from "firebase-functions/lib/common/providers/https";
import {
  APPROVAL_STATUS, DEFAULT_MAX_UPLOADS, ImageMetadata, Lokasi,
  LruCache, USER_ROLE, UploadRequest, UserProfile, Votes, isValidVoteNumbers,
} from "./interfaces";
import {LOKASI} from "./lokasi";
import {RUN_ID, processPendingUploads, uploadHandler} from "./upload_handler";
import {getServingUrl} from "./serving_url";

import * as admin from "firebase-admin";
admin.initializeApp();
const firestore = admin.firestore();

import * as logger from "firebase-functions/logger";

// TODO list:
// - admin features (banning)

/**
 * The pending method is run in a single thread.
 * This is achieved by setting maxInstances to 1 and guarded by "isLocked".
 */
let isLocked = false;
let skippedDueToLocked = 0;
const PROCESS_PENDING_TIMEOUT_SECS = 300;
export const pending = onDocumentCreated({
  document: "p/{docId}",
  timeoutSeconds: PROCESS_PENDING_TIMEOUT_SECS,
  maxInstances: 1,
}, async (event) => {
  if (!event?.data) return;
  if (isLocked) {
    skippedDueToLocked++;
    return;
  }
  isLocked = true;
  console.log(RUN_ID, "OnCreated LOCK", event.data.id);
  await processPendingUploads(firestore, PROCESS_PENDING_TIMEOUT_SECS / 2);
  console.log(RUN_ID, "Skipped since locked:", skippedDueToLocked);
  isLocked = false;
  skippedDueToLocked = 0;
});

const lokasiCache: Record<string, Lokasi> = {};
/**
 * @param {string} id the lokasi id.
 * @return {number} how long should the id be cached in ms.
 */
function getCacheTimeoutMs(id: string) {
  if (id.length <= 2) return 60 * 1000; // 1 minute, about 1 QPS.
  if (id.length <= 4) return 5 * 60 * 1000; // 5 minutes, about 2 QPS,
  if (id.length <= 6) return 30 * 60 * 1000; // 30 minutes, about 5 QPS.
  return 50 * 60 * 1000; // 1 hour, about 24 QPS.
}
const lastUidCallTs = new LruCache<string, number>(1000);
/**
 * @param {number} now the current datetime in ms.
 * @param {AuthData} auth the accessing user.
 * @return {boolean} true if the user should be rate-limited.
 */
function rateLimited(now: number, auth?: AuthData) {
  if (!auth) return true; // Always rate-limit anonymous users.
  const lastCallTs = lastUidCallTs.get(auth.uid);
  if (lastCallTs === undefined) {
    lastUidCallTs.set(auth.uid, now);
    return false; // Don't rate-limit logged in users.
  }
  const elapsed = now - lastCallTs;
  if (elapsed < 1000) {
    logger.warn("DoS from", auth.uid, auth.token.name, auth.token.email);
    return true; // Unless they are hammering!
  }
  lastUidCallTs.set(auth.uid, now);
  return false;
}
export const hierarchy = onCall(
  {cors: true},
  async (request: CallableRequest<{ id: string }>) : Promise<Lokasi> => {
    let id = request.data.id;
    if (!(/^\d{0,13}$/.test(id))) id = "";

    const prestineLokasi = LOKASI.getPrestineLokasi(id);
    if (!Object.keys(prestineLokasi.aggregated).length) {
      return {} as Lokasi; // Invalid lokasi id.
    }

    const now = Date.now();
    const cachedLokasi = lokasiCache[id];
    if (cachedLokasi?.lastCachedTs && rateLimited(now, request.auth)) {
      const elapsed = now - cachedLokasi.lastCachedTs;
      if (elapsed < getCacheTimeoutMs(id)) return cachedLokasi;
    }

    // Get the Hierarchy with the aggregated votes from Firestore.
    const hRef = firestore.doc(`h/i${id}`);
    const latest = (await hRef.get()).data() as Lokasi | undefined;

    // If not exists, use the hard-coded hierarchy without any votes.
    const lokasi = lokasiCache[id] = latest ? latest : prestineLokasi;
    lokasi.lastCachedTs = now;
    return lokasi;
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
      reviews: {},
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
        updateTs: Date.now(),
        status,
      }],
      status,
    };
    return uploadHandler(firestore, sanitized);
  });


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
        updateTs: Date.now(),
        status: APPROVAL_STATUS.NEW,
      }],
      status: APPROVAL_STATUS.NEW,
    };
    return uploadHandler(firestore, sanitized);
  });

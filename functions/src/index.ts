import {onCall, CallableRequest} from "firebase-functions/v2/https";
import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {
  ALLOW_ORIGINS, APPROVAL_STATUS, DEFAULT_MAX_LAPORS, DEFAULT_MAX_UPLOADS,
  ImageMetadata, LaporRequest, Lokasi,
  LruCache, USER_ROLE, UploadRequest, UserProfile, Votes,
  isValidVoteNumbers, shouldRateLimit,
} from "./interfaces";
import {LOKASI} from "./lokasi";
import {RUN_ID, processPendingUploads, uploadHandler} from "./upload_handler";
import {getServingUrl} from "./serving_url";

import * as admin from "firebase-admin";
admin.initializeApp();
const firestore = admin.firestore();

import * as logger from "firebase-functions/logger";
import {jagaTpsHandler} from "./jaga_tps_handler";
import {laporHandler} from "./lapor_handler";

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
  logger.log(RUN_ID, "OnCreated LOCK", event.data.id);
  try {
    await processPendingUploads(firestore, PROCESS_PENDING_TIMEOUT_SECS / 2);
  } catch (e) {
    logger.error(RUN_ID, "Error processing", e);
  }
  logger.log(RUN_ID, "Skipped since locked:", skippedDueToLocked);
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
  return 60 * 60 * 1000; // 1 hour, about 24 QPS.
}
type HierarchyRequest = CallableRequest<{ id: string, uid?: string }>;
const hierarchyRateLimiter = new LruCache<string, [number, number]>(1000);
/**
 * @param {number} now the current timestamp.
 * @param {HierarchyRequest} request
 * @return {boolean} true if the request should be rate limited.
 */
function shouldRateLimitHierarchy(now: number, request: HierarchyRequest) {
  const r = request.rawRequest;
  const ip = `${r.headers["x-forwarded-for"] || r.connection.remoteAddress}`;
  logger.log("IP Address:", ip, request);

  if (request.data.uid === "kawalc1") {
    if (shouldRateLimit(hierarchyRateLimiter, now, request.data.uid, 25)) {
      logger.error("hierarchy-rate-limited-kawalc1",
        request.data.id, request.data.uid);
      return true;
    }
    return false;
  }
  if (request.auth?.token?.email) {
    logger.error("hierarchy-rate-limited-user", request.data.id,
      request.auth.uid, request.auth.token.name, request.auth.token.email);
  }
  if (shouldRateLimit(hierarchyRateLimiter, now, ip, 20)) {
    logger.info("hierarchy-rate-limited-public", request.data.id, ip);
    return true;
  }
  return false;
}
export const hierarchy2 = onCall(
  {cors: ALLOW_ORIGINS, memory: "512MiB"},
  async (request: HierarchyRequest): Promise<Lokasi> => {
    const now = Date.now();
    if (shouldRateLimitHierarchy(now, request)) return {} as Lokasi;

    let id = request.data.id;
    if (!(/^\d{0,13}$/.test(id))) id = "";

    const prestineLokasi = LOKASI.getPrestineLokasi(id);
    if (!prestineLokasi || !Object.keys(prestineLokasi.aggregated).length) {
      return {} as Lokasi; // Invalid lokasi id.
    }

    const cachedLokasi = lokasiCache[id];
    if (cachedLokasi?.lastCachedTs) {
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

const userRateLimiter = new LruCache<string, [number, number]>(1000);
export const register = onCall(
  {cors: ALLOW_ORIGINS},
  async (request: CallableRequest<void>): Promise<boolean> => {
    logger.log("register", request.auth, request.data);

    if (!request.auth) return false;
    if (request.auth.token?.firebase?.sign_in_provider == "anonymous") {
      return false;
    }

    const now = Date.now();
    if (shouldRateLimit(userRateLimiter, now, request.auth.uid)) {
      logger.error("register-rate-limited", request.auth.uid);
      return false;
    }

    const uRef = firestore.doc(`/u/${request.auth.uid}`);
    try {
      const u = await uRef.get();
      if (u.data()) {
        logger.log("register-user-exists", request.auth.uid);
        return false;
      }
    } catch (e) {
      logger.error("register", e, request.auth.uid);
      return false;
    }
    const user: UserProfile = {
      uid: request.auth.uid,
      name: request.auth.token.name,
      lowerCaseName: request.auth.token.name.toLowerCase(),
      email: request.auth.token.email ?? "",
      pic: request.auth.token.picture ?? "",
      createdTs: request.auth.token.iat * 1000,
      lastLoginTs: now,
      role: USER_ROLE.RELAWAN,
      uploads: {},
      reviews: {},
      uploadCount: 0,
      uploadMaxCount: DEFAULT_MAX_UPLOADS,
      uploadRemaining: DEFAULT_MAX_UPLOADS,
      uploadDistinctDesa: 0,
      uploadDistinctTps: 0,
      lapor: {},
      laporCount: 0,
      laporMaxCount: DEFAULT_MAX_LAPORS,
      laporRemaining: DEFAULT_MAX_LAPORS,
      jagaTps: {},
      jagaTpsCount: 0,
      reviewCount: 0,
      size: 0,
    };
    try {
      await uRef.set(user);
      return true;
    } catch (e) {
      logger.error(e);
      return false;
    }
  });

export const changeRole = onCall(
  {cors: ALLOW_ORIGINS},
  async (request: CallableRequest<{ uid: string, role: USER_ROLE }>)
    : Promise<string> => {
    logger.log("changeRole", request.auth, request.data);
    if (!request.auth?.uid) return "Not logged in";

    const now = Date.now();
    if (shouldRateLimit(userRateLimiter, now, request.auth.uid)) {
      logger.error("change-role-rate-limited", request.auth.uid);
      return "rate-limited";
    }

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

export const jagaTps = onCall(
  {cors: ALLOW_ORIGINS},
  async (request: CallableRequest<{ tpsId: string }>)
      : Promise<boolean> => {
    logger.log("jagaTps", request.auth, request.data);
    if (!request.auth?.uid) return false;

    const now = Date.now();
    if (now > 1707929660706) return false; // Disable Jaga TPS end of 14 Feb.

    if (shouldRateLimit(userRateLimiter, now, request.auth.uid)) {
      logger.error("jaga-tps-rate-limited", request.auth.uid);
      return false;
    }

    return jagaTpsHandler(firestore, request.data.tpsId, request.auth.uid)
      .then((success) => {
        if (success) {
          delete lokasiCache[request.data.tpsId.substring(0, 10)];
        }
        return success;
      });
  });

export const review = onCall(
  {cors: ALLOW_ORIGINS},
  async (request: CallableRequest<{
    tpsId: string, imageId: string, votes: Votes
  }>)
    : Promise<boolean> => {
    logger.log("review", request.auth, request.data);

    if (!request.auth?.uid) return false;

    const now = Date.now();
    if (shouldRateLimit(userRateLimiter, now, request.auth.uid)) {
      logger.error("review-rate-limited", request.auth.uid);
      return false;
    }

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
      status !== APPROVAL_STATUS.REJECTED &&
      status !== APPROVAL_STATUS.MOVED) return false;
    const sanitized: UploadRequest = {
      idLokasi: request.data.tpsId,
      imageId: request.data.imageId,
      imageMetadata: {} as ImageMetadata, servingUrl: "",
      votes: [{
        uid: request.auth.uid,
        pas1, pas2, pas3,
        updateTs: now,
        status,
      }],
      status,
    };
    return uploadHandler(firestore, sanitized).then((success) => {
      if (success) {
        delete lokasiCache[request.data.tpsId.substring(0, 10)];
      }
      return success;
    });
  });

/** https://firebase.google.com/docs/functions/callable?gen=2nd */
export const upload = onCall(
  {cors: ALLOW_ORIGINS},
  async (request: CallableRequest<UploadRequest>) => {
    logger.log("upload", request.auth, request.data);

    if (!request.auth?.uid) return false;

    const now = Date.now();
    if (shouldRateLimit(userRateLimiter, now, request.auth.uid)) {
      logger.error("upload-rate-limited", request.auth.uid);
      return false;
    }

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

    const status = request.data.status;
    if (status !== APPROVAL_STATUS.NEW &&
        status !== APPROVAL_STATUS.MOVED) return false;

    const m = request.data.imageMetadata;
    const imageMetadata: ImageMetadata = {l: Number(m.l), s: Number(m.s)};
    if (m.z) imageMetadata.z = Number(m.z);
    if (m.m) imageMetadata.m = m.m.substring(0, 50);
    if (m.o) imageMetadata.o = Number(m.o);
    if (m.y) imageMetadata.y = Number(m.y);
    if (m.x) imageMetadata.x = Number(m.x);

    // Use the default image for local testing.
    const servingUrl = status === APPROVAL_STATUS.MOVED ?
      request.data.servingUrl :
      ((process.env.FUNCTIONS_EMULATOR === "true") ?
        "https://kp24.web.app/assets/kp.png" :
        await getServingUrl(
          `uploads/${idLokasi}/${request.auth.uid}/${imageId}`));

    const sanitized: UploadRequest = {
      idLokasi, imageId, imageMetadata, servingUrl,
      votes: [{
        uid: request.auth.uid,
        pas1, pas2, pas3,
        updateTs: Date.now(),
        status,
      }],
      status,
    };
    return uploadHandler(firestore, sanitized).then((success) => {
      if (success) {
        delete lokasiCache[request.data.idLokasi.substring(0, 10)];
      }
      return success;
    });
  });

export const lapor = onCall(
  {cors: ALLOW_ORIGINS},
  async (request: CallableRequest<LaporRequest>) : Promise<boolean> => {
    logger.log("lapor", request.auth, request.data);

    if (!request.auth?.uid) return false;

    const now = Date.now();
    if (shouldRateLimit(userRateLimiter, now, request.auth.uid)) {
      logger.error("lapor-rate-limited", request.auth.uid);
      return false;
    }

    const idLokasi = request.data.idLokasi;
    if (!(/^\d{11,13}$/.test(idLokasi))) return false;

    const imageId = request.data.imageId;
    if (!(/^[A-Za-z0-9]{20}$/.test(imageId))) return false;

    const reason = request.data.reason;
    if (reason.length > 300) return false;

    const vs = request.data.votes;
    const pas1 = Number(vs.pas1);
    if (!isValidVoteNumbers(pas1)) return false;

    const pas2 = Number(vs.pas2);
    if (!isValidVoteNumbers(pas2)) return false;

    const pas3 = Number(vs.pas3);
    if (!isValidVoteNumbers(pas3)) return false;

    const status = vs.status;
    if (status !== APPROVAL_STATUS.NEW &&
        status !== APPROVAL_STATUS.APPROVED &&
        status !== APPROVAL_STATUS.REJECTED &&
        status !== APPROVAL_STATUS.LAPOR &&
        status !== APPROVAL_STATUS.MOVED) return false;

    const sanitized: LaporRequest = {
      idLokasi,
      imageId,
      servingUrl: "",
      uid: request.auth.uid,
      reason,
      isResolved: !!request.data.isResolved,
      votes: {pas1, pas2, pas3, status, updateTs: Date.now()},
    };
    return laporHandler(firestore, sanitized).then((success) => {
      if (success) {
        delete lokasiCache[request.data.idLokasi.substring(0, 10)];
      }
      return success;
    });
  });

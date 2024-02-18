import {
  LaporRequest, Lokasi, USER_ROLE, UserProfile, UserStats,
  aggregate, getParentId, getUserStats,
} from "./interfaces";

import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";

/**
 * Lapor photo.
 * @param {admin.firestore.Firestore} firestore the handle to the Firestore.
 * @param {LaporRequest} request the request.
 * @return {string} true if the photo is successfully lapored.
 */
export async function laporHandler(firestore: admin.firestore.Firestore,
  request: LaporRequest): Promise<boolean> {
  const now = Date.now();
  const idDesa = getParentId(request.idLokasi);
  const hRef = firestore.doc(`h/i${idDesa}`);
  const uRef = firestore.doc(`u/${request.uid}`);
  const sRef = firestore.doc(`s/${request.uid}`);
  const eRef = firestore.doc(`e/${request.idLokasi}-${request.imageId}-${now}`);
  const lokasi = await firestore
    .runTransaction(async (t) => {
      const lokasi = (await t.get(hRef)).data() as Lokasi | undefined;
      if (!lokasi) {
        logger.error("Lokasi not exists", request.idLokasi, request.uid);
        return null;
      }

      const c = lokasi.aggregated[request.idLokasi.substring(10)];
      if (!c) {
        logger.error("Invalid lapor lokasi", request.idLokasi, request.uid);
        return null;
      }

      const p = (await t.get(uRef)).data() as UserProfile | undefined;
      if (!p) {
        logger.error("User not registered", request.uid);
        return false;
      }
      if (p.role < USER_ROLE.RELAWAN) {
        logger.error("User cannot lapor", request.uid);
        return false;
      }
      const s = getUserStats(
          (await t.get(sRef)).data() as UserStats | undefined, p);

      if (!p.lapor) p.lapor = {};
      const key = `${request.idLokasi}/${request.imageId}`;
      p.lapor[key] = request;
      p.laporCount = Object.keys(p.lapor).length;
      s.laporCount++;
      if (s.laporCount > s.laporMaxCount && p.role < USER_ROLE.MODERATOR) {
        logger.error("User has too many lapor", request.uid, s.laporCount);
        return false;
      }

      const aIdx = c.findIndex(
        (a) => a.uploadedPhoto?.imageId === request.imageId);
      if (aIdx < 1) {
        logger.error("No published image", aIdx, request);
        return false;
      }
      const a = c[aIdx];
      if (!a.uploadedPhoto) {
        logger.error("No photo", aIdx, a, request);
        return false;
      }
      if (request.isResolved && p.role < USER_ROLE.MODERATOR) {
        logger.error("Not permitted to resolve", a, request);
        return false;
      }

      if (a.uploadedPhoto.lapor === request.reason &&
            a.uploadedPhoto.laporResolved === request.isResolved) {
        logger.log("Lapor sudah masuk", request);
        return null;
      }
      p.size = JSON.stringify(p).length;

      t.set(uRef, p);
      t.set(sRef, s);

      a.totalLaporTps = request.isResolved ? 0 : 1;
      a.uploadedPhoto.lapor = request.reason;
      a.uploadedPhoto.laporResolved = request.isResolved;

      c[0].totalLaporTps = 0;
      for (let i = 1; i < c.length; i++) {
        if (c[i].totalLaporTps) c[0].totalLaporTps++;
      }

      if (c[0].totalLaporTps > 0) {
        c[0].anyLaporTps = request.idLokasi;
      } else {
        delete c[0].anyLaporTps;
      }

      c[0].updateTs = now;
      t.set(hRef, lokasi);
      t.set(eRef, request);
      return lokasi;
    });

  if (!lokasi) {
    logger.warn("Fail to lapor", request.idLokasi, request);
    return false; // Fail to update.
  }
  await firestore
    .collection("p")
    .add(aggregate(lokasi))
    .catch(logger.error);
  return true;
}

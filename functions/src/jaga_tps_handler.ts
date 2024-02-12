import {
  Lokasi, USER_ROLE, UserProfile, UserStats,
  aggregate, getParentId, getUserStats,
} from "./interfaces";

import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {LOKASI} from "./lokasi";

/**
 * Mark the user is guarding the TPS.
 * @param {admin.firestore.Firestore} firestore the handle to the Firestore.
 * @param {string} tpsId the tps to be guarded.
 * @param {string} uid the user who is guarding.
 * @return {string} true if the TPS is successfully guarded.
 */
export async function jagaTpsHandler(firestore: admin.firestore.Firestore,
  tpsId: string, uid: string): Promise<boolean> {
  logger.log(`Jaga TPS t/${tpsId}/u/${uid}`);

  const now = Date.now();
  const idDesa = getParentId(tpsId);
  const hRef = firestore.doc(`h/i${idDesa}`);
  const uRef = firestore.doc(`u/${uid}`);
  const sRef = firestore.doc(`s/${uid}`);
  const lokasi = await firestore
    .runTransaction(async (t) => {
      let lokasi = (await t.get(hRef)).data() as Lokasi | null;
      if (!lokasi) lokasi = LOKASI.getPrestineLokasi(idDesa);
      if (!lokasi) {
        logger.error("Invalid jaga lokasi Desa ID", tpsId, uid);
        return null;
      }

      const c = lokasi.aggregated[tpsId.substring(10)];
      if (!c) {
        logger.error("Invalid jaga TPS ID", tpsId, uid);
        return null;
      }

      const p = (await t.get(uRef)).data() as UserProfile | undefined;
      if (!p) {
        logger.error("User not registered", uid);
        return false;
      }
      if (p.role < USER_ROLE.RELAWAN) {
        logger.error("User cannot jagaTps", uid);
        return false;
      }
      const s = getUserStats(
          (await t.get(sRef)).data() as UserStats | undefined, p);

      if (!p.jagaTps) p.jagaTps = {};
      p.jagaTps[tpsId] = true;
      p.jagaTpsCount = Object.keys(p.jagaTps).length;
      s.jagaTpsCount++;
      if (s.jagaTpsCount > 100) {
        logger.error("User has too many jagaTps", uid, s.jagaTpsCount);
        return false;
      }

      p.size = JSON.stringify(p).length;
      t.set(uRef, p);
      t.set(sRef, s);

      if (c[0].totalJagaTps) {
        logger.log("Sudah terjaga", tpsId);
        return null;
      }
      c[0].totalJagaTps = 1;
      c[0].updateTs = now;
      t.set(hRef, lokasi);
      return lokasi;
    });

  if (!lokasi) {
    logger.log("Fail to jagaTps", tpsId);
    return false; // Fail to update.
  }
  await firestore
    .collection("p")
    .add(aggregate(lokasi))
    .catch(logger.error);
  return true;
}

import {
  APPROVAL_STATUS, AggregateVotes,
  Lokasi, UploadRequest, UserProfile,
} from "./interfaces";
import {getPrestineLokasi} from "./lokasi";

import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";

/**
 * Check whether the number of votes in a and b are the same.
 * @param {AggregateVotes} a the first votes.
 * @param {AggregateVotes} b the second votes.
 * @return {boolean} True if they are the same.
 */
function isIdentical(a: AggregateVotes, b: AggregateVotes): boolean {
  return a.pas1 === b.pas1 &&
    a.pas2 === b.pas2 &&
    a.pas3 === b.pas3 &&
    a.totalTps === b.totalTps &&
    a.totalCompletedTps === b.totalCompletedTps &&
    a.totalPendingTps === b.totalPendingTps &&
    a.totalErrorTps === b.totalErrorTps &&
    Object.keys(a.pendingUploads ?? {}).length ===
    Object.keys(b.pendingUploads ?? {}).length;
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
 * @param {string} idLokasi the lokasi id.
 * @return {AggregateVotes} empty object.
 */
function newAggregateVotes(idLokasi: string): AggregateVotes {
  return {
    idLokasi,
    name: "",
    pas1: 0,
    pas2: 0,
    pas3: 0,
    createdTs: 0,
    totalTps: 0,
    totalCompletedTps: 0,
    totalPendingTps: 0,
    totalErrorTps: 0,
  };
}

async function addDataToUserProfile(
  firestore: admin.firestore.Firestore,
  t: admin.firestore.Transaction,
  data: UploadRequest
) {
  const uid = data.votes[0].uid;
  const uRef = firestore.doc(`u/${uid}`);
  const p = (await t.get(uRef)).data() as UserProfile | undefined;
  if (!p) {
    console.error("User not registered", uid);
    return false;
  }
  if (!p.uploads[data.idLokasi]) p.uploads[data.idLokasi] = {};
  p.uploads[data.idLokasi][data.imageId] = data;
  p.uploadCount++;
  if (p.uploadCount > p.uploadMaxCount) {
    console.error("Uploads exceeded", uid);
    return false;
  }
  t.set(uRef, p);
  return true;
}

/**
 * Stores the uploaded image and votes to Firestore and aggregate them
 * upwards through the hierarchy.
 * @param {admin.firestore.Firestore} firestore the handle to the Firestore.
 * @param {UploadRequest} data the UploadRequest data.
 * @return {string} the serving photo url in the request.
 */
export async function uploadHandler(firestore: admin.firestore.Firestore,
  data: UploadRequest): Promise<boolean> {
  logger.log("Dispatched", JSON.stringify(data, null, 2));

  if (!data.votes || data.votes.length !== 1) {
    console.error("No votes", JSON.stringify(data, null, 2));
    return false;
  }
  if (!data.votes[0].uid) {
    console.error("Missing uid", JSON.stringify(data, null, 2));
    return false;
  }

  const now = Date.now();
  for (let agg = newAggregateVotes(data.idLokasi); agg;) {
    const idParent = getParentId(agg.idLokasi);
    const nextAgg = await firestore
      .runTransaction(async (t) => {
        const hRef = firestore.doc(`h/i${idParent}`);
        let lokasi = (await t.get(hRef)).data() as Lokasi | undefined;
        if (!lokasi) lokasi = getPrestineLokasi(idParent);
        logger.log("Lokasi", JSON.stringify(lokasi, null, 2));

        if (agg.idLokasi.length > 10) {
          const c = lokasi.aggregated[data.idLokasi.substring(10)];

          // Copy over the existing data.
          agg.pas1 = c[0].pas1;
          agg.pas2 = c[0].pas2;
          agg.pas3 = c[0].pas3;
          agg.createdTs = c[0].createdTs;
          agg.totalTps = c[0].totalTps;
          agg.totalCompletedTps = c[0].totalCompletedTps;
          agg.totalPendingTps = c[0].totalPendingTps;
          agg.totalErrorTps = c[0].totalErrorTps;
          agg.pendingUploads = {...(c[0].pendingUploads ?? {})};

          const uploadRef =
           firestore.doc(`t/${data.idLokasi}/p/${data.imageId}`);
          const upload =
           (await t.get(uploadRef)).data() as UploadRequest | undefined;
          if (!upload) {
            if (!data.servingUrl) {
              console.error("No serving url", JSON.stringify(data));
              return null;
            }
            if (!await addDataToUserProfile(firestore, t, data)) return null;
            t.set(uploadRef, data);
            agg.createdTs = now;
            agg.pendingUploads[data.imageId] = true;
          } else {
            if (!data.votes[0].status) {
              console.error("Status is null", JSON.stringify(data, null, 2));
              return null;
            }
            if (upload.idLokasi !== data.idLokasi ||
               upload.imageId !== data.imageId) {
              console.error("Mismatch upload request",
                JSON.stringify(upload, null, 2), JSON.stringify(agg, null, 2));
              return null;
            }
            upload.votes.unshift(data.votes[0]);
            upload.status = data.votes[0].status;
            t.set(uploadRef, upload);

            delete agg.pendingUploads[data.imageId];

            if (data.votes[0].status == APPROVAL_STATUS.APPROVED) {
              // Adds the photo and the votes.
              agg.pas1 = data.votes[0].pas1;
              agg.pas2 = data.votes[0].pas2;
              agg.pas3 = data.votes[0].pas3;
              agg.uid = data.votes[0].uid;
              c.splice(1, 0, {
                ...agg, uploadedPhoto: {
                  imageId: data.imageId,
                  photoUrl: upload.servingUrl,
                },
              });
            }
          }
          agg.totalTps = 1;
          agg.totalPendingTps = Object.keys(agg.pendingUploads).length ? 1 : 0;
          agg.totalCompletedTps = c.length > 1 ? 1 : 0;
        }

        const c = lokasi.aggregated[agg.idLokasi.length > 10 ?
          agg.idLokasi.substring(10) : agg.idLokasi];
        if (isIdentical(c[0], agg)) {
          logger.log("Identical", JSON.stringify(agg, null, 2));
          return null;
        }
        agg.name = c[0].name; // Preserve the name.
        c[0] = agg;

        t.set(hRef, lokasi);

        const nextAgg = newAggregateVotes(idParent);
        for (const [cagg] of Object.values(lokasi.aggregated)) {
          nextAgg.pas1 += cagg.pas1 ?? 0;
          nextAgg.pas2 += cagg.pas2 ?? 0;
          nextAgg.pas3 += cagg.pas3 ?? 0;
          nextAgg.totalTps += cagg.totalTps ?? 0;
          nextAgg.totalCompletedTps += cagg.totalCompletedTps ?? 0;
          nextAgg.totalPendingTps += cagg.totalPendingTps ?? 0;
          nextAgg.totalErrorTps += cagg.totalErrorTps ?? 0;
        }
        return nextAgg;
      });

    if (!idParent.length || !nextAgg) break;
    logger.log("Next TPS", idParent, JSON.stringify(nextAgg, null, 2));
    agg = nextAgg;
  }
  return true;
}

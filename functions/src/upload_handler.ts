import {
  APPROVAL_STATUS, AggregateVotes,
  Lokasi, TESTER_UID, USER_ROLE, UploadRequest, UserProfile,
} from "./interfaces";
import { getPrestineLokasi } from "./lokasi";

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

async function addDataToUserProfile(
  firestore: admin.firestore.Firestore,
  t: admin.firestore.Transaction,
  data: UploadRequest
) {
  const uid = data.votes[0].uid;

  // For testing skip updating the profile.
  if (uid == TESTER_UID) return true;

  const uRef = firestore.doc(`u/${uid}`);
  const p = (await t.get(uRef)).data() as UserProfile | undefined;
  if (!p) {
    console.error("User not registered", uid);
    return false;
  }

  if (data.status) {
    // Reviewer.
    if (p.role < USER_ROLE.MODERATOR) {
      console.error("User cannot review", uid);
      return false;
    }
    if (!p.reviews[data.idLokasi]) p.reviews[data.idLokasi] = 0;
    p.reviews[data.idLokasi]++;
    p.reviewCount++;
  } else {
    // Uploader.
    if (!p.uploads[data.idLokasi]) p.uploads[data.idLokasi] = {};
    p.uploads[data.idLokasi][data.imageId] = data;
    p.uploadCount++;
    if (p.uploadCount > p.uploadMaxCount) {
      console.error("Uploads exceeded", uid);
      return false;
    }
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
  const lokasi = await updateTps(firestore, data);
  if (!lokasi) {
    console.log('Fail to upload tps', data.idLokasi, data.status);
    return false; // Fail to update.
  }

  await firestore
    .collection('p')
    .add(aggregate(lokasi))
    .catch(console.error);
  return true;
}

export async function aggregateUp(firestore: admin.firestore.Firestore,
  ids: string[], aggs: AggregateVotes[]): Promise<void> {
  const t0 = Date.now();
  let numRetries = 0;
  const res = firestore
    .runTransaction(async (t) => {
      const t1 = Date.now();
      numRetries++;
      // Read all Lokasi before writing them all later.
      console.log('Read all lokasi');
      const lokasiMap: { [id: string]: Lokasi } = {};
      for (const a of aggs) {
        for (let id = a.idLokasi; id.length > 0;) {
          id = getParentId(id);
          if (lokasiMap[id]) continue;
          lokasiMap[id] = {} as Lokasi;
        }
      }
      // Read in parallel to save time.
      const lokasiIds = Object.keys(lokasiMap);
      const hRefs = lokasiIds.map(id => firestore.doc(`h/i${id}`));
      await t.getAll(...hRefs).then(docs => {
        for (let i = 0; i < hRefs.length; i++) {
          let lokasi = docs[i].data() as Lokasi;
          if (!lokasi) lokasi = getPrestineLokasi(lokasiIds[i]);
          lokasiMap[lokasiIds[i]] = lokasi;
        }
      });
      const t2 = Date.now();

      console.log('Aggregating lokasi');
      while (aggs[0].idLokasi.length > 0) {
        // Group by the parent ids to save read / write to the same parent.
        const aggParent: { [id: string]: AggregateVotes[] } = {};
        let length = aggs[0].idLokasi.length;
        for (const a of aggs) {
          if (a.idLokasi.length !== length) throw new Error('Length mismatch');
          const idParent = getParentId(a.idLokasi);
          if (!aggParent[idParent]) aggParent[idParent] = [];
          aggParent[idParent].push(a);
        }

        // Clear and then populate with the next level's below.
        aggs = [];

        // For each parent, aggregate its children.
        for (const [id, caggs] of Object.entries(aggParent)) {
          const lokasi = await lokasiMap[id];
          if (!lokasi) throw new Error(`Missing lokasi ${id}`);
          for (const agg of caggs) {
            const c = lokasi.aggregated[agg.idLokasi];
            if (!c) throw new Error(`Child ${agg.idLokasi} not found`);
            if (isIdentical(c[0], agg)) {
              logger.log("Identical", JSON.stringify(agg, null, 2));
              continue;
            }
            if (c[0].updateTs > agg.updateTs) {
              logger.log("Stale", agg.idLokasi);
              continue;
            }
            agg.name = c[0].name; // Preserve the name.
            c[0] = agg;
          }
          lokasi.numWrites++;
          aggs.push(aggregate(lokasi));
          t.set(firestore.doc(`h/i${id}`), lokasi);
        }
      }
      const t3 = Date.now();

      // Delete the ids from the pending collection.
      for (const id of ids) {
        t.delete(firestore.doc(`p/${id}`));
      }
      const t4 = Date.now();
      console.log('Updated lokasi', Object.keys(lokasiMap).length,
        'init', t1 - t0, 'read', t2 - t1, 'agg', t3 - t2, 'delete', t4 - t3);
    });

  try {
    await res;
  } catch (e) {
    console.error('aggregateUp', e);
  }
  if (numRetries > 1) {
    console.warn('Num retries', numRetries);
  }
}

async function updateTps(firestore: admin.firestore.Firestore,
  data: UploadRequest): Promise<Lokasi | null> {
  logger.log(`Update TPS t/${data.idLokasi}/p/${data.imageId}:${data.status}`);

  if (!data.votes || data.votes.length !== 1) {
    console.error("Invalid votes", JSON.stringify(data, null, 2));
    return null;
  }
  if (data.votes[0].status !== data.status || data.status === undefined) {
    console.error("Invalid status", JSON.stringify(data, null, 2));
    return null;
  }
  if (!data.votes[0].uid) {
    console.error("Missing uid", JSON.stringify(data, null, 2));
    return null;
  }
  if (data.idLokasi.length <= 10) {
    console.error("Invalid lokasi", JSON.stringify(data, null, 2));
    return null;
  }

  const now = Date.now();
  const idDesa = getParentId(data.idLokasi);
  const hRef = firestore.doc(`h/i${idDesa}`);
  return firestore
    .runTransaction(async (t) => {
      let lokasi = (await t.get(hRef)).data() as Lokasi | undefined;
      if (!lokasi) lokasi = getPrestineLokasi(idDesa);

      const c = lokasi.aggregated[data.idLokasi.substring(10)];
      const agg = JSON.parse(JSON.stringify(c[0])) as AggregateVotes;
      const uploadRef = firestore.doc(`t/${data.idLokasi}/p/${data.imageId}`);
      const upload =
        (await t.get(uploadRef)).data() as UploadRequest | undefined;
      if (!upload) {
        // New upload.
        if (!data.servingUrl) {
          console.error("No serving url", JSON.stringify(data));
          return null;
        }
        if (!await addDataToUserProfile(firestore, t, data)) return null;
        t.set(uploadRef, data);
        if (!agg.pendingUploads) agg.pendingUploads = {};
        agg.pendingUploads[data.imageId] = true;
      } else {
        // Reviewer or editor for existing upload, must have status.
        if (!data.votes[0].status) {
          console.error("Status must be set", JSON.stringify(data, null, 2));
          return null;
        }
        if (upload.idLokasi !== data.idLokasi ||
          upload.imageId !== data.imageId) {
          console.error("Mismatch upload request",
            JSON.stringify(upload, null, 2), JSON.stringify(agg, null, 2));
          return null;
        }
        if (!await addDataToUserProfile(firestore, t, data)) return null;
        upload.votes.unshift(data.votes[0]);
        upload.status = data.votes[0].status;
        t.set(uploadRef, upload);

        if (!agg.pendingUploads) agg.pendingUploads = {};
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
      agg.updateTs = now;
      agg.totalTps = 1;
      agg.totalPendingTps = Object.keys(agg.pendingUploads).length ? 1 : 0;
      agg.totalCompletedTps = c.length > 1 ? 1 : 0;

      if (isIdentical(c[0], agg)) {
        logger.log("Identical", JSON.stringify(agg, null, 2));
        return null;
      }
      c[0] = agg;
      t.set(hRef, lokasi);
      return lokasi;
    });
}

function aggregate(lokasi: Lokasi) {
  const nextAgg: AggregateVotes = {
    idLokasi: lokasi.id,
    name: "",
    pas1: 0,
    pas2: 0,
    pas3: 0,
    updateTs: 0,
    totalTps: 0,
    totalCompletedTps: 0,
    totalPendingTps: 0,
    totalErrorTps: 0,
  };
  for (const [cagg] of Object.values(lokasi.aggregated)) {
    nextAgg.pas1 += cagg.pas1 ?? 0;
    nextAgg.pas2 += cagg.pas2 ?? 0;
    nextAgg.pas3 += cagg.pas3 ?? 0;
    nextAgg.totalTps += cagg.totalTps ?? 0;
    nextAgg.totalCompletedTps += cagg.totalCompletedTps ?? 0;
    nextAgg.totalPendingTps += cagg.totalPendingTps ?? 0;
    nextAgg.totalErrorTps += cagg.totalErrorTps ?? 0;
    nextAgg.updateTs = Math.max(nextAgg.updateTs, cagg.updateTs);
  }
  return nextAgg;
}

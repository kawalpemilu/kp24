import {APPROVAL_STATUS, AggregateVotes,
  Lokasi, UploadRequest} from "./interfaces";
import {getPrestineLokasi} from "./lokasi";
import {getServingUrl} from "./serving_url";

import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";

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
        a.tidakSah === b.tidakSah &&
        a.totalTps === b.totalTps &&
        a.totalCompletedTps === b.totalCompletedTps &&
        a.totalPendingTps === b.totalPendingTps &&
        a.totalErrorTps === b.totalErrorTps;
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
  if (!u.votes.length || u.votes.length > 1) throw new Error();
  const v = u.votes[0];
  // Use the default image for local testing.
  const photoUrl = (process.env.FUNCTIONS_EMULATOR === "true") ?
    "https://kp24.web.app/assets/kp.png" :
    await getServingUrl(`uploads/${u.idLokasi}/${v.uid}/${u.imageId}`);
  return {
    idLokasi: u.idLokasi,
    name: u.idLokasi.substring(10),
    pas1: v.pas1,
    pas2: v.pas2,
    pas3: v.pas3,
    sah: v.sah,
    tidakSah: v.tidakSah,
    createdTs: Date.now(),
    totalTps: 1,
    totalCompletedTps: 0,
    totalPendingTps: 1,
    totalErrorTps: 0,
    uploadedPhoto: {
      halaman: u.halaman,
      imageId: u.imageId,
      imageMetadata: u.imageMetadata,
      photoUrl,
    },
    status: APPROVAL_STATUS.NEW,
  };
}

/**
 * Stores the uploaded image and votes to Firestore and aggregate them
 * upwards through the hierarchy.
 * @param {admin.firestore.Firestore} firestore the handle to the Firestore.
 * @param {UploadRequest} data the UploadRequest data.
 * @return {string} the serving photo url in the request.
 */
export async function uploadHandler(firestore: admin.firestore.Firestore,
  data: UploadRequest): Promise<string | false> {
  logger.log("Dispatched", JSON.stringify(data, null, 2));

  let agg = await processImageId(data);
  const photoUrl = agg.uploadedPhoto?.photoUrl ?? false;
  const tpsColRef = firestore.collection(`t/${agg.idLokasi}/p`);
  await tpsColRef.doc(data.imageId).set(agg);

  do {
    const idParent = getParentId(agg.idLokasi);
    const hRef = firestore.doc(`h/i${idParent}`);
    const nextAgg = await firestore
      .runTransaction(async (t) => {
        let lokasi = (await t.get(hRef)).data() as Lokasi | undefined;
        if (!lokasi) lokasi = getPrestineLokasi(idParent);
        logger.log("Lokasi", JSON.stringify(lokasi, null, 2));

        const cid = isUploadRequest(agg) ?
          agg.idLokasi.substring(10) : agg.idLokasi;

        const old = lokasi.aggregated[cid][0];
        if (isUploadRequest(agg)) {
          lokasi.aggregated[cid].splice(1, 0, {...agg});
          const v = data.votes[0];
          if (data.halaman === 1) {
            agg.pas1 = v.pas1;
            agg.pas2 = v.pas2;
            agg.pas3 = v.pas3;
            agg.sah = old.sah;
            agg.tidakSah = old.tidakSah;
          } else if (data.halaman === 2) {
            agg.pas1 = old.pas1;
            agg.pas2 = old.pas2;
            agg.pas3 = old.pas3;
            agg.sah = v.sah;
            agg.tidakSah = v.tidakSah;
          }
          delete agg.uploadedPhoto;
        } else if (isIdentical(old, agg)) {
          logger.log("Identical", JSON.stringify(agg, null, 2));
          return null;
        }
        agg.name = old.name; // Preserve the name.
        agg.totalTps = old.totalTps;
        lokasi.aggregated[cid][0] = agg;

        t.set(hRef, lokasi);

        const nextAgg: AggregateVotes = {
          idLokasi: idParent,
          name: "",
          pas1: 0,
          pas2: 0,
          pas3: 0,
          sah: 0,
          tidakSah: 0,
          createdTs: agg.createdTs,
          totalTps: 0,
          totalCompletedTps: 0,
          totalPendingTps: 0,
          totalErrorTps: 0,
          status: APPROVAL_STATUS.APPROVED,
        };
        for (const [cagg] of Object.values(lokasi.aggregated)) {
          if (cagg.status === APPROVAL_STATUS.APPROVED) {
            nextAgg.pas1 += cagg.pas1 ?? 0;
            nextAgg.pas2 += cagg.pas2 ?? 0;
            nextAgg.pas3 += cagg.pas3 ?? 0;
            nextAgg.sah += cagg.sah ?? 0;
            nextAgg.tidakSah += cagg.tidakSah ?? 0;
          }
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
  } while (agg);
  return photoUrl;
}

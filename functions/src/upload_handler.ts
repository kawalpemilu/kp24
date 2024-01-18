import {AggregateVotes, Lokasi, UploadRequest} from "./interfaces";
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
  // Use the default image for local testing.
  const photoUrl = (process.env.FUNCTIONS_EMULATOR === "true") ?
    "https://lh3.googleusercontent.com/2vCAJNE_LMg6fXSEuXOdjAgn8bAX1DmnTwiCfWZWtqgvm7Gc3afrnRjusNU4g9pM1hRQLVo_aTaZWSezAoBVAliBAPRxQWMmEQMPGHE" :
    await getServingUrl(`uploads/${u.idLokasi}/${u.uid}/${u.imageId}`);
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
    photoUrl,
    totalTps: 1,
    totalCompletedTps: 1,
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
  data: UploadRequest): Promise<string> {
  logger.log("Dispatched", JSON.stringify(data, null, 2));

  let agg = await processImageId(data);
  const photoUrl = agg.photoUrl;
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
        const old = lokasi.aggregated[cid];
        if (isIdentical(old, agg)) {
          logger.log("Identical", JSON.stringify(agg, null, 2));
          return null;
        }
        agg.name = old.name; // Preserve the name.
        agg.totalTps = old.totalTps;
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
          nextAgg.totalTps += cagg.totalTps ?? 0;
        }
        return nextAgg;
      });

    if (!idParent.length || !nextAgg) break;
    logger.log("Next TPS", idParent, JSON.stringify(nextAgg, null, 2));
    agg = nextAgg;
  } while (agg);
  return photoUrl;
}

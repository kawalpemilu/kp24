import * as admin from "firebase-admin";
import { APPROVAL_STATUS, ImageMetadata, Lokasi, TESTER_UID, UploadRequest } from "./interfaces";
import { uploadHandler } from "./upload_handler";

admin.initializeApp();
const firestore = admin.firestore();

console.log("env", process.env.NODE_ENV);
if (process.env.NODE_ENV !== "production") {
  firestore.settings({
    host: "localhost:8084",
    ssl: false,
  });
}

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection at:", reason);
});

async function reviewReject(idLokasi: string, imageId: string) {
  const rejectRequest: UploadRequest = {
    idLokasi,
    imageId,
    votes: [{
      uid: TESTER_UID,
      pas1: 0, pas2: 0, pas3: 0,
      updateTs: Date.now(),
      status: APPROVAL_STATUS.REJECTED,
    }],
    status: APPROVAL_STATUS.REJECTED,
    imageMetadata: {} as ImageMetadata,
    servingUrl: ""
  };
  const response = await uploadHandler(firestore, rejectRequest);
  if (!response) throw new Error();
  console.log('Cleared', idLokasi, imageId);
}

async function clearDesa(idDesa: string) {
  const snap = await firestore.doc(`h/i${idDesa}`).get();
  const lokasi = snap.data() as Lokasi | null;
  if (!lokasi) throw new Error();
  
  console.log('Clearing Desa', idDesa, lokasi.names[lokasi.names.length - 1]);
  for (const [tpsNo, agg] of Object.entries(lokasi.aggregated)) {
    // Reject approved photos.
    for (let i = 1; i < agg.length; i++) {
      const a = agg[i];
      await reviewReject(idDesa + tpsNo, a.uploadedPhoto?.imageId ?? '');
    }
    // Reject pending photos.
    const tpsId = idDesa + tpsNo;
    const tRef = firestore.collection(`/t/${tpsId}/p`);
    const qRef = tRef.where('status', '==', APPROVAL_STATUS.NEW).limit(10);
    while (true) {
      const snapshots = await qRef.get();
      const pendings: UploadRequest[] = [];
      snapshots.forEach(snap => {
        pendings.push(snap.data() as UploadRequest);
      });
      if (!pendings.length) break;
      for (const pending of pendings) {
        await reviewReject(tpsId, pending.imageId);
      }
    }
  }
}

async function clearKec(idKec: string) {
  console.log('Processing kec', idKec);
  const snap = await firestore.doc(`h/i${idKec}`).get();
  const lokasi = snap.data() as Lokasi | null;
  if (!lokasi) throw new Error();

  for (const [idDesa, agg] of Object.entries(lokasi?.aggregated)) {
    if (agg[0].totalCompletedTps || agg[0].totalPendingTps || agg[0].totalLaporTps) {
      await clearDesa(idDesa);
    }
  }
}

async function clearKab(idKab: string) {
  console.log('Processing kab', idKab);
  const snap = await firestore.doc(`h/i${idKab}`).get();
  const lokasi = snap.data() as Lokasi | null;
  if (!lokasi) throw new Error();

  for (const [idKec, agg] of Object.entries(lokasi?.aggregated)) {
    if (agg[0].totalCompletedTps || agg[0].totalPendingTps || agg[0].totalLaporTps) {
      await clearKec(idKec);
    }
  }
}

async function clearProp(idProp: string) {
  const snap = await firestore.doc(`h/i${idProp}`).get();
  const lokasi = snap.data() as Lokasi | null;
  if (!lokasi) throw new Error();

  const promises = [];
  for (const [idKab, agg] of Object.entries(lokasi?.aggregated)) {
    if (agg[0].totalCompletedTps || agg[0].totalPendingTps || agg[0].totalLaporTps) {
      promises.push(clearKab(idKab));
    }
  }
  console.log('Processing prop', idProp, 'parallelism', promises.length);
  await Promise.all(promises);
}

/**
 * Run administrative function.
 */
async function run() {
  const snap = await firestore.doc(`h/i`).get();
  const lokasi = snap.data() as Lokasi | null;
  if (!lokasi) throw new Error();
  
  const promises = [];
  for (const [idProp, agg] of Object.entries(lokasi?.aggregated)) {
    if (agg[0].totalCompletedTps || agg[0].totalPendingTps || agg[0].totalLaporTps) {
      promises.push(clearProp(idProp));
    }
  }
  console.log('Parallel', promises.length);
  await Promise.all(promises);
}

run();

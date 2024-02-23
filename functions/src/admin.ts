import * as admin from "firebase-admin";
import {
  APPROVAL_STATUS, DEFAULT_MAX_LAPORS, DEFAULT_MAX_UPLOADS, ImageMetadata, Lokasi,
  TESTER_UID, UploadRequest, UserProfile, autoId
} from "./interfaces";
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

async function clearAll() {
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

async function clearUserStats() {
  const tRef = firestore.collection(`/u`);
  const qRef = tRef
    .where('laporCount', '>', 0)
    .orderBy('laporCount', 'desc')
    .limit(10);
  while (true) {
    const snapshots = await qRef.get();
    const userProfiles: UserProfile[] = [];
    snapshots.forEach(snap => {
      userProfiles.push(snap.data() as UserProfile);
    });
    if (!userProfiles.length) break;
    for (const { uid } of userProfiles) {
      const uRef = firestore.doc(`u/${uid}`);
      const bRef = firestore.doc(`b/${uid}`);
      const result = await firestore.runTransaction(async (t) => {
        const p = (await t.get(uRef)).data() as UserProfile | undefined;
        if (!p) throw new Error();
        // console.log('p', JSON.stringify(p, null, 2));

        t.set(bRef, JSON.parse(JSON.stringify(p)));

        p.uploads = {};
        p.uploadCount = 0;
        p.uploadMaxCount = DEFAULT_MAX_UPLOADS;
        p.uploadRemaining = DEFAULT_MAX_UPLOADS;
        p.uploadDistinctTps = 0;
        p.uploadDistinctDesa = 0;

        p.reviews = {};
        p.reviewCount = 0;

        p.lapor = {};
        p.laporCount = 0;
        p.laporMaxCount = DEFAULT_MAX_LAPORS;
        p.laporRemaining = DEFAULT_MAX_LAPORS;

        p.size = JSON.stringify(p).length;

        t.set(uRef, p);

        return p;
      });
      console.log('Cleared', result.email, result.uid);
      // return;
    }
  }
}

async function trimUserStats() {
  const qRef = firestore.collection(`/u`).orderBy('size', 'desc').limit(10);
  const snapshots = await qRef.get();
  const uids: string[] = [];
  snapshots.forEach(snap => {
    uids.push((snap.data() as UserProfile).uid);
  });
  for (const uid of uids) {
    const res = await firestore.runTransaction(async t => {
      const uRef = firestore.doc(`/u/${uid}`);
      const u = (await t.get(uRef)).data() as UserProfile;
      const trimRef = firestore.doc(`/u/${uid}/t/${autoId()}`);
      t.set(trimRef, JSON.parse(JSON.stringify(u)));
      u.uploads = {};
      u.uploadMaxCount = 10000;
      u.size = JSON.stringify(u).length;
      t.set(uRef, u);
      return u;
    })
    console.log(res.name, res.size);
  }
}

/**
 * Run administrative function.
 */
async function run() {
  if (false) await clearAll();
  if (false) await clearUserStats();
  await trimUserStats();
}

run();

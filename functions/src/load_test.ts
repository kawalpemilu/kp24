import {APPROVAL_STATUS, ImageMetadata, TESTER_UID,
  UploadRequest, autoId} from "./interfaces";
import {LOKASI} from "./lokasi";
import {uploadHandler} from "./upload_handler";
import * as admin from "firebase-admin";

admin.initializeApp();
const firestore = admin.firestore();

console.log("env", process.env.NODE_ENV);
if (process.env.NODE_ENV !== "production") {
  firestore.settings({
    host: "localhost:8084",
    ssl: false,
  });
}

/**
 * @param {T[]} array the array to be shuffled.
 * @return {T[]} the shuffled array.
 */
function shuffleArray<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * @param {string} id the idDesa
 * @return {UploadRequest} fake UploadRequest for testing.
 */
function createUploadRequest(id: string) {
  const request: UploadRequest = {
    idLokasi: id,
    imageId: autoId(),
    imageMetadata: {} as ImageMetadata,
    servingUrl: "https://kp24.web.app/assets/kp.png",
    votes: [{
      uid: TESTER_UID,
      pas1: 1, pas2: 2, pas3: 3,
      updateTs: Date.now(),
      status: APPROVAL_STATUS.NEW,
    }],
    status: APPROVAL_STATUS.NEW,
  };
  return request;
}

/**
 * Run load test: upload 1000 photos and review them.
 * The current production firestore can support about 13 QPS.
 */
async function run() {
  const tpsIds = [];
  for (const idDesa of LOKASI.getDesaIds()) {
    const lokasi = LOKASI.getPrestineLokasi(idDesa);
    for (const [tpsId] of Object.entries(lokasi.aggregated)) {
      tpsIds.push(idDesa + tpsId);
    }
  }
  console.log("read tps", tpsIds.length);
  shuffleArray(tpsIds);

  const uploadRequests: UploadRequest[] = [];
  for (let i = 0; i < 1000 && i < tpsIds.length; i++) {
    uploadRequests.push(createUploadRequest(tpsIds[i]));
  }

  // Upload and Review simultaneously.
  let uploadPromises = [];
  let uploadRequestBatch = [];
  const reviewPromises: Promise<boolean>[] = [];
  for (const request of uploadRequests) {
    uploadRequestBatch.push(request);
    uploadPromises.push(uploadHandler(firestore, request));
    if (uploadPromises.length > 100) {
      console.log("Settling ", uploadPromises.length);
      await Promise.allSettled(uploadPromises);
      await new Promise((resolve) => setTimeout(resolve, 100));
      for (const request of uploadRequestBatch) {
        request.votes[0].status = request.status = APPROVAL_STATUS.APPROVED;
        request.votes[0].updateTs = Date.now();
        reviewPromises.push(uploadHandler(firestore, request));
      }
      uploadPromises = [];
      uploadRequestBatch = [];
    }
  }
  await Promise.allSettled(uploadPromises);
  for (const request of uploadRequestBatch) {
    request.votes[0].status = request.status = APPROVAL_STATUS.APPROVED;
    reviewPromises.push(uploadHandler(firestore, request));
  }

  for (const p of reviewPromises) {
    if (!p) {
      console.log("gagal review", p);
    }
  }
}

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection at:", reason);
});

run();

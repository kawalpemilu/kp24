import { getDesaIds, getPrestineLokasi } from "./lokasi";
import { APPROVAL_STATUS, AggregateVotes, ImageMetadata, TESTER_UID, UploadRequest, autoId } from "./interfaces";

import * as admin from "firebase-admin";
import {
    aggregateUp,
    uploadHandler
} from "./upload_handler";

admin.initializeApp();
const firestore = admin.firestore();

console.log('env', process.env.NODE_ENV);
if (process.env.NODE_ENV !== 'production') {
    firestore.settings({
        host: "localhost:8084",
        ssl: false
    });
}

function shuffleArray<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

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

async function listenToNewUploadsAndAggregateUp() {
    console.log('listening to new uploads');
    const t0 = Date.now();
    const colRef = firestore.collection('p').orderBy('updateTs', 'asc').limit(100);
    const [ids, aggs] = await new Promise<[string[], AggregateVotes[]]>(resolve => {
        const unsub = colRef.onSnapshot(async snapshot => {
            const ids = snapshot.docs.map(d => d.id);
            const aggs = snapshot.docs.map(d => d.data() as AggregateVotes);
            if (!aggs.length) return;
            console.log('Fetched', aggs.length, 'pending uploads');
            unsub();
            resolve([ids, aggs]);
        });
    });
    const t1 = Date.now();
    await aggregateUp(firestore, ids, aggs);
    const t2 = Date.now();
    console.log('AggregatedUp', aggs.length, 'Fetch', t1 - t0, 'Agg', t2 - t1);
    return aggs.length;
}

async function eternalListen() {
    while (true) {
        const n = await listenToNewUploadsAndAggregateUp();
        console.log('aggregated up ', n);
    }
}

async function run() {
    const tpsIds = [];
    for (const idDesa of getDesaIds()) {
        const lokasi = getPrestineLokasi(idDesa);
        for (const [tpsId] of Object.entries(lokasi.aggregated)) {
            tpsIds.push(idDesa + tpsId);
        }
    }
    console.log('read tps', tpsIds.length);
    shuffleArray(tpsIds);

    const listen = eternalListen();

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
            console.log('Settling ', uploadPromises.length);
            await Promise.allSettled(uploadPromises);
            await new Promise(resolve => setTimeout(resolve, 100));
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
            console.log('gagal review', p);
        }
    }
    await listen;
}

process.on('unhandledRejection', (reason: any) => {
    console.error('Unhandled Rejection at:', reason?.details);
});

run();

import * as admin from "firebase-admin";
import { processPendingUploads } from "./upload_handler";

admin.initializeApp();
const firestore = admin.firestore();

console.log('env', process.env.NODE_ENV);
if (process.env.NODE_ENV !== 'production') {
    firestore.settings({
        host: "localhost:8084",
        ssl: false
    });
}

process.on('unhandledRejection', (reason: any) => {
    console.error('Unhandled Rejection at:', reason?.details);
});

async function run() {
    await processPendingUploads(firestore);
}

run();

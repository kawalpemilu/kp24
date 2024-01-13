import {
  onRequest, Request,
  onCall, CallableRequest,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as express from "express";

/** Trigger calls to the getServingUrl. */
export const gsu = onRequest(
  async (request: Request, response: express.Response) => {
    // TODO: add retry using tasks.
    const objectName = "mountains.jpg";
    logger.info("Get serving url", JSON.stringify(request.params, null, 2));
    response.send(await getServingUrl(objectName));
  });

/** https://firebase.google.com/docs/functions/callable?gen=2nd */
export const gsuc = onCall(
  {cors: true},
  async (request: CallableRequest<string>) => {
    // TODO: add retry using tasks.
    logger.info("Get serving url", request.auth?.uid);
    const objectName = request.auth?.uid + ".jpg";
    return await getServingUrl(objectName);
  });

/**
 * Returns the optimized image serving url for the given object.
 * @param {string} objectName The object name in the storage bucket.
 * @return {string} The serving url of the object image.
 */
async function getServingUrl(objectName: string) {
  const path = encodeURIComponent(`kp24-fd486.appspot.com/${objectName}`);
  const data = await fetch(`https://kp24-fd486.et.r.appspot.com/gsu?path=${path}`);
  if (!data.startsWith("http")) throw new Error("GSU failed: " + path);
  return data;
}

import * as https from "https";
import * as http from "http";

/**
 * Fetches the content of the given url.
 * @param {string} url The url to be fetched.
 * @return {string} The content of the url.
 */
export function fetch(url: string) {
  return new Promise<string>((resolve, reject) => {
    https.get(url, (resp: http.IncomingMessage) => {
      let data = "";
      resp.on("data", (chunk: string) => {
        data += chunk;
      });
      resp.on("end", () => {
        resolve(data);
      });
    }).on("error", reject);
  });
}

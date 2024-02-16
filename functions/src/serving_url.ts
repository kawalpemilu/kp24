import * as https from "https";
import * as http from "http";

/**
 * Returns the optimized image serving url for the given object.
 * @param {string} objectName The object name in the storage bucket.
 * @return {string} The serving url of the object image.
 */
export async function getServingUrl(objectName: string) {
  const path = encodeURIComponent(`kp24-fd486.appspot.com/${objectName}`);
  const data = await fetch(`https://kp24-fd486.et.r.appspot.com/gsu?path=${path}`);
  return data.startsWith("http") ? data : "";
}

/**
 * Fetches the content of the given url.
 * @param {string} url The url to be fetched.
 * @return {string} The content of the url.
 */
export function fetch(url: string, ignoreCertificate = false) {
  const agent = new https.Agent({ rejectUnauthorized: !ignoreCertificate });
  return new Promise<string>((resolve, reject) => {
    const req = https.get(url, {agent}, (resp: http.IncomingMessage) => {
      let data = "";
      resp.on("data", (chunk: string) => {
        data += chunk;
      });
      resp.on("end", () => {
        resolve(data);
      });
    }).on("error", reject);

    // Set a 1-minute timeout
    req.setTimeout(60000, () => {
      req.abort(); // Abort the request
      reject(new Error('Request timed out after 1 minute.'));
    });
  });
}

export function writeToStream(url: string, pst: any) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (response) => {
      response.pipe(pst).on('finish', resolve);
    }).on("error", reject);
    // Set a 1-minute timeout
    req.setTimeout(60000, () => {
      req.abort(); // Abort the request
      reject(new Error('Request timed out after 1 minute.'));
    });
  });
}

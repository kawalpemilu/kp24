// These interfaces are shared between the backend (Firestore Functions) and
// the frontend (Angular).

export const DEFAULT_MAX_UPLOADS = 100;
export const DEFAULT_MAX_LAPORS = 100;

export const TESTER_UID = "tester_uid";

export const ALLOW_ORIGINS = [
  "https://kawalpemilu.org",
  "http://localhost:4200",
  "http://10.0.0.57:4200",
];

export enum USER_ROLE {
  BANNED = 0,
  RELAWAN = 1,
  MODERATOR = 2,
  ADMIN = 3,
  ROOT = 4
}

export interface UserProfile {
  uid: string; // Firebase User ID.
  name: string; // User Full Name.
  lowerCaseName: string; // For prefix search.
  email: string; // User email.
  pic: string; // Link to user's profile picture.
  createdTs: number; // The timestamp of when the user created the profile.
  lastLoginTs: number; // The timestamp of last login.
  role: USER_ROLE;
  referrerUid?: string; // Must be set for role > RELAWAN.

  // uploads[tpsId][imageId] = UploadRequest.
  uploads: Record<string, Record<string, UploadRequest>>;
  uploadCount: number; // Number of uploaded photos.
  uploadMaxCount: number; // Whitelist this person to go beyond.
  uploadRemaining: number;
  uploadDistinctTps: number; // Number of different TPS uploaded.
  uploadDistinctDesa: number; // Number of different kelurahans uploaded.

  // reviews[tpsId] = number of photos reviewed in that TPS.
  reviews: Record<string, number>;
  reviewCount: number; // The number of images reviewed.

  // Which tps this person plans to upload foto.
  jagaTps: Record<string, boolean>;
  jagaTpsCount: number;

  // Which tpsId+imageId this person lapored.
  lapor: Record<string, LaporRequest>;
  laporCount: number;
  laporMaxCount: number;
  laporRemaining: number;

  // The payload size of this object.
  size: number;
}

export interface UserStats {
  uploadCount: number;
  reviewCount: number;
  jagaTpsCount: number;
  laporCount: number;

  uploadMaxCount: number;
  laporMaxCount: number;
}

export declare interface Hierarchy {
  // The id is one of idProvinsi, idKabupaten, idKecamatan, idDesa.
  // The value is the name for the id.
  id2name: { [id: string]: string };

  // The id is the idDesa.
  // The value is [maxTpsNo, extBegin?, extEnd?].
  // signifying that the TPS has number from [1, maxTpsNo].
  // and optionally it has extended number from [extBegin, extEnd].
  tps: { [id: string]: number[] };
}

/**
 * Class that provides Lokasi object with the hard-coded data without votes.
 */
export class PrestineLokasi {
  public C: Record<string, string[]>;
  T: Record<string, number>;
  D: Record<string, number> = {};

  /**
   * @param {Hierarchy} H the id2name and tps detail.
   * @param {Record<string, number[]>} dpt optionally supplied.
   */
  constructor(public H: Hierarchy, private dpt?: Record<string, number[]>) {
    this.C = this.getChildrenIds(H.id2name);
    this.T = this.getTotalTps();
    if (this.dpt) this.D = this.getTotalDpt();
    console.log("Loaded Hierarchy, total TPS: ",
      this.T[""], Object.keys(this.T).length);
  }

  /**
   * Constructs Lokasi object from hard-coded data.
   * The data has empty votes for this Lokasi.
   * @param {string} id The id of a location.
   * @return {Lokasi | null} The Lokasi object from hard-coded data.
   */
  getPrestineLokasi(id: string): Lokasi | null {
    const lokasi: Lokasi = {
      id,
      names: this.getParentNames(id),
      aggregated: {},
      numWrites: 0,
    };
    if (id.length === 10 && id.startsWith("99")) {
      // TPS luar negeri.
      const tps = this.H.tps[lokasi.id];
      if (!tps) return null;
      const [tpsNo] = tps;
      if (tpsNo < 0) {
        lokasi.aggregated[1] = [this.newAggregateVotes(
          `${id}${-tpsNo}`, `${-tpsNo}`, 1, -1)];
      } else {
        for (let i = 1; i <= tpsNo; i++) {
          lokasi.aggregated[i] = [this.newAggregateVotes(
            `${id}${i}`, `${i}`, 1, -1)];
        }
      }
    } else if (id.length === 10) {
      // TPS dalam negeri.
      const tps = this.H.tps[lokasi.id];
      if (!tps) return null;
      const [maxTpsNo, extBegin, extEnd] = tps;
      const d = this.dpt ? this.dpt[id] : [];
      let j = 0;
      for (let i = 1; i <= maxTpsNo; i++) {
        lokasi.aggregated[i] = [this.newAggregateVotes(
          `${id}${i}`, `${i}`, 1, d[j++])];
      }
      if (extBegin) {
        for (let i = extBegin; i <= extEnd; i++) {
          lokasi.aggregated[i] = [this.newAggregateVotes(
            `${id}${i}`, `${i}`, 1, d[j++])];
        }
      }
    } else {
      const children = this.C[lokasi.id];
      if (!children) return null;
      // Prov, Kab, Kec, Kel.
      for (const suffixId of children) {
        const cid = lokasi.id + suffixId;
        lokasi.aggregated[cid] = [this.newAggregateVotes(
          cid, this.H.id2name[cid], this.T[cid], this.D[cid])];
      }
    }
    return lokasi;
  }

  /**
   * @return {string[]} ids for desa.
   */
  getDesaIds() {
    const desaIds: string[] = [];
    for (const id of Object.keys(this.H.id2name)) {
      if (id.length === 10) desaIds.push(id);
    }
    return desaIds;
  }

  /**
   * Returns the map of sorted children ids.
   * @param {Record<string, string>} id2name The map of idLokasi to name.
   * @return {Record<string, string[]>} The map of sorted children.
   */
  private getChildrenIds(id2name: Record<string, string>) {
    const c: Record<string, Set<string>> = {"": new Set<string>()};
    for (const idDesa of Object.keys(id2name)) {
      if (idDesa.length != 10) continue;

      const idProvinsi = idDesa.substring(0, 2);
      c[""].add(idProvinsi);
      if (!c[idProvinsi]) c[idProvinsi] = new Set<string>();
      c[idProvinsi].add(idDesa.substring(2, 4));

      const idKabupaten = idDesa.substring(0, 4);
      if (!c[idKabupaten]) c[idKabupaten] = new Set<string>();
      c[idKabupaten].add(idDesa.substring(4, 6));

      const idKecamatan = idDesa.substring(0, 6);
      if (!c[idKecamatan]) c[idKecamatan] = new Set<string>();
      c[idKecamatan].add(idDesa.substring(6, 10));
    }
    const sortedC: Record<string, string[]> = {};
    for (const [id, set] of Object.entries(c)) {
      sortedC[id] = Array.from(set).sort((a, b) => {
        const na = id2name[id + a];
        const nb = id2name[id + b];
        return (na < nb) ? -1 : (na > nb) ? 1 : 0;
      });
    }
    return sortedC;
  }

  /**
   * Compute the total tps for each id.
   * @return {Record<string, number>} The map of total tps by id.
   */
  private getTotalTps() {
    const totalTps: Record<string, number> = {};
    /**
     * Recursive function to compute number of tps in the sub hierarchy.
     * @param {string} id the lokasi id
     * @return {number} the total number of tps for the id.
     */
    const rec = (id: string) => {
      let numTps = 0;
      if (id.length == 10 && id.startsWith("99")) {
        const [tpsNo] = this.H.tps[id];
        numTps += tpsNo > 0 ? tpsNo : 1;
      } else if (id.length == 10) {
        const [maxTpsNo, extBegin, extEnd] = this.H.tps[id];
        numTps += maxTpsNo;
        if (extBegin) numTps += (extEnd - extBegin) + 1;
      } else {
        for (const suffixId of this.C[id]) {
          numTps += rec(id + suffixId);
        }
      }
      return totalTps[id] = numTps;
    };
    rec("");
    return totalTps;
  }

  /**
   * Compute the total dpt for each id.
   * @return {Record<string, number>} The map of total dpt by id.
   */
  private getTotalDpt() {
    const totalDpt: Record<string, number> = {};
    /**
     * Recursive function to compute number of dpt in the sub hierarchy.
     * @param {string} id the lokasi id
     * @return {number} the total number of dpt for the id.
     */
    const rec = (id: string) => {
      let numDpt = 0;
      if (id.length == 10) {
        for (const d of this.dpt?.[id] ?? []) {
          numDpt += d;
        }
      } else {
        for (const suffixId of this.C[id]) {
          numDpt += rec(id + suffixId);
        }
      }
      return totalDpt[id] = numDpt;
    };
    rec("");
    return totalDpt;
  }

  /**
   * @param {string} idLokasi
   * @param {string} name
   * @param {number} totalTps
   * @param {number} dpt
   * @return {AggregateVotes}
   */
  private newAggregateVotes(idLokasi: string, name: string,
    totalTps: number, dpt?: number): AggregateVotes {
    return {
      idLokasi,
      pas1: 0,
      pas2: 0,
      pas3: 0,
      name,
      totalTps,
      totalCompletedTps: 0,
      totalPendingTps: 0,
      totalErrorTps: 0,
      totalJagaTps: 0,
      totalLaporTps: 0,
      updateTs: 0,
      dpt,
    };
  }

  /**
   * Returns an array of names from the top level down to id's level.
   * @param {string} id The id to be processed.
   * @return {string[]} The array of names of the path to the id.
   */
  private getParentNames(id: string) {
    const names: string[] = [];
    if (id.length >= 2) names.push(this.H.id2name[id.substring(0, 2)]);
    if (id.length >= 4) names.push(this.H.id2name[id.substring(0, 4)]);
    if (id.length >= 6) names.push(this.H.id2name[id.substring(0, 6)]);
    if (id.length >= 10) names.push(this.H.id2name[id.substring(0, 10)]);
    return names;
  }
}

export enum APPROVAL_STATUS {
  NEW = 0,
  APPROVED = 1,
  REJECTED = 2,
  MOVED = 3,
  LAPOR = 4,
}

export declare interface Votes {
  // The number of votes for each paslon.
  pas1: number;
  pas2: number;
  pas3: number;

  // The timestamp when the votes were updated.
  updateTs: number;

  // NEW means the uid is the uploader.
  // APPROVED/REJECTED means the uid is the moderator who approved.
  // The status is unset for AggregateVotes.
  status?: APPROVAL_STATUS;

  // The user id who entered/approved the votes.
  // The uid is unset for level Desa and above.
  uid?: string;
}

// The aggregated votes at Provinsi, Kabupaten, and Kecamatan level.
export declare interface AggregateVotes extends Votes {
  idLokasi: string;

  // The name of this location.
  name: string;

  // The total number of TPS in this aggregated votes.
  totalTps: number;

  // Total TPS needs to be reviewed for photos.
  totalPendingTps: number;

  // Total TPS needs to be reviewed for errors.
  totalErrorTps: number;

  // Total TPS that are lapored by public.
  totalLaporTps: number;

  // Total TPS has at least one photo.
  totalCompletedTps: number;

  // Total TPS has at least one volunter that plans to take photo.
  totalJagaTps: number;

  // Only available at Desa level.
  uploadedPhoto?: UploadedPhoto;

  // List of uid-imageIds to be reviewed.
  // Only available at Desa level.
  pendingUploads?: Record<string, string>;

  // Number of registered voters (daftar pemilih tetap).
  dpt?: number;

  // Shortcut to the any pending TPS.
  anyPendingTps?:string;

  // Shortcut to the any error TPS.
  anyErrorTps?:string;

  // Shortcut to the any lapor TPS.
  anyLaporTps?:string;

  // The original uploader uid.
  ouid?: string;
}

// Extension to signify that the AggregateVotes is being submitted.
export interface PendingAggregateVotes extends AggregateVotes {
  onSubmitted: Promise<string>;
}

export declare interface UploadedPhoto {
  // The blobId of the image file.
  imageId: string;

  // The serving url of the imageId.
  // Only available at Desa level.
  photoUrl: string;

  // Whether there are laporan for this photo.
  lapor?: string;

  // Whether the laporan is resolved.
  laporResolved?: boolean;
}

// Lokasi detail for Provinsi, Kabupaten, and Kecamatan level.
export declare interface Lokasi {
  // The 10 digits id formatted as folows:
  // The first 2 is the idProvinsi.
  // The next 2 is the idKabupaten.
  // The next 2 is the idKecamatan.
  // The next 4 is the idDesa.
  id: string;

  // The names depending on the hierarchy:
  // The 0-th index is tha name of the Provinsi.
  // The 1-th index is tha name of the Kabupaten.
  // The 2-th index is tha name of the Kecamatan.
  // The 3-th index is tha name of the Desa.
  names: string[];

  // The aggregated votes of all the children of this Node.
  // If the current id is idProvinsi, then the cid is idKabupaten.
  // If the current id is idDesa, then the cid is Tps No.
  // At Provinsi, Kabupaten, Kecamatan level, there is only 1 AggregateVotes.
  // At Desa level there can be many AggregateVotes[].
  aggregated: { [cid: string]: AggregateVotes[] };

  // How many times this node is written to Firestore.
  numWrites: number;

  // Only used for caching purposes.
  lastCachedTs?: number;
}

export declare interface UploadRequest {
  // The idDesa + tpsNo
  idLokasi: string;

  // The blobId in the cloud storage.
  imageId: string;

  // Additional info about the image if available.
  imageMetadata: ImageMetadata;

  // The seving URL for the imageId.
  servingUrl: string;

  // The digitized votes from newest to oldest.
  votes: Votes[];

  // Is the photo and digitiziation approved.
  status: APPROVAL_STATUS;
}

// Intentionally make the field name short to save bytes.
export interface ImageMetadata {
  l: number; // Last Modified Timestamp.
  s: number; // Size in Bytes.
  z?: number; // Size in Bytes after compressed.
  m?: string; // Make, Model.
  o?: number; // Orientation.
  y?: number; // Latitude.
  x?: number; // Longitude.
}

export declare interface LaporRequest {
  // The idDesa + tpsNo
  idLokasi: string;

  // The blobId in the cloud storage.
  imageId: string;

  // The seving URL for the imageId.
  servingUrl: string;

  // The votes of the photo.
  votes: Votes;

  // The user who issued the lapor.
  uid: string;

  // The reason why the TPS is reported or resolved.
  reason: string;

  // Is the lapor request resolved.
  isResolved: boolean;
}

/**
 * Simple implementation of LRU cache.
 */
export class LruCache<K, V> {
  private readonly map = new Map<K, V>();

  /**
   * @param {number} maxSize The maximum number of items in this cache.
   */
  constructor(private readonly maxSize = 10) { }

  has = this.map.has.bind(this.map);

  /**
   * Returns the cached key if exists, optionally specify a provider
   * function that can generate value for the given key.
   * @param {K} key cache key.
   * @param {any} callable function value provider for the given key.
   * @return {V} the value at the given key.
   */
  get(key: K, callable?: () => V): V | undefined {
    const value = this.map.get(key);
    if (value !== undefined) return this.set(key, value);
    if (callable) return this.set(key, callable());
    return undefined;
  }

  /**
   * Sets the value to the given key to the cache.
   * @param {K} key the cache key.
   * @param {V} value the value to be cached for the given key.
   * @return {V} the cached value.
   */
  set(key: K, value: V) {
    this.map.delete(key);
    if (this.map.size === this.maxSize) {
      // Map keys is ordered by insertion order.
      // The first key is the oldest (first inserted) key.
      this.map.delete(this.map.keys().next().value);
    }
    this.map.set(key, value);
    return value;
  }
}

/**
 * @param {LruCache<string, [number, number]>} rateLimiter the cache
 * for keeping track the last timestamp of user access.
 * @param {number} now the current datetime in ms.
 * @param {string} uid the accessing user.
 * @param {number} maxQps the maximum qps for this user.
 * @return {boolean} true if the user should be rate-limited.
 */
export function shouldRateLimit(
  rateLimiter: LruCache<string, [number, number]>,
  now: number, uid?: string, maxQps = 1) {
  if (!uid) return true; // Always rate-limit anonymous users.
  const [startTs, numCalls] = rateLimiter.get(uid) ?? [now, 0];
  rateLimiter.set(uid, [startTs, numCalls + 1]);
  if (numCalls > 5) {
    const elapsedSecs = (now - startTs + 1.0) / 1000;
    if (elapsedSecs > 60) rateLimiter.set(uid, [now, 1]);
    if (numCalls > 100) console.error("DoS attack", uid);
    if (numCalls / elapsedSecs > maxQps) return true;
  }
  return false;
}

/**
 * Returns true if the votes is between [0, 999].
 * @param {number} votes the votes to be checked.
 * @return {boolean} true if valid.
 */
export function isValidVoteNumbers(votes: number) {
  if (isNaN(votes)) return false;
  return votes >= 0 && votes < 1000;
}

/**
 * @param {number} n the length of random characters.
 * @return {string} a random n-character identifier containing [a-zA-Z0-9].
 */
export function autoId(n = 20): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let autoId = "";
  for (let i = 0; i < n; i++) {
    autoId += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return autoId;
}

/**
 * @param {number} ms the number of milliseconds to delay.
 * @return {Promise<void>} that resolve ms later.
 */
export function delayTime(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Returns the parent id of a lokasi id.
 * @param {string} id the id to be queried.
 * @return {string} The id's parent.
 */
export function getParentId(id: string) {
  if (id.length > 10) return id.substring(0, 10);
  if (id.length > 6) return id.substring(0, 6);
  if (id.length > 4) return id.substring(0, 4);
  if (id.length > 2) return id.substring(0, 2);
  return "";
}

/**
 * @param {UserStats} s existing user statistics if any.
 * @param {UserProfile} p the user profile.
 * @return {UserStats} s or the new one from p.
 */
export function getUserStats(s: UserStats | undefined, p : UserProfile) {
  return s ?? {
    uploadCount: p.uploadCount ?? 0,
    reviewCount: p.reviewCount ?? 0,
    jagaTpsCount: p.jagaTpsCount ?? 0,
    laporCount: p.laporCount ?? 0,
    uploadMaxCount: DEFAULT_MAX_UPLOADS,
    laporMaxCount: DEFAULT_MAX_LAPORS,
  } as UserStats;
}

/**
 * @param {Lokasi} lokasi
 * @return {AggregateVotes} the aggregated votes of the children.
 */
export function aggregate(lokasi: Lokasi) {
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
    totalJagaTps: 0,
    totalLaporTps: 0,
  };
  for (const [cagg] of Object.values(lokasi.aggregated)) {
    nextAgg.pas1 += cagg.pas1 ?? 0;
    nextAgg.pas2 += cagg.pas2 ?? 0;
    nextAgg.pas3 += cagg.pas3 ?? 0;
    nextAgg.totalTps += cagg.totalTps ?? 0;
    nextAgg.totalCompletedTps += cagg.totalCompletedTps ?? 0;
    nextAgg.totalPendingTps += cagg.totalPendingTps ?? 0;
    nextAgg.totalErrorTps += cagg.totalErrorTps ?? 0;
    nextAgg.totalJagaTps += cagg.totalJagaTps ?? 0;
    nextAgg.totalLaporTps += cagg.totalLaporTps ?? 0;
    nextAgg.updateTs = Math.max(nextAgg.updateTs, cagg.updateTs);
    if (cagg.anyPendingTps) nextAgg.anyPendingTps = cagg.anyPendingTps;
    if (cagg.anyErrorTps) nextAgg.anyErrorTps = cagg.anyErrorTps;
    if (cagg.anyLaporTps) nextAgg.anyLaporTps = cagg.anyLaporTps;
  }
  return nextAgg;
}

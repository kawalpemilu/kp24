// These interfaces are shared between the backend (Firestore Functions) and
// the frontend (Angular).

export const DEFAULT_MAX_UPLOADS = 10;

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
  nTps: number; // Number of different TPS uploaded.
  nKel: number; // Number of different kelurahans uploaded.

  reviewCount: number; // The number of images reviewed.

  // reports: ProblemRequest[];
  // reportCount: number; // Number of reported photos.
  // reportMaxCount: number; // Whitelist this person to go beyond.

  // laporKpus: LaporKpuRequest[];
  // laporKpuCount: number; // The number of janggal photos lapored ke KPU.
  // laporKpuMaxCount: number; // The max janggal photos lapored ke KPU.
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

export enum APPROVAL_STATUS {
  NEW = 0,
  APPROVED = 1,
  REJECTED = 2
}

export declare interface Votes {
  // The number of votes for each paslon.
  pas1: number;
  pas2: number;
  pas3: number;

  // The timestamp when the votes were entered.
  createdTs: number;

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

  // Total TPS has at least one photo.
  totalCompletedTps: number;

  // Only available at Desa level.
  uploadedPhoto?: UploadedPhoto;

  // List of uid-imageIds to be reviewed.
  // Only available at Desa level.
  pendingUploads?: Record<string, true>;
}

export declare interface UploadedPhoto {
  // The blobId of the image file.
  imageId: string;

  // The serving url of the imageId.
  // Only available at Desa level.
  photoUrl: string;
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
}

// Photos and votes at Desa level.
export declare interface TpsData {
  // The idDesa + tpsNo.
  id: string;

  // One TPS can have many photos.
  // The votes in each photo is digitized.
  votes: { [imageId: string]: AggregateVotes };
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

/**
 * Returns the map of sorted children ids.
 * @param {Record<string, string>} id2name The map of idLokasi to name.
 * @return {Record<string, string[]>} The map of sorted children.
 */
export function getChildrenIds(id2name: Record<string, string>) {
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
 * Simple implementation of LRU cache.
 */
export class LruCache<K, V> {
  private readonly map = new Map<K, V>();

  /**
   * @param {number} maxSize The maximum number of items in this cache.
   */
  constructor(private readonly maxSize = 10) {}

  has = this.map.has.bind(this.map);

  /**
   * Returns the cached key if exists, optionally specify a provider
   * function that can generate value for the given key.
   * @param {K} key cache key.
   * @param {any} callable function value provider for the given key.
   * @return {V} the value at the given key.
   */
  get(key: K, callable?: () => V): V {
    const value = this.map.get(key);
    if (value !== undefined) return this.set(key, value);
    if (callable) return this.set(key, callable());
    return undefined as V;
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

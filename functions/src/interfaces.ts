export declare interface Hierarchy {
    // The id is one of idProvinsi, idKabupaten, idKecamatan, idDesa.
    // The value is the name for the id.
    id2name: {[id: string]: string};

    // The id is the idDesa.
    // The value is [maxTpsNo, extBegin?, extEnd?].
    // signifying that the TPS has number from [1, maxTpsNo].
    // and optionally it has extended number from [extBegin, extEnd].
    tps: {[id: string]: number[]};
}

export function getChildrenIds(hierarchy: Hierarchy) {
  const c: Record<string, Set<string>> = {"": new Set<string>()};
  for (const idDesa in hierarchy.tps) {
    if (idDesa.length != 10) throw new Error("Length must be 10");

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
      const na = hierarchy.id2name[id + a];
      const nb = hierarchy.id2name[id + b];
      return (na < nb) ? -1 : (na > nb) ? 1 : 0;
    });
  }
  return sortedC;
}

export function getParentNames(hierarchy: Hierarchy, id: string) {
  const names: string[] = [];
  if (id.length >= 2) names.push(hierarchy.id2name[id.substring(0, 2)]);
  if (id.length >= 4) names.push(hierarchy.id2name[id.substring(0, 4)]);
  if (id.length >= 6) names.push(hierarchy.id2name[id.substring(0, 6)]);
  if (id.length >= 10) names.push(hierarchy.id2name[id.substring(0, 10)]);
  return names;
}

/**
 * Returns the first 6 characters.
 * @param {string} id The id of kecamatan or lower.
 * @return {string} The idKecamatan.
 */
export function getIdKecamatan(id: string) {
  if (id.length == 6) return id;
  if (id.length < 6) throw new Error("Insufficient length");
  return id.substring(0, 6);
}

/**
 * Returns the first 4 characters.
 * @param {string} id The id of kabupaten or lower.
 * @return {string} The idKabupaten.
 */
export function getIdKabupaten(id: string) {
  if (id.length == 4) return id;
  if (id.length < 4) throw new Error("Insufficient length");
  return id.substring(0, 4);
}

/**
 * Returns the first 2 characters.
 * @param {string} id The id of provinsi or lower.
 * @return {string} The idProvinsi.
 */
export function getIdProvinsi(id: string) {
  if (id.length == 2) return id;
  if (id.length < 2) throw new Error("Insufficient length");
  return id.substring(0, 2);
}

export declare interface AggregateVotes {
  idLokasi: string;

  // The name of this location.
  name: string;

  // The number of votes for each paslon.
  pas1: number;
  pas2: number;
  pas3: number;

  // Total valid votes.
  sah: number;

  // Total invalid votes.
  tidakSah: number;

  // The total number of TPS in this aggregated votes.
  totalTps: number;

  // Total TPS has at least one photo.
  totalCompletedTps: number;

  // The blobId of the image file.
  imageId: string;

  // The serving url of the imageId.
  photoUrl: string;

  // The upload timestamp.
  uploadTimeMs: number;
}

export declare interface Lokasi {
  // The 10 digits id formatted as folows:
  // The first 2 is the idProvinsi.
  // The next 2 is the idKabupaten.
  // The next 2 is the idKecamatan.
  // The next 4 is the idDesa.
  // The next 3 is the TPS NO.
  id: string;

  // The names depending on the hierarchy:
  // The 0-th index is tha name of the Provinsi.
  // The 1-th index is tha name of the Kabupaten.
  // The 2-th index is tha name of the Kecamatan.
  // The 3-th index is tha name of the Desa.
  names: string[];

  // The aggregated votes of all the children of this Node.
  // If the current id is idProvinsi, then the cid is idKabupaten.
  // If the current id is idDesa, then the cid is the tpsNo.
  aggregated: {[cid: string]: AggregateVotes};
}

export declare interface UploadRequest {
  // The idDesa + tpsNo
  tpsId: string;

  // The blobId in the cloud storage.
  // If unset, then the image is not overriden.
  imageId?: string;

  // Number of votes for paslon 1, 2, 3
  pas1: number;
  pas2: number;
  pas3: number;

  // Number of valid votes.
  sah: number;

  // Number of invalid votes.
  tidakSah: number;
}

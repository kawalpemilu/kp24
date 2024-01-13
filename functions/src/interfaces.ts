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

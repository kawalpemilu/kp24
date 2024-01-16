import * as fs from "fs";
import {AggregateVotes, Hierarchy, Lokasi} from "./interfaces";

/**
 * This global variable for this module takes memory resources.
 * It should only be initialized once per process.
 */
const H = JSON.parse(
  fs.readFileSync("lib/hierarchy.js", "utf-8")) as Hierarchy;
const C = getChildrenIds(H);
console.log("Loaded Hierarchy", Object.keys(C).length);

/**
 * Constructs Lokasi object from hard-coded data.
 * The data has empty votes for this Lokasi.
 * @param {string} id The id of a location.
 * @return {Lokasi} The Lokasi object from hard-coded data.
 */
export function getPrestineLokasi(id: string) {
  const lokasi: Lokasi = {id, names: getParentNames(H, id), aggregated: {}};
  if (id.length === 10) {
    const [maxTpsNo, extBegin, extEnd] = H.tps[lokasi.id];
    for (let i = 1; i <= maxTpsNo; i++) {
      lokasi.aggregated[i] = {
        name: `${i}`,
      } as AggregateVotes;
    }
    if (extBegin) {
      for (let i = extBegin; i <= extEnd; i++) {
        lokasi.aggregated[i] = {
          name: `${i}`,
        } as AggregateVotes;
      }
    }
  } else {
    for (const suffixId of C[lokasi.id]) {
      const cid = lokasi.id + suffixId;
      lokasi.aggregated[cid] = {
        name: H.id2name[cid],
      } as AggregateVotes;
    }
  }
  return lokasi;
}

/**
 * Returns an array of names from the top level down to id's level.
 * @param {Hierarchy} hierarchy The hierarchy to be processed.
 * @param {string} id The id to be processed.
 * @return {string[]} The array of names of the path to the id.
 */
function getParentNames(hierarchy: Hierarchy, id: string) {
  const names: string[] = [];
  if (id.length >= 2) names.push(hierarchy.id2name[id.substring(0, 2)]);
  if (id.length >= 4) names.push(hierarchy.id2name[id.substring(0, 4)]);
  if (id.length >= 6) names.push(hierarchy.id2name[id.substring(0, 6)]);
  if (id.length >= 10) names.push(hierarchy.id2name[id.substring(0, 10)]);
  return names;
}

/**
 * Returns the map of sorted children ids.
 * @param {Hierarchy} hierarchy The hierarchy to be processed.
 * @return {Record<string, string[]>} The map of sorted children.
 */
function getChildrenIds(hierarchy: Hierarchy) {
  const c: Record<string, Set<string>> = {"": new Set<string>()};
  for (const idDesa of Object.keys(hierarchy.tps)) {
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

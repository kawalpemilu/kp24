import * as fs from "fs";
import {AggregateVotes, Hierarchy, Lokasi, getChildrenIds} from "./interfaces";

/**
 * This global variable for this module takes memory resources.
 * It should only be initialized once per process.
 */
const H = JSON.parse(
  fs.readFileSync("lib/hierarchy.js", "utf-8")) as Hierarchy;
const C = getChildrenIds(H.id2name);
const T = getTotalTps();
console.log("Loaded Hierarchy, total TPS: ", T[""]);

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
      lokasi.aggregated[i] = [{
        name: `${i}`,
        totalTps: 1,
      } as AggregateVotes];
    }
    if (extBegin) {
      for (let i = extBegin; i <= extEnd; i++) {
        lokasi.aggregated[i] = [{
          name: `${i}`,
          totalTps: 1,
        } as AggregateVotes];
      }
    }
  } else {
    for (const suffixId of C[lokasi.id]) {
      const cid = lokasi.id + suffixId;
      lokasi.aggregated[cid] = [{
        name: H.id2name[cid],
        totalTps: T[cid],
      } as AggregateVotes];
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
 * Compute the total tps for each id.
 * @return {Record<string, number>} The map of total tps by id.
 */
function getTotalTps() {
  const totalTps: Record<string, number> = {};
  /**
   * Recursive function to compute number of tps in the sub hierarchy.
   * @param {string} id the lokasi id
   * @return {number} the total number of tps for the id.
   */
  function rec(id: string) {
    let numTps = 0;
    if (id.length == 10) {
      const [maxTpsNo, extBegin, extEnd] = H.tps[id];
      numTps += maxTpsNo;
      if (extBegin) numTps += (extEnd - extBegin) + 1;
    } else {
      for (const suffixId of C[id]) {
        numTps += rec(id + suffixId);
      }
    }
    return totalTps[id] = numTps;
  }
  rec("");
  return totalTps;
}

/**
 * Script to parse the ../data/tps.csv into ../data/tps.js
 * The tps.js is the compact representation of the hierarchy.
 */
import {parse} from "csv-parse";
import * as fs from "fs";
import {Hierarchy} from "./interfaces";

/**
 * Parses the csv.
 * @param {string} csv The csv content.
 * @param {number} limit Read the first {limit} records.
 * @return {string[]} The parsed csv.
 */
function parseCsv(csv: string, limit = -1) {
  return new Promise<string[]>((resolve, reject) => {
    const records: string[] = [];
    const parser = parse({delimiter: ","});
    parser.on("readable", function() {
      for (let record; (record = parser.read()) !== null; ) {
        if (limit > 0 && records.length >= limit) {
          resolve(records);
          continue;
        }
        records.push(record);
      }
    });
    parser.on("end", () => resolve(records));
    parser.on("error", reject);
    parser.write(csv);
    parser.end();
  });
}

const RecordKeys = ["no", "dapilDprRi", "dapilDprdProv", "dapilDprdKab",
  "idProvinsi", "provinsi",
  "idKabupaten", "kabupaten",
  "idKecamatan", "kecamatan",
  "idDesa", "desa", "noTps"] as const;

type AllowedRecordKeys = typeof RecordKeys[number];
type RecordArray = Record<AllowedRecordKeys, string>[];

/**
 * Convert the records into keyed object.
 * @param {string[]} records The records to be converted.
 * @return {RecordArray} The records keyed by the RecordKeys.
 */
function keyedRecords(records: string[]) {
  const arr: RecordArray = [];
  for (let i = 1; i < records.length; i++) {
    if (records[i].length != 13) {
      throw new Error("Record columnns mismatch");
    }
    const keyed = {} as Record<AllowedRecordKeys, string>;
    for (let j = 0; j < RecordKeys.length; j++) {
      keyed[RecordKeys[j]] = records[i][j];
    }
    arr.push(keyed);
  }
  return arr;
}

/**
 * Validates the structure of the wilayah ids.
 * @param {string[]} records The records to be validated.
 */
function ensureHierarchyStructure(records: RecordArray) {
  for (const r of records) {
    let id = r.idDesa;
    if (id.length != 10) throw new Error("idDesa is not 10");

    id = id.substring(0, 6);
    if (id != r.idKecamatan) throw new Error("idKecamatan is not 6");

    id = id.substring(0, 4);
    if (id != r.idKabupaten) throw new Error("idKabupaten is not 4");

    id = id.substring(0, 2);
    if (id != r.idProvinsi) throw new Error("idProvinsi is not 2");
  }
}

/**
 * Adds the name for the give id if not already exists.
 * @param {Record<string, string>} idName the name keyed by id.
 * @param {string} id the id.
 * @param {string} name the name.
 */
function setAndCheck(
  idName: Record<string, string>, id: string, name : string) {
  if (!idName[id]) {
    idName[id] = name;
  } else if (idName[id] != name) {
    throw new Error(id + " " + idName[id] + " != " + name);
  }
}

/**
 * Index all the provinsi, kab, kec, desa names from its ids.
 * @param {RecordArray} records records keyed by the RecordKeys.
 * @return {Record<string, string>} The map from id to name.
 */
function getNameMap(records: RecordArray) {
  const idName: Record<string, string> = {};
  for (const r of records) {
    setAndCheck(idName, r.idProvinsi, r.provinsi);
    setAndCheck(idName, r.idKabupaten, r.kabupaten);
    setAndCheck(idName, r.idKecamatan, r.kecamatan);
    setAndCheck(idName, r.idDesa, r.desa);
  }
  return idName;
}

/**
 * Reduce all the necessary info from the records.
 * @param {RecordArray} records records keyed by the RecordKeys.
 * @param {Record<string, number[]>} desaTpsNumbers the idDesa tps numbers.
 * @return {Hierarchy} The compact hierarchy of all tps.
 */
function getDistilledTps(
  records: RecordArray, desaTpsNumbers : Record<string, number[]>) : Hierarchy {
  const id2name = getNameMap(records);
  const tps: {[idDesa: string]: number[]} = {};
  for (const [idDesa, v] of Object.entries<number[]>(desaTpsNumbers)) {
    v.sort((a, b) => (a - b));
    // TPS number is between [1, n].
    let i = 0; while (i < v.length && i + 1 == v[i]) i++;
    tps[idDesa] = [i];
    if (i < v.length) {
      // The extended TPS number is between [k, j).
      let j = v[i];
      const k = j;
      while (i < v.length && j == v[i]) i++, j++;
      if (j > 951) throw new Error();
      tps[idDesa].push(k);
      tps[idDesa].push(j-1);
    }
    if (v.length != i) throw new Error(v.join(", "));
  }
  return {id2name, tps};
}

(async () => {
  const csv = fs.readFileSync("../data/tps.csv", "utf-8");
  const records = keyedRecords(await parseCsv(csv));

  // There are 820,162 TPS.
  console.log("Total TPS: ", records.length);

  ensureHierarchyStructure(records);

  const desaTpsNumbers :{[key: string]: number[]} = {};
  for (const r of records) {
    if (!desaTpsNumbers[r.idDesa]) desaTpsNumbers[r.idDesa] = [];
    desaTpsNumbers[r.idDesa].push(+r.noTps);
  }

  // There are 83,731 unique desa.
  console.log("unique Desa", Object.keys(desaTpsNumbers).length);

  const tps = getDistilledTps(records, desaTpsNumbers);
  fs.writeFileSync("../src/assets/tps.json", JSON.stringify(tps));
})();

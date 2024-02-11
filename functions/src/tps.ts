/**
 * Script to parse the ../data/tps.csv into ../data/tps.js
 * The tps.js is the compact representation of the hierarchy.
 */
import {parse} from "csv-parse";
import * as fs from "fs";
import {Hierarchy} from "./interfaces";
import {LOKASI} from "./lokasi";

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

/** Headers for the old tps.csv */
// const RecordKeys = ["no", "dapilDprRi", "dapilDprdProv", "dapilDprdKab",
//   "idProvinsi", "provinsi",
//   "idKabupaten", "kabupaten",
//   "idKecamatan", "kecamatan",
//   "idDesa", "desa", "noTps"] as const;

const RecordKeys = [
  "idProvinsi", "provinsi",
  "idKabupaten", "kabupaten",
  "idKecamatan", "kecamatan",
  "idDesa", "desa", "noTps", "pemilih"] as const;

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
    if (records[i].length != RecordKeys.length) {
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
  if (name.length < 2) throw new Error();
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
 * @return {[Hierarchy, Record<string, number[]>]} The compact data.
 */
function getDistilledTps(
  records: RecordArray, desaTpsNumbers : Record<string, number[][]>)
   : [Hierarchy, Record<string, number[]>] {
  const id2name = getNameMap(records);
  const tps: {[idDesa: string]: number[]} = {};
  const dpt: {[idDesa: string]: number[]} = {};
  for (const [idDesa, v] of Object.entries(desaTpsNumbers)) {
    v.sort((a, b) => (a[0] - b[0]));
    // TPS number is between [1, n].
    let i = 0; while (i < v.length && i + 1 == v[i][0]) i++;
    tps[idDesa] = [i];
    if (i < v.length) {
      // The extended TPS number is between [k, j).
      let j = v[i][0];
      const k = j;
      while (i < v.length && j == v[i][0]) i++, j++;
      if (j > 951) throw new Error();
      tps[idDesa].push(k);
      tps[idDesa].push(j-1);
    }
    if (v.length != i) throw new Error(v.join(", ") + " idDesa: " + idDesa);
    dpt[idDesa] = [];
    for (const [, pemilih] of v) {
      dpt[idDesa].push(pemilih);
    }
  }
  return [{id2name, tps}, dpt];
}

async function processTps() {
  const csv = fs.readFileSync("../data/tps_recon.csv", "utf-8");
  const records = keyedRecords(await parseCsv(csv));

  // There are 820,162 TPS.
  console.log("Total TPS: ", records.length);

  ensureHierarchyStructure(records);

  const desaTpsNumbers :{[key: string]: number[][]} = {};
  for (const r of records) {
    if (!desaTpsNumbers[r.idDesa]) desaTpsNumbers[r.idDesa] = [];
    desaTpsNumbers[r.idDesa].push([+r.noTps, +r.pemilih]);
  }

  // There are 83,731 unique desa.
  console.log("unique Desa", Object.keys(desaTpsNumbers).length);

  const [H, dpt] = getDistilledTps(records, desaTpsNumbers);

  console.log("Num IDS",
    Object.keys(LOKASI.H.id2name).length, Object.keys(H.id2name).length);
  console.log("Num TPS",
    Object.keys(LOKASI.H.tps).length, Object.keys(H.tps).length);

  const diffNames = [];
  for (const [id, name] of Object.entries(LOKASI.H.id2name)) {
    if (H.id2name[id] !== name) {
      diffNames.push(["id", id, name, "->", H.id2name[id]]);
    }
    if (!H.id2name[id]?.length) throw new Error(id);
  }
  if (diffNames.length) {
    console.log("Num names diffs", diffNames.length);
  }

  for (const [id, details] of Object.entries(LOKASI.H.tps)) {
    if (H.tps[id]?.join(",") !== details.join(",")) {
      console.log("tps", id, details, "->", H.tps[id]);
    }
  }

  fs.writeFileSync("../data/dpt.json", JSON.stringify(dpt));
  return H;
}

async function processTpsLuarNegeri() {
  const csv = fs.readFileSync("../data/tps_ln.csv", "utf-8");
  const records = await parseCsv(csv);

  // There are 3,205 TPS Luar negeri.
  console.log("Total TPS: ", records.length - 1);

  const id2name: Record<string, string> = {};
  const desaTpsNumbers :{[key: string]: number[]} = {};
  const kpu2kp: Record<string, string> = {};
  for (let i = 1; i < records.length; i++) {
    const [idLn, nama, idNegara, negara, idKpuKota, idKota, kota,
           idKpuTps, idTps, mode, noTps] = records[i];

    if (idLn.length != 2) throw new Error();
    if (idNegara.length != 4) throw new Error();
    if (idKota.length != 6) throw new Error();
    if (idTps.length != 10) throw new Error();
    if (!idNegara.startsWith(idLn)) throw new Error();
    if (!idKota.startsWith(idNegara)) throw new Error();
    if (!idTps.startsWith(idKota)) throw new Error();

    if (mode !== "POS" && mode !== "KSK" && mode !== "TPS") {
      throw new Error(noTps);
    }

    setAndCheck(id2name, idLn, nama);
    setAndCheck(id2name, idNegara, negara);
    setAndCheck(id2name, idKota, kota);
    setAndCheck(id2name, idTps, mode);
    if (!idKpuKota.length) {
      throw new Error(JSON.stringify(records[i]));
    }
    if (!idKpuTps.length) {
      throw new Error(JSON.stringify(records[i]));
    }
    setAndCheck(kpu2kp, idKpuKota, idKota);
    setAndCheck(kpu2kp, idKpuTps, idTps);

    if (isNaN(+noTps)) throw new Error();

    if (!desaTpsNumbers[idTps]) desaTpsNumbers[idTps] = [];
    desaTpsNumbers[idTps].push(+noTps);
  }

  let numTps = 0;
  const tps: {[idDesa: string]: number} = {};
  for (const [idDesa, tpsNos] of Object.entries(desaTpsNumbers)) {
    numTps += tpsNos.length;
    tpsNos.sort((a, b) => +a - +b);
    for (let i = 0; i < tpsNos.length; i++) {
      if (tpsNos[i] != i + 1) {
        console.log('Weird tpsNos', idDesa, JSON.stringify(tpsNos));
      }
    }
    if (tpsNos[tpsNos.length - 1] === tpsNos.length) {
      tps[idDesa] = tpsNos.length;
    } else if (tpsNos.length === 1) {
      tps[idDesa] = -tpsNos[0];
    } else {
      throw new Error();
    }
  }
  if (records.length != numTps + 1) throw new Error();
  console.log("total Tps", numTps);
  return {id2name,    tps};
}

async function processTpsLuarNegeriOri() {
  const csv = fs.readFileSync("../data/tps_ln_ori.csv", "utf-8");
  const records = await parseCsv(csv);

  // There are 3,316 TPS Luar negeri.
  console.log("Total TPS: ", records.length);
}

(async () => {
  const H = await processTps();
  const {id2name, tps} = await processTpsLuarNegeri();
  for (const [id, name] of Object.entries(id2name)) {
    if (H.id2name[id]) throw new Error();
    H.id2name[id] = name;
  }
  for (const [id, tpsNo] of Object.entries(tps)) {
    if (H.tps[id]) throw new Error();
    H.tps[id] = [tpsNo];
  }
  fs.writeFileSync("../data/tps2.json", JSON.stringify(H));
  
  if (false) await processTpsLuarNegeriOri();
})();

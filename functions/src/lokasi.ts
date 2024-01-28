import * as fs from "fs";
import {Hierarchy, PrestineLokasi, } from "./interfaces";

/**
 * This global variable for this module takes memory resources.
 * It should only be initialized once per process.
 */
const H = JSON.parse(
  fs.readFileSync("./lib/tps.json", "utf-8")) as Hierarchy;
const dpt = JSON.parse(
  fs.readFileSync("./lib/dpt.json", "utf-8")) as Record<string, number[]>;
  
export const LOKASI = new PrestineLokasi(H, dpt);

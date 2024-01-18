import { Injectable } from '@angular/core';
import { id2name } from './hierarchy/id2name';

@Injectable({
  providedIn: 'root'
})
export class AppService {
  public mobileQuery?: MediaQueryList;
  childrenIds: Record<string, string[]> = {};

  constructor() {
    this.childrenIds = this.initializeChildrenIds();
   }

   initializeChildrenIds() {
    const c: Record<string, Set<string>> = {"": new Set<string>()};
    for (const idKecamatan of Object.keys(id2name)) {
      if (idKecamatan.length != 6) continue;
  
      const idProvinsi = idKecamatan.substring(0, 2);
      c[""].add(idProvinsi);
      if (!c[idProvinsi]) c[idProvinsi] = new Set<string>();
      c[idProvinsi].add(idKecamatan.substring(2, 4));
  
      const idKabupaten = idKecamatan.substring(0, 4);
      if (!c[idKabupaten]) c[idKabupaten] = new Set<string>();
      c[idKabupaten].add(idKecamatan.substring(4, 6));
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
}

import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class AppService {
  public mobileQuery?: MediaQueryList;
  public id2name: Record<string, string> = {};
  public childrenIds: Record<string, string[]> = {};
}

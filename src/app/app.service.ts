import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export declare interface StaticHierarchy {
  id2name: Record<string, string>;
  childrenIds: Record<string, string[]>;
} 

@Injectable({
  providedIn: 'root',
})
export class AppService {
  public mobileQuery?: MediaQueryList;
  public hierarchy$?: Observable<StaticHierarchy>;
}

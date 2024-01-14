import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';

import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getAnalytics, provideAnalytics, ScreenTrackingService, UserTrackingService } from '@angular/fire/analytics';
import { connectFirestoreEmulator, getFirestore, provideFirestore } from '@angular/fire/firestore';
import { connectFunctionsEmulator, getFunctions, provideFunctions } from '@angular/fire/functions';
import { getStorage, provideStorage } from '@angular/fire/storage';
import { provideAnimations } from '@angular/platform-browser/animations';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    importProvidersFrom(provideFirebaseApp(() => initializeApp(environment.firebaseConfig))),
    importProvidersFrom(provideAuth(() => getAuth())),
    importProvidersFrom(provideAnalytics(() => getAnalytics())),
    importProvidersFrom(provideFirestore(() => {
      const f = getFirestore();
      if (!environment.production) {
        connectFirestoreEmulator(f, "127.0.0.1", 8084);
      }
      return f;
    })),
    importProvidersFrom(provideFunctions(() => {
      const f = getFunctions();
      if (!environment.production) {
        connectFunctionsEmulator(f, "127.0.0.1", 5001);
      }
      return f;
    })),
    importProvidersFrom(provideStorage(() => getStorage())),
    ScreenTrackingService,
    UserTrackingService,
    provideAnimations()
  ]
};

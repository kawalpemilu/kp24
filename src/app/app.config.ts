import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getAnalytics, provideAnalytics, ScreenTrackingService, UserTrackingService } from '@angular/fire/analytics';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { getFunctions, provideFunctions } from '@angular/fire/functions';
import { getStorage, provideStorage } from '@angular/fire/storage';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    importProvidersFrom(provideFirebaseApp(() => initializeApp({
      "projectId": "kp24-fd486",
      "appId": "1:887593210576:web:b697f44855185de4f784d5",
      "databaseURL": "https://kp24-fd486-default-rtdb.asia-southeast1.firebasedatabase.app",
      "storageBucket": "kp24-fd486.appspot.com",
      "apiKey": "AIzaSyBbLVuESLAgRiadGXI-Y7nn7SpHivD7sOo",
      "authDomain": "kp24-fd486.firebaseapp.com",
      "messagingSenderId": "887593210576",
      "measurementId": "G-DEEZMKY15N"
    }))),
    importProvidersFrom(provideAuth(() => getAuth())),
    importProvidersFrom(provideAnalytics(() => getAnalytics())),
    importProvidersFrom(provideFirestore(() => getFirestore())),
    importProvidersFrom(provideFunctions(() => getFunctions())),
    importProvidersFrom(provideStorage(() => getStorage())),
    ScreenTrackingService,
    UserTrackingService,
  ]
};

import { getFirestore } from 'firebase/firestore';
import { initializeApp, getApp, getApps } from 'firebase/app';
import {
  initializeAuth,
  getAuth,
  getReactNativePersistence
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyC8_CmKNPlaO1Qdv0nLP-4bPX01PDaqTHA",
  authDomain: "veer-prep-ssc-ae41f.firebaseapp.com",
  projectId: "veer-prep-ssc-ae41f",
  storageBucket: "veer-prep-ssc-ae41f.firebasestorage.app",
  messagingSenderId: "52017609415",
  appId: "1:52017609415:web:003ce80043981f0041dce2",
  measurementId: "G-ZY2MXFQVXS"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

let auth;

try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
} catch (error) {
  auth = getAuth(app);
}

export { auth };
export const db = getFirestore(app);
export default app;

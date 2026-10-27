
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import serviceAccount from '../secrets/firebase-service-account.json'
  with { type: 'json' };

const firebaseApp = getApps().length
  ? getApps()[0]
  : initializeApp({
      credential: cert(serviceAccount),
    });

export default firebaseApp;

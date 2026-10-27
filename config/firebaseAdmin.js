
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { readFileSync } from 'node:fs';

const serviceAccount = JSON.parse(
  readFileSync(
    '/etc/secrets/firebase-service-account.json',
    'utf8'
  )
);

const firebaseApp = getApps().length
  ? getApps()[0]
  : initializeApp({
      credential: cert(serviceAccount),
    });

export default firebaseApp;

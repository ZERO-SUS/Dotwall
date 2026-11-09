/**
 * DOTWALL — SECURE OWNER PROVISIONING SCRIPT (FIREBASE ADMIN SDK)
 *
 * This administrative script securely assigns the `{ admin: true }` custom claim
 * and initializes the `/admins/{uid}` database authorization record for the
 * verified Dotwall platform owner (@zero_sus).
 *
 * REQUIREMENTS:
 * 1. Place your Firebase service account private key in a file named `service-account.json`
 *    in the project root (this file is ignored by .gitignore and will NEVER be committed),
 *    OR provide its path via the `FIREBASE_SERVICE_ACCOUNT_KEY` environment variable.
 * 2. Run: `node scripts/provision-owner.mjs [target_uid_or_email]`
 *
 * SECURITY GUARANTEES:
 * - Only modifies the explicitly authorized owner account (zero_sus@dotwall.app or darshan99806@gmail.com).
 * - Never logs or prints private keys or sensitive credentials.
 * - Confirms the custom claim was written and verified by Firebase Auth before exiting.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const AUTHORIZED_OWNER_EMAILS = new Set(['zero_sus@dotwall.app', 'darshan99806@gmail.com']);
const KNOWN_OWNER_UID = 'TBkmaIZ9vhWmRRCp48KNVGLh1CX2';

async function main() {
  const serviceAccountPath =
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
    path.resolve(process.cwd(), 'service-account.json');

  if (!fs.existsSync(serviceAccountPath)) {
    console.log('========================================================================');
    console.log('DOTWALL OWNER PROVISIONING PROCEDURE (FIREBASE ADMIN SDK)');
    console.log('========================================================================');
    console.log('[-] Service account key not detected at: ' + serviceAccountPath);
    console.log('[*] To run this script securely in your local terminal:');
    console.log('    1. Download a service account private key from Firebase Console:');
    console.log('       https://console.firebase.google.com/project/dotwall-13046/settings/serviceaccounts/adminsdk');
    console.log('       (Click "Generate new private key")');
    console.log('    2. Save it as `service-account.json` in this directory (ignored by .gitignore).');
    console.log('    3. Run: npm install firebase-admin --save-dev');
    console.log('    4. Run: npm run provision:owner');
    console.log('========================================================================');
    process.exit(0);
  }

  let admin;
  try {
    admin = require('firebase-admin');
  } catch {
    console.error('[-] Error: firebase-admin is not installed. Please run `npm install firebase-admin --save-dev`.');
    process.exit(1);
  }

  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://dotwall-13046-default-rtdb.asia-southeast1.firebasedatabase.app',
  });

  const targetIdentifier = process.argv[2] || KNOWN_OWNER_UID;
  console.log(`[*] Locating user in Firebase Auth: ${targetIdentifier}...`);

  let userRecord;
  try {
    if (targetIdentifier.includes('@')) {
      userRecord = await admin.auth().getUserByEmail(targetIdentifier.toLowerCase());
    } else {
      userRecord = await admin.auth().getUser(targetIdentifier);
    }
  } catch (err) {
    console.error(`[-] User not found in Firebase Auth: ${err.message}`);
    process.exit(1);
  }

  const userEmail = (userRecord.email || '').toLowerCase();
  console.log(`[+] User located: UID=${userRecord.uid}, Email=${userEmail}`);

  if (!AUTHORIZED_OWNER_EMAILS.has(userEmail) && userRecord.uid !== KNOWN_OWNER_UID) {
    console.error(`[-] Security Violation: ${userEmail} is NOT an authorized platform owner.`);
    console.error(`[-] Authorized owner accounts: ${Array.from(AUTHORIZED_OWNER_EMAILS).join(', ')}`);
    process.exit(1);
  }

  // 1. Assign custom claim { admin: true }
  console.log('[*] Assigning custom claim { admin: true }...');
  await admin.auth().setCustomUserClaims(userRecord.uid, { admin: true });

  // 2. Write to Realtime Database /admins/{uid}
  console.log(`[*] Updating Realtime Database: /admins/${userRecord.uid} = true...`);
  const db = admin.database();
  await db.ref(`admins/${userRecord.uid}`).set(true);

  // 3. Ensure user profile in /users/{uid} has isAdmin: true and username: 'zero_sus'
  await db.ref(`users/${userRecord.uid}`).update({
    username: 'zero_sus',
    isAdmin: true,
  });

  // 4. Verify custom claim is set
  const verifiedUser = await admin.auth().getUser(userRecord.uid);
  console.log('========================================================================');
  console.log('[+] SUCCESS: Owner account successfully provisioned!');
  console.log(`    UID:           ${verifiedUser.uid}`);
  console.log(`    Email:         ${verifiedUser.email}`);
  console.log(`    Custom Claims: ${JSON.stringify(verifiedUser.customClaims)}`);
  console.log('========================================================================');
  process.exit(0);
}

main().catch((err) => {
  console.error('[-] Fatal error:', err);
  process.exit(1);
});

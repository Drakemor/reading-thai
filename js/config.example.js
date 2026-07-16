/**
 * Copy to js/config.js and fill in your Firebase project values.
 * Get these from: Firebase Console → Project Settings → General → Your apps (Web)
 *
 * Enable Google sign-in: Firebase Console → Authentication → Sign-in method → Google
 * Authorized domains must include your app origin, e.g.:
 *   localhost
 *   drakemor.github.io
 */
window.SYNC_CONFIG = {
  enabled: true,
  firebase: {
    apiKey: 'YOUR_API_KEY',
    authDomain: 'YOUR_PROJECT.firebaseapp.com',
    projectId: 'YOUR_PROJECT_ID',
    appId: 'YOUR_APP_ID'
  }
};

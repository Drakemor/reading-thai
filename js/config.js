/**
 * Cloud sync configuration. Copy from config.example.js and set your Firebase values.
 * When disabled or empty, the app works offline with localStorage only.
 */
window.SYNC_CONFIG = {
  enabled: false,
  firebase: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    appId: ''
  }
};

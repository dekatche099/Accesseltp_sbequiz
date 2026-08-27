/* firebase-adapter.js — Firebase Synchronization Adapter
 * ============================================================
 * cloud-sync.js was already course-agnostic (it takes courseId as
 * a parameter and never names a course), so this adapter doesn't
 * need to change its contents — it just gives the rest of the
 * engine one stable import instead of scattering `import "./cloud-sync.js"`
 * and window-global wiring across course pages.
 *
 * cloud-sync.js expects four window hooks to exist so it can refresh
 * the UI once Firebase Auth resolves who's signed in:
 *   window.checkForSavedSession
 *   window.validateStart
 *   window.updateTotalAvail
 *   window.setSignedInUser(user, profile)
 * This adapter wires those to the UIRenderer instance instead of
 * requiring UIRenderer (or course pages) to know cloud-sync exists.
 *
 * IMPORTANT — call this BEFORE uiRenderer.init(), not after. The old
 * ordering (init() first, attachFirebaseSync() after) is what caused
 * the cross-device sync race condition: applyLoginState() would run
 * and try to react to auth state before cloud-sync.js's listeners
 * even existed. See app.js for the corrected call order.
 * ============================================================ */

export async function attachFirebaseSync(courseId, uiRenderer) {
  window.checkForSavedSession = () => uiRenderer.checkForSavedSession();
  window.validateStart = () => uiRenderer.validateStart();
  window.updateTotalAvail = () => uiRenderer.updateTotalAvail();
  window.setSignedInUser = (user, profile) => uiRenderer.setSignedInUser(user, profile);

  try {
    const { initCloudSync } = await import('../cloud-sync.js?v=20260822');
    initCloudSync(courseId);
    return true;
  } catch (e) {
    // cloud-sync.js not present, or Firebase unreachable — silent, optional feature.
    console.warn('firebase-adapter: cloud sync unavailable', e);
    return false;
  }
}

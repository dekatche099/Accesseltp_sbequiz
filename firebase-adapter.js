/* firebase-adapter.js — Firebase Synchronization Adapter
 * ============================================================
 * cloud-sync.js was already course-agnostic (it takes courseId as
 * a parameter and never names a course), so this adapter doesn't
 * need to change its contents — it just gives the rest of the
 * engine one stable import instead of scattering `import "./cloud-sync.js"`
 * and window-global wiring across course pages.
 *
 * cloud-sync.js expects three window hooks to exist so it can
 * refresh the UI after a successful login/PIN check:
 *   window.checkForSavedSession
 *   window.validateStart
 *   window.updateTotalAvail
 * This adapter wires those to the UIRenderer instance instead of
 * requiring UIRenderer (or course pages) to know cloud-sync exists.
 * ============================================================ */

export async function attachFirebaseSync(courseId, uiRenderer) {
  window.checkForSavedSession = () => uiRenderer.checkForSavedSession();
  window.validateStart = () => uiRenderer.validateStart();
  window.updateTotalAvail = () => uiRenderer.updateTotalAvail();

  try {
    const { initCloudSync } = await import('../cloud-sync.js');
    initCloudSync(courseId);
    return true;
  } catch (e) {
    // cloud-sync.js not present, or Firebase unreachable — silent, optional feature.
    console.warn('firebase-adapter: cloud sync unavailable', e);
    return false;
  }
}

// Hidden feature switches. A flag turns on by loading any page with
// `?features=<name>[,<name>]` after the hash, e.g. #/library?features=color.
// The choice is stored as pref `feature.<name>`; `?features=none` clears all.
// Nothing in the UI shows that these exist.
export const FEATURES = ['color'];

/** The hash without its query string: '#/play/abc?features=color' -> '#/play/abc'. */
export function hashPath(hash) {
  const q = hash.indexOf('?');
  return q === -1 ? hash : hash.slice(0, q);
}

/** {set: known feature names} when the hash carries `features`, else {set: null}. */
export function parseFeatureParam(hash) {
  const q = hash.indexOf('?');
  if (q === -1) return { set: null };
  const params = new URLSearchParams(hash.slice(q + 1));
  if (!params.has('features')) return { set: null };
  const names = params
    .get('features')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => FEATURES.includes(s));
  return { set: [...new Set(names)] };
}

/** True only when the pref is literally `true`. */
export function isEnabled(store, name) {
  return store.getPref(`feature.${name}`, false) === true;
}

/** When the hash carries a features param, make the stored prefs match it. */
export function applyFeatureParam(store, hash) {
  const { set } = parseFeatureParam(hash);
  if (set === null) return;
  try {
    for (const name of FEATURES) store.setPref(`feature.${name}`, set.includes(name));
  } catch {
    // storage unavailable: the flag just stays off
  }
}

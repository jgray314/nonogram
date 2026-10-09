// Theme tokens: the single source of truth for colors. Token names are CSS
// custom properties. css/base.css :root repeats only the day values, as a
// first-paint fallback (a test keeps the two in sync).
//   day     cream paper, cocoa fills, leafy green and terracotta accents
//   evening deep blue-violet night, warm lantern-amber accents

export const THEMES = {
  day: {
    '--bg': '#f3e8d0',
    '--panel': '#fffaf0',
    '--ink': '#3b2a1e',
    '--muted': '#6b5645',
    '--accent': '#3b7444',
    '--accent-soft': '#dcebd2',
    '--accent-2': '#b5532f',
    '--wood': '#8a5a34',
    '--wood-dark': '#5e3b20',
    '--on-wood': '#fff4de',
    '--line': '#dccaa6',
    '--line-thick': '#6b4a30',
    '--cell-unknown': '#fffdf6',
    '--cell-filled': '#4a2f1c',
    '--cell-cross': '#8c6a4f',
    '--cell-hot': '#cfe3c0',
    '--cell-wrong': '#c0392b',
    '--cell-hl': '#d9930d',
    '--clue-text': '#3b2a1e',
    '--danger': '#a4372a',
    '--danger-bg': '#fdeae4',
    '--ok': '#2c7a3f',
    '--warn': '#8a6a12',
    '--shadow': 'rgba(94, 59, 32, 0.22)',
    '--paper-dot': 'rgba(138, 90, 52, 0.07)',
  },
  evening: {
    '--bg': '#1d1b3a',
    '--panel': '#2a2752',
    '--ink': '#f8e9c9',
    '--muted': '#bdb4dc',
    '--accent': '#ffb84d',
    '--accent-soft': '#3d3870',
    '--accent-2': '#ff9a62',
    '--wood': '#4a3a63',
    '--wood-dark': '#2b2045',
    '--on-wood': '#ffe7b8',
    '--line': '#47427f',
    '--line-thick': '#9a92d2',
    '--cell-unknown': '#34305f',
    '--cell-filled': '#ffc766',
    '--cell-cross': '#aaa2da',
    '--cell-hot': '#4f4a8a',
    '--cell-wrong': '#ff6f6f',
    '--cell-hl': '#5cc3ff',
    '--clue-text': '#f8e9c9',
    '--danger': '#ff8f85',
    '--danger-bg': '#4a2740',
    '--ok': '#8fe0a0',
    '--warn': '#ffd36b',
    '--shadow': 'rgba(8, 6, 28, 0.5)',
    '--paper-dot': 'rgba(255, 214, 140, 0.05)',
  },
};

const PREFS = ['auto', 'day', 'evening'];

function luminance(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map((x) => x + x).join('');
  const lin = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** WCAG 2.x contrast ratio between two hex colors, 1 to 21. */
export function contrastRatio(hexA, hexB) {
  const [hi, lo] = [luminance(hexA), luminance(hexB)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

/** The pref is 'auto' | 'day' | 'evening'; auto follows the system setting. */
export function resolveTheme(pref, prefersDark) {
  if (pref === 'day' || pref === 'evening') return pref;
  return prefersDark ? 'evening' : 'day';
}

/** Toggle order: auto, day, evening, then back to auto. */
export function nextPref(pref) {
  const i = PREFS.indexOf(pref);
  if (i < 0) return 'day';
  return PREFS[(i + 1) % PREFS.length];
}

/** Set every token on the root element and record the theme name. */
export function applyTheme(name, root = document.documentElement) {
  for (const [k, v] of Object.entries(THEMES[name])) root.style.setProperty(k, v);
  root.dataset.theme = name;
}

const LABELS = { auto: 'Theme: auto', day: 'Theme: day', evening: 'Theme: evening' };

/**
 * Wire the nav toggle: apply the stored pref now, cycle it on click (and
 * persist it), and follow the system setting while the pref is 'auto'.
 */
export function initTheme(
  store,
  button,
  media = window.matchMedia('(prefers-color-scheme: dark)'),
) {
  const read = () => {
    const p = store.getPref('theme', 'auto');
    return PREFS.includes(p) ? p : 'auto';
  };
  let pref = read();
  const paint = () => {
    applyTheme(resolveTheme(pref, media.matches));
    if (button) {
      button.textContent = LABELS[pref];
      button.title = 'Cycle theme: auto, day, evening';
    }
  };
  paint();
  media.addEventListener('change', () => {
    if (pref === 'auto') paint();
  });
  button?.addEventListener('click', () => {
    pref = nextPref(pref);
    try {
      store.setPref('theme', pref);
    } catch {
      // Storage unavailable: the theme still changes for this session.
    }
    paint();
  });
}

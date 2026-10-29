// The image source: decoding a file, the crop, and regenerating the grid from it.
import { cellLuminance, otsu } from '../../image.js';
import { el } from '../dom.js';
import { tileGrid } from '../../tiles.js';
import { colorGrid } from '../../color.js';
import { defaultSize, titleFromFile, centerCrop, loadScale } from '../../create-logic.js';

/** Decode a File into a canvas capped at 1024px on the long side. */
function decodeFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      if (!nw || !nh) {
        reject(new Error('empty image'));
        return;
      }
      const scale = loadScale(nw, nh);
      const w = Math.max(1, Math.round(nw * scale));
      const h = Math.max(1, Math.round(nh * scale));
      const canvas = el('canvas', { width: w, height: h });
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, w, h);
      try {
        resolve({ canvas, w, h, rgba: ctx.getImageData(0, 0, w, h).data });
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode failed'));
    };
    img.src = url;
  });
}

/** @param {import('./context.js').CreateContext} ctx */
export function createImageSource(ctx) {
  const { st, state, refs } = ctx;
  const {
    fileInput,
    widthSel,
    heightSel,
    slider,
    invertBox,
    colorsSel,
    tileRowsSel,
    tileColsSel,
    titleInput,
  } = refs;

  function currentCrop() {
    const d = ctx.shell.dims();
    return centerCrop(state.image.w, state.image.h, d.width, d.height, st.offset);
  }

  /** Rebuild the grid from the image with the current settings. */
  function regenerate() {
    if (!state.image) return;
    const d = ctx.shell.dims();
    const crop = currentCrop();
    if (st.colors) {
      // One palette over the whole crop, so the tiles of a set share it.
      const q = colorGrid(state.image.rgba, state.image.w, crop, d.width, d.height, st.colors);
      st.grid = q.grid;
      st.palette = q.palette;
      st.blank = q.blank; // D29: Create and Play draw blank cells in it
      st.manualEdits = false;
      ctx.gridView.resetHistory();
      ctx.shell.syncControls();
      ctx.cropPreview.drawPreview();
      ctx.gridView.renderGridNow();
      return;
    }
    st.palette = null;
    st.blank = null;
    if (st.autoThreshold) {
      const lum = cellLuminance(
        state.image.rgba,
        state.image.w,
        state.image.h,
        crop,
        d.width,
        d.height,
      );
      st.threshold = otsu(lum.flat());
    }
    // One global threshold over the whole crop, so tiles show no seams.
    const { full } = tileGrid(
      state.image.rgba,
      state.image.w,
      state.image.h,
      crop,
      st.width,
      st.height,
      st.tileRows,
      st.tileCols,
      { threshold: st.threshold, invert: st.invert },
    );
    st.grid = full;
    st.manualEdits = false;
    ctx.gridView.resetHistory();
    ctx.shell.syncControls();
    ctx.cropPreview.drawPreview();
    ctx.gridView.renderGridNow();
  }

  // --- handlers ---
  async function onFile() {
    const file = fileInput.files[0];
    if (!file) return;
    ctx.shell.showError(null);
    let decoded;
    try {
      decoded = await decodeFile(file);
    } catch {
      ctx.shell.showError(
        `Could not read "${file.name}" as an image. Try a PNG, JPEG, GIF or WebP file.`,
      );
      return;
    }
    if (!ctx.shell.okToDiscard()) {
      fileInput.value = '';
      return;
    }
    state.image = decoded;
    if (!state.titleTouched) titleInput.value = titleFromFile(file.name);
    st.hasImage = true;
    st.offset = { dx: 0, dy: 0 };
    st.autoThreshold = true;
    const size = defaultSize(state.image.w / st.tileCols, state.image.h / st.tileRows);
    st.width = size.width;
    st.height = size.height;
    regenerate();
  }

  function onSize() {
    if (!ctx.shell.okToDiscard()) {
      ctx.shell.syncControls();
      return;
    }
    st.width = Number(widthSel.value);
    st.height = Number(heightSel.value);
    st.tileRows = Number(tileRowsSel.value);
    st.tileCols = Number(tileColsSel.value);
    if (state.image) {
      regenerate();
    } else {
      ctx.shell.newBlank();
    }
  }

  function onSlider() {
    if (!ctx.shell.okToDiscard()) {
      ctx.shell.syncControls();
      return;
    }
    st.autoThreshold = false;
    st.threshold = Number(slider.value);
    regenerate();
  }

  function onReset() {
    if (!ctx.shell.okToDiscard()) return;
    st.autoThreshold = true;
    regenerate();
  }

  function onColors() {
    if (!ctx.shell.okToDiscard()) {
      ctx.shell.syncControls();
      return;
    }
    st.colors = Number(colorsSel.value);
    st.brush = 1;
    regenerate();
  }

  function onInvert() {
    if (!ctx.shell.okToDiscard()) {
      ctx.shell.syncControls();
      return;
    }
    st.invert = invertBox.checked;
    regenerate();
  }

  return { currentCrop, regenerate, onFile, onSize, onSlider, onReset, onColors, onInvert };
}

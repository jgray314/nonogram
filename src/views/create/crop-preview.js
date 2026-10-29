import { centerCrop } from '../../create-logic.js';

const PREVIEW_MAX = 320;

/** @param {import('./context.js').CreateContext} ctx */
export function createCropPreview(ctx) {
  const { st, state, refs } = ctx;
  const { previewCanvas, previewWrap } = refs;

  function drawPreview() {
    previewWrap.hidden = state.image === null;
    if (!state.image) return;
    state.previewScale = PREVIEW_MAX / Math.max(state.image.w, state.image.h);
    const cw = Math.max(1, Math.round(state.image.w * state.previewScale));
    const ch = Math.max(1, Math.round(state.image.h * state.previewScale));
    previewCanvas.width = cw;
    previewCanvas.height = ch;
    const g = previewCanvas.getContext('2d');
    g.drawImage(state.image.canvas, 0, 0, cw, ch);
    const c = ctx.shell.currentCrop();
    const x = c.x * state.previewScale;
    const y = c.y * state.previewScale;
    const w = c.w * state.previewScale;
    const h = c.h * state.previewScale;
    g.fillStyle = 'rgba(0, 0, 0, 0.5)';
    g.fillRect(0, 0, cw, y);
    g.fillRect(0, y + h, cw, ch - y - h);
    g.fillRect(0, y, x, h);
    g.fillRect(x + w, y, cw - x - w, h);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2;
    g.strokeRect(x + 1, y + 1, w - 2, h - 2);
  }

  // Crop drag: pointer movement shifts the crop in image pixels.
  state.drag = null;
  function onPreviewDown(e) {
    if (!state.image || e.button !== 0 || !ctx.shell.okToDiscard()) return;
    const d = ctx.shell.dims();
    const base = centerCrop(state.image.w, state.image.h, d.width, d.height);
    state.drag = { x: e.clientX, y: e.clientY, from: ctx.shell.currentCrop(), base };
    previewCanvas.setPointerCapture(e.pointerId);
    previewCanvas.classList.add('dragging');
  }
  function onPreviewMove(e) {
    if (!state.drag) return;
    const rect = previewCanvas.getBoundingClientRect();
    const k = state.previewScale * (rect.width / previewCanvas.width);
    const d = ctx.shell.dims();
    const crop = centerCrop(state.image.w, state.image.h, d.width, d.height, {
      dx: state.drag.from.x - state.drag.base.x + (e.clientX - state.drag.x) / k,
      dy: state.drag.from.y - state.drag.base.y + (e.clientY - state.drag.y) / k,
    });
    st.offset = { dx: crop.x - state.drag.base.x, dy: crop.y - state.drag.base.y };
    ctx.shell.regenerate();
  }
  function onPreviewUp() {
    state.drag = null;
    previewCanvas.classList.remove('dragging');
  }

  return { drawPreview, onPreviewDown, onPreviewMove, onPreviewUp };
}

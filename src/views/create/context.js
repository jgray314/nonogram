// The shared context the create view's modules receive. Types only, no runtime code.
// Modules reach each other as `ctx.<module>.fn(...)` at run time, never by
// destructuring at construction: image-source and crop-preview call each other.

/**
 * The create view's mutable state (what used to be `let` bindings in mount).
 * `st` stays a nested object: onStartOver resets it with Object.assign and the
 * saved draft reuses the same object.
 * @typedef {object} CreateState
 * @property {ReturnType<typeof import('../../create-logic.js').newEditorState>} st
 * @property {any} image decoded image `{ canvas, w, h, rgba }`, or null
 * @property {any} gridView the renderGrid return value, or null
 * @property {number | null} previewScale
 * @property {any} reportTimer setTimeout handle, or null
 * @property {number | null} reportRun id of the newest report request
 * @property {boolean | null} titleTouched
 * @property {any} history hand-edit history
 * @property {string | null} baseline JSON of the grid as generated
 * @property {any} savedSig gridSig of the last successful save, or null
 * @property {any} reports per-tile report results
 * @property {any} stroke `[r, c][]` while a stroke is held, else null
 * @property {any} drag crop-drag start, or null
 */

/**
 * The shell functions that stay in index.js.
 * @typedef {object} CreateShell
 * @property {(msg?: string | null) => void} showError
 * @property {() => void} syncControls
 * @property {() => any} dims
 * @property {() => boolean} tiled
 * @property {() => boolean} okToDiscard
 * @property {() => void} newBlank
 * @property {() => void} onBlank
 * @property {() => void} onStartOver
 * @property {() => void} onResize
 */

/**
 * @typedef {object} CreateContext
 * @property {CreateState['st']} st the editor state (same object as `state.st`)
 * @property {CreateState} state
 * @property {ReturnType<typeof import('./build.js').buildView>} refs
 * @property {ReturnType<typeof import('../../solver-client.js').createSolverClient>} solver
 * @property {() => (HTMLElement | null)} root reads the module-level root in index.js (null after unmount)
 * @property {CreateShell} shell
 * @property {ReturnType<typeof import('./image-source.js').createImageSource>} imageSource
 * @property {ReturnType<typeof import('./crop-preview.js').createCropPreview>} cropPreview
 * @property {ReturnType<typeof import('./grid-view.js').createGridView>} gridView
 * @property {ReturnType<typeof import('./report.js').createReport>} report
 * @property {ReturnType<typeof import('./save.js').createSave>} save
 */

export {};

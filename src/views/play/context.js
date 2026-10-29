// Play view: the shared context contract (types only, no runtime code).
// index.js builds one PlayContext per mount and hands it to each module factory.
// Fields that change identity (cells, history, drag) are always read through
// ctx.state at call time, never copied out of it.

/**
 * All mutable per-mount values.
 * @typedef {object} PlayState
 * @property {number} brush
 * @property {string} touchMode  'fill' or 'cross'.
 * @property {number[][]} cells
 * @property {number} elapsedMs
 * @property {number | null} solvedAt
 * @property {number} hearts
 * @property {number} hints
 * @property {number[] | null} wrongMark
 * @property {boolean} dirty
 * @property {boolean} started
 * @property {any} history  The object from createHistory; replaced by restart.
 * @property {{ button: any, path: number[][] } | null} drag
 * @property {boolean} revealed
 * @property {boolean} animateReveal
 * @property {any} revealTimer
 * @property {number} lastTick
 * @property {{ zen: boolean, autoCross: boolean }} rules
 */

/**
 * @typedef {object} PlayContext
 * @property {any} puzzle
 * @property {any} store  The store, or null when storage is unavailable.
 * @property {PlayState} state
 * @property {{ zen: boolean, autoCross: boolean }} rules  The same object as state.rules.
 * @property {any} clues
 * @property {any} refs  The object returned by buildView.
 * @property {HTMLElement} container
 * @property {Array<() => void>} cleanup  This mount's cleanup list.
 * @property {boolean} heartsOk
 * @property {any} helpers
 * @property {() => any} grid  The module-level grid, read at call time.
 * @property {() => number} generation  The module-level mount counter, read at call time.
 * @property {any} hud  Set by index.js after construction.
 * @property {any} persist
 * @property {any} rulesLayout
 * @property {any} session
 */

export {};

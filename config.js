// BELJOUR runs entirely in the browser: every tool works on this device and no photo is uploaded.
// The optional API (our own server-side engines, for development and tests) is used only when an
// operator sets window.BELJOUR_API before this script.
if (typeof window.BELJOUR_API === "undefined") {
  window.BELJOUR_API = typeof window.PLUMB_API === "string" ? window.PLUMB_API : "";
}

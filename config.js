// Static Pages builds start in local-only mode. The optional YouCam key proxy is
// selected explicitly by the operator, never silently or from a hostname.
// Only an API origin belongs here: credentials remain on the server.
// Set window.BELJOUR_API before this script if the approved proxy is available.
// The older PLUMB_API option is retained for existing integrations.
if (typeof window.BELJOUR_API === "undefined") {
  window.BELJOUR_API = typeof window.PLUMB_API === "string" ? window.PLUMB_API : "";
}

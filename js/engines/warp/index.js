/**
 * E06 warp (plan-r3-final §10.4 R5): fields, thin plate spline, moving least squares,
 * Delaunay + piecewise affine, the face-mesh warp, fold checks and falloff. Python mirror:
 * api/plumb_api/engines/warp/. Author: John Khan.
 */
export * as falloff from "./falloff.js";
export * as field from "./field.js";
export * as fold from "./fold.js";
export * as mesh from "./mesh.js";
export * as mls from "./mls.js";
export * as piecewise from "./piecewise.js";
export * as tps from "./tps.js";
export * as triangulate from "./triangulate.js";
export { WarpEngine } from "./engine.js";

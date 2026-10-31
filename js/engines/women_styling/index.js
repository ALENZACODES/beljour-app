/** Explicit client-facing R20c local exports. No import of other workstreams.
 * Author: John Khan.
 */
export { applyPreviewTiled } from './tiled.js';
export { applyPreview } from './engine.js';
export { FEATURE_IDS, FEATURE_SPECS, REGIONS, specFor } from './specs.js';
export { SWATCHES, suggestedPalette, checkedRGB, mixRGB } from './palette.js';
export { checkedRequest } from './requests.js';
export { PASS_DEFINITIONS, evaluateFrame } from './definitions.js';
export { auditFrame, auditChecks } from './pixel_evidence.js';

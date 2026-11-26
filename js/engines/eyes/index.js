/** Stable eye/lash feature entry. Author: John Khan. */
export { FEATURES, LABEL, VERSION, ANATOMIES, parseRequest } from "./contracts.js";
export { renderEyes } from "./engine.js";
export { frames, nativePlacement } from "./geometry.js";
export { extensionMap, chooseStyle } from "./lashes.js";
export { colourRecommendations } from "./liner.js";
export { lashMapSvg, lashMapCsv, mapDocument } from "./maps.js";
export { traceSummary, resampleTrace, photometricTraceEvidence } from "./observations.js";
export { recolourVisible } from "./visible-iris.js";
export { DEFAULT_LOCK_LEVEL, SIMULATION_LABEL, IrisTrialEngine, PixelLimitGuard, checkedLevel, legacyStrength, safeTrialReport, } from "./iris-trial.js";
export { auditIrisTrial, aggregateIrisAudits, safeIrisAuditReport } from "./iris-evidence.js";
export { irisToneQuality, measuredGateRow, safeIrisToneReport } from "./iris-quality.js";
//# sourceMappingURL=index.js.map
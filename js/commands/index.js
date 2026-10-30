/** Public Workstream H browser contracts. Author: John Khan. */
export { LEVEL_TICKS, ProLevelError, adjustLevel, boundedAdjustLevel, isCompliantSlider, levelDose, levelFromTenths, levelLabel, parseLevel, } from './levels.js';
export { DEFAULT_IDENTITY_POLICY, ProPlanError, canonicalProPlan, createProPlan, editProLevel, parseProCommands, userIdentityOverride, validateIdentityPolicy, } from './plan.js';
export { ProPreviewCoordinator } from './preview.js';
export { DEFAULT_REPAIR_LIMITS, measureFaceFixer } from './face-fixer.js';
export { DEFAULT_RENDER_BUDGET, ProBrowserRuntime, ProRenderError, checkedFrame, unchanged, } from './runtime.js';
export { CpuCleanup, validateSpots } from './cpu-cleanup.js';
export { PhotoRegions } from './regions.js';
export { CpuUpscale, planUpscaleTiles } from './cpu-upscale.js';
export { R2HBrowserSession } from './r2h-session.js';
export { assessLocalQuality, parseCommandQualityDefinition } from './quality-r2h.js';
export { CpuStudioQuality, DEFAULT_STUDIO_CONTROLS } from './studio-quality.js';
export { CpuPoseOnly, validatePose } from './pose-only.js';
export { R3HBrowserSession } from './r3h-session.js';
export { measuredPsnr, measuredSsim, qualityPoint, qualitySeries } from './quality-metrics-r3h.js';
export { decodeGate, evaluateLocalGate } from './quality-gate-r3h.js';
export { DEFAULT_PREFLIGHT_CAPACITY, checkedPreflightCapacity, preflightProPlan } from './preflight.js';
export { decodeShardEvidence, decodeShardJson, collectEvidence } from './evidence-batch.js';
export { ProBrowserBenchmark, syntheticBenchmarkFrame } from './benchmark.js';
// Workstream H release-facing local workbench and synthetic/checked diagnostics.
export { ProWorkbenchModel } from './workbench-model.js';
export { mountProWorkbench } from './workbench-view.js';
export { BrowserPhotoCodec, MAX_IMPORT_BYTES, ALLOWED_INPUT_TYPES, clonePixels, toRgba, fromRgba, uiPreviewPixels, validateImport, downloadLocalPng, } from './frame-io.js';
export { measurePreviewParity } from './preview-parity.js';
export { checkedProtectionMask, measureProtectedRegions } from './protected-quality.js';
// Workstream H aggregated local acceptance, always pending independent face review.
export { assembleBrowserAcceptance } from './acceptance-bundle.js';
// Workstream H host attachment and independently admitted local identity runtime.
export { ApprovedEmbeddingIdentityPort, alignIdentityReference, blendIdentityReference, checkIdentityEvidence, embeddingCosine, identityMeter, } from './identity-admission.js';
export { mountHostProCommands } from './host-bridge.js';
export { loadVerifiedIdentityRuntime, sha256Local } from './verified-model.js';
// Complete local five-command synthetic acceptance and photo-free public receipts.
export { runFiveCommandSyntheticSmoke } from './release-smoke.js';
export { createPublicProReceipt, encodePublicProReceipt } from './public-receipt.js';
// Workstream H offline, image-free portable recipe and photo-scoped host transactions.
export { MAX_PORTABLE_RECIPE_BYTES, PORTABLE_RECIPE_FORMAT, exportPortableProRecipe, importPortableProRecipe, inspectPortableProRecipe, } from './portable-recipe.js';
export { PORTABLE_FILENAME, prepareRecipeDownload, readLocalRecipe, saveLocalRecipe, } from './recipe-local-io.js';
export { exportProShareFragment, importProShareFragment } from './share-fragment.js';
// Workstream H r7h: opt-in editor attachment, local timings and honest demo evidence.
export { attachProToExistingEditor } from './host-shell-adapter.js';
export { ProDeviceReadinessProbe } from './device-readiness.js';
export { inspectFiveCommandDemoPlan, runFiveCommandHostDemo } from './demo-contract.js';
// Workstream H r11h: private-pair metrics are read-only and never approve release.
export { QualificationInputError, parseIdentityQualification, parseIdentityQualificationJson, summarizeIdentityQualification, } from './identity-qualification.js';
export { mountIdentityQualification } from './identity-qualification-view.js';
// BELJOUR Quality Generator: local 1080/4K tiers and Tuesday supplement.
export { QUALITY_TIER_VERSION, TIER_LONG_EDGES, checkedTier, createTierRecipe, parseQualityTierCommands, planQualityTier, runQualityTier, checkedTierOutput, tierPublicMetadata, } from './quality-tiers.js';
export { TIER_MATRIX_VERSION, buildTierMatrix, verifyTierMatrix, tierMatrixCsv, serializeTierMatrix, observationFromTierRuns, tierFindings, } from './quality-tier-matrix.js';
// Pixel-exact neutral upscale claims use final bytes and post-cleanup provenance.
export { NEUTRAL_CLAIM_COPY, NEUTRAL_CLAIM_VERSION, compareNeutralOutput, evaluateNeutralUpscaleClaim, } from './upscale-claims.js';
//# sourceMappingURL=index.js.map
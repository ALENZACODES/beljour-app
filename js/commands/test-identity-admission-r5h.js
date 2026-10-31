/** All identity inputs are generated pixel buffers or toy embedding vectors.
 * These checks do not validate a production face recognizer. Author: John Khan.
 */
import { ApprovedEmbeddingIdentityPort, alignIdentityReference, blendIdentityReference, checkIdentityEvidence, embeddingCosine, identityMeter, } from './identity-admission.js';
import { DEFAULT_IDENTITY_POLICY, userIdentityOverride } from './plan.js';
import { ProRenderError } from './runtime.js';
function check(value, message) {
    if (!value)
        throw new Error(`Identity admission: ${message}`);
}
function failure(code, run) {
    try {
        run();
    }
    catch (error) {
        if (error instanceof ProRenderError && error.code === code)
            return;
        throw error;
    }
    throw new Error(`Identity admission expected ${code}`);
}
async function rejected(code, run) {
    try {
        await run();
    }
    catch (error) {
        if (error instanceof ProRenderError && error.code === code)
            return;
        throw error;
    }
    throw new Error(`Identity admission expected ${code}`);
}
const SHA = 'a'.repeat(64);
function cleared() {
    return {
        format: 'beljour-identity-evidence/1', modelId: 'external-cleared-model',
        codeLicence: 'MIT', weightsLicence: 'Apache-2.0', sha256: SHA,
        trainingSources: [{ label: 'released-source', documentedRights: true, reviewedLineage: true }],
        independentCommercialReview: true, independentRealFaceReview: true, syntheticOnly: false,
    };
}
function synthetic() {
    return {
        ...cleared(), modelId: 'toy-descriptor', weightsLicence: null, sha256: null,
        trainingSources: [], syntheticOnly: true,
        independentCommercialReview: false, independentRealFaceReview: false,
    };
}
function photo(colour, width = 12, height = 12) {
    const pixels = new Uint8Array(width * height * 4);
    for (let index = 0; index < width * height; index++) {
        const offset = 4 * index;
        pixels.set([colour, 120, 75, 255], offset);
    }
    return { width, height, channels: 4, pixels };
}
class ToyEmbedding {
    calls = 0;
    async embed(frame) {
        this.calls++;
        let sum = 0;
        for (let index = 0; index < frame.width * frame.height; index++) {
            sum += frame.pixels[index * frame.channels];
        }
        const mean = sum / (frame.width * frame.height);
        return [1, mean / 32];
    }
}
export async function testIdentityAdmissionR5H() {
    let count = 0;
    const policy = (label) => label === 'released-source';
    const accepted = checkIdentityEvidence(cleared(), policy);
    check(accepted.status === 'ready', 'eligible external model admitted');
    check(accepted.modelEvidenceKey?.includes(SHA), 'pinned external model identity');
    check(accepted.externalApprovalRequired, 'independent approval still required');
    count += 3;
    const noReview = checkIdentityEvidence({ ...cleared(), independentRealFaceReview: false }, policy);
    check(noReview.status === 'blocked' &&
        noReview.reasons.includes('identity_qualification_missing'), 'holdout review prerequisite');
    const noRights = checkIdentityEvidence({ ...cleared(), independentCommercialReview: false }, policy);
    check(noRights.reasons.includes('commercial_approval_missing'), 'commercial rights prerequisite');
    const missingSha = checkIdentityEvidence({ ...cleared(), sha256: 'f' }, policy);
    check(missingSha.reasons.includes('weights_pin_missing'), 'weights hash prerequisite');
    const wrongLicence = checkIdentityEvidence({ ...cleared(), codeLicence: 'uncleared' }, policy);
    check(wrongLicence.reasons.includes('implementation_licence_pending'), 'code licence prerequisite');
    const wrongWeights = checkIdentityEvidence({ ...cleared(), weightsLicence: 'uncleared' }, policy);
    check(wrongWeights.reasons.includes('weights_licence_pending'), 'weights licence prerequisite');
    count += 5;
    const noPolicy = checkIdentityEvidence(cleared(), null);
    check(noPolicy.reasons.includes('central_source_policy_missing'), 'central source policy');
    const denied = checkIdentityEvidence(cleared(), () => false);
    check(denied.reasons.includes('training_source_unapproved'), 'denied source');
    const thrown = checkIdentityEvidence(cleared(), () => { throw new Error('refused'); });
    check(thrown.reasons.includes('training_source_unapproved'), 'policy errors fail closed');
    const lineage = checkIdentityEvidence({ ...cleared(), trainingSources: [] }, policy);
    check(lineage.reasons.includes('training_lineage_missing'), 'complete lineage required');
    count += 4;
    const toy = checkIdentityEvidence(synthetic(), null, true);
    check(toy.status === 'test_only', 'test-only never production ready');
    check(checkIdentityEvidence(synthetic(), null).status === 'blocked', 'synthetic disabled by default');
    check(checkIdentityEvidence({ ...synthetic(), sha256: SHA }, null, true).status === 'blocked', 'toy cannot advertise weights');
    count += 3;
    check(Math.abs(embeddingCosine([3, 4], [6, 8]) - 1) < 1e-12, 'normalized cosine');
    check(Math.abs(embeddingCosine([1, 0], [-1, 0]) + 1) < 1e-12, 'opposite vectors');
    check(embeddingCosine([1e300, 3e300], [2e300, 6e300]) > 0.9999999, 'stable large values');
    check(identityMeter(1) === 100 && identityMeter(-1) === 0, 'meter bounds');
    check(identityMeter(0.81) <= identityMeter(0.85), 'meter monotone');
    count += 5;
    failure('embedding_dimension_changed', () => embeddingCosine([1, 2], [1, 2, 3]));
    failure('zero_embedding', () => embeddingCosine([0, 0], [1, 1]));
    failure('invalid_embedding', () => embeddingCosine([1, Number.NaN], [1, 1]));
    failure('invalid_similarity', () => identityMeter(Number.NaN));
    count += 4;
    const original = photo(0);
    const changed = photo(255);
    const resized = alignIdentityReference(original, photo(255, 24, 24));
    check(resized.width === 24 && resized.height === 24, 'upscale alignment');
    check(resized.pixels.every((x, i) => i % 4 !== 3 || x === 255), 'alpha alignment');
    const mixed = blendIdentityReference(original, changed, 0.25);
    check(mixed.pixels[0] === 64 && mixed.pixels[3] === 255, 'blend quantization and alpha');
    check(original.pixels[0] === 0, 'source unchanged');
    count += 4;
    const changedAlpha = photo(255);
    changedAlpha.pixels[3] = 210;
    check(blendIdentityReference(original, changedAlpha, 0.25).pixels[3] === 210, 'blend preserves rendered output transparency');
    check(alignIdentityReference(original, changedAlpha).pixels[3] === 210, 'same-size reference preserves output transparency');
    count += 2;
    failure('identity_blend_invalid', () => blendIdentityReference(original, resized, 0.5));
    failure('identity_blend_invalid', () => blendIdentityReference(original, changed, 2));
    count += 2;
    const backend = new ToyEmbedding();
    const port = new ApprovedEmbeddingIdentityPort(backend, synthetic(), null, { allowSyntheticTests: true });
    check(port.modelEvidenceKey.includes('toy-descriptor'), 'model provenance key');
    const kept = await port.enforce(original, photo(0), DEFAULT_IDENTITY_POLICY);
    check(kept.status === 'kept' && kept.identityMatch === 100 && kept.syntheticOnly, 'same source passes test-only comparison');
    const softened = await port.enforce(original, changed, DEFAULT_IDENTITY_POLICY);
    check(softened.status === 'softened' || softened.status === 'restored', 'soften does not pass unguarded candidate');
    check(softened.frame.pixels[0] < 255, 'soften restores source content');
    check(original.pixels[0] === 0 && changed.pixels[0] === 255, 'guard does not mutate either frame');
    count += 5;
    await rejected('identity_blocked', () => port.enforce(original, changed, userIdentityOverride(true, 'block', 'strict')));
    const warned = await port.enforce(original, changed, userIdentityOverride(true, 'warn', 'normal'));
    check(warned.status === 'warned', 'explicit warning');
    count += 2;
    await rejected('identity_policy_disabled', () => port.enforce(original, changed, userIdentityOverride(false)));
    await rejected('identity_override_required', () => port.enforce(original, changed, { ...DEFAULT_IDENTITY_POLICY, mode: 'warn' }));
    count += 2;
    failure('identity_model_unavailable', () => new ApprovedEmbeddingIdentityPort(backend, cleared(), null));
    failure('identity_model_unavailable', () => new ApprovedEmbeddingIdentityPort(backend, synthetic(), null));
    count += 2;
    const failingBackend = {
        async embed() { throw new Error('private data must not escape'); },
    };
    const failPort = new ApprovedEmbeddingIdentityPort(failingBackend, synthetic(), null, { allowSyntheticTests: true });
    await rejected('identity_embedder_failed', () => failPort.enforce(original, changed, DEFAULT_IDENTITY_POLICY));
    count++;
    check(backend.calls >= 8, 'multiple guarded comparisons actually performed');
    count++;
    return count;
}

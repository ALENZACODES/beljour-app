import { ProRenderError, checkedFrame, } from './runtime.js';
const LICENCES = new Set([
    'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause',
]);
const SHA256 = /^[0-9a-f]{64}$/;
const MODEL_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/;
const THRESHOLDS = Object.freeze({ normal: 0.85, strict: 0.93 });
const MAX_EMBEDDING = 4096;
function clone(frame) {
    checkedFrame(frame);
    return { ...frame, pixels: new Uint8Array(frame.pixels) };
}
function safeVector(vector) {
    if (!Array.isArray(vector) || vector.length < 2 || vector.length > MAX_EMBEDDING) {
        throw new ProRenderError('invalid_embedding', 'Face embedding dimensions are invalid.');
    }
    let peak = 0;
    for (const value of vector) {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            throw new ProRenderError('invalid_embedding', 'Face embedding has a nonfinite value.');
        }
        peak = Math.max(peak, Math.abs(value));
    }
    if (peak === 0)
        throw new ProRenderError('zero_embedding', 'Face embedding is empty.');
    const output = new Float64Array(vector.length);
    let energy = 0;
    for (let index = 0; index < vector.length; index++) {
        const value = vector[index] / peak;
        output[index] = value;
        energy += value * value;
    }
    const inverse = 1 / Math.sqrt(energy);
    for (let index = 0; index < vector.length; index++)
        output[index] *= inverse;
    return output;
}
export function embeddingCosine(a, b) {
    if (a.length !== b.length) {
        throw new ProRenderError('embedding_dimension_changed', 'Embedding size changed.');
    }
    const left = safeVector(a);
    const right = safeVector(b);
    let dot = 0;
    for (let index = 0; index < left.length; index++)
        dot += left[index] * right[index];
    return Math.max(-1, Math.min(1, dot));
}
export function identityMeter(cosine) {
    if (!Number.isFinite(cosine) || cosine < -1 || cosine > 1) {
        throw new ProRenderError('invalid_similarity', 'Identity similarity is not finite.');
    }
    return Math.max(0, Math.min(100, Math.floor(Math.max(0, cosine) * 100 + 0.5)));
}
export function checkIdentityEvidence(evidence, sourcePolicy, allowSyntheticTests = false) {
    if (evidence === null || typeof evidence !== 'object' ||
        evidence.format !== 'beljour-identity-evidence/1') {
        throw new ProRenderError('invalid_identity_evidence', 'Identity model evidence is invalid.');
    }
    const reasons = [];
    if (!MODEL_ID.test(evidence.modelId))
        reasons.push('model_id_missing');
    if (!LICENCES.has(evidence.codeLicence))
        reasons.push('implementation_licence_pending');
    if (evidence.syntheticOnly) {
        if (!allowSyntheticTests)
            reasons.push('synthetic_embedder_not_production');
        if (evidence.sha256 !== null || evidence.weightsLicence !== null) {
            reasons.push('synthetic_embedder_weights_invalid');
        }
    }
    else {
        if (!LICENCES.has(evidence.weightsLicence ?? ''))
            reasons.push('weights_licence_pending');
        if (evidence.sha256 === null || !SHA256.test(evidence.sha256)) {
            reasons.push('weights_pin_missing');
        }
        if (!Array.isArray(evidence.trainingSources) || evidence.trainingSources.length === 0) {
            reasons.push('training_lineage_missing');
        }
        if (sourcePolicy === null)
            reasons.push('central_source_policy_missing');
        if (!evidence.independentCommercialReview)
            reasons.push('commercial_approval_missing');
        if (!evidence.independentRealFaceReview)
            reasons.push('identity_qualification_missing');
    }
    if (!Array.isArray(evidence.trainingSources) || evidence.trainingSources.length > 256) {
        reasons.push('training_lineage_invalid');
    }
    else {
        for (const source of evidence.trainingSources) {
            if (typeof source?.label !== 'string' || source.label.length < 1 ||
                source.label.length > 100 || !source.documentedRights || !source.reviewedLineage) {
                reasons.push('training_lineage_unverified');
                continue;
            }
            try {
                if (sourcePolicy !== null && !sourcePolicy(source.label)) {
                    reasons.push('training_source_unapproved');
                }
            }
            catch {
                reasons.push('training_source_unapproved');
            }
        }
    }
    const unique = [...new Set(reasons)];
    return {
        status: unique.length > 0 ? 'blocked' : evidence.syntheticOnly ? 'test_only' : 'ready',
        reasons: unique,
        modelEvidenceKey: unique.length > 0 ? null :
            `${evidence.modelId}:${evidence.sha256 ?? 'synthetic'}`,
        externalApprovalRequired: true,
    };
}
/** Deterministic nearest-neighbour source alignment for already accepted pixels. */
export function alignIdentityReference(original, candidate) {
    checkedFrame(original);
    checkedFrame(candidate);
    if (original.channels !== candidate.channels) {
        throw new ProRenderError('identity_channels', 'Identity frame channels are incompatible.');
    }
    if (original.width === candidate.width && original.height === candidate.height) {
        const aligned = clone(original);
        if (aligned.channels === 4) {
            for (let index = 3; index < aligned.pixels.length; index += 4) {
                aligned.pixels[index] = candidate.pixels[index];
            }
        }
        return aligned;
    }
    const pixels = new Uint8Array(candidate.width * candidate.height * candidate.channels);
    for (let y = 0; y < candidate.height; y++) {
        const sourceY = Math.min(original.height - 1, Math.floor((y + 0.5) * original.height / candidate.height));
        for (let x = 0; x < candidate.width; x++) {
            const sourceX = Math.min(original.width - 1, Math.floor((x + 0.5) * original.width / candidate.width));
            const from = (sourceY * original.width + sourceX) * original.channels;
            const to = (y * candidate.width + x) * candidate.channels;
            for (let channel = 0; channel < candidate.channels; channel++) {
                pixels[to + channel] = channel === 3 ? candidate.pixels[to + channel] :
                    original.pixels[from + channel];
            }
        }
    }
    return { width: candidate.width, height: candidate.height,
        channels: candidate.channels, pixels };
}
export function blendIdentityReference(reference, edited, fraction) {
    checkedFrame(reference);
    checkedFrame(edited);
    if (reference.width !== edited.width || reference.height !== edited.height ||
        reference.channels !== edited.channels || !Number.isFinite(fraction) ||
        fraction < 0 || fraction > 1) {
        throw new ProRenderError('identity_blend_invalid', 'Identity blend frames are incompatible.');
    }
    const pixels = new Uint8Array(reference.pixels.length);
    for (let offset = 0; offset < pixels.length; offset++) {
        if (reference.channels === 4 && offset % 4 === 3) {
            pixels[offset] = edited.pixels[offset];
        }
        else {
            const mixed = reference.pixels[offset] * (1 - fraction) + edited.pixels[offset] * fraction;
            pixels[offset] = Math.max(0, Math.min(255, Math.round(mixed)));
        }
    }
    return { width: edited.width, height: edited.height, channels: edited.channels, pixels };
}
export class ApprovedEmbeddingIdentityPort {
    backend;
    modelEvidenceKey;
    testOnly;
    constructor(backend, evidence, sourcePolicy, options = {}) {
        this.backend = backend;
        if (typeof backend?.embed !== 'function') {
            throw new ProRenderError('identity_model_unavailable', 'No face embedder was supplied.');
        }
        const result = checkIdentityEvidence(evidence, sourcePolicy, options.allowSyntheticTests ?? false);
        if (result.status === 'blocked' || result.modelEvidenceKey === null) {
            throw new ProRenderError('identity_model_unavailable', `Identity evidence is incomplete: ${result.reasons.join(', ')}`);
        }
        this.modelEvidenceKey = result.modelEvidenceKey;
        this.testOnly = result.status === 'test_only';
        this.aligner = options.aligner ?? alignIdentityReference;
    }
    aligner;
    async descriptor(frame) {
        try {
            const result = await this.backend.embed(clone(frame));
            safeVector(result);
            return result;
        }
        catch (error) {
            if (error instanceof ProRenderError)
                throw error;
            throw new ProRenderError('identity_embedder_failed', 'Identity model could not measure the photo.');
        }
    }
    async enforce(original, edited, policy) {
        checkedFrame(original);
        checkedFrame(edited);
        if (!policy.enabled) {
            throw new ProRenderError('identity_policy_disabled', 'Identity checks need an enabled policy.');
        }
        if (policy.mode === 'warn' && !policy.explicit_user_override) {
            throw new ProRenderError('identity_override_required', 'Warning mode requires user confirmation.');
        }
        if (original.channels !== edited.channels) {
            throw new ProRenderError('identity_channels', 'Identity channels changed.');
        }
        const baseline = await this.descriptor(original);
        const candidate = await this.descriptor(edited);
        const similarity = embeddingCosine(baseline, candidate);
        const minimum = THRESHOLDS[policy.strength];
        if (similarity >= minimum) {
            return { frame: clone(edited), identityMatch: identityMeter(similarity),
                status: 'kept', syntheticOnly: this.testOnly };
        }
        if (policy.mode === 'block') {
            throw new ProRenderError('identity_blocked', 'This edit exceeds the selected identity limit.');
        }
        if (policy.mode === 'warn') {
            return { frame: clone(edited), identityMatch: identityMeter(similarity),
                status: 'warned', syntheticOnly: this.testOnly };
        }
        const reference = checkedFrame(this.aligner(original, edited));
        if (reference.width !== edited.width || reference.height !== edited.height ||
            reference.channels !== edited.channels) {
            throw new ProRenderError('identity_alignment_invalid', 'Identity alignment changed dimensions.');
        }
        const referenceScore = embeddingCosine(baseline, await this.descriptor(reference));
        if (referenceScore < minimum) {
            throw new ProRenderError('identity_alignment_unproven', 'Original cannot be compared reliably after resizing.');
        }
        let best = reference;
        let bestScore = referenceScore;
        let bestFraction = 0;
        let upper = 1;
        for (let index = 1; index <= 12; index++) {
            const fraction = 1 - index / 12;
            if (fraction <= 0)
                break;
            const trial = blendIdentityReference(reference, edited, fraction);
            const score = embeddingCosine(baseline, await this.descriptor(trial));
            if (score >= minimum) {
                best = trial;
                bestScore = score;
                bestFraction = fraction;
                break;
            }
            upper = fraction;
        }
        let lower = bestFraction;
        for (let index = 0; index < 14; index++) {
            const middle = (lower + upper) / 2;
            const trial = blendIdentityReference(reference, edited, middle);
            const score = embeddingCosine(baseline, await this.descriptor(trial));
            if (score >= minimum) {
                lower = middle;
                best = trial;
                bestScore = score;
                bestFraction = middle;
            }
            else {
                upper = middle;
            }
        }
        const final = embeddingCosine(baseline, await this.descriptor(best));
        if (final < minimum || !Number.isFinite(bestScore)) {
            throw new ProRenderError('identity_unstable', 'Identity protection could not be verified.');
        }
        return { frame: clone(best), identityMatch: identityMeter(final),
            status: bestFraction === 0 ? 'restored' : 'softened', syntheticOnly: this.testOnly };
    }
}

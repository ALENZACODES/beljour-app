/** Local-only SHA-pinned identity runtime admission.
 * The selected model, training rights and holdout result must be approved by
 * the product owner before a real portrait can use this path. Model bytes are
 * supplied explicitly by the host; this file performs no network requests.
 * Author: John Khan.
 */
import { ApprovedEmbeddingIdentityPort, checkIdentityEvidence, } from './identity-admission.js';
import { ProRenderError } from './runtime.js';
const MAX_MODEL_BYTES = 64 * 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/;
export async function sha256Local(bytes, hash = globalThis.crypto?.subtle ?? null) {
    if (!(bytes instanceof Uint8Array) || bytes.length === 0 ||
        bytes.length > MAX_MODEL_BYTES) {
        throw new ProRenderError('identity_weights_size', 'Local model bytes exceed the allowed bounds.');
    }
    if (hash === null || typeof hash.digest !== 'function') {
        throw new ProRenderError('identity_crypto_unavailable', 'Local SHA-256 hashing is unavailable.');
    }
    let output;
    try {
        const copied = new Uint8Array(bytes);
        output = await hash.digest('SHA-256', copied.buffer);
    }
    catch {
        throw new ProRenderError('identity_crypto_failed', 'Local SHA-256 verification failed.');
    }
    if (!(output instanceof ArrayBuffer) || output.byteLength !== 32) {
        throw new ProRenderError('identity_crypto_failed', 'SHA-256 result has an invalid size.');
    }
    return Array.from(new Uint8Array(output), byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function loadVerifiedIdentityRuntime(weights, evidence, policy, factory, hash = globalThis.crypto?.subtle ?? null) {
    const approval = checkIdentityEvidence(evidence, policy);
    if (approval.status !== 'ready' || approval.modelEvidenceKey === null) {
        throw new ProRenderError('identity_model_unavailable', `Identity evidence is incomplete: ${approval.reasons.join(', ')}`);
    }
    if (weights.length < 1 || weights.length > MAX_MODEL_BYTES ||
        evidence.sha256 === null || !SHA256.test(evidence.sha256)) {
        throw new ProRenderError('identity_weights_size', 'Approved model asset size is invalid.');
    }
    if (typeof factory?.create !== 'function') {
        throw new ProRenderError('identity_backend_unavailable', 'A verified local model runtime is required.');
    }
    const digest = await sha256Local(weights, hash);
    if (digest !== evidence.sha256) {
        throw new ProRenderError('identity_weights_mismatch', 'The local model checksum did not match.');
    }
    let backend;
    const copy = new Uint8Array(weights);
    try {
        backend = await factory.create(copy);
    }
    catch {
        throw new ProRenderError('identity_backend_failed', 'The local model could not initialize.');
    }
    finally {
        copy.fill(0);
    }
    if (typeof backend?.embed !== 'function') {
        throw new ProRenderError('identity_backend_unavailable', 'The local model has no embedding function.');
    }
    return {
        port: new ApprovedEmbeddingIdentityPort(backend, evidence, policy),
        asset: {
            expectedBytes: weights.length,
            actualSha256: digest,
            modelEvidenceKey: approval.modelEvidenceKey,
            declarationsAccepted: true,
        },
    };
}

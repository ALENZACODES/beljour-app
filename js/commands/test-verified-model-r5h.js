import { loadVerifiedIdentityRuntime, sha256Local } from './verified-model.js';
import { ProRenderError } from './runtime.js';
function check(value, name) {
    if (!value)
        throw new Error(`verified-model ${name}`);
}
async function reject(code, task) {
    try {
        await task();
    }
    catch (error) {
        if (error instanceof ProRenderError && error.code === code)
            return;
        throw error;
    }
    throw new Error(`verified-model ${code} expected`);
}
const DIGEST = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const WEIGHTS = new Uint8Array([97, 98, 99]);
function approval() {
    return {
        format: 'beljour-identity-evidence/1', modelId: 'local-pin',
        codeLicence: 'MIT', weightsLicence: 'Apache-2.0', sha256: DIGEST,
        trainingSources: [{ label: 'released-source', documentedRights: true, reviewedLineage: true }],
        independentCommercialReview: true, independentRealFaceReview: true, syntheticOnly: false,
    };
}
export async function testVerifiedModelR5H() {
    let count = 0;
    check(await sha256Local(WEIGHTS) === DIGEST, 'known SHA-256 vector');
    count++;
    let creationCount = 0;
    let retainedView = null;
    const factory = {
        async create(bytes) {
            creationCount++;
            check(bytes.join(',') === '97,98,99', 'factory receives verified bytes');
            retainedView = bytes;
            return { async embed() { return [1, 0.3]; } };
        },
    };
    const result = await loadVerifiedIdentityRuntime(WEIGHTS, approval(), name => name === 'released-source', factory);
    check(retainedView !== null && retainedView.every(item => item === 0), 'temporary model byte copy erased');
    check(creationCount === 1, 'runtime created once');
    check(result.asset.actualSha256 === DIGEST, 'checksum retained in metadata');
    check(result.asset.expectedBytes === 3, 'asset length measured');
    check(result.asset.declarationsAccepted, 'documented declarations accepted');
    check(result.port.modelEvidenceKey.includes(DIGEST), 'verified guard binds to model pin');
    check(WEIGHTS.join(',') === '97,98,99', 'caller source bytes not modified');
    count += 7;
    await reject('identity_weights_mismatch', () => loadVerifiedIdentityRuntime(WEIGHTS, { ...approval(), sha256: 'a'.repeat(64) }, name => name === 'released-source', factory));
    check(creationCount === 1, 'hash mismatch cannot load model');
    count += 2;
    await reject('identity_model_unavailable', () => loadVerifiedIdentityRuntime(WEIGHTS, { ...approval(), independentCommercialReview: false }, name => name === 'released-source', factory));
    await reject('identity_model_unavailable', () => loadVerifiedIdentityRuntime(WEIGHTS, approval(), () => false, factory));
    check(creationCount === 1, 'uncleared source cannot load model');
    count += 3;
    await reject('identity_weights_size', () => sha256Local(new Uint8Array()));
    await reject('identity_crypto_unavailable', () => sha256Local(WEIGHTS, null));
    count += 2;
    const failingFactory = {
        async create() { throw new Error('local initialization failed'); },
    };
    await reject('identity_backend_failed', () => loadVerifiedIdentityRuntime(WEIGHTS, approval(), () => true, failingFactory));
    count++;
    const wrongFactory = {
        async create() {
            return {};
        },
    };
    await reject('identity_backend_unavailable', () => loadVerifiedIdentityRuntime(WEIGHTS, approval(), () => true, wrongFactory));
    count++;
    return count;
}
//# sourceMappingURL=test-verified-model-r5h.js.map
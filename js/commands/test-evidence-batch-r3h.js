/** Strict aggregate evidence tests; every observation is synthetic numeric data.
 * Author: John Khan.
 */
import { collectEvidence, decodeShardEvidence, decodeShardJson } from './evidence-batch.js';
import { decodeGate } from './quality-gate-r3h.js';
import { ProRenderError } from './runtime.js';
const MANIFEST = 'a'.repeat(64);
const DEFINITION = 'b'.repeat(64);
function check(condition, description) {
    if (!condition)
        throw new Error(`Evidence batch: ${description}`);
}
function expectError(code, action) {
    try {
        action();
    }
    catch (error) {
        check(error instanceof ProRenderError && error.code === code, `expected ${code}`);
        return;
    }
    throw new Error(`Expected ${code}`);
}
function gate() {
    return decodeGate({ version: 'beljour-pro-quality-gate/1',
        command: 'studioquality', minimum_faces: 100000,
        required_labels: ['source', 'skin_tone', 'gender'],
        metrics: [
            { name: 'psnr_db', comparison: 'at_least', threshold: 25, unit: 'dB' },
            { name: 'artifact_fraction', comparison: 'at_most', threshold: 0.05, unit: 'ratio' },
        ], assumptions: true });
}
function syntheticShard(index) {
    return decodeShardEvidence({ version: 'beljour-pro-aggregate-shard/1',
        run_id: 'test-run-001', manifest_sha256: MANIFEST, definition_sha256: DEFINITION,
        command: 'studioquality', shard: index, shard_count: 2,
        expected: 50000, seen: 50000, eligible: 50000, errors: 0,
        labels: ['source', 'skin_tone', 'gender'],
        readings: [
            { metric: 'psnr_db', count: 50000, total: 1500000, lowest: 29, highest: 31 },
            { metric: 'artifact_fraction', count: 50000, total: 1000, lowest: 0.01, highest: 0.03 },
        ], human_review_complete: true });
}
function asWire(shard) {
    return { version: shard.version, run_id: shard.runId,
        manifest_sha256: shard.manifestSha256, definition_sha256: shard.definitionSha256,
        command: shard.command, shard: shard.shard, shard_count: shard.shardCount,
        expected: shard.expected, seen: shard.seen, eligible: shard.eligible,
        errors: shard.errors, labels: [...shard.labels], human_review_complete: shard.humanReviewComplete,
        readings: shard.readings.map((entry) => ({ ...entry })) };
}
export function testProEvidenceBatch() {
    let count = 0;
    const first = syntheticShard(0);
    const second = syntheticShard(1);
    const complete = collectEvidence(gate(), [first, second], DEFINITION, MANIFEST);
    check(complete.status === 'unproven' && complete.releaseQualified === false, 'numeric success does not certify release');
    check(complete.expectedTotal === 100000 && complete.seenTotal === 100000, '100k population explicitly recorded');
    check(complete.missing.length === 1 &&
        complete.missing[0] === 'external_release_verdict_not_supplied', 'independent external gate mandatory');
    check(complete.metrics[0]?.average === 30 && complete.metrics[1]?.average === 0.02, 'weighted means computed');
    count += 4;
    check(JSON.stringify(complete) === JSON.stringify(collectEvidence(gate(), [second, first], DEFINITION, MANIFEST)), 'order-independent rollup');
    count++;
    const partial = collectEvidence(gate(), [first], DEFINITION, MANIFEST);
    check(partial.missingShards.length === 1 && partial.missingShards[0] === 1, 'missing shards cannot disappear');
    count++;
    const noReview = decodeShardEvidence({ ...asWire(second), human_review_complete: false });
    check(collectEvidence(gate(), [first, noReview], DEFINITION, MANIFEST)
        .missing.includes('independent_review_missing'), 'review evidence required');
    count++;
    const labelsGone = decodeShardEvidence({ ...asWire(second), labels: ['source'] });
    check(collectEvidence(gate(), [first, labelsGone], DEFINITION, MANIFEST)
        .missing.includes('label:gender'), 'no inferred group label');
    count++;
    const incomplete = decodeShardEvidence({ ...asWire(second), seen: 49999,
        eligible: 49999, readings: [
            { metric: 'psnr_db', count: 49999, total: 49999 * 30, lowest: 29, highest: 31 },
            { metric: 'artifact_fraction', count: 49999, total: 49999 * 0.02,
                lowest: 0.01, highest: 0.03 },
        ] });
    check(collectEvidence(gate(), [first, incomplete], DEFINITION, MANIFEST)
        .missing.includes('incomplete_shard'), 'partial progress is not complete');
    count++;
    const bad = decodeShardEvidence({ ...asWire(second), readings: [
            { metric: 'psnr_db', count: 50000, total: 750000, lowest: 14, highest: 16 },
            { metric: 'artifact_fraction', count: 50000, total: 6000, lowest: 0.11, highest: 0.13 },
        ] });
    const failure = collectEvidence(gate(), [first, bad], DEFINITION, MANIFEST);
    check(failure.status === 'fail' && failure.failed.includes('metric:psnr_db') &&
        failure.failed.includes('metric:artifact_fraction'), 'bad metrics fail');
    count++;
    expectError('duplicate_shard', () => collectEvidence(gate(), [first, first], DEFINITION, MANIFEST));
    count++;
    expectError('invalid_evidence', () => collectEvidence(gate(), [first,
        decodeShardEvidence({ ...asWire(second), manifest_sha256: 'c'.repeat(64) })], DEFINITION, MANIFEST));
    count++;
    expectError('invalid_evidence', () => decodeShardEvidence({ ...asWire(first),
        image_path: '/outside-repo/private.jpg' }));
    count++;
    expectError('invalid_evidence', () => decodeShardEvidence({ ...asWire(first), seen: true }));
    count++;
    expectError('invalid_evidence', () => decodeShardEvidence({ ...asWire(first), readings: [
            { metric: 'psnr_db', count: 50000, total: Infinity, lowest: 12, highest: 30 },
        ] }));
    count++;
    expectError('invalid_evidence', () => decodeShardJson(' '.repeat(33000)));
    count++;
    expectError('invalid_evidence', () => decodeShardJson('{invalid json'));
    count++;
    const wire = asWire(first);
    check(decodeShardJson(JSON.stringify(wire)).shard === 0, 'round-trip JSON');
    count++;
    check(JSON.stringify(complete).indexOf('image_path') === -1, 'no file metadata');
    count++;
    expectError('invalid_evidence', () => decodeShardEvidence({ ...asWire(first),
        expected: 10_000_001 }));
    count++;
    const huge = (index) => decodeShardEvidence({ ...asWire(syntheticShard(index)),
        readings: [
            { metric: 'psnr_db', count: 1, total: 1e308, lowest: 1e308, highest: 1e308 },
            { metric: 'artifact_fraction', count: 50000, total: 1000, lowest: 0.01, highest: 0.03 },
        ],
    });
    expectError('invalid_evidence', () => collectEvidence(gate(), [huge(0), huge(1)], DEFINITION, MANIFEST));
    count++;
    return count;
}
//# sourceMappingURL=test-evidence-batch-r3h.js.map
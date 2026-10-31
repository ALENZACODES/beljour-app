import { ProRenderError } from './runtime.js';
const SHA = /^[a-f0-9]{64}$/;
const RUN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const METRIC = /^[a-z][a-z0-9_]{0,79}$/;
const COMMANDS = new Set(['enhance', 'denoise', 'upscale', 'studioquality', 'poseonly']);
function object(raw, keys) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw) ||
        JSON.stringify(Object.keys(raw).sort()) !== JSON.stringify([...keys].sort())) {
        throw new ProRenderError('invalid_evidence', 'Aggregate evidence fields are invalid.');
    }
    return raw;
}
function integer(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
    if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) {
        throw new ProRenderError('invalid_evidence', 'Aggregate counts must be bounded integers.');
    }
    return Number(value);
}
function reading(raw) {
    const entry = object(raw, ['metric', 'count', 'total', 'lowest', 'highest']);
    if (typeof entry.metric !== 'string' || !METRIC.test(entry.metric) ||
        typeof entry.total !== 'number' || !Number.isFinite(entry.total) ||
        typeof entry.lowest !== 'number' || !Number.isFinite(entry.lowest) ||
        typeof entry.highest !== 'number' || !Number.isFinite(entry.highest)) {
        throw new ProRenderError('invalid_evidence', 'Aggregate metric values are invalid.');
    }
    const count = integer(entry.count, 1);
    const mean = entry.total / count;
    if (entry.lowest > entry.highest ||
        mean < entry.lowest - 1e-9 || mean > entry.highest + 1e-9) {
        throw new ProRenderError('invalid_evidence', 'Metric aggregate is inconsistent.');
    }
    return Object.freeze({
        metric: entry.metric, count, total: entry.total,
        lowest: entry.lowest, highest: entry.highest,
    });
}
export function decodeShardEvidence(raw) {
    const entry = object(raw, [
        'version', 'run_id', 'manifest_sha256', 'definition_sha256', 'command',
        'shard', 'shard_count', 'expected', 'seen', 'eligible', 'errors',
        'labels', 'readings', 'human_review_complete',
    ]);
    if (entry.version !== 'beljour-pro-aggregate-shard/1' ||
        typeof entry.run_id !== 'string' || !RUN.test(entry.run_id) ||
        typeof entry.manifest_sha256 !== 'string' || !SHA.test(entry.manifest_sha256) ||
        typeof entry.definition_sha256 !== 'string' || !SHA.test(entry.definition_sha256) ||
        typeof entry.command !== 'string' || !COMMANDS.has(entry.command) ||
        typeof entry.human_review_complete !== 'boolean' ||
        !Array.isArray(entry.labels) || !Array.isArray(entry.readings)) {
        throw new ProRenderError('invalid_evidence', 'Shard identifiers or fields are invalid.');
    }
    const shardCount = integer(entry.shard_count, 1, 4096);
    const shard = integer(entry.shard, 0, shardCount - 1);
    const expected = integer(entry.expected, 1, 10_000_000);
    const seen = integer(entry.seen, 0, expected);
    const eligible = integer(entry.eligible, 0, seen);
    const errors = integer(entry.errors, 0, seen);
    if (eligible + errors > seen) {
        throw new ProRenderError('invalid_evidence', 'Shard cases are double counted.');
    }
    const labels = entry.labels;
    if (labels.length > 64 || labels.some((label) => typeof label !== 'string' ||
        !METRIC.test(label)) || new Set(labels).size !== labels.length ||
        entry.readings.length > 64) {
        throw new ProRenderError('invalid_evidence', 'Shard metadata is invalid.');
    }
    const readings = entry.readings.map(reading);
    if (new Set(readings.map((item) => item.metric)).size !== readings.length ||
        readings.some((item) => item.count > eligible)) {
        throw new ProRenderError('invalid_evidence', 'Metric coverage is not consistent.');
    }
    return Object.freeze({
        version: 'beljour-pro-aggregate-shard/1',
        runId: entry.run_id,
        manifestSha256: entry.manifest_sha256,
        definitionSha256: entry.definition_sha256,
        command: entry.command,
        shard, shardCount, expected, seen, eligible, errors,
        labels: Object.freeze([...labels]), readings: Object.freeze(readings),
        humanReviewComplete: entry.human_review_complete,
    });
}
export function decodeShardJson(json) {
    if (typeof json !== 'string' || new TextEncoder().encode(json).length > 32_768) {
        throw new ProRenderError('invalid_evidence', 'Evidence JSON exceeds its safe size.');
    }
    let data;
    try {
        data = JSON.parse(json);
    }
    catch {
        throw new ProRenderError('invalid_evidence', 'Evidence JSON is malformed.');
    }
    return decodeShardEvidence(data);
}
function rollup(name, shards) {
    const values = shards.flatMap((shard) => shard.readings.filter((item) => item.metric === name));
    if (values.length === 0) {
        return { name, count: 0, average: null, lowest: null, highest: null };
    }
    const count = values.reduce((sum, value) => sum + value.count, 0);
    const total = values.reduce((sum, value) => sum + value.total, 0);
    if (!Number.isFinite(total) || !Number.isSafeInteger(count)) {
        throw new ProRenderError('invalid_evidence', 'Metric aggregate overflowed.');
    }
    return { name, count, average: total / count,
        lowest: Math.min(...values.map((value) => value.lowest)),
        highest: Math.max(...values.map((value) => value.highest)) };
}
export function collectEvidence(definition, shards, definitionSha256, manifestSha256) {
    if (!SHA.test(definitionSha256) || !SHA.test(manifestSha256) ||
        shards.length < 1 || shards.length > 4096) {
        throw new ProRenderError('invalid_evidence', 'Evidence digests or shard count are invalid.');
    }
    const ordered = [...shards].sort((a, b) => a.shard - b.shard);
    const first = ordered[0];
    if (first === undefined) {
        throw new ProRenderError('invalid_evidence', 'At least one shard is required.');
    }
    const indexes = new Set();
    for (const shard of ordered) {
        if (shard.runId !== first.runId || shard.command !== definition.command ||
            shard.manifestSha256 !== manifestSha256 || shard.definitionSha256 !== definitionSha256 ||
            shard.shardCount !== first.shardCount) {
            throw new ProRenderError('invalid_evidence', 'Evidence identity is inconsistent.');
        }
        if (indexes.has(shard.shard)) {
            throw new ProRenderError('duplicate_shard', 'The same evidence shard appeared twice.');
        }
        indexes.add(shard.shard);
    }
    const missingShards = [];
    for (let i = 0; i < first.shardCount; i++) {
        if (!indexes.has(i))
            missingShards.push(i);
    }
    const expectedTotal = ordered.reduce((sum, value) => sum + value.expected, 0);
    const seenTotal = ordered.reduce((sum, value) => sum + value.seen, 0);
    const eligibleTotal = ordered.reduce((sum, value) => sum + value.eligible, 0);
    const errorTotal = ordered.reduce((sum, value) => sum + value.errors, 0);
    const missing = [];
    const failed = [];
    if (missingShards.length > 0)
        missing.push('missing_shards');
    if (ordered.some((shard) => shard.seen !== shard.expected ||
        shard.eligible + shard.errors !== shard.seen))
        missing.push('incomplete_shard');
    if (expectedTotal < definition.minimumFaces || seenTotal < definition.minimumFaces) {
        missing.push('frozen_population_incomplete');
    }
    if (ordered.some((shard) => !shard.humanReviewComplete)) {
        missing.push('independent_review_missing');
    }
    for (const label of definition.requiredLabels) {
        if (ordered.some((shard) => !shard.labels.includes(label)))
            missing.push(`label:${label}`);
    }
    const metrics = definition.metrics.map((limit) => rollup(limit.name, ordered));
    for (const [index, limit] of definition.metrics.entries()) {
        const measurement = metrics[index];
        if (measurement === undefined)
            continue;
        if (measurement.average === null || measurement.count < eligibleTotal) {
            missing.push(`metric:${limit.name}`);
        }
        if (measurement.average !== null && !(limit.comparison === 'at_least' ?
            measurement.average >= limit.threshold : measurement.average <= limit.threshold)) {
            failed.push(`metric:${limit.name}`);
        }
    }
    missing.push('external_release_verdict_not_supplied');
    return Object.freeze({
        version: 'beljour-pro-evidence-report/1',
        status: failed.length > 0 ? 'fail' : 'unproven',
        runId: first.runId, command: first.command,
        expectedTotal, seenTotal, eligibleTotal, errorTotal,
        shardsPresent: ordered.length, shardsExpected: first.shardCount,
        missingShards, missing, failed, metrics, releaseQualified: false,
    });
}

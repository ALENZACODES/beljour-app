/** Tuesday lock supplement: 1080/4K tiers × all 41 strength steps.
 * The original 205-command evidence is bound by checksum and unchanged.
 * Raw photographs, landmarks and embeddings must never enter this packet.
 * Author: John Khan.
 */
import { TIER_LONG_EDGES, checkedTier } from './quality-tiers.js';
import { ProRenderError } from './runtime.js';
import { verifyTuesdayLockJson } from './tuesday-lock.js';
export const TIER_MATRIX_VERSION = 'beljour-tuesday-quality-tiers/1';
function reject(reason) {
    throw new ProRenderError('invalid_tier_evidence', reason);
}
function canonical(value) {
    if (value === null || typeof value !== 'object')
        return JSON.stringify(value);
    if (Array.isArray(value))
        return `[${value.map(canonical).join(',')}]`;
    const record = value;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
}
async function digest(value) {
    if (typeof crypto === 'undefined' || crypto.subtle === undefined) {
        return reject('Local SHA-256 is required for tier evidence.');
    }
    const bytes = new TextEncoder().encode(canonical(value));
    const hashed = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(hashed)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
function validNumeric(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
function checkedObservation(value) {
    checkedTier(value.tier);
    if (!Number.isInteger(value.levelTenths) || value.levelTenths < 10 ||
        value.levelTenths > 50 ||
        [value.sourceWidth, value.sourceHeight, value.outputWidth,
            value.outputHeight].some((number) => !Number.isSafeInteger(number) || number < 1) ||
        (value.factor !== 2 && value.factor !== 4) ||
        !validNumeric(value.previewMs) || !validNumeric(value.exportMs) ||
        !Number.isSafeInteger(value.guardedPreviewSteps) || value.guardedPreviewSteps < 0 ||
        !Number.isSafeInteger(value.guardedExportSteps) || value.guardedExportSteps < 0 ||
        [value.cleanupFirst, value.identityLockOn, value.neutralReferenceExact,
            value.measuredDevice].some((flag) => typeof flag !== 'boolean')) {
        reject('Tier observation is malformed.');
    }
}
export function tierFindings(value) {
    checkedObservation(value);
    const problems = [];
    if (!value.cleanupFirst)
        problems.push('cleanup_missing');
    if (!value.identityLockOn || Math.min(value.guardedPreviewSteps, value.guardedExportSteps) < 2)
        problems.push('identity_not_proved');
    if (value.outputWidth !== value.sourceWidth * value.factor ||
        value.outputHeight !== value.sourceHeight * value.factor) {
        problems.push('scale_mismatch');
    }
    if (value.outputWidth * value.sourceHeight !== value.outputHeight * value.sourceWidth) {
        problems.push('aspect_mismatch');
    }
    if (Math.max(value.outputWidth, value.outputHeight) < TIER_LONG_EDGES[value.tier]) {
        problems.push('tier_shortfall');
    }
    if (value.outputWidth * value.outputHeight > 24_000_000)
        problems.push('capacity_exceeded');
    if (value.levelTenths === 10 && !value.neutralReferenceExact) {
        problems.push('neutral_reference_mismatch');
    }
    return Object.freeze([...new Set(problems)]);
}
function observedRow(value, previewBudget, exportBudget) {
    const findings = tierFindings(value);
    const slow = value.previewMs > previewBudget || value.exportMs > exportBudget;
    const status = findings.length > 0 ? 'failed_safety' :
        slow ? 'over_budget' : value.measuredDevice ? 'device_checked' : 'synthetic_checked';
    return { tier: value.tier, level_tenths: value.levelTenths, status,
        minimum_long_edge: TIER_LONG_EDGES[value.tier],
        source_width: value.sourceWidth, source_height: value.sourceHeight,
        output_width: value.outputWidth, output_height: value.outputHeight,
        scale: value.factor, preview_ms: value.previewMs, export_ms: value.exportMs,
        cleanup_first: value.cleanupFirst, identity_lock_on: value.identityLockOn,
        guarded_preview_steps: value.guardedPreviewSteps,
        guarded_export_steps: value.guardedExportSteps,
        neutral_reference_exact: value.neutralReferenceExact,
        measured_device: value.measuredDevice, findings };
}
function missingRow(tier, level) {
    return { tier, level_tenths: level, status: 'missing',
        minimum_long_edge: TIER_LONG_EDGES[tier],
        source_width: null, source_height: null, output_width: null, output_height: null,
        scale: null, preview_ms: null, export_ms: null, cleanup_first: null,
        identity_lock_on: null, guarded_preview_steps: null, guarded_export_steps: null,
        neutral_reference_exact: null, measured_device: null,
        findings: ['evidence_missing'] };
}
export function observationFromTierRuns(preview, exported, neutralReferenceExact, measuredDevice = false) {
    if (preview.quality !== 'preview' || exported.quality !== 'export' ||
        canonical(preview.plan.proPlan) !== canonical(exported.plan.proPlan) ||
        preview.plan.sourceWidth !== exported.plan.sourceWidth ||
        preview.plan.sourceHeight !== exported.plan.sourceHeight) {
        return reject('Tier preview and export must be actual executions of one plan.');
    }
    if (preview.guardedStepCount !== preview.plan.proPlan.steps.length ||
        exported.guardedStepCount !== exported.plan.proPlan.steps.length) {
        return reject('Tier execution is missing identity decisions.');
    }
    const plan = exported.plan;
    return {
        tier: plan.recipe.tier, levelTenths: plan.recipe.upscaleLevel,
        sourceWidth: plan.sourceWidth, sourceHeight: plan.sourceHeight,
        outputWidth: exported.result.image.width, outputHeight: exported.result.image.height,
        factor: plan.upscaleFactor, previewMs: preview.elapsedMs,
        exportMs: exported.elapsedMs,
        cleanupFirst: plan.proPlan.steps[0]?.name === 'cleanup',
        identityLockOn: plan.proPlan.identity.enabled,
        guardedPreviewSteps: preview.guardedStepCount,
        guardedExportSteps: exported.guardedStepCount,
        neutralReferenceExact, measuredDevice,
    };
}
export async function buildTierMatrix(observations, originalTuesdayJson, runId, rendererBuild, previewBudgetMs = 100, exportBudgetMs = 2000) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(runId) ||
        !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(rendererBuild) ||
        !validNumeric(previewBudgetMs) || previewBudgetMs <= 0 ||
        !validNumeric(exportBudgetMs) || exportBudgetMs <= 0) {
        reject('Tier packet input or timing budget is invalid.');
    }
    const original = await verifyTuesdayLockJson(originalTuesdayJson);
    if (original.run_id !== runId || original.renderer_build !== rendererBuild) {
        reject('Tier evidence must bind to the same Tuesday run and build.');
    }
    const lookup = new Map();
    for (const item of observations) {
        checkedObservation(item);
        const key = `${item.tier}:${item.levelTenths}`;
        if (lookup.has(key))
            reject('Duplicate tier/level receipt is not allowed.');
        lookup.set(key, item);
    }
    const rows = [];
    for (const tier of ['1080', '4k']) {
        for (let level = 10; level <= 50; level++) {
            const value = lookup.get(`${tier}:${level}`);
            rows.push(value === undefined ? missingRow(tier, level) :
                observedRow(value, previewBudgetMs, exportBudgetMs));
        }
    }
    const statuses = new Set(rows.map((row) => row.status));
    const hasSafetyOrTimingFailure = statuses.has('failed_safety') || statuses.has('over_budget');
    const status = hasSafetyOrTimingFailure ? 'blocked' :
        statuses.has('missing') ? 'incomplete' : 'technical_review_required';
    const content = {
        version: TIER_MATRIX_VERSION, run_id: runId, renderer_build: rendererBuild,
        original_tuesday_sha256: original.sha256, tier_count: 2,
        levels_per_tier: 41, supplemental_slots: 82,
        original_command_slots_unchanged: 205,
        preview_budget_ms: previewBudgetMs, export_budget_ms: exportBudgetMs,
        status, rows, independent_realface_result: 'NOT_RUN',
        production_identity_qualified: false, release_qualified: false,
    };
    return { ...content, sha256: await digest(content) };
}
export function serializeTierMatrix(value) {
    return canonical(value);
}
export async function verifyTierMatrix(serialized, originalTuesdayJson) {
    if (typeof serialized !== 'string' || serialized.length > 120_000) {
        return reject('Tier packet is missing or too large.');
    }
    let input;
    try {
        input = JSON.parse(serialized);
    }
    catch {
        return reject('Tier packet is malformed JSON.');
    }
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
        return reject('Tier packet must be a JSON object.');
    }
    const record = input;
    if (record['version'] !== TIER_MATRIX_VERSION || typeof record['sha256'] !== 'string') {
        return reject('Tier packet version or checksum is invalid.');
    }
    const { sha256, ...contents } = record;
    if (sha256 !== await digest(contents))
        return reject('Tier packet checksum mismatch.');
    if (record['supplemental_slots'] !== 82 || record['tier_count'] !== 2 ||
        record['levels_per_tier'] !== 41 || record['original_command_slots_unchanged'] !== 205 ||
        record['independent_realface_result'] !== 'NOT_RUN' ||
        record['production_identity_qualified'] !== false || record['release_qualified'] !== false) {
        return reject('Tier packet cannot weaken required coverage or release restrictions.');
    }
    const rows = record['rows'];
    if (!Array.isArray(rows) || rows.length !== 82)
        return reject('Tier packet must have 82 rows.');
    const readings = [];
    for (const [index, rowValue] of rows.entries()) {
        if (rowValue === null || typeof rowValue !== 'object' || Array.isArray(rowValue)) {
            return reject('Tier row is invalid.');
        }
        const row = rowValue;
        const tier = index < 41 ? '1080' : '4k';
        const level = 10 + (index % 41);
        if (row['tier'] !== tier || row['level_tenths'] !== level) {
            return reject('Tier row order is invalid.');
        }
        if (row['status'] === 'missing') {
            if (canonical(row) !== canonical(missingRow(tier, level))) {
                return reject('Missing rows cannot contain measurements.');
            }
            continue;
        }
        const reading = {
            tier, levelTenths: level, sourceWidth: row['source_width'],
            sourceHeight: row['source_height'],
            outputWidth: row['output_width'],
            outputHeight: row['output_height'],
            factor: row['scale'], previewMs: row['preview_ms'],
            exportMs: row['export_ms'],
            cleanupFirst: row['cleanup_first'],
            identityLockOn: row['identity_lock_on'],
            guardedPreviewSteps: row['guarded_preview_steps'],
            guardedExportSteps: row['guarded_export_steps'],
            neutralReferenceExact: row['neutral_reference_exact'],
            measuredDevice: row['measured_device'],
        };
        if (canonical(row) !== canonical(observedRow(reading, record['preview_budget_ms'], record['export_budget_ms']))) {
            return reject('Tier row safety verdict was modified.');
        }
        readings.push(reading);
    }
    const rebuilt = await buildTierMatrix(readings, originalTuesdayJson, record['run_id'], record['renderer_build'], record['preview_budget_ms'], record['export_budget_ms']);
    if (serializeTierMatrix(rebuilt) !== serialized)
        return reject('Tier packet was not canonical.');
    return rebuilt;
}
export async function tierMatrixCsv(serialized, originalTuesdayJson) {
    const document = await verifyTierMatrix(serialized, originalTuesdayJson);
    const columns = ['tier', 'level_tenths', 'status', 'minimum_long_edge',
        'output_width', 'output_height', 'scale', 'preview_ms', 'export_ms',
        'cleanup_first', 'identity_lock_on', 'guarded_preview_steps',
        'guarded_export_steps', 'neutral_reference_exact', 'measured_device', 'findings'];
    const csv = [columns.join(',')];
    for (const row of document.rows) {
        const fields = row;
        const line = columns.map((name) => {
            const value = fields[name];
            if (value === null || value === undefined)
                return '';
            return name === 'findings' ? value.join(';') : String(value);
        });
        csv.push(line.join(','));
    }
    return `${csv.join('\n')}\n`;
}
//# sourceMappingURL=quality-tier-matrix.js.map
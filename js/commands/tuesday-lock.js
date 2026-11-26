/** Tuesday's 205-slot technical evidence dossier, never a release certificate.
 * The packet records missing and failed observations without images or hashes.
 * Checksums detect corruption, not the authenticity of external evidence.
 * Author: John Khan.
 */
import { evaluateCommandLocks, PRO_COMMAND_NAMES, } from './lock-matrix.js';
import { ProRenderError } from './runtime.js';
export const TUESDAY_PACKET_VERSION = 'beljour-tuesday-command-lock/1';
function refuse(reason) {
    throw new ProRenderError('invalid_lock_packet', reason);
}
function checkedIdentifier(value) {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(value)) {
        return refuse('Lock evidence accepts short, non-sensitive run identifiers only.');
    }
    return value;
}
function canonical(value) {
    if (value === null || typeof value !== 'object')
        return JSON.stringify(value);
    if (Array.isArray(value))
        return `[${value.map(canonical).join(',')}]`;
    const dict = value;
    const members = Object.keys(dict).sort()
        .map((key) => `${JSON.stringify(key)}:${canonical(dict[key])}`);
    return `{${members.join(',')}}`;
}
async function digest(value) {
    if (typeof crypto === 'undefined' || crypto.subtle === undefined) {
        return refuse('Local SHA-256 is required for the technical lock packet.');
    }
    const bytes = new TextEncoder().encode(canonical(value));
    const sum = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(sum)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
function matrixMetadata(report) {
    return {
        version: report.version,
        status: report.status,
        total_checked: report.totalChecked,
        duplicate_rows: report.duplicateRows,
        preview_budget_ms: report.previewBudgetMs,
        export_budget_ms: report.exportBudgetMs,
        complete_five_command_coverage: report.completeFiveCommandCoverage,
        commands: report.findings.map((entry) => ({
            name: entry.command,
            checked_levels: entry.checkedLevels,
            missing_levels: [...entry.missingLevels],
            failed_levels: [...entry.failedLevels],
            timing_limited_levels: [...entry.timingLimitedLevels],
            device_levels: entry.deviceLevels,
        })),
        synthetic_only: report.status !== 'device_measured',
        independent_face_evidence: false,
        release_qualified: false,
    };
}
function blockersFor(report) {
    const result = [];
    for (const finding of report.findings) {
        if (finding.missingLevels.length > 0) {
            result.push(`${finding.command}:missing:${finding.missingLevels.length}`);
        }
        if (finding.failedLevels.length > 0) {
            result.push(`${finding.command}:safety:${finding.failedLevels.length}`);
        }
        if (finding.timingLimitedLevels.length > 0) {
            result.push(`${finding.command}:timing:${finding.timingLimitedLevels.length}`);
        }
    }
    return result;
}
function neutralRow(command, level, observation, failure, slow) {
    const status = observation === null ? 'missing' : failure ? 'failed_safety' :
        slow ? 'over_budget' : observation.measuredDevice ? 'device_checked' : 'synthetic_checked';
    return Object.freeze({ command, level_tenths: level, status,
        preview_ms: observation?.previewMs ?? null, export_ms: observation?.exportMs ?? null,
        identity_applied: observation?.identityApplied ?? null,
        alpha_unchanged: observation?.alphaUnchanged ?? null,
        protected_unchanged: observation?.protectedUnchanged ?? null,
        neutral_correct: observation?.neutralCorrect ?? null,
        skin_lift_l: observation?.skinLiftL ?? null,
        pose_minimum_jacobian: observation?.poseMinimumJacobian ?? null,
        pose_retention: observation?.poseRetention ?? null,
        measured_device: observation?.measuredDevice ?? null });
}
export async function buildTuesdayLockPacket(observations, args) {
    checkedIdentifier(args.runId);
    checkedIdentifier(args.rendererBuild);
    const report = evaluateCommandLocks(observations, args.previewBudgetMs ?? 100, args.exportBudgetMs ?? 2000);
    const lookup = new Map();
    for (const row of observations) {
        const key = `${row.command}:${row.levelTenths}`;
        if (lookup.has(key))
            return refuse('Duplicate lock observations are not admissible.');
        lookup.set(key, row);
    }
    const rows = [];
    for (const finding of report.findings) {
        const failed = new Set(finding.failedLevels);
        const slow = new Set(finding.timingLimitedLevels);
        for (let level = 10; level <= 50; level++) {
            rows.push(neutralRow(finding.command, level, lookup.get(`${finding.command}:${level}`) ?? null, failed.has(level), slow.has(level)));
        }
    }
    if (rows.length !== 205)
        return refuse('A technical lock packet must contain all 205 slots.');
    const bad = rows.some((entry) => entry.status === 'failed_safety' || entry.status === 'over_budget');
    const missing = rows.some((entry) => entry.status === 'missing');
    const technicalStatus = bad ? 'blocked' : missing ? 'incomplete' : 'technical_review_required';
    const content = { version: TUESDAY_PACKET_VERSION, run_id: args.runId,
        renderer_build: args.rendererBuild, level_count: 41,
        command_count: 5, total_slots: 205,
        technical_status: technicalStatus,
        matrix: matrixMetadata(report), rows, blockers: blockersFor(report),
        independent_realface_result: 'NOT_RUN',
        production_identity_qualified: false, release_qualified: false };
    return Object.freeze({ ...content, sha256: await digest(content) });
}
function hasExactKeys(value, keys) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return false;
    const actual = Object.keys(value);
    return actual.length === keys.length && keys.every((key) => actual.includes(key));
}
function checkedNumeric(value) {
    return typeof value === 'number' && Number.isFinite(value);
}
const ROW_FIELDS = [
    'command', 'level_tenths', 'status', 'preview_ms', 'export_ms',
    'identity_applied', 'alpha_unchanged', 'protected_unchanged', 'neutral_correct',
    'skin_lift_l', 'pose_minimum_jacobian', 'pose_retention', 'measured_device',
];
const PACKET_FIELDS = [
    'version', 'run_id', 'renderer_build', 'level_count', 'command_count',
    'total_slots', 'technical_status', 'matrix', 'rows', 'blockers',
    'independent_realface_result', 'production_identity_qualified',
    'release_qualified', 'sha256',
];
export async function verifyTuesdayLockJson(raw) {
    if (typeof raw !== 'string' || raw.length > 250_000)
        return refuse('Packet is absent or too large.');
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        return refuse('Packet JSON is malformed.');
    }
    if (!hasExactKeys(parsed, PACKET_FIELDS))
        return refuse('Packet fields are missing or unknown.');
    const content = { ...parsed };
    const checksum = content.sha256;
    delete content.sha256;
    if (typeof checksum !== 'string' || !/^[a-f0-9]{64}$/.test(checksum) ||
        checksum !== await digest(content))
        return refuse('Packet checksum mismatch.');
    if (content.version !== TUESDAY_PACKET_VERSION || content.level_count !== 41 ||
        content.command_count !== 5 || content.total_slots !== 205 ||
        content.release_qualified !== false || content.production_identity_qualified !== false ||
        content.independent_realface_result !== 'NOT_RUN' ||
        typeof content.run_id !== 'string' || typeof content.renderer_build !== 'string') {
        return refuse('Invalid or impermissible release claim.');
    }
    checkedIdentifier(content.run_id);
    checkedIdentifier(content.renderer_build);
    if (!Array.isArray(content.rows) || content.rows.length !== 205) {
        return refuse('Exactly 205 ordered slots are required.');
    }
    const rows = [];
    const foundStatuses = new Set([
        'missing', 'failed_safety', 'over_budget', 'synthetic_checked', 'device_checked',
    ]);
    for (let index = 0; index < 205; index++) {
        const item = content.rows[index];
        if (!hasExactKeys(item, ROW_FIELDS))
            return refuse('Malformed or unexpected lock row fields.');
        const command = PRO_COMMAND_NAMES[Math.floor(index / 41)];
        const level = 10 + index % 41;
        if (item.command !== command || item.level_tenths !== level ||
            !foundStatuses.has(item.status)) {
            return refuse('Lock row order, level or status is invalid.');
        }
        const missing = item.status === 'missing';
        for (const name of ROW_FIELDS.slice(3)) {
            const value = item[name];
            if (value === null) {
                if (!missing && ['preview_ms', 'export_ms', 'identity_applied',
                    'alpha_unchanged', 'protected_unchanged', 'neutral_correct',
                    'measured_device'].includes(name))
                    return refuse('Measured fields cannot be omitted.');
            }
            else if (missing) {
                return refuse('Missing rows cannot contain synthetic measurements.');
            }
            else if (['preview_ms', 'export_ms', 'skin_lift_l',
                'pose_minimum_jacobian', 'pose_retention'].includes(name)) {
                if (!checkedNumeric(value) ||
                    ((name === 'preview_ms' || name === 'export_ms') && value < 0)) {
                    return refuse('Invalid numerical lock measurement.');
                }
            }
            else if (typeof value !== 'boolean') {
                return refuse('Lock flags must be checked booleans.');
            }
        }
        rows.push(item);
    }
    if (!hasExactKeys(content.matrix, [
        'version', 'status', 'total_checked', 'duplicate_rows', 'preview_budget_ms',
        'export_budget_ms', 'complete_five_command_coverage', 'commands',
        'synthetic_only', 'independent_face_evidence', 'release_qualified',
    ]))
        return refuse('Invalid matrix evidence fields.');
    if (!checkedNumeric(content.matrix.preview_budget_ms) ||
        !checkedNumeric(content.matrix.export_budget_ms)) {
        return refuse('Missing performance bounds.');
    }
    const observations = rows.filter((row) => row.status !== 'missing').map((row) => ({ command: row.command, levelTenths: row.level_tenths,
        previewMs: row.preview_ms, exportMs: row.export_ms,
        identityApplied: row.identity_applied, alphaUnchanged: row.alpha_unchanged,
        protectedUnchanged: row.protected_unchanged,
        neutralCorrect: row.neutral_correct,
        skinLiftL: row.skin_lift_l, poseMinimumJacobian: row.pose_minimum_jacobian,
        poseRetention: row.pose_retention, measuredDevice: row.measured_device }));
    const computed = evaluateCommandLocks(observations, content.matrix.preview_budget_ms, content.matrix.export_budget_ms);
    if (canonical(content.matrix) !== canonical(matrixMetadata(computed)) ||
        canonical(content.blockers) !== canonical(blockersFor(computed))) {
        return refuse('The matrix or blockers contradict measured evidence.');
    }
    const technicalStatus = rows.some((row) => row.status === 'failed_safety' ||
        row.status === 'over_budget') ? 'blocked' :
        rows.some((row) => row.status === 'missing') ? 'incomplete' : 'technical_review_required';
    if (content.technical_status !== technicalStatus) {
        return refuse('Status contradicts measured evidence.');
    }
    return parsed;
}
export function serializeTuesdayPacket(packet) {
    return canonical(packet);
}
//# sourceMappingURL=tuesday-lock.js.map
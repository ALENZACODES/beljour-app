/** Conservative R17B release-evidence bookkeeping mirror. Author: John Khan. */
import { sha256 } from '../../engines/workflow_w/passport.js';
const STATIC_GATES = ['mypy', 'ruff', 'api', 'web', 'parity', 'browser_acceptance'];
const GROUPS = ['hair_women', 'makeup_w', 'workflow_w', 'upscale', 'gender_look', 'shave'];
const FROZEN_MINIMUM = 100_000;
function validHash(value) { return /^[0-9a-f]{64}$/.test(value); }
function safeText(value, name) {
    const text = value.trim();
    if (!text || text.length > 240)
        throw new Error(`${name} is invalid`);
    for (const char of text)
        if (char.charCodeAt(0) < 32 && char !== '\t' && char !== '\n')
            throw new Error(`${name} is unsafe`);
    return text;
}
function nonnegative(value, name) {
    if (!Number.isSafeInteger(value) || value < 0)
        throw new Error(`${name} must be a non-negative integer`);
    return value;
}
function stable(value) {
    if (value === null || typeof value !== 'object')
        return JSON.stringify(value);
    if (Array.isArray(value))
        return `[${value.map(stable).join(',')}]`;
    const object = value;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stable(object[key])}`).join(',')}}`;
}
export function validateFrozen(value) {
    nonnegative(value.cases, 'cases');
    nonnegative(value.passed, 'passed');
    nonnegative(value.failed, 'failed');
    if (value.passed + value.failed !== value.cases)
        throw new Error('frozen evidence counts do not add up');
    if (value.locked && (!value.lock_sha256 || !validHash(value.lock_sha256)))
        throw new Error('locked evidence requires lock hash');
    if (!value.locked && value.lock_sha256 != null)
        throw new Error('unlocked evidence cannot claim lock hash');
    return { ...value };
}
export function frozenReady(value) {
    const clean = validateFrozen(value);
    return clean.locked && clean.cases >= FROZEN_MINIMUM && clean.failed === 0 && clean.passed === clean.cases;
}
export function validateParity(value) {
    if (!Number.isInteger(value.max_byte_error) || value.max_byte_error < 0 || value.max_byte_error > 255)
        throw new Error('parity byte error must be in 0..255');
    if (!Number.isSafeInteger(value.vectors) || value.vectors < 1)
        throw new Error('parity requires at least one vector');
    if (!value.engines.length || new Set(value.engines).size !== value.engines.length)
        throw new Error('parity engines must be unique');
    value.engines.forEach((name) => safeText(name, 'parity engine'));
    return { ...value, engines: [...value.engines] };
}
function validateGroup(value) {
    for (const key of ['total', 'tested', 'passed', 'failed', 'not_tested'])
        nonnegative(value[key], key);
    if (value.tested !== value.passed + value.failed)
        throw new Error('tested count mismatch');
    if (value.total !== value.tested + value.not_tested)
        throw new Error('total count mismatch');
    if (value.ready !== (value.total > 0 && value.failed === 0 && value.not_tested === 0))
        throw new Error('ready flag mismatch');
    safeText(value.group, 'group');
    return { ...value };
}
export function assessRelease(input) {
    if (!validHash(input.definitions_sha256))
        throw new Error('definitions hash must be sha256');
    const gateMap = new Map();
    for (const gate of input.gates) {
        const name = safeText(gate.name, 'gate name');
        if (!['passed', 'failed', 'unavailable'].includes(gate.status))
            throw new Error('invalid gate status');
        if (gateMap.has(name))
            throw new Error(`duplicate gate: ${name}`);
        gateMap.set(name, { name, status: gate.status, detail: gate.detail ?? '' });
    }
    const groupMap = new Map();
    for (const source of input.groups) {
        const group = validateGroup(source);
        if (groupMap.has(group.group))
            throw new Error(`duplicate group: ${group.group}`);
        groupMap.set(group.group, group);
    }
    const parity = validateParity(input.parity);
    const frozen = validateFrozen(input.frozen);
    const blockers = [];
    for (const name of STATIC_GATES) {
        const result = gateMap.get(name);
        if (!result)
            blockers.push(`static:${name}:missing`);
        else if (result.status !== 'passed')
            blockers.push(`static:${name}:${result.status}`);
    }
    const staticReady = !blockers.some((item) => item.startsWith('static:'));
    const parityReady = parity.max_byte_error <= 1;
    if (!parityReady)
        blockers.push(`parity:max_byte_error=${parity.max_byte_error}`);
    for (const name of GROUPS) {
        const summary = groupMap.get(name);
        if (!summary)
            blockers.push(`evidence:${name}:missing`);
        else if (!summary.ready)
            blockers.push(`evidence:${name}:not_ready`);
    }
    const groupReady = !blockers.some((item) => item.startsWith('evidence:'));
    const isFrozenReady = frozenReady(frozen);
    if (!isFrozenReady) {
        if (!frozen.locked)
            blockers.push('frozen:not_locked');
        if (frozen.cases < FROZEN_MINIMUM)
            blockers.push(`frozen:cases=${frozen.cases}<${FROZEN_MINIMUM}`);
        if (frozen.failed)
            blockers.push(`frozen:failed=${frozen.failed}`);
    }
    let decision = 'blocked';
    if (staticReady && parityReady)
        decision = groupReady && isFrozenReady ? 'release_candidate' : 'development_verified';
    const payload = {
        author: 'John Khan', claim: 'bookkeeping only; no release or superiority claim', decision,
        static_ready: staticReady, parity_ready: parityReady, group_evidence_ready: groupReady, frozen_ready: isFrozenReady,
        blockers, definitions_sha256: input.definitions_sha256,
        gates: [...gateMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
        parity, groups: [...groupMap.values()].sort((a, b) => a.group.localeCompare(b.group)), frozen,
    };
    return {
        decision, static_ready: staticReady, parity_ready: parityReady, group_evidence_ready: groupReady, frozen_ready: isFrozenReady,
        blockers: [...blockers], definitions_sha256: input.definitions_sha256, audit_sha256: sha256(stable(payload)),
    };
}
//# sourceMappingURL=release.js.map
/** Versioned, decimal-first plan for five ordered commands. Author: John Khan. */
import { levelFromTenths, levelLabel, parseLevel, ProLevelError } from './levels.js';
export class ProPlanError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'ProPlanError';
    }
}
export const DEFAULT_IDENTITY_POLICY = Object.freeze({
    enabled: true,
    mode: 'soften',
    strength: 'normal',
    explicit_user_override: false,
});
const NAMES = new Set([
    'identitylock', 'cleanup', 'upscale', 'studioquality', 'poseonly',
]);
export function validateIdentityPolicy(input) {
    if (typeof input.enabled !== 'boolean' || typeof input.explicit_user_override !== 'boolean') {
        throw new ProPlanError('invalid_lock_policy', 'Identity policy flags are invalid.');
    }
    if (!['block', 'soften', 'warn'].includes(input.mode)) {
        throw new ProPlanError('invalid_lock_policy', 'Identity mode is invalid.');
    }
    if (!['normal', 'strict'].includes(input.strength)) {
        throw new ProPlanError('invalid_lock_policy', 'Identity strength is invalid.');
    }
    if ((!input.enabled || input.mode === 'warn') && !input.explicit_user_override) {
        throw new ProPlanError('identity_override_required', 'Only a deliberate user choice may weaken identity lock.');
    }
    return Object.freeze({ ...input });
}
export function userIdentityOverride(enabled, mode = 'soften', strength = 'normal') {
    return validateIdentityPolicy({ enabled, mode, strength, explicit_user_override: true });
}
export function createProPlan(steps, identity = DEFAULT_IDENTITY_POLICY) {
    if (steps.length < 1 || steps.length > 12) {
        throw new ProPlanError('invalid_plan_size', 'The plan must contain 1 to 12 commands.');
    }
    const verified = steps.map((step, index) => {
        if (!NAMES.has(step.name) || step.index !== index) {
            throw new ProPlanError('invalid_step_order', 'Commands must be known and sequential.');
        }
        const level = levelFromTenths(step.level);
        if (step.scale !== 2 && step.scale !== 4) {
            throw new ProPlanError('invalid_scale', 'Upscale accepts only 2x and 4x.');
        }
        if (step.name !== 'upscale' && step.scale !== 2) {
            throw new ProPlanError('invalid_scale', 'Only upscale can change dimensions.');
        }
        return Object.freeze({ name: step.name, index, level, scale: step.scale });
    });
    return Object.freeze({
        version: 'beljour-pro-plan/1',
        identity: validateIdentityPolicy(identity),
        steps: Object.freeze(verified),
    });
}
export function editProLevel(plan, index, level) {
    if (!Number.isInteger(index) || index < 0 || index >= plan.steps.length) {
        throw new ProPlanError('invalid_index', 'Edited command does not exist.');
    }
    return createProPlan(plan.steps.map((step, position) => position === index ? { ...step, level } : step), plan.identity);
}
export function parseProCommands(text, identity = DEFAULT_IDENTITY_POLICY) {
    if (typeof text !== 'string' || text.trim().length === 0) {
        throw new ProPlanError('empty_commands', 'At least one command is required.');
    }
    if (text.length > 2048 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) {
        throw new ProPlanError('invalid_commands', 'Command text is invalid.');
    }
    const tokens = text.match(/\S+/g) ?? [];
    const steps = [];
    let active = null;
    let args = [];
    const flush = () => {
        if (active === null)
            return;
        const name = active.toLowerCase();
        if (!NAMES.has(name)) {
            throw new ProPlanError('unknown_command', 'Unknown Pro command.');
        }
        const fields = new Map();
        for (const token of args) {
            const equal = token.indexOf('=');
            const key = equal >= 0 ? token.slice(0, equal).toLowerCase() :
                name === 'upscale' && ['2x', '4x'].includes(token.toLowerCase()) ? 'scale' : 'level';
            const value = equal >= 0 ? token.slice(equal + 1) : token;
            if (!['level', 'scale'].includes(key)) {
                throw new ProPlanError('unknown_parameter', 'Unknown Pro command parameter.');
            }
            if (fields.has(key)) {
                throw new ProPlanError('duplicate_parameter', 'Parameter repeated.');
            }
            fields.set(key, value);
        }
        if (name !== 'upscale' && fields.has('scale')) {
            throw new ProPlanError('unknown_parameter', 'Only upscale may set scale.');
        }
        const scaleText = (fields.get('scale') ?? '2x').toLowerCase();
        if (name === 'upscale' && scaleText !== '2x' && scaleText !== '4x') {
            throw new ProPlanError('invalid_scale', 'Scale must be 2x or 4x.');
        }
        let level;
        try {
            level = parseLevel(fields.get('level') ?? '3.0');
        }
        catch (error) {
            if (error instanceof ProLevelError) {
                throw new ProPlanError('invalid_level', 'Level must use 1.0 to 5.0 in 0.1 steps.');
            }
            throw error;
        }
        steps.push({ name: name, index: steps.length, level, scale: scaleText === '4x' ? 4 : 2 });
    };
    for (const token of tokens) {
        if (/^\/[a-z][a-z0-9]*$/i.test(token)) {
            flush();
            active = token.slice(1);
            args = [];
        }
        else if (active === null || token.startsWith('/')) {
            throw new ProPlanError('invalid_commands', 'Arguments require a valid command.');
        }
        else {
            args.push(token);
        }
    }
    flush();
    return createProPlan(steps, identity);
}
export function canonicalProPlan(plan) {
    const canonical = {
        identity: {
            enabled: plan.identity.enabled,
            explicit_user_override: plan.identity.explicit_user_override,
            mode: plan.identity.mode,
            strength: plan.identity.strength,
        },
        steps: plan.steps.map((step) => ({
            index: step.index,
            level: levelLabel(step.level),
            name: step.name,
            scale: step.scale,
        })),
        version: plan.version,
    };
    return JSON.stringify(canonical);
}

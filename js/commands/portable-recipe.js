/** Portable, photo-free five-command recipes with checked import boundaries.
 * SHA-256 detects accidental changes, not authorship or release approval.
 * A weaker imported identity policy needs fresh local confirmation.
 * Author: John Khan.
 */
import { parseLevel } from './levels.js';
import { ProPlanError, canonicalProPlan, createProPlan, validateIdentityPolicy, } from './plan.js';
export const PORTABLE_RECIPE_FORMAT = 'beljour-pro-recipe/1';
export const MAX_PORTABLE_RECIPE_BYTES = 8192;
const NAMES = new Set([
    'identitylock', 'cleanup', 'upscale', 'studioquality', 'poseonly',
]);
const DIGEST = /^[0-9a-f]{64}$/;
function fail(code, message) {
    throw new ProPlanError(code, message);
}
function record(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return fail('invalid_recipe_schema', 'Recipe values must be plain JSON objects.');
    }
    return value;
}
function exactKeys(value, names, code) {
    const present = Object.keys(value).sort();
    const expected = [...names].sort();
    if (present.length !== expected.length ||
        present.some((key, index) => key !== expected[index])) {
        fail(code, 'Recipe contains missing or unexpected fields.');
    }
}
function checkedPlan(value) {
    const top = record(value);
    exactKeys(top, ['version', 'identity', 'steps'], 'invalid_recipe_plan');
    if (top.version !== 'beljour-pro-plan/1') {
        fail('invalid_recipe_plan', 'Recipe plan version is not supported.');
    }
    const policy = record(top.identity);
    exactKeys(policy, ['enabled', 'mode', 'strength', 'explicit_user_override'], 'invalid_recipe_policy');
    if (typeof policy.enabled !== 'boolean' ||
        typeof policy.explicit_user_override !== 'boolean' ||
        !['block', 'soften', 'warn'].includes(String(policy.mode)) ||
        !['normal', 'strict'].includes(String(policy.strength))) {
        fail('invalid_recipe_policy', 'Recipe identity settings are invalid.');
    }
    const identity = validateIdentityPolicy({
        enabled: policy.enabled,
        explicit_user_override: policy.explicit_user_override,
        mode: policy.mode,
        strength: policy.strength,
    });
    if (!Array.isArray(top.steps) || top.steps.length < 1 || top.steps.length > 12) {
        fail('invalid_plan_size', 'A recipe needs 1 to 12 commands.');
    }
    const steps = top.steps.map((value, index) => {
        const row = record(value);
        exactKeys(row, ['index', 'name', 'level', 'scale'], 'invalid_recipe_step');
        if (!Number.isInteger(row.index) || row.index !== index ||
            typeof row.name !== 'string' || !NAMES.has(row.name) ||
            typeof row.level !== 'string' ||
            (row.scale !== 2 && row.scale !== 4)) {
            fail('invalid_recipe_step', 'Recipe command fields are invalid.');
        }
        return {
            index, name: row.name, scale: row.scale,
            level: parseLevel(row.level),
        };
    });
    return createProPlan(steps, identity);
}
function rejectDuplicateKeys(text) {
    /** JSON.parse silently overwrites repeated keys. This small lexical check
     * identifies a key only when its string token is followed by a colon.
     * JSON.parse remains responsible for validating the overall grammar.
     */
    const stack = [];
    let index = 0;
    while (index < text.length) {
        const symbol = text[index];
        if (symbol === '{') {
            stack.push(new Set());
            index++;
            continue;
        }
        if (symbol === '[') {
            stack.push(null);
            index++;
            continue;
        }
        if (symbol === '}' || symbol === ']') {
            stack.pop();
            index++;
            continue;
        }
        if (symbol !== '"') {
            index++;
            continue;
        }
        const start = index++;
        while (index < text.length) {
            if (text[index] === '\\') {
                index += 2;
                continue;
            }
            if (text[index] === '"') {
                index++;
                break;
            }
            index++;
        }
        let next = index;
        while (next < text.length && /\s/.test(text[next]))
            next++;
        if (text[next] !== ':' || stack.length === 0)
            continue;
        const seen = stack[stack.length - 1];
        if (seen === null)
            continue;
        let key;
        try {
            key = JSON.parse(text.slice(start, index));
        }
        catch {
            fail('invalid_recipe_json', 'Malformed recipe key.');
        }
        if (seen.has(key))
            fail('duplicate_recipe_field', 'Recipe repeats a JSON field.');
        seen.add(key);
    }
}
function checkedText(raw) {
    if (typeof raw !== 'string') {
        return fail('invalid_recipe_encoding', 'Recipe must be UTF-8 JSON text.');
    }
    const size = new TextEncoder().encode(raw).byteLength;
    if (size < 1 || size > MAX_PORTABLE_RECIPE_BYTES) {
        return fail('invalid_recipe_size', 'Recipe exceeds its bounded size.');
    }
    let decoded;
    try {
        decoded = JSON.parse(raw);
    }
    catch {
        return fail('invalid_recipe_json', 'Recipe is not valid JSON.');
    }
    rejectDuplicateKeys(raw);
    return decoded;
}
async function sha256(text, provider) {
    const digest = provider === undefined ? globalThis.crypto?.subtle ?? null : provider;
    if (digest === null || typeof digest.digest !== 'function') {
        return fail('recipe_crypto_unavailable', 'Local SHA-256 is required.');
    }
    const bytes = new TextEncoder().encode(text);
    let result;
    try {
        result = await digest.digest('SHA-256', bytes.buffer);
    }
    catch {
        return fail('recipe_crypto_failed', 'Recipe hashing failed.');
    }
    if (!(result instanceof ArrayBuffer) || result.byteLength !== 32) {
        return fail('recipe_crypto_failed', 'Recipe hash length is invalid.');
    }
    return Array.from(new Uint8Array(result), value => value.toString(16).padStart(2, '0')).join('');
}
function weakPolicy(plan) {
    return !plan.identity.enabled || plan.identity.mode === 'warn';
}
export async function exportPortableProRecipe(plan, digest) {
    const validated = createProPlan(plan.steps, plan.identity);
    const canonical = canonicalProPlan(validated);
    const hash = await sha256(canonical, digest);
    const payload = {
        format: PORTABLE_RECIPE_FORMAT,
        plan: JSON.parse(canonical),
        sha256: hash,
    };
    const text = JSON.stringify(payload);
    if (new TextEncoder().encode(text).length > MAX_PORTABLE_RECIPE_BYTES) {
        return fail('invalid_recipe_size', 'Recipe exceeds its bounded size.');
    }
    return text;
}
export async function importPortableProRecipe(text, options = {}) {
    if (options.confirmWeakenedIdentity !== undefined &&
        typeof options.confirmWeakenedIdentity !== 'boolean') {
        return fail('invalid_identity_confirmation', 'Identity confirmation must be explicit.');
    }
    const root = record(checkedText(text));
    exactKeys(root, ['format', 'plan', 'sha256'], 'invalid_recipe_schema');
    if (root.format !== PORTABLE_RECIPE_FORMAT) {
        return fail('invalid_recipe_version', 'Recipe version is unsupported.');
    }
    if (typeof root.sha256 !== 'string' || !DIGEST.test(root.sha256)) {
        return fail('invalid_recipe_digest', 'Recipe checksum is malformed.');
    }
    const plan = checkedPlan(root.plan);
    const expected = await sha256(canonicalProPlan(plan), options.digest);
    if (expected !== root.sha256) {
        return fail('recipe_integrity_failed', 'Recipe contents do not match its checksum.');
    }
    const reconfirmation = weakPolicy(plan);
    if (reconfirmation && options.confirmWeakenedIdentity !== true) {
        return fail('identity_reconfirmation_required', 'Importing weakened identity protection needs a new local user choice.');
    }
    return Object.freeze({
        format: PORTABLE_RECIPE_FORMAT, plan, sha256: expected,
        identityReconfirmationRequired: reconfirmation,
        releaseQualified: false,
    });
}
export async function inspectPortableProRecipe(text, digest) {
    /** Inspection never applies a recipe. A caller must obtain fresh consent
     * and call importPortableProRecipe before replacing the running plan.
     */
    return importPortableProRecipe(text, { confirmWeakenedIdentity: true, digest });
}
//# sourceMappingURL=portable-recipe.js.map
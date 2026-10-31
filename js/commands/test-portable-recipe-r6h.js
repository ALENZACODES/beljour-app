/** Pure browser recipe contract tests; no photo, storage or provider calls.
 * Author: John Khan.
 */
import { levelFromTenths } from './levels.js';
import { ProPlanError, canonicalProPlan, createProPlan, userIdentityOverride, } from './plan.js';
import { MAX_PORTABLE_RECIPE_BYTES, exportPortableProRecipe, importPortableProRecipe, inspectPortableProRecipe, } from './portable-recipe.js';
function check(predicate, reason) {
    if (!predicate)
        throw new Error(`portable recipe: ${reason}`);
}
async function rejects(code, perform) {
    try {
        await perform();
    }
    catch (error) {
        if (error instanceof ProPlanError && error.code === code)
            return;
        throw error;
    }
    throw new Error(`portable recipe: expected ${code}`);
}
function recipePlan() {
    return createProPlan([
        { index: 0, name: 'cleanup', level: levelFromTenths(24), scale: 2 },
        { index: 1, name: 'studioquality', level: levelFromTenths(39), scale: 2 },
        { index: 2, name: 'poseonly', level: levelFromTenths(10), scale: 2 },
        { index: 3, name: 'upscale', level: levelFromTenths(50), scale: 4 },
        { index: 4, name: 'identitylock', level: levelFromTenths(10), scale: 2 },
    ], {
        enabled: true, mode: 'soften', strength: 'normal', explicit_user_override: false,
    });
}
function parse(raw) {
    return JSON.parse(raw);
}
function mutated(raw, action) {
    const obj = parse(raw);
    action(obj);
    return JSON.stringify(obj);
}
export async function testPortableRecipeR6H() {
    let checks = 0;
    const plan = recipePlan();
    const json = await exportPortableProRecipe(plan);
    check(json === await exportPortableProRecipe(plan), 'deterministic export');
    check(json.length < MAX_PORTABLE_RECIPE_BYTES, 'bounded export');
    checks += 2;
    const verified = await importPortableProRecipe(json);
    check(canonicalProPlan(verified.plan) === canonicalProPlan(plan), 'complete roundtrip');
    check(verified.releaseQualified === false, 'cannot certify quality');
    check(!verified.identityReconfirmationRequired, 'no opt-out confirmation for normal recipe');
    check(verified.sha256 === parse(json).sha256, 'checksum retained');
    checks += 4;
    for (const protectedField of ['image', 'photo', 'landmark', 'pixels', 'embedding', 'filename']) {
        check(!json.includes(protectedField), `no biometric field: ${protectedField}`);
        checks++;
    }
    for (let index = 0; index < 5; index++) {
        const changed = mutated(json, value => {
            const inner = value.plan;
            const rows = inner.steps;
            rows[index].level = '1.1';
        });
        await rejects('recipe_integrity_failed', () => importPortableProRecipe(changed));
        checks++;
    }
    await rejects('recipe_integrity_failed', () => importPortableProRecipe(mutated(json, obj => {
        const content = obj.plan;
        const rows = content.steps;
        rows[3].scale = 2;
    })));
    checks++;
    await rejects('recipe_integrity_failed', () => importPortableProRecipe(mutated(json, obj => {
        const content = obj.plan;
        const identity = content.identity;
        identity.strength = 'strict';
    })));
    checks++;
    const importedWhitespace = await importPortableProRecipe(JSON.stringify(parse(json), null, 2));
    check(importedWhitespace.sha256 === verified.sha256, 'pretty printed JSON allowed');
    checks++;
    const weakerOff = createProPlan(plan.steps, userIdentityOverride(false));
    const warningOnly = createProPlan(plan.steps, userIdentityOverride(true, 'warn'));
    for (const weak of [weakerOff, warningOnly]) {
        const serialized = await exportPortableProRecipe(weak);
        await rejects('identity_reconfirmation_required', () => importPortableProRecipe(serialized));
        const inspected = await inspectPortableProRecipe(serialized);
        check(inspected.identityReconfirmationRequired, 'opt-out flagged during inspection');
        const admitted = await importPortableProRecipe(serialized, { confirmWeakenedIdentity: true });
        check(admitted.identityReconfirmationRequired, 'fresh confirmation recorded');
        check(canonicalProPlan(admitted.plan) === canonicalProPlan(weak), 'explicit opt-out retained');
        checks += 4;
    }
    const unsupported = mutated(json, value => { value.format = 'beljour-pro-recipe/2'; });
    await rejects('invalid_recipe_version', () => importPortableProRecipe(unsupported));
    checks++;
    const injected = mutated(json, value => {
        Object.defineProperty(value, '__proto__', { value: { injected: true }, enumerable: true });
    });
    await rejects('invalid_recipe_schema', () => importPortableProRecipe(injected));
    checks++;
    const badDigest = mutated(json, value => { value.sha256 = 'ABC'; });
    await rejects('invalid_recipe_digest', () => importPortableProRecipe(badDigest));
    checks++;
    const badPolicy = mutated(json, value => {
        const content = value.plan;
        const identity = content.identity;
        identity.enabled = false;
    });
    await rejects('identity_override_required', () => importPortableProRecipe(badPolicy));
    checks++;
    for (const raw of [
        '{"format":"a","format":"b"}',
        json.replace('"enabled":true', '"enabled":true,"enabled":true'),
        json.replace('"level":"2.4"', '"level":"2.4","level":"2.4"'),
    ]) {
        await rejects('duplicate_recipe_field', () => importPortableProRecipe(raw));
        checks++;
    }
    for (const raw of ['', '[]', 'null', 'bad json', '{', '{}']) {
        await rejects(raw === '' ? 'invalid_recipe_size' : raw === 'bad json' || raw === '{' ?
            'invalid_recipe_json' : 'invalid_recipe_schema', () => importPortableProRecipe(raw));
        checks++;
    }
    await rejects('invalid_recipe_size', () => importPortableProRecipe(' '.repeat(8200)));
    checks++;
    for (let tenths = 10; tenths <= 50; tenths++) {
        const single = createProPlan([
            { index: 0, name: 'cleanup', level: levelFromTenths(tenths), scale: 2 },
        ]);
        const record = await importPortableProRecipe(await exportPortableProRecipe(single));
        check(record.plan.steps[0].level === tenths, `decimal ${tenths} preserved`);
        checks++;
    }
    return checks;
}

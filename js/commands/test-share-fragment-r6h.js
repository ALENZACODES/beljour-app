/** Offline fragment sharing regression tests. Author: John Khan. */
import { levelFromTenths } from './levels.js';
import { ProPlanError, createProPlan, userIdentityOverride } from './plan.js';
import { exportPortableProRecipe } from './portable-recipe.js';
import { exportProShareFragment, importProShareFragment } from './share-fragment.js';
function check(value, reason) {
    if (!value)
        throw new Error(`share fragment: ${reason}`);
}
async function rejects(code, callback) {
    try {
        await callback();
    }
    catch (error) {
        if (error instanceof ProPlanError && error.code === code)
            return;
        throw error;
    }
    throw new Error(`share fragment: expected ${code}`);
}
function plan() {
    return createProPlan([
        { index: 0, name: 'identitylock', level: levelFromTenths(10), scale: 2 },
        { index: 1, name: 'cleanup', level: levelFromTenths(30), scale: 2 },
        { index: 2, name: 'upscale', level: levelFromTenths(42), scale: 2 },
        { index: 3, name: 'studioquality', level: levelFromTenths(36), scale: 2 },
        { index: 4, name: 'poseonly', level: levelFromTenths(10), scale: 2 },
    ]);
}
export async function testShareFragmentR6H() {
    let count = 0;
    const original = await exportProShareFragment(plan());
    check(original.startsWith('#pro='), 'fragment prefix');
    check(!original.includes('/'), 'URL-safe payload');
    check(!original.includes('&'), 'no hidden query options');
    check(original.length < 4000, 'length bounded');
    count += 4;
    const imported = await importProShareFragment(original);
    check(imported.plan.steps.length === 5, 'all five commands restored');
    check(imported.sha256.length === 64, 'SHA-256 checksum checked');
    check(imported.plan.identity.enabled, 'identity on by default');
    count += 3;
    const raw = new TextEncoder().encode(await exportPortableProRecipe(plan()));
    let binary = '';
    for (const byte of raw)
        binary += String.fromCharCode(byte);
    const independent = '#pro=' + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    check(original === independent, 'independent canonical base64url encoding');
    count++;
    for (const position of [7, 21, 41, original.length - 2]) {
        const changed = original.slice(0, position) +
            (original[position] === 'A' ? 'B' : 'A') + original.slice(position + 1);
        try {
            await importProShareFragment(changed);
            throw new Error('corrupt share accepted');
        }
        catch (error) {
            check(error instanceof ProPlanError, 'corrupt fragment rejected');
        }
        count++;
    }
    for (const bad of ['&src=face', '=extra', '/bad', '#new', '%20', ' pro']) {
        await rejects('invalid_share_encoding', () => importProShareFragment(original + bad));
        count++;
    }
    for (const bad of ['', 'pro=abc', '#other=abc',
        'https://example.org/editor' + original]) {
        await rejects(bad === '' ? 'invalid_share_fragment' : 'invalid_share_prefix', () => importProShareFragment(bad));
        count++;
    }
    await rejects('invalid_share_fragment', () => importProShareFragment('#pro=' + 'A'.repeat(11001)));
    count++;
    const weakened = createProPlan(plan().steps, userIdentityOverride(false));
    const weakerText = await exportProShareFragment(weakened);
    await rejects('identity_reconfirmation_required', () => importProShareFragment(weakerText));
    const accepted = await importProShareFragment(weakerText, { confirmWeakenedIdentity: true });
    check(!accepted.plan.identity.enabled, 'fresh choice retains intentional opt-out');
    check(accepted.identityReconfirmationRequired, 'opt-out remains traceable');
    count += 3;
    for (let level = 10; level <= 50; level++) {
        const changing = createProPlan([
            { index: 0, name: 'cleanup', level: levelFromTenths(level), scale: 2 },
        ]);
        const link = await exportProShareFragment(changing);
        const restored = await importProShareFragment(link);
        check(restored.plan.steps[0].level === level, `level ${level} preserved`);
        count++;
    }
    return count;
}

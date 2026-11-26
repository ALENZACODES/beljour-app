/** Generated fixtures for BELJOUR 1080/4K tiers and Tuesday lock coverage.
 * Tests are metadata-only except for generated small pixel buffers.
 * Author: John Khan.
 */
import { levelFromTenths } from './levels.js';
import { createTierRecipe, parseQualityTierCommands, planQualityTier, checkedTierOutput, TIER_LONG_EDGES, runQualityTier, } from './quality-tiers.js';
import { buildTierMatrix, serializeTierMatrix, verifyTierMatrix, tierMatrixCsv, tierFindings, } from './quality-tier-matrix.js';
import { R2HBrowserSession } from './r2h-session.js';
import { ProRenderError } from './runtime.js';
import { buildTuesdayLockPacket, serializeTuesdayPacket } from './tuesday-lock.js';
function ensure(value, reason) {
    if (!value)
        throw new Error(`Quality tier contract: ${reason}`);
}
async function refuses(callback, code) {
    try {
        await callback();
    }
    catch (error) {
        ensure(error instanceof ProRenderError && error.code === code, `expected ${code}`);
        return;
    }
    throw new Error(`Expected refusal ${code}`);
}
function fixture(width, height) {
    const pixels = new Uint8Array(width * height * 3);
    pixels.fill(121);
    return { width, height, channels: 3, pixels };
}
function observation(tier, level) {
    const factor = tier === '1080' ? 2 : 4;
    return { tier, levelTenths: level, sourceWidth: 960, sourceHeight: 540,
        outputWidth: 960 * factor, outputHeight: 540 * factor, factor,
        previewMs: 10 + factor, exportMs: 120 + factor,
        cleanupFirst: true, identityLockOn: true, guardedPreviewSteps: 2,
        guardedExportSteps: 2, neutralReferenceExact: true, measuredDevice: false };
}
async function resign(content) {
    const canonical = (value) => {
        if (value === null || typeof value !== 'object')
            return JSON.stringify(value);
        if (Array.isArray(value))
            return `[${value.map(canonical).join(',')}]`;
        const record = value;
        return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
    };
    const { sha256: _old, ...body } = content;
    const bytes = new TextEncoder().encode(canonical(body));
    const hashed = await crypto.subtle.digest('SHA-256', bytes);
    const sha256 = [...new Uint8Array(hashed)].map((value) => value.toString(16).padStart(2, '0')).join('');
    return canonical({ ...body, sha256 });
}
export async function testQualityTiersR13H() {
    let checks = 0;
    const input = fixture(960, 540);
    const original = await buildTuesdayLockPacket([], {
        runId: 'tuesday-quality', rendererBuild: 'pro-v1',
    });
    const originalJson = serializeTuesdayPacket(original);
    ensure(TIER_LONG_EDGES['1080'] === 1920 && TIER_LONG_EDGES['4k'] === 3840, 'the output tiers use the agreed long edge');
    checks++;
    const recipe = parseQualityTierCommands('/cleanup 2.4 /upscale 4K 3.1 /identitylock');
    ensure(recipe.tier === '4k' && recipe.cleanupLevel === 24 && recipe.upscaleLevel === 31 &&
        recipe.explicitIdentityStep, 'command parser applies exact decimal levels');
    checks++;
    ensure(parseQualityTierCommands('/upscale 1080').cleanupLevel === 10, 'implicit cleanup always comes first');
    checks++;
    for (const tier of ['1080', '4k']) {
        for (let level = 10; level <= 50; level++) {
            const prepared = planQualityTier(input, createTierRecipe(tier, levelFromTenths(10), levelFromTenths(level)));
            ensure(prepared.outputWidth === (tier === '1080' ? 1920 : 3840) &&
                prepared.outputHeight === (tier === '1080' ? 1080 : 2160), 'scale meets requested tier with aspect preserved');
            ensure(prepared.proPlan.identity.enabled &&
                prepared.proPlan.steps[0]?.name === 'cleanup' &&
                prepared.proPlan.steps[1]?.name === 'upscale', 'guard ON, cleanup first, upscale second');
            ensure(prepared.proPlan.steps[1]?.level === level, 'strength is an exact decimal step');
            const audited = observation(tier, level);
            ensure(tierFindings(audited).length === 0, 'generated tier/level evidence includes both identity and latency');
            checks += 4;
        }
    }
    for (const bad of ['/upscale 720', '/cleanup 2.9',
        '/upscale 4k /cleanup 2.9', '/upscale 1080 1.05']) {
        await refuses(() => parseQualityTierCommands(bad), 'invalid_quality_command');
        checks++;
    }
    for (const [width, height, tier] of [
        [200, 150, '1080'], [512, 512, '4k'], [3000, 2300, '4k'],
    ]) {
        await refuses(() => planQualityTier(fixture(width, height), createTierRecipe(tier)), 'tier_unavailable');
        checks++;
    }
    const plan = planQualityTier(input, createTierRecipe('1080'));
    checkedTierOutput(plan, fixture(1920, 1080));
    await refuses(() => checkedTierOutput(plan, fixture(1024, 768)), 'tier_shortfall');
    checks++;
    const session = new R2HBrowserSession(null);
    session.openPhoto(fixture(120, 80), 'synthetic-photo-key');
    await refuses(() => runQualityTier(session, fixture(120, 80), createTierRecipe('4k')), 'tier_unavailable');
    checks++;
    session.closePhoto();
    const missing = await buildTierMatrix([], originalJson, 'tuesday-quality', 'pro-v1');
    ensure(missing.rows.length === 82 && missing.status === 'incomplete' &&
        missing.rows.every((row) => row.status === 'missing'), '82 unmeasured tier/strength slots are not passing results');
    checks++;
    ensure((await verifyTierMatrix(serializeTierMatrix(missing), originalJson)).sha256 ===
        missing.sha256, 'checksum verified and original 205 matrix bound');
    checks++;
    const csvRows = (await tierMatrixCsv(serializeTierMatrix(missing), originalJson)).split('\n');
    ensure(csvRows.length === 84, 'Tuesday supplement CSV contains all 82 rows plus header');
    checks++;
    const observed = [observation('1080', 10), observation('4k', 30)];
    const partial = await buildTierMatrix(observed, originalJson, 'tuesday-quality', 'pro-v1');
    ensure(partial.status === 'incomplete' && partial.rows[0]?.status === 'synthetic_checked' &&
        partial.rows[61]?.status === 'synthetic_checked', 'partial evidence stays incomplete');
    checks++;
    const all = ['1080', '4k'].flatMap((tier) => Array.from({ length: 41 }, (_, i) => observation(tier, i + 10)));
    const complete = await buildTierMatrix(all, originalJson, 'tuesday-quality', 'pro-v1');
    ensure(complete.status === 'technical_review_required' &&
        complete.rows.length === 82 && !complete.release_qualified, 'synthetic technical matrix never authorizes real-face release');
    checks++;
    const duplicate = [observed[0], observed[0]];
    await refuses(() => buildTierMatrix(duplicate, originalJson, 'tuesday-quality', 'pro-v1'), 'invalid_tier_evidence');
    checks++;
    for (const mutation of [
        { identityLockOn: false }, { guardedPreviewSteps: 1 },
        { cleanupFirst: false }, { outputWidth: 1900 },
        { previewMs: 101 }, { exportMs: 2001 },
    ]) {
        const failed = await buildTierMatrix([{ ...observation('1080', 10), ...mutation }], originalJson, 'tuesday-quality', 'pro-v1');
        ensure(failed.status === 'blocked', 'safety and time failures cannot clear the tier');
        checks++;
    }
    const forged = JSON.parse(serializeTierMatrix(partial));
    forged['release_qualified'] = true;
    const forgedSerialized = await resign(forged);
    await refuses(() => verifyTierMatrix(forgedSerialized, originalJson), 'invalid_tier_evidence');
    checks++;
    const changed = JSON.parse(serializeTierMatrix(partial));
    changed['rows'][0]['status'] = 'device_checked';
    const changedSerialized = await resign(changed);
    await refuses(() => verifyTierMatrix(changedSerialized, originalJson), 'invalid_tier_evidence');
    checks++;
    return checks;
}
//# sourceMappingURL=test-quality-tiers-r13h.js.map
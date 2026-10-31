/** BELJOUR 1080/4K /UPSCALE tiers with /CLEANUP first and identity ON.
 * Uses existing 2x/4x guarded engines, without inventing new weights or APIs.
 * An input that cannot satisfy the tier within 24 MP is refused BEFORE editing.
 * Author: John Khan.
 */
import { levelFromTenths, parseLevel, levelLabel } from './levels.js';
import { createProPlan } from './plan.js';
import { R2HBrowserSession } from './r2h-session.js';
import { checkedFrame, ProRenderError } from './runtime.js';
export const TIER_LONG_EDGES = Object.freeze({
    '1080': 1920,
    '4k': 3840,
});
export const QUALITY_TIER_VERSION = 'beljour-quality-generator/1';
export function checkedTier(value) {
    if (value === '1080')
        return '1080';
    if (value === '4k' || value === '4K')
        return '4k';
    throw new ProRenderError('invalid_tier', 'Quality Generator supports 1080 or 4K.');
}
export function createTierRecipe(tier, cleanupLevel = levelFromTenths(10), upscaleLevel = levelFromTenths(30), explicitIdentityStep = false) {
    checkedTier(tier);
    const cleanup = levelFromTenths(cleanupLevel);
    const upscale = levelFromTenths(upscaleLevel);
    if (typeof explicitIdentityStep !== 'boolean') {
        throw new ProRenderError('invalid_lock_policy', 'Lock request flag must be boolean.');
    }
    return Object.freeze({ tier, cleanupLevel: cleanup, upscaleLevel: upscale,
        explicitIdentityStep });
}
export function parseQualityTierCommands(text) {
    if (typeof text !== 'string' || text.length > 192 || text.trim() !== text) {
        throw new ProRenderError('invalid_quality_command', 'Quality command text is invalid.');
    }
    const pattern = new RegExp(String.raw `^(?:/cleanup ([1-5](?:\.[0-9])?) )?/upscale (1080|4k)` +
        String.raw `(?: ([1-5](?:\.[0-9])?))?( /identitylock)?$`, 'i');
    const matched = pattern.exec(text);
    if (matched === null) {
        throw new ProRenderError('invalid_quality_command', 'Use /cleanup LEVEL /upscale 1080|4k LEVEL [/identitylock].');
    }
    const tier = checkedTier((matched[2] ?? '').toLowerCase());
    return createTierRecipe(tier, parseLevel(matched[1] ?? '1.0'), parseLevel(matched[3] ?? '3.0'), matched[4] !== undefined);
}
export function planQualityTier(frame, recipe) {
    checkedFrame(frame);
    if (recipe === null || typeof recipe !== 'object') {
        throw new ProRenderError('invalid_tier_input', 'A checked output tier is required.');
    }
    const checked = createTierRecipe(recipe.tier, recipe.cleanupLevel, recipe.upscaleLevel, recipe.explicitIdentityStep);
    const minimum = TIER_LONG_EDGES[checked.tier];
    const sourceLong = Math.max(frame.width, frame.height);
    const sourcePixels = frame.width * frame.height;
    let scale = null;
    for (const candidate of [2, 4]) {
        if (sourceLong * candidate >= minimum &&
            sourcePixels * candidate * candidate <= 24_000_000) {
            scale = candidate;
            break;
        }
    }
    if (scale === null) {
        throw new ProRenderError('tier_unavailable', `${checked.tier.toUpperCase()} tier requires at least ${minimum} on its long edge; ` +
            'the current 2x/4x CPU engine cannot meet it within 24 MP. No smaller output was delivered.');
    }
    const steps = [
        { name: 'cleanup', index: 0, level: checked.cleanupLevel, scale: 2 },
        { name: 'upscale', index: 1, level: checked.upscaleLevel, scale },
    ];
    if (checked.explicitIdentityStep) {
        steps.push({ name: 'identitylock', index: 2,
            level: levelFromTenths(10), scale: 2 });
    }
    const plan = createProPlan(steps);
    return Object.freeze({ recipe: checked, proPlan: plan,
        sourceWidth: frame.width, sourceHeight: frame.height,
        outputWidth: frame.width * scale, outputHeight: frame.height * scale,
        upscaleFactor: scale });
}
export function checkedTierOutput(plan, output) {
    checkedFrame(output);
    if (output.width !== plan.outputWidth || output.height !== plan.outputHeight ||
        Math.max(output.width, output.height) < TIER_LONG_EDGES[plan.recipe.tier]) {
        throw new ProRenderError('tier_shortfall', 'Rendered pixels do not meet the requested output tier.');
    }
    if (output.width * plan.sourceHeight !== output.height * plan.sourceWidth) {
        throw new ProRenderError('aspect_changed', 'The output aspect ratio differs from the source.');
    }
}
export async function runQualityTier(session, frame, recipe, quality = 'export', signal = new AbortController().signal, current = () => true) {
    if (!(session instanceof R2HBrowserSession) || (quality !== 'preview' && quality !== 'export')) {
        throw new ProRenderError('invalid_tier_session', 'A checked local editor session is required.');
    }
    const prepared = planQualityTier(frame, recipe);
    if (!session.state.photoOpen) {
        throw new ProRenderError('photo_missing', 'Open the input photo before editing.');
    }
    const result = await session.run(prepared.proPlan, quality, signal, current);
    checkedTierOutput(prepared, result.image);
    let guarded = 0;
    for (const [index, report] of result.steps.entries()) {
        if (report.command !== prepared.proPlan.steps[index]?.name || report.identity === null) {
            throw new ProRenderError('tier_identity_unverified', 'Quality output lacks a mandatory identity check.');
        }
        guarded++;
    }
    if (guarded !== prepared.proPlan.steps.length || !Number.isFinite(result.elapsedMs)) {
        throw new ProRenderError('invalid_tier_execution', 'Quality execution evidence is incomplete.');
    }
    return Object.freeze({ plan: prepared, result, quality, guardedStepCount: guarded,
        elapsedMs: result.elapsedMs });
}
export function tierPublicMetadata(plan) {
    return Object.freeze({ version: QUALITY_TIER_VERSION, tier: plan.recipe.tier,
        minimum_long_edge: TIER_LONG_EDGES[plan.recipe.tier],
        cleanup_first: true,
        cleanup_level: levelLabel(plan.recipe.cleanupLevel),
        upscale_level: levelLabel(plan.recipe.upscaleLevel),
        identity_lock_on: plan.proPlan.identity.enabled,
        output_width: plan.outputWidth, output_height: plan.outputHeight,
        scale: plan.upscaleFactor, independent_face_gate: 'NOT_RUN',
        release_qualified: false });
}

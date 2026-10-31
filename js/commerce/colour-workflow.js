/** Corrected hair readings to a guarded, tinted fibre preview with final-pixel evidence.
 * Mirrors api/plumb_api/engines/concealer/colour_workflow.py: two to six corrected
 * readings must agree (assessColourStability); the agreed swatch, or a visitor-chosen
 * two-swatch mix of it, is the pigment for the existing local, mask-limited CoverSession
 * with its default identity guard and validated 1.0-5.0 strength. Moving frames return
 * preview_only receipts; released frames are audited against the chosen swatch inside
 * the marked scalp of the marked hair region. Repeated levels reuse one prepared zone.
 * The photo digest is the cover cache key only and never leaves this module; receipts
 * carry levels, codes, counts and distances. No provider calls. Author: John Khan.
 */
import { requireShade } from "../engines/hair_palette/index.js";
import { CoverSession } from "../engines/local/fibre.js";
import { validateLevel } from "./strength.js";
import { assessColourStability } from "./colour-stability.js";
import { auditFinalColour, publicFinalColour } from "./colour-evidence.js";
import { planTwoTone } from "./two-tone.js";
function tint(code, swatch, rgb, lab, twoTone) {
    return Object.freeze({ code, refused: code !== null, swatch_id: swatch, rgb, lab, two_tone: twoTone });
}
/** Agree on a swatch from the readings; optionally mix it with a second chosen swatch. */
export function planTint(readings, options = {}) {
    const approveLighter = options.approveLighter ?? false;
    const stability = assessColourStability(readings, { approveLighter });
    const best = stability.plan?.matches[0];
    if (stability.code !== null || stability.plan === null || best === undefined) {
        return tint(stability.code ?? "too_far", null, null, null, null);
    }
    const shade = requireShade(best.record.id);
    if (!options.secondId)
        return tint(null, shade.id, shade.rgb, shade.lab, null);
    const mix = planTwoTone(stability.plan.reading, shade.id, options.secondId, { approveLighter });
    if (mix.best === null)
        return tint(mix.code, shade.id, null, null, mix);
    return tint(null, shade.id, mix.best.rgb, mix.best.lab, mix);
}
async function digest(image) {
    const bytes = new Uint8Array(image.data.length);
    bytes.set(image.data);
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(hash), (v) => v.toString(16).padStart(2, "0")).join("");
}
function allowedRegion(image, hair, scalp, box) {
    const out = new Uint8Array(image.width * image.height);
    const [x0, y0, x1, y1] = box ?? [0, 0, image.width, image.height];
    if (hair.data.length !== out.length || scalp.data.length !== out.length)
        return out;
    for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
            const i = y * image.width + x;
            out[i] = hair.data[i] >= 0.5 && scalp.data[i] >= 0.5 ? 1 : 0;
        }
    return out;
}
/** One visitor's local tinted preview; the session cache is the only state kept. */
export class TintedFibreWorkflow {
    session;
    hashes = new WeakMap();
    constructor(session = new CoverSession()) {
        this.session = session;
    }
    async render(plan, image, hairRegion, scalpShow, options) {
        const level = validateLevel(options.level ?? 3);
        const phase = options.phase ?? "release";
        if (phase !== "moving" && phase !== "release")
            throw new RangeError("Unknown local preview phase");
        const second = plan.two_tone?.second_id ?? null;
        const percent = plan.two_tone?.best?.percent ?? null;
        const receipt = (status, code = null, changed = 0, guard = null, evidence = null) => Object.freeze({ format: "beljour-tinted-fibre-receipt/1", level, phase, status, code, swatch_id: plan.swatch_id,
            second_id: second, second_percent: percent, changed_pixels: changed, identity_guard: guard, evidence,
            provider_calls: 0, simulated: true, tested_against_real_products: false });
        if (plan.refused || plan.rgb === null || plan.lab === null)
            return receipt("refused", plan.code);
        let photoHash = this.hashes.get(image);
        if (photoHash === undefined) {
            photoHash = await digest(image);
            this.hashes.set(image, photoHash);
        }
        const result = this.session.render(image, hairRegion, scalpShow, { photoHash, zone: options.zone ?? "crown", level,
            landmarks: options.landmarks, primaryBox: options.primaryBox, paletteRgb: plan.rgb, guard: options.guard,
            lockLevel: options.lockLevel ?? 5, phase });
        if (!result.rendered)
            return receipt("refused", result.code);
        const guard = { applied: true, similarity: Math.round(result.identitySimilarity * 1e6) / 1e6,
            blended: result.identityBlended, engine: "pixel_proxy" };
        if (phase === "moving")
            return receipt("preview_only", null, result.changedPixels, guard);
        const evidence = publicFinalColour(auditFinalColour(image, result.image, allowedRegion(image, hairRegion, scalpShow, options.primaryBox), plan.lab));
        return receipt(evidence.status, evidence.code, result.changedPixels, guard, evidence);
    }
    /** The same photo and masks at several strengths, sharing one prepared zone. */
    async renderLevels(plan, image, hairRegion, scalpShow, options, levels = [1, 2, 3, 4, 5]) {
        const out = [];
        for (const level of levels)
            out.push(await this.render(plan, image, hairRegion, scalpShow, { ...options, level }));
        return out;
    }
}

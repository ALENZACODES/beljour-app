/** Display-target evidence for the hair palette, in the browser.
 * Mirrors api/plumb_api/engines/hair_palette/evidence.py: the on-screen composite
 * (allowed hair mixed with the swatch in sRGB bytes at opacity (level - 1) / 4 * 0.8) is
 * re-derived and compared with what applyShade() returned, against the ASSUMED 1.25
 * CIEDE2000 display tolerance; bytes outside the hair support, alpha and the input must
 * be unchanged, and an identity-guard blend is reported. Synthetic on-screen colour, not
 * dye calibration or a real-face result. Author: John Khan.
 */
import { ciede2000, pixelLab } from "../core/colour.js";
import { catalogue, requireShade } from "./palette.js";
import { applyShade } from "./preview.js";
export const DISPLAY_TOLERANCE = 1.25;
export const MAX_OPACITY = 0.8;
export const CONTROL_SIZE = 96;
export const CONTROL_ANCHORS = {
    left_temple: [0.30, 0.38], right_temple: [0.70, 0.38], crown: [0.50, 0.12],
    left_ear: [0.26, 0.56], right_ear: [0.74, 0.56], nape: [0.50, 0.82],
};
/** The allowed-pixel rule of applyShade(): bytes >= 128, otherwise >= 0.5, clipped to the box. */
export function hairSupport(mask, width, height, box = [0, 0, width, height]) {
    const isByte = mask instanceof Uint8Array || mask instanceof Uint8ClampedArray;
    const allow = new Uint8Array(width * height);
    for (let y = box[1]; y < box[3]; y++)
        for (let x = box[0]; x < box[2]; x++) {
            const i = y * width + x;
            if (mask[i] >= (isByte ? 128 : 0.5))
                allow[i] = 1;
        }
    return allow;
}
/** The documented on-screen mix, independent of the renderer's own loop. */
export function expectedComposite(source, channels, allow, shadeId, level) {
    const opacity = (level - 1) / 4 * MAX_OPACITY, target = requireShade(shadeId).rgb;
    const out = new Uint8Array(source);
    allow.forEach((on, i) => {
        if (!on)
            return;
        for (let c = 0; c < 3; c++)
            out[i * channels + c] = Math.floor(source[i * channels + c] * (1 - opacity) + target[c] * opacity + 0.5);
    });
    return out;
}
/** Render one swatch with applyShade and compare it with the expected composite. */
export function targetEvidence(image, width, height, mask, landmarks, shadeId, level = 3, options = {}) {
    const before = new Uint8Array(image);
    const found = applyShade(image, width, height, mask, landmarks, shadeId, level, options);
    const sourceOk = before.every((v, i) => v === image[i]);
    if (!found.rendered) {
        return Object.freeze({ shade_id: shadeId, level, status: "refused", code: found.code, mean_delta_e: null,
            max_delta_e: null, outside_unchanged: true, alpha_unchanged: true, source_unchanged: sourceOk, guard_blended: false });
    }
    const channels = before.length / (width * height);
    const allow = hairSupport(mask, width, height, options.primaryBox);
    const expected = expectedComposite(before, channels, allow, shadeId, found.level);
    let outside = true, alpha = true, total = 0, top = 0, count = 0;
    const a = [0, 0, 0], b = [0, 0, 0];
    for (let i = 0; i < allow.length; i++) {
        const k = i * channels;
        if (channels === 4 && found.pixels[k + 3] !== before[k + 3])
            alpha = false;
        if (!allow[i]) {
            for (let c = 0; c < channels; c++)
                if (found.pixels[k + c] !== before[k + c])
                    outside = false;
            continue;
        }
        const d = ciede2000(pixelLab(found.pixels[k], found.pixels[k + 1], found.pixels[k + 2], a), pixelLab(expected[k], expected[k + 1], expected[k + 2], b));
        total += d;
        top = Math.max(top, d);
        count += 1;
    }
    const status = found.changedPixels === 0 ? "unchanged"
        : top <= DISPLAY_TOLERANCE && outside && alpha && sourceOk ? "meets_target" : "misses_target";
    return Object.freeze({ shade_id: shadeId, level: found.level, status, code: null,
        mean_delta_e: found.changedPixels === 0 ? 0 : total / count, max_delta_e: found.changedPixels === 0 ? 0 : top,
        outside_unchanged: outside, alpha_unchanged: alpha, source_unchanged: sourceOk, guard_blended: found.identityBlended });
}
/** The drawn RGBA control: a small 6x6 hair patch keeps the default identity guard from blending. */
export function controlCase() {
    const n = CONTROL_SIZE * CONTROL_SIZE, image = new Uint8Array(n * 4), mask = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
        const x = i % CONTROL_SIZE, y = Math.floor(i / CONTROL_SIZE), patch = x >= 44 && x < 50 && y >= 44 && y < 50;
        image.set(patch ? [96, 84, 76, 230] : [180, 176, 170, 230], i * 4);
        if (patch)
            mask[i] = 255;
    }
    return { image, mask };
}
/** Every swatch on the drawn control, lighter swatches explicitly allowed for the audit. */
export function auditPaletteTargets(level = 5) {
    const { image, mask } = controlCase();
    const evidence = catalogue().map((s) => targetEvidence(image, CONTROL_SIZE, CONTROL_SIZE, mask, CONTROL_ANCHORS, s.id, level, { allowLightening: true }));
    return { meets_target: evidence.filter((e) => e.status === "meets_target").length, swatches: evidence.length, evidence };
}
//# sourceMappingURL=evidence.js.map
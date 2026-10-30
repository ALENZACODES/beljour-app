/** Original PMU pigment simulations, healed first. Author: John Khan. */
import { byte, choice, colour, finish, number, options } from "./contracts.js";
import { luminance } from "./evidence.js";
import { drawPath, pointAt, project, union } from "./geometry.js";
export const PMU_STATES = ["healed", "fresh", "faded"];
export const PMU_METHODS = ["microblading", "powder", "nano"];
export const CONSULT_NOTE = "For a professional consultation. Pigment placement is illustrative; it does not predict a healed result.";
export function noise(index, seed) {
    let value = (Math.imul(index, 1664525) + Math.imul(seed, 1013904223)) >>> 0;
    value ^= value >>> 16;
    value = Math.imul(value, 2246822519) >>> 0;
    value ^= value >>> 13;
    return (value >>> 0) / 4294967296;
}
export function pigmentLayer(image, frames, method, state, density, seed) {
    const alpha = new Float64Array(image.width * image.height);
    const stateOpacity = { healed: 0.28, fresh: 0.45, faded: 0.12 }[state];
    let strokeCount = 0;
    frames.forEach((frame, sideIndex) => {
        if (method === "powder") {
            for (let y = 0; y < image.height; y++) {
                for (let x = 0; x < image.width; x++) {
                    const i = y * image.width + x;
                    if (frame.mask[i] <= 0)
                        continue;
                    const [u] = project(frame, x + 0.5, y + 0.5);
                    const edge = Math.max(0, Math.min(1, u * 8, (1 - u) * 8));
                    const texture = 0.65 + 0.35 * noise(i, seed + 17 * sideIndex);
                    alpha[i] = Math.max(alpha[i], frame.mask[i] * edge * texture * density * stateOpacity * 0.72);
                }
            }
            return;
        }
        const n = Math.floor(12 + density * 46);
        for (let i = 0; i < n; i++) {
            const u = (i + 0.5) / n, jitter = (noise(i + sideIndex * 131, seed) - 0.5) * 0.025;
            const arch = 0.065 * Math.sin(Math.PI * u);
            const base = pointAt(frame, u, arch - frame.height / frame.width * 0.12);
            const length = Math.min(frame.height * 0.8, frame.width * (0.08 + 0.035 * noise(i + 67, seed)));
            const direction = 0.35 + 0.45 * u;
            const tip = [base[0] + (frame.up[0] + frame.across[0] * direction) * length,
                base[1] + (frame.up[1] + frame.across[1] * direction) * length];
            const middle = [(base[0] + tip[0]) / 2 + frame.across[0] * frame.width * jitter,
                (base[1] + tip[1]) / 2 + frame.across[1] * frame.width * jitter];
            const points = [];
            for (let step = 0; step <= 8; step++) {
                const t = step / 8;
                points.push([(1 - t) ** 2 * base[0] + 2 * (1 - t) * t * middle[0] + t * t * tip[0],
                    (1 - t) ** 2 * base[1] + 2 * (1 - t) * t * middle[1] + t * t * tip[1]]);
            }
            const strokeWidth = Math.max(method === "nano" ? 0.35 : 0.55, frame.width * (method === "nano" ? 0.009 : 0.013));
            drawPath(alpha, image.width, image.height, points, strokeWidth, stateOpacity * density, frame.mask);
            strokeCount++;
        }
    });
    return { alpha, strokeCount };
}
export function renderPigment(image, frames, feature, settings) {
    const opts = options(settings, ["amount", "colour", "state", "density", "seed", "method"]);
    const amount = number(opts.amount ?? 0.5, "amount", 0, 1), density = number(opts.density ?? 0.45, "density", 0, 0.75);
    const state = choice(opts.state ?? "healed", "state", PMU_STATES);
    const method = choice(opts.method ?? (feature === "W71" ? "microblading" : "powder"), "method", PMU_METHODS);
    if (feature === "W71" && method !== "microblading")
        throw new RangeError("W71 uses microblading; compare powder or nano with W72");
    const target = colour(opts.colour ?? [79, 57, 46]);
    const seed = number(opts.seed ?? 17, "seed", 0, 2147483647);
    if (!Number.isInteger(seed))
        throw new RangeError("seed must be an integer");
    const { alpha, strokeCount } = pigmentLayer(image, frames, method, state, density, seed);
    const output = Uint8ClampedArray.from(image.data);
    let maximum = 0, skinSum = 0, skinCount = 0;
    const region = union(frames);
    for (let i = 0; i < alpha.length; i++) {
        alpha[i] *= amount;
        maximum = Math.max(maximum, alpha[i]);
        const o = i * image.channels;
        for (let c = 0; c < 3; c++)
            output[o + c] = byte(image.data[o + c] * (1 - alpha[i]) + target[c] * alpha[i]);
        if (region[i] >= 0.5) {
            skinSum += luminance(image.data[o], image.data[o + 1], image.data[o + 2]);
            skinCount++;
        }
    }
    const skinLight = skinCount ? skinSum / skinCount : 0;
    const contrast = Math.abs(skinLight - luminance(...target));
    const warnings = [CONSULT_NOTE, "Fresh, healed and faded are artistic states, not measured retention rates."];
    if (contrast < 25)
        warnings.push("This pigment has low contrast on the observed brow area. Actual payoff and retention need professional assessment.");
    if (state === "fresh")
        warnings.push("Fresh pigment is darker here. The default comparison is healed.");
    return finish(image, output, alpha, { feature, method, state, pigment_strokes: strokeCount,
        new_hair_claim: false, density, maximum_opacity: maximum, observed_pigment_contrast: contrast, prediction: false }, warnings);
}
export function compareMethods(image, frames, settings) {
    return { microblading: renderPigment(image, frames, "W71", { ...settings, method: "microblading" }),
        powder: renderPigment(image, frames, "W72", { ...settings, method: "powder" }),
        nano: renderPigment(image, frames, "W72", { ...settings, method: "nano" }) };
}
//# sourceMappingURL=pigment.js.map
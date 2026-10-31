/** W69 tint and W70 observed-pixel transport. Author: John Khan. */
import { byte, choice, colour, finish, number, options } from "./contracts.js";
import { components, evidenceSummary, luminance } from "./evidence.js";
import { project, union } from "./geometry.js";
export function tintSuggestion(image, evidence, frames) {
    const region = union(frames), channels = [[], [], []];
    let skinSum = 0, skinCount = 0;
    for (let i = 0; i < region.length; i++) {
        const o = i * image.channels;
        if (evidence.coverage[i] >= 0.5)
            for (let c = 0; c < 3; c++)
                channels[c].push(image.data[o + c]);
        if (region[i] >= 0.5 && evidence.coverage[i] < 0.2) {
            skinSum += luminance(image.data[o], image.data[o + 1], image.data[o + 2]);
            skinCount++;
        }
    }
    if (!channels[0].length)
        return [92, 72, 59];
    const ratio = (skinCount ? skinSum / skinCount : 150) > 130 ? 0.85 : 0.94;
    const values = channels.map(channel => {
        channel.sort((a, b) => a - b);
        return byte(channel[Math.floor((channel.length - 1) / 2)] * ratio);
    });
    return [values[0], values[1], values[2]];
}
export function renderTint(image, evidence, frames, settings) {
    const opts = options(settings, ["amount", "colour", "state", "greyResistance"]);
    const amount = number(opts.amount ?? 0.5, "amount", 0, 1);
    const state = choice(opts.state ?? "settled", "state", ["settled", "first_week", "faded"]);
    const resistance = number(opts.greyResistance ?? 0.65, "greyResistance", 0, 1);
    const target = colour(opts.colour ?? tintSuggestion(image, evidence, frames));
    const intensity = { settled: 0.52, first_week: 0.82, faded: 0.24 }[state];
    const alpha = new Float64Array(evidence.coverage.length), output = Uint8ClampedArray.from(image.data);
    let maximum = 0, anyCoverage = false;
    for (let i = 0; i < alpha.length; i++) {
        const cover = evidence.coverage[i];
        const greyShare = cover > 0 ? evidence.grey[i] / cover : 0;
        alpha[i] = cover * amount * intensity * (1 - greyShare * resistance);
        maximum = Math.max(maximum, alpha[i]);
        anyCoverage ||= cover > 0;
        for (let c = 0; c < 3; c++) {
            const o = i * image.channels + c;
            output[o] = byte(image.data[o] * (1 - alpha[i]) + target[c] * alpha[i]);
        }
    }
    const observed = evidenceSummary(evidence, union(frames));
    const warnings = [...evidence.notes];
    if (Number(observed.observed_coverage_fraction) < 0.12)
        warnings.push("Sparse areas remain sparse. Compare a separate pigment-stroke or powder simulation if wanted.");
    if (state === "first_week")
        warnings.push("The first-week view intentionally looks darker; it is an illustrative state, not a duration guarantee.");
    if (!anyCoverage)
        warnings.push("No reliable brow hair coverage. Mark the visible hairs before applying tint.");
    return finish(image, output, alpha, { ...observed, state, grey_resistance: resistance, colour: target,
        maximum_opacity: maximum, skin_gap_unchanged: true }, warnings, anyCoverage ? "simulation" : "unavailable");
}
export function renderLamination(image, evidence, frames, settings) {
    const opts = options(settings, ["amount", "angle"]);
    const amount = number(opts.amount ?? 0.5, "amount", 0, 1), angle = number(opts.angle ?? 60, "angle", 0, 85);
    const support = new Float64Array(image.width * image.height), output = Uint8ClampedArray.from(image.data);
    const used = new Set(), swaps = [];
    let refused = 0, measuredGroups = 0, maxMove = 0;
    for (const frame of frames) {
        const local = evidence.coverage.map((value, i) => value * frame.mask[i]);
        for (const group of components(local, image.width, image.height)) {
            measuredGroups++;
            if (group.length < 2) {
                refused++;
                continue;
            }
            const projected = group.map(([x, y]) => project(frame, x + 0.5, y + 0.5));
            let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
            for (const [u, v] of projected) {
                minU = Math.min(minU, u);
                maxU = Math.max(maxU, u);
                minV = Math.min(minV, v);
                maxV = Math.max(maxV, v);
            }
            if (maxU - minU > 0.35 || maxV - minV > 0.55) {
                refused++;
                continue;
            }
            let rootIndex = 0;
            for (let i = 1; i < group.length; i++) {
                if (projected[i][1] < projected[rootIndex][1] || (projected[i][1] === projected[rootIndex][1] && projected[i][0] < projected[rootIndex][0]))
                    rootIndex = i;
            }
            const [rootX, rootY] = group[rootIndex];
            const cx = group.reduce((s, p) => s + p[0], 0) / group.length;
            const cy = group.reduce((s, p) => s + p[1], 0) / group.length;
            const vx = cx - rootX, vy = cy - rootY;
            if (Math.hypot(vx, vy) < 0.25) {
                refused++;
                continue;
            }
            const current = Math.atan2(vy, vx), radians = angle * Math.PI / 180;
            const desired = Math.atan2(frame.up[1] * Math.sin(radians) + frame.across[1] * Math.cos(radians), frame.up[0] * Math.sin(radians) + frame.across[0] * Math.cos(radians));
            let delta = Math.atan2(Math.sin(desired - current), Math.cos(desired - current)) * amount;
            delta = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, delta));
            const cosA = Math.cos(delta), sinA = Math.sin(delta);
            const ordered = [...group].sort((a, b) => {
                const da = (a[0] - rootX) ** 2 + (a[1] - rootY) ** 2;
                const db = (b[0] - rootX) ** 2 + (b[1] - rootY) ** 2;
                return db - da || b[1] - a[1] || b[0] - a[0];
            });
            for (const [x, y] of ordered) {
                const dx = x - rootX, dy = y - rootY;
                const nx = Math.floor(rootX + cosA * dx - sinA * dy + 0.5), ny = Math.floor(rootY + sinA * dx + cosA * dy + 0.5);
                const src = y * image.width + x, dst = ny * image.width + nx;
                if ((nx === x && ny === y) || used.has(src) || used.has(dst))
                    continue;
                if (nx < 0 || nx >= image.width || ny < 0 || ny >= image.height)
                    continue;
                const [u, v] = project(frame, nx + 0.5, ny + 0.5);
                if (u < -0.05 || u > 1.05 || v < -0.10 || v > 0.55)
                    continue;
                if (evidence.coverage[dst] >= 0.5)
                    continue;
                if (image.channels === 4 && (image.data[src * 4 + 3] !== 255 || image.data[dst * 4 + 3] !== 255))
                    continue;
                const movement = Math.hypot(nx - x, ny - y);
                if (movement > frame.width * 0.25)
                    continue;
                used.add(src);
                used.add(dst);
                swaps.push([x, y, nx, ny]);
                maxMove = Math.max(maxMove, movement);
            }
        }
    }
    if (amount > 0) {
        for (const [x, y, nx, ny] of swaps) {
            const src = y * image.width + x, dst = ny * image.width + nx;
            for (let c = 0; c < 3; c++) {
                output[src * image.channels + c] = image.data[dst * image.channels + c];
                output[dst * image.channels + c] = image.data[src * image.channels + c];
            }
            support[src] = 1;
            support[dst] = 1;
        }
    }
    else
        swaps.length = 0;
    const observed = evidenceSummary(evidence, union(frames)), warnings = [...evidence.notes];
    if (Number(observed.observed_coverage_fraction) < 0.12 || !swaps.length)
        warnings.push("Sparse, short or unseparated brows may show very little change. A pigment preview is a separate option.");
    if (angle > 70 || amount > 0.75)
        warnings.push("A strongly upright direction can exceed the visible hair length; this preview does not lengthen it.");
    return finish(image, output, support, { ...observed, observed_components: measuredGroups,
        refused_components: refused, transported_pixels: swaps.length, maximum_movement_px: swaps.length ? maxMove : 0,
        length_scale: 1, smoothing_applied: false, rgb_histogram_conserved: true }, warnings, amount > 0 && !swaps.length ? "unavailable" : "simulation");
}

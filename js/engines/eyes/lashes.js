/** Observed-lash transforms and original extension maps, W59-W63. Author: John Khan. */
import { polylineLength } from "./contracts.js";
import { interpolate } from "./geometry.js";
import { bezier, combine, randomValues, restoreTraceBackground, stroke } from "./raster.js";
export const STYLES = ["cat", "doll", "wispy", "kitten", "fox"];
export const EXTENSIONS = ["classic", "hybrid", "volume", "mega"];
export const MAP_ZONES = 7;
export function styleProfile(style, u) {
    switch (style) {
        case "cat": return .65 + .50 * u;
        case "doll": return .68 + .47 * Math.sin(Math.PI * u);
        case "wispy": return .75 + .24 * Math.sin(Math.PI * u) + .16 * Math.max(0, Math.cos(12 * Math.PI * u));
        case "kitten": return .7 + .44 * Math.exp(-(((u - .73) / .29) ** 2));
        case "fox": return .60 + .60 * u * u;
        default: throw new RangeError("unsupported lash styling profile");
    }
}
export function chooseStyle(frame, anatomy, desired = "") {
    if (desired && !STYLES.includes(desired))
        throw new RangeError("unsupported lash style");
    const chosen = desired || (frame.downturned || ["hooded", "deep_set"].includes(anatomy) ? "kitten" : "doll");
    const warnings = [];
    let why = "A central peak keeps the longest lashes above the open part of your eye.";
    if (["cat", "fox"].includes(chosen))
        why = "The length increases toward your outer corner.";
    else if (chosen === "kitten")
        why = "The longest section ends before the outer corner, so the tail stays lighter.";
    else if (chosen === "wispy")
        why = "Short and longer groups alternate; the measured lash line stays the anchor.";
    if (frame.downturned)
        warnings.push("Downturned outer corner: a long cat or fox tail may exaggerate the downward line.");
    if (anatomy === "hooded")
        warnings.push("Hooded eye: check the curl and length with the eye open before choosing a set.");
    if (anatomy === "monolid")
        why += " A gradual upright curl is placed from the lash line without inventing a crease.";
    if (anatomy === "deep_set")
        warnings.push("Deep-set eye: projected length may touch the upper fold; shorten the outer section if it does.");
    return { style: chosen, why, warnings };
}
export function extensionMap(frame, request) {
    const anatomy = request.anatomy[frame.side];
    let recommendation = chooseStyle(frame, anatomy), family = request.style || "classic";
    if (request.feature === "W60") {
        recommendation = chooseStyle(frame, anatomy, request.style);
        family = "classic";
    }
    else if (!EXTENSIONS.includes(family)) {
        throw new RangeError("extension style must be classic, hybrid, volume or mega");
    }
    const style = recommendation.style, zones = [];
    for (let i = 0; i < MAP_ZONES; i++) {
        const start = i / MAP_ZONES, end = (i + 1) / MAP_ZONES, midpoint = (start + end) / 2;
        let length = request.length * styleProfile(style, midpoint);
        if (frame.downturned && midpoint > .8)
            length *= .78;
        const fans = family === "classic" ? 1 : family === "hybrid" ? (i % 2 ? 2 : 1) : family === "volume" ? 3 : 5;
        zones.push({ zone: i + 1, start, end, length_eye_width: length, length_px: length * frame.width, curl: request.curl, fan_count: fans });
    }
    const warnings = [...recommendation.warnings];
    if (request.natural_density === null)
        warnings.push("Natural lash density has not been measured. Attachment suitability is unknown.");
    else if (request.natural_density < .25 && ["volume", "mega"].includes(family))
        warnings.push("Unrealistic on very sparse natural lashes: this simulated density may not be achievable.");
    if (request.glasses_clearance !== null) {
        const projected = Math.max(...zones.map(z => z.length_eye_width)) * (1 - .35 * request.curl);
        if (projected > request.glasses_clearance)
            warnings.push("Possible glasses collision: the simulated lash projection exceeds your entered clearance.");
    }
    return { side: frame.side, style, family, zones, warnings, why: recommendation.why, physical_mm: null,
        scale_note: "Lengths use measured eye width; millimetres require a known physical scale.",
        professional_review: "An original visual lash map for discussion, not a treatment instruction." };
}
export function extensionStrokes(frame, request) {
    const report = extensionMap(frame, request), paths = [];
    const rng = randomValues(request.seed + (frame.side === "left" ? 17 : 0), 48);
    for (let index = 0; index < 28; index++) {
        const u = .045 + index / 27 * .91, zone = report.zones[Math.min(MAP_ZONES - 1, Math.floor(u * MAP_ZONES))];
        const v = interpolate(frame.upper, u), length = zone.length_eye_width;
        for (let fan = 0; fan < zone.fan_count; fan++) {
            const spread = (fan - (zone.fan_count - 1) / 2) * .018;
            const lean = .03 + .07 * u + spread;
            const end = frame.point(u + lean, v + length * (.72 + .28 * request.curl));
            const control = frame.point(u + lean * .28, v + length * (.25 + .35 * request.curl));
            const root = frame.point(u, v + .008), variation = .96 + .08 * rng[index];
            const varied = [root[0] + (end[0] - root[0]) * variation, root[1] + (end[1] - root[1]) * variation];
            paths.push(bezier(root, control, varied));
        }
    }
    report.synthetic_strokes = paths.length;
    report.anchors = paths.map(path => [...path[0]]);
    return { paths, report };
}
export function stripStrokes(frame, request) {
    const style = request.style || "strip";
    if (!["strip", "cluster", "half_strip"].includes(style))
        throw new RangeError("strip style must be strip, cluster or half_strip");
    const groups = style === "cluster" ? 7 : 15, begin = style === "half_strip" ? .46 : .055;
    const paths = [], anchors = [];
    for (let i = 0; i < groups; i++) {
        const u = begin + (.94 - begin) * i / Math.max(1, groups - 1), v = interpolate(frame.upper, u);
        anchors.push(frame.point(u, v));
        for (let j = 0; j < (style === "cluster" ? 4 : 2); j++) {
            const shift = (j - (style === "cluster" ? 1.5 : .5)) * .025;
            const root = frame.point(u, v + .008), length = request.length * (.72 + .26 * Math.sin(Math.PI * u));
            const end = frame.point(u + shift + .07 * u, v + length);
            const control = frame.point(u + shift * .3, v + length * (.35 + .2 * request.curl));
            paths.push(bezier(root, control, end));
        }
    }
    const warnings = [];
    if (request.glasses_clearance !== null && request.length > request.glasses_clearance)
        warnings.push("Possible glasses collision: shorten the lash or check the frame clearance.");
    return { paths, report: { side: frame.side, style, groups, eye_width_px: frame.width, anchors: anchors.map(p => [...p]),
            synthetic_strokes: paths.length, warnings, product: "Original generic shape; no product availability or exact fit is claimed." } };
}
export function observedPaths(frame, request, width, height) {
    const output = [];
    for (const item of request.observed_lashes) {
        if (item.side !== frame.side || item.confidence < .5 || (item.lower && !request.lower))
            continue;
        const path = item.points.map(([x, y]) => [x * width, y * height]);
        const [u, v] = frame.local(...path[0]);
        const target = interpolate(item.lower ? frame.lower : frame.upper, Math.min(1, Math.max(0, u)));
        if (u < -.04 || u > 1.04 || Math.abs(v - target) > .08)
            throw new RangeError("observed lash root is not on the measured lash line");
        if (polylineLength(path) > frame.width * .55)
            throw new RangeError("observed lash length is implausibly large for this eye");
        output.push({ trace: item, path });
    }
    return output;
}
export function liftedPath(frame, path, curl, lower) {
    const originalLength = polylineLength(path), root = path[0], [u, v] = frame.local(...root);
    const direction = lower ? -1 : 1, length = originalLength / frame.width;
    const control = frame.point(u + length * .12, v + direction * length * (.18 + .50 * curl));
    const end = frame.point(u + length * (.60 - .45 * curl), v + direction * length * (.45 + .52 * curl));
    const curved = bezier(root, control, end), factor = originalLength / Math.max(polylineLength(curved), 1e-12);
    return curved.map(([x, y]) => [root[0] + (x - root[0]) * factor, root[1] + (y - root[1]) * factor]);
}
export function mascaraPath(path, kind, amount) {
    if (kind !== "lengthening")
        return [...path];
    const tail = [path.at(-1)[0] - path.at(-2)[0], path.at(-1)[1] - path.at(-2)[1]];
    const norm = Math.hypot(...tail), extra = polylineLength(path) * .12 * amount;
    return [...path, [path.at(-1)[0] + tail[0] / Math.max(norm, 1e-12) * extra, path.at(-1)[1] + tail[1] / Math.max(norm, 1e-12) * extra]];
}
export function renderLashes(image, eyeFrames, request, protection) {
    const { height, width } = image;
    let mask = new Float64Array(height * width), remove = new Float64Array(height * width);
    const reports = [], lengthErrors = [];
    let inputCount = 0, outputCount = 0;
    const style = request.style || (request.feature === "W61" ? "lifting" : "volumising");
    if (["W63", "W76"].includes(request.feature) && !["lengthening", "volumising", "tubing", "navy", "burgundy", "forest"].includes(style))
        throw new RangeError("unsupported mascara type");
    if (request.feature === "W61" && !["lifting", "tint"].includes(style))
        throw new RangeError("lift style must be lifting or tint");
    for (const frame of eyeFrames) {
        if (!frame.visible) {
            reports.push({ side: frame.side, status: "unavailable", warnings: ["Open this eye for a reliable lash preview."] });
            continue;
        }
        if (["W59", "W60", "W62"].includes(request.feature)) {
            const { paths, report } = request.feature === "W62" ? stripStrokes(frame, request) : extensionStrokes(frame, request);
            for (const path of paths)
                mask = combine(mask, stroke(height, width, path, Math.max(.3, request.thickness * frame.width / 2), true));
            if (request.feature === "W62" && (request.style || "strip") !== "cluster") {
                const band = Array.from({ length: 25 }, (_, i) => {
                    const u = .05 + .90 * i / 24;
                    return frame.point(u, interpolate(frame.upper, u) + .008);
                });
                mask = combine(mask, stroke(height, width, band, Math.max(.3, .005 * frame.width)));
            }
            const fit = fitMetrics(frame, paths);
            report.fit = fit;
            report.warnings.push(...fit.warnings);
            reports.push(report);
            outputCount += paths.length;
            continue;
        }
        const observed = observedPaths(frame, request, width, height);
        inputCount += observed.length;
        reports.push({ side: frame.side, observed_count: observed.length, warnings: [] });
        for (const { trace: item, path } of observed) {
            let radius = Math.max(.3, request.thickness * frame.width / 2), target = path;
            if (request.feature === "W61" && style === "lifting") {
                target = liftedPath(frame, path, request.curl, item.lower);
                remove = combine(remove, stroke(height, width, path, radius, true));
                lengthErrors.push(Math.abs(polylineLength(path) - polylineLength(target)));
            }
            else {
                target = mascaraPath(path, style, request.amount);
                radius *= style === "volumising" ? 1 + 1.1 * request.amount : 1 + .45 * request.amount;
            }
            mask = combine(mask, stroke(height, width, target, radius, style !== "tubing"));
            if (request.smudge > 0 && ["W63", "W76"].includes(request.feature)) {
                const [u, v] = frame.local(...path[0]);
                const shadow = [frame.point(u - .02, v - .045), frame.point(u + .025, v - .06)];
                const smudged = stroke(height, width, shadow, Math.max(.4, frame.width * .025), false, 2).map(x => x * request.smudge * .28);
                mask = combine(mask, smudged);
            }
            outputCount++;
        }
    }
    for (let i = 0; i < mask.length; i++)
        if (protection[i] !== 0) {
            mask[i] = 0;
            remove[i] = 0;
        }
    const cleaned = remove.some(v => v > 0) ? restoreTraceBackground(image, remove.map(v => v * request.amount), protection) : { image: Uint8ClampedArray.from(image.data), unreliable: 0 };
    const unavailable = ["W61", "W63", "W76"].includes(request.feature) && inputCount === 0;
    return { image: cleaned.image, mask, removal: remove, report: { maps: reports, observed_count: inputCount, rendered_count: outputCount,
            invented_natural_lashes: 0, length_error_px: Math.max(0, ...lengthErrors), unfilled_trace_pixels: cleaned.unreliable,
            status: unavailable ? "unavailable" : "simulation", reason: unavailable ? "Trace your visible lashes first; a face mesh cannot count them." : "" } };
}
/** Visible-plane fit diagnostics; these never certify physical attachment or lens clearance. */
export function fitMetrics(frame, paths) {
    if (!paths.length)
        return { strokes: 0, root_error_px_max: null, brow_clearance_eye_width: null,
            outer_overhang_eye_width: null, projection_kind: "image_plane", warnings: [] };
    const rootErrors = [], lengths = [];
    let maximumU = -Infinity, maximumV = -Infinity;
    for (const path of paths) {
        if (path.length < 2)
            throw new RangeError("lash fit needs complete paths");
        const [rootU, rootV] = frame.local(...path[0]);
        const target = interpolate(frame.upper, Math.min(1, Math.max(0, rootU))) + .008;
        rootErrors.push(Math.abs(rootV - target) * frame.width);
        lengths.push(polylineLength(path) / frame.width);
        for (const point of path) {
            const [u, v] = frame.local(...point);
            if (!Number.isFinite(u) || !Number.isFinite(v))
                throw new RangeError("lash fit paths must be finite");
            maximumU = Math.max(maximumU, u);
            maximumV = Math.max(maximumV, v);
        }
    }
    const clearance = frame.brow_space - maximumV, overhang = Math.max(0, maximumU - 1), warnings = [];
    if (clearance < 0)
        warnings.push("Lash tips cross the estimated brow line in this image. Compare a shorter set or a different curl.");
    if (overhang > .2)
        warnings.push("The outer overhang is large compared with the eye width. Check the visible tail before choosing a set.");
    return { strokes: paths.length, root_error_px_max: Math.max(...rootErrors), brow_clearance_eye_width: clearance,
        outer_overhang_eye_width: overhang, maximum_arc_length_eye_width: Math.max(...lengths), projection_kind: "image_plane",
        physical_fit_verified: false, warnings };
}

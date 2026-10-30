/** Public local renderer for eleven eye/lash features. Author: John Khan. */
import { LABEL, VERSION, parseRequest, validatePhoto } from "./contracts.js";
import { eyeProtection, frames, nativePlacement } from "./geometry.js";
import { renderLashes } from "./lashes.js";
import { COLOURED, graphicMask, linerMask } from "./liner.js";
import { traceSummary } from "./observations.js";
import { combine, paint } from "./raster.js";
import { displaySupport, occlusionField, visibilityReport } from "./visibility.js";
import { shadowFields } from "./shadow.js";
export function renderEyes(photo, landmarks, request, occlusionMask) {
    validatePhoto(photo);
    const options = parseRequest(request), { height, width } = photo;
    const measuredFrames = frames(landmarks, width, height), occlusion = occlusionField(occlusionMask, width, height);
    const visibility = visibilityReport(measuredFrames, options, width, height, occlusion, occlusionMask != null);
    const eyeFrames = visibility.frames, protection = eyeProtection(height, width, eyeFrames);
    const observations = traceSummary(options.observed_lashes, width, height);
    if (observations.duplicate_traces)
        throw new RangeError("duplicate observed lash traces");
    let result = Uint8ClampedArray.from(photo.data), coverage = new Float64Array(height * width);
    const report = {
        feature: options.feature, version: VERSION, label: LABEL, provider: "local_procedural_simulation", status: "simulation",
        real_face_quality: "Not tested", geometry_changed: false, eye_colour_changed: false, anatomy_source: "user_selection",
        warnings: [], sides: [], amount: options.amount, observations, visibility: visibility.report,
    };
    if (options.amount === 0) {
        report.status = "identity";
        return { image: result, coverage, report };
    }
    const current = () => ({ ...photo, data: result });
    const protect = (mask) => {
        for (let i = 0; i < mask.length; i++)
            mask[i] *= protection[i] !== 0 ? 0 : 1 - occlusion[i];
        return mask;
    };
    if (["W59", "W60", "W61", "W62", "W63"].includes(options.feature)) {
        const lashes = renderLashes(photo, eyeFrames, options, protection);
        for (let i = 0; i < lashes.mask.length; i++) {
            lashes.mask[i] *= 1 - occlusion[i];
            lashes.removal[i] *= 1 - occlusion[i];
        }
        let cleaned = lashes.image;
        if (occlusionMask != null) {
            const rgb = new Float64Array(height * width * 3);
            for (let i = 0; i < height * width; i++)
                for (let c = 0; c < 3; c++)
                    rgb[i * 3 + c] = cleaned[i * photo.channels + c];
            cleaned = paint(photo, occlusion.map(v => 1 - v), rgb);
        }
        result = paint({ ...photo, data: cleaned }, lashes.mask, options.colour, options.amount);
        coverage = combine(lashes.mask.map(v => v * options.amount), lashes.removal.map(v => v * options.amount));
        Object.assign(report, lashes.report);
        report.sides = eyeFrames.map(frame => nativePlacement(frame, options.anatomy[frame.side]));
    }
    else if (["W64", "W65", "W75", "W76"].includes(options.feature)) {
        let colour = options.colour;
        if (options.feature === "W76") {
            const chosen = options.style || "navy";
            if (!(chosen in COLOURED))
                throw new RangeError("coloured eye style must be navy, burgundy or forest");
            colour = COLOURED[chosen];
        }
        for (const frame of eyeFrames) {
            const field = options.feature === "W65" ? graphicMask(height, width, frame, options) : linerMask(height, width, frame, options);
            protect(field.mask);
            result = paint(current(), field.mask, colour, options.amount);
            coverage = combine(coverage, field.mask.map(v => v * options.amount));
            report.sides.push(field.report);
        }
        if (options.feature === "W76") {
            const lashes = renderLashes(photo, eyeFrames, { ...options, style: "tubing" }, protection);
            for (let i = 0; i < lashes.mask.length; i++)
                lashes.mask[i] *= 1 - occlusion[i];
            result = paint(current(), lashes.mask, colour, options.amount);
            coverage = combine(coverage, lashes.mask.map(v => v * options.amount));
            report.mascara = lashes.report;
            if (lashes.report.status === "unavailable")
                report.warnings.push("Coloured liner is shown. Trace your visible lashes to preview coloured mascara.");
        }
        if (options.feature === "W75")
            report.artist_validation = "Not tested; expert and real-model review is required before a quality claim.";
    }
    else {
        for (const frame of eyeFrames) {
            const field = shadowFields(photo, frame, options);
            protect(field.mask);
            result = paint(current(), field.mask, field.pigment, options.amount);
            coverage = combine(coverage, field.mask.map(v => v * options.amount));
            report.sides.push(field.report);
        }
    }
    let changedPixels = 0, coveredPixels = 0, protectedPixels = 0;
    for (let i = 0; i < height * width; i++) {
        const offset = i * photo.channels;
        if (photo.channels === 4 && photo.data[offset + 3] === 0) {
            for (let c = 0; c < photo.channels; c++)
                result[offset + c] = photo.data[offset + c];
            coverage[i] = 0;
        }
        if ([0, 1, 2].some(c => result[offset + c] !== photo.data[offset + c]))
            changedPixels++;
        if (coverage[i] > 0)
            coveredPixels++;
        if (protection[i] > 0)
            protectedPixels++;
    }
    const maps = (report.maps ?? []);
    report.display_support = displaySupport(photo, result, coverage, eyeFrames);
    for (const item of [...report.sides, ...maps, ...visibility.report.sides]) {
        if (Array.isArray(item.warnings))
            report.warnings.push(...item.warnings);
        const payoff = item.payoff;
        if (payoff?.warnings)
            report.warnings.push(...payoff.warnings);
    }
    if (!eyeFrames.some(frame => frame.visible)) {
        report.status = "unavailable";
        report.reason = "Both eyes are closed or too small for a reliable preview.";
    }
    report.changed_pixels = changedPixels;
    report.coverage_pixels = coveredPixels;
    report.protected_eye_pixels = protectedPixels;
    report.warnings = [...new Set(report.warnings)];
    return { image: result, coverage, report };
}
//# sourceMappingURL=engine.js.map
/** R17B browser mirror for women hair. Author: John Khan. */
import { blendGrey, defineCurls, recolour } from "./colour.js";
import { parseHairOptions, validateGeometry, validateMask, validatePhoto, } from "./contracts.js";
import { extensionMask, foilPattern, fringeMask, lowerHair, rootBand, scalpBand, sideRegion, topperMask, } from "./masks.js";
import { greyTransition, humidityForecast, postpartumRegrowth } from "./timeline.js";
function copyF32(source) {
    const out = new Float32Array(new ArrayBuffer(source.length * Float32Array.BYTES_PER_ELEMENT));
    out.set(source);
    return out;
}
function copyU8(source) {
    const out = new Uint8ClampedArray(new ArrayBuffer(source.length));
    out.set(source);
    return out;
}
function coverageFor(photo, hair, scalp, geometry, request) {
    switch (request.feature) {
        case "W19":
        case "W20":
            return copyF32(extensionMask(hair, photo, geometry, request.length_ratio, request.volume));
        case "W21":
        case "W22":
            return copyF32(topperMask(hair, photo, geometry, request.volume));
        case "W23":
        case "W32":
        case "W33": {
            const roots = rootBand(hair, photo, geometry);
            const out = copyF32(roots);
            for (let index = 0; index < out.length; index += 1) {
                out[index] = Math.max(out[index], scalp[index] * 0.35);
            }
            return out;
        }
        case "W24":
        case "W25":
        case "W41":
        case "W42": {
            const out = copyF32(scalpBand(hair, photo.width, photo.height, 4));
            for (let index = 0; index < out.length; index += 1) {
                out[index] = Math.max(out[index], scalp[index]);
            }
            return out;
        }
        case "W29":
            return copyF32(foilPattern(hair, photo.width, 4, 0.15));
        case "W30":
            return copyF32(foilPattern(hair, photo.width, 13));
        case "W31":
            return copyF32(foilPattern(hair, photo.width, 6, 0.08));
        case "W34":
            return copyF32(lowerHair(hair, photo, geometry, 0.48));
        case "W35":
            return copyF32(sideRegion(hair, photo.width, "left"));
        case "W36":
            return copyF32(lowerHair(sideRegion(hair, photo.width, "right"), photo, geometry, 0.46));
        case "W37":
            return copyF32(fringeMask(hair, photo, geometry, request.amount));
        default:
            return copyF32(hair);
    }
}
export function renderHair(photo, hairMask, scalpMask, geometry, options) {
    validatePhoto(photo);
    validateMask(hairMask, photo, "hair_mask");
    validateMask(scalpMask, photo, "scalp_mask");
    validateGeometry(geometry);
    const request = parseHairOptions(options);
    const coverage = coverageFor(photo, hairMask, scalpMask, geometry, request);
    if (request.amount === 0) {
        return {
            data: copyU8(photo.data),
            coverage: new Float32Array(new ArrayBuffer(coverage.length * Float32Array.BYTES_PER_ELEMENT)),
            report: { feature: request.feature, label: "identity" },
        };
    }
    let data = copyU8(photo.data);
    const report = {
        feature: request.feature,
        label: "Local hair simulation. Estimate where stated.",
        provider: "local",
        simulation: true,
    };
    switch (request.feature) {
        case "W19":
        case "W20":
        case "W21":
        case "W22":
        case "W37":
        case "W38":
            data = copyU8(recolour(photo, coverage, request.colour, request.amount * 0.45, 0.9));
            if (request.feature === "W19" || request.feature === "W20") {
                report.stretched_length_ratio = request.length_ratio;
                report.worn_length_ratio = request.length_ratio * (0.72 + 0.28 * request.curl_strength);
            }
            break;
        case "W23":
        case "W24":
        case "W25":
            data = copyU8(recolour(photo, coverage, request.colour, request.amount * (request.scalp_sensitivity ? 0.35 : 0.55), 0.95));
            break;
        case "W26":
            data = copyU8(recolour(photo, coverage, request.colour, request.amount * 0.65, 0.82));
            break;
        case "W29":
        case "W30":
        case "W31":
        case "W34":
        case "W35":
        case "W36":
            data = copyU8(recolour(photo, coverage, request.accent, request.amount * 0.72, 0.86));
            report.placement_map = true;
            break;
        case "W32":
        case "W33": {
            const share = request.feature === "W32"
                ? request.grey_share
                : greyTransition(request.grey_share, 18)[Math.min(request.month, 18)].natural_share;
            data = copyU8(blendGrey(photo, coverage, share, request.amount));
            report.natural_grey_share = share;
            if (request.feature === "W33") {
                report.timeline = greyTransition(request.grey_share, 18);
            }
            break;
        }
        case "W40":
            data = copyU8(defineCurls(photo, coverage, request.amount));
            report.curl_pattern_preserved = true;
            break;
        case "W41": {
            const growth = postpartumRegrowth(request.month, request.amount);
            data = copyU8(recolour(photo, coverage, request.colour, 0.35 * growth.relative_density, 0.95));
            report.regrowth = growth;
            report.medical_advice = false;
            break;
        }
        case "W42":
            data = copyU8(recolour(photo, coverage, request.colour, Math.min(request.amount, 0.45) * 0.3, 0.98));
            report.mode = "calm_sensitive";
            report.copy = "Optional gentle visual aid. Keeping the current look is an equal option.";
            report.medical_advice = false;
            break;
        case "W43":
            data = copyU8(defineCurls(photo, coverage, request.amount * (0.7 + 0.3 * request.heat_shape)));
            report.heat_warning = "preview only; safe heat depends on hair condition and tools";
            break;
        case "W44": {
            const forecast = humidityForecast(request.humidity, request.curl_strength);
            data = copyU8(defineCurls(photo, coverage, request.amount * forecast.definition_retention));
            report.forecast = forecast;
            break;
        }
    }
    if (photo.channels === 4) {
        for (let index = 0; index < coverage.length; index += 1) {
            data[index * 4 + 3] = photo.data[index * 4 + 3];
        }
    }
    return { data, coverage, report };
}

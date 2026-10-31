/** R17B browser mirror for women makeup. Author: John Khan. */
import { applyFinish, applyTint } from "./colour.js";
import { parseMakeupOptions } from "./contracts.js";
import { blushMap, concealerMap, contourMap, correctionMap } from "./maps.js";
import { oxidationCurve, seasonalMix } from "./oxidation.js";
import { extractPalette, recommend } from "./palette.js";
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
function required(masks, name, photo) {
    const mask = masks[name];
    if (!mask || mask.length !== photo.width * photo.height) {
        throw new RangeError(`${name} mask required`);
    }
    return copyF32(mask);
}
function multiply(a, b) {
    const out = new Float32Array(new ArrayBuffer(a.length * Float32Array.BYTES_PER_ELEMENT));
    for (let index = 0; index < a.length; index += 1) {
        out[index] = a[index] * b[index];
    }
    return out;
}
function union(...masks) {
    const length = masks[0]?.length ?? 0;
    const out = new Float32Array(new ArrayBuffer(length * Float32Array.BYTES_PER_ELEMENT));
    for (const mask of masks) {
        for (let index = 0; index < out.length; index += 1) {
            out[index] = Math.max(out[index], mask[index]);
        }
    }
    return out;
}
function empty(photo) {
    return new Float32Array(new ArrayBuffer(photo.width * photo.height * Float32Array.BYTES_PER_ELEMENT));
}
function originalLook(name) {
    const looks = {
        gallery_glow: { eye: [92, 61, 57], cheek: [146, 83, 76], lip: [118, 55, 62] },
        midnight_line: { eye: [45, 42, 51], cheek: [123, 77, 69], lip: [103, 46, 58] },
        soft_flash: { eye: [121, 89, 78], cheek: [164, 97, 84], lip: [141, 72, 82] },
        velvet_evening: { eye: [79, 52, 63], cheek: [133, 71, 75], lip: [96, 38, 52] },
    };
    const look = looks[name];
    if (!look) {
        throw new RangeError("unknown original look");
    }
    return look;
}
export function renderMakeup(photo, masks, options) {
    const request = parseMakeupOptions(options);
    const skin = required(masks, "skin", photo);
    if (request.amount === 0) {
        return { data: copyU8(photo.data), coverage: empty(photo), report: { feature: request.feature, label: "identity" } };
    }
    let data = copyU8(photo.data);
    let coverage = copyF32(skin);
    const report = {
        feature: request.feature,
        provider: "local",
        simulation: true,
        label: "Local makeup simulation; shades are visual estimates.",
    };
    switch (request.feature) {
        case "W1":
            report.palette = recommend([request.shade, request.accent], request.undertone);
            coverage = empty(photo);
            break;
        case "W2":
            report.palette = extractPalette(photo, masks.palette_region, 6);
            coverage = empty(photo);
            break;
        case "W4":
            report.recommendations = recommend([request.shade, request.accent, [96, 54, 82], [166, 95, 72], [115, 86, 54]], request.undertone);
            coverage = empty(photo);
            break;
        case "W5":
            report.harmony = recommend([request.accent, request.shade], request.undertone);
            coverage = empty(photo);
            break;
        case "W7":
            coverage = multiply(concealerMap(photo.width, photo.height), skin);
            data = copyU8(applyTint(photo, coverage, request.shade, request.amount * 0.35));
            break;
        case "W8": {
            const issue = typeof request.metadata.issue === "string" ? request.metadata.issue : "redness";
            coverage = multiply(correctionMap(photo.width, photo.height, issue), skin);
            data = copyU8(applyTint(photo, coverage, issue === "under_eye" ? [108, 91, 70] : [82, 104, 73], request.amount * 0.22));
            report.correction_issue = issue;
            break;
        }
        case "W9":
            coverage = copyF32(skin);
            data = copyU8(applyFinish(photo, skin, request.finish === "cream" || request.finish === "powder" ? request.finish : "cream", request.amount));
            report.finish = request.finish;
            break;
        case "W10":
            coverage = copyF32(skin);
            data = copyU8(applyFinish(photo, skin, request.finish === "dewy" || request.finish === "matte" || request.finish === "skin_tint"
                ? request.finish
                : "skin_tint", request.amount));
            report.finish = request.finish;
            break;
        case "W11":
            coverage = multiply(blushMap(photo.width, photo.height, request.face_shape), skin);
            data = copyU8(applyTint(photo, coverage, request.accent, request.amount * 0.42));
            break;
        case "W12":
            coverage = multiply(contourMap(photo.width, photo.height, request.face_shape), skin);
            data = copyU8(applyTint(photo, coverage, [
                Math.trunc(request.shade[0] * 0.72),
                Math.trunc(request.shade[1] * 0.72),
                Math.trunc(request.shade[2] * 0.72),
            ], request.amount * 0.32));
            report.geometry_change = false;
            break;
        case "W13": {
            const lip = required(masks, "lip", photo);
            const cheek = required(masks, "cheek", photo);
            const eye = required(masks, "eye", photo);
            coverage = union(lip, cheek, eye);
            data = copyU8(applyTint(photo, lip, request.shade, request.amount * 0.5));
            data = copyU8(applyTint({ ...photo, data }, cheek, request.accent, request.amount * 0.25));
            report.reference_source = "user_checked";
            break;
        }
        case "W14": {
            const lip = required(masks, "lip", photo);
            const cheek = required(masks, "cheek", photo);
            const eye = required(masks, "eye", photo);
            const look = originalLook(request.look);
            coverage = union(lip, cheek, eye);
            data = copyU8(applyTint(photo, lip, look.lip, request.amount * 0.58));
            data = copyU8(applyTint({ ...photo, data }, cheek, look.cheek, request.amount * 0.3));
            data = copyU8(applyTint({ ...photo, data }, eye, look.eye, request.amount * 0.4));
            report.look = request.look;
            report.third_party_names = false;
            break;
        }
        case "W16":
            coverage = union(multiply(concealerMap(photo.width, photo.height), skin), multiply(blushMap(photo.width, photo.height, request.face_shape), skin));
            data = copyU8(applyFinish(photo, coverage, "skin_tint", request.amount * 0.22));
            report.minimum_product = true;
            break;
        case "W17": {
            coverage = copyF32(skin);
            const factor = Math.max(0.78, 1 + Math.min(request.oxidation_delta, 0) / 100);
            const shade = [
                Math.trunc(request.shade[0] * factor),
                Math.trunc(request.shade[1] * factor),
                Math.trunc(request.shade[2] * factor),
            ];
            data = copyU8(applyTint(photo, skin, shade, request.amount * 0.28));
            report.timeline = oxidationCurve(request.oxidation_delta);
            break;
        }
        case "W18":
            coverage = empty(photo);
            report.mix = seasonalMix(request.season_shift);
            break;
    }
    if (photo.channels === 4) {
        for (let index = 0; index < coverage.length; index += 1) {
            data[index * 4 + 3] = photo.data[index * 4 + 3];
        }
    }
    return { data, coverage, report };
}

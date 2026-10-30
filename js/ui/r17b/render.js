/** Local dispatch for R17B studio worker jobs. Author: John Khan. */
import { renderGenderLook } from "../../engines/gender_look/index.js";
import { renderHair } from "../../engines/hair_women/engine.js";
import { renderMakeup } from "../../engines/makeup_w/engine.js";
import { renderShave } from "../../engines/shave/index.js";
import { upscale } from "../../engines/upscale/index.js";
import { runWorkflow } from "../../engines/workflow_w/index.js";
function copyU8(source) {
    const out = new Uint8ClampedArray(new ArrayBuffer(source.length));
    out.set(source);
    return out;
}
function changedFraction(before, after, channels) {
    let changed = 0;
    let count = 0;
    for (let pixel = 0; pixel < before.length / channels; pixel += 1) {
        let delta = 0;
        for (let channel = 0; channel < Math.min(3, channels); channel += 1) {
            delta = Math.max(delta, Math.abs(before[pixel * channels + channel] - after[pixel * channels + channel]));
        }
        if (delta > 1) {
            changed += 1;
        }
        count += 1;
    }
    return count ? changed / count : 0;
}
function defaultHair(job) {
    const colour = job.style.includes("bright") ? [186, 126, 78] : [94, 60, 42];
    const accent = [176, 113, 72];
    return {
        feature: job.feature,
        amount: job.amount,
        colour,
        accent,
        length_ratio: 0.45,
        volume: 0.42,
        grey_share: 0.38,
        month: 12,
        curl_strength: 0.64,
        heat_shape: 0.55,
        humidity: job.humidity,
        scalp_sensitivity: job.feature === "W42",
        seed: 17,
    };
}
function defaultMakeup(job) {
    const finish = job.feature === "W9" && (job.style === "cream" || job.style === "powder")
        ? job.style
        : job.feature === "W10" && (job.style === "dewy" || job.style === "matte" || job.style === "skin_tint")
            ? job.style
            : "satin";
    const faceShape = job.feature === "W11" && ["round", "oval", "square", "heart", "long", "balanced"].includes(job.style)
        ? job.style
        : "balanced";
    const look = job.feature === "W14" && ["gallery_glow", "midnight_line", "soft_flash", "velvet_evening"].includes(job.style)
        ? job.style
        : "gallery_glow";
    return {
        feature: job.feature,
        amount: job.amount,
        shade: [117, 67, 62],
        accent: [156, 91, 80],
        finish: finish,
        face_shape: faceShape,
        undertone: "olive",
        oxidation_delta: -6,
        season_shift: 0.22,
        look: look,
        metadata: { issue: job.style === "under_eye" ? "under_eye" : "redness" },
    };
}
export function renderJob(job, now = () => performance.now()) {
    const start = now();
    const fixture = job.fixture;
    const photo = fixture.photo;
    let pixels = copyU8(photo.data);
    let width = photo.width;
    let height = photo.height;
    let label = "Local simulation";
    let metrics = { feature: job.feature };
    const warnings = [];
    if (/^W(19|20|21|22|23|24|25|26|29|30|31|32|33|34|35|36|37|38|40|41|42|43|44)$/.test(job.feature)) {
        const result = renderHair(photo, fixture.hair, fixture.scalp, fixture.geometry, defaultHair(job));
        pixels = copyU8(result.data);
        metrics = { ...metrics, ...result.report, changed_fraction: changedFraction(photo.data, pixels, photo.channels) };
        label = "Local hair simulation";
    }
    else if (/^W(1|2|4|5|7|8|9|10|11|12|13|14|16|17|18)$/.test(job.feature)) {
        const result = renderMakeup(photo, fixture.masks, defaultMakeup(job));
        pixels = copyU8(result.data);
        metrics = { ...metrics, ...result.report, changed_fraction: changedFraction(photo.data, pixels, photo.channels) };
        label = "Local makeup simulation";
    }
    else if (["W94", "W96", "W99", "W100"].includes(job.feature)) {
        const feature = job.feature;
        const report = runWorkflow({
            feature,
            city: "Local",
            service: "Example",
            price_low: 80,
            price_high: 140,
            sessions: 1,
            maintenance_weeks: 8,
            occasion: "evening",
            look_id: "gallery_glow",
            depth: 42,
            undertone: "olive",
            hair_base: "medium brown",
            start_date: "2026-10-24",
        });
        metrics = { ...metrics, ...report };
        label = "Local workflow output";
    }
    else if (job.feature === "UPSCALE2" || job.feature === "UPSCALE4") {
        const scale = job.feature === "UPSCALE2" ? 2 : 4;
        const result = upscale(photo, scale, 0.55);
        pixels = copyU8(result.data);
        width = result.width;
        height = result.height;
        metrics = {
            ...metrics,
            scale,
            width,
            height,
            source_pixels: photo.width * photo.height,
            output_pixels: width * height,
        };
        label = "Classical local upscale";
    }
    else if (job.feature === "GENDER") {
        const result = renderGenderLook(photo, fixture.masks, {
            direction: job.direction,
            level: job.level,
            amount: job.amount,
        });
        pixels = copyU8(result.data);
        metrics = { ...metrics, ...result.report, changed_fraction: changedFraction(photo.data, pixels, photo.channels) };
        label = "Full-look signal simulation";
    }
    else if (job.feature === "SHAVE") {
        const result = renderShave(photo, fixture.masks.beard, fixture.masks.cheek, job.amount);
        pixels = copyU8(result.data);
        metrics = { ...metrics, ...result.report, changed_fraction: changedFraction(photo.data, pixels, photo.channels) };
        label = "Clean-shave visual estimate";
    }
    else {
        throw new RangeError(`unsupported studio feature ${job.feature}`);
    }
    const end = now();
    return {
        pixels,
        width,
        height,
        label,
        warnings,
        metrics,
        elapsedMs: Math.max(0, end - start),
    };
}
//# sourceMappingURL=render.js.map
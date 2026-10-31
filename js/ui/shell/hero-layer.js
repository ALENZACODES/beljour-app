/** Production entry for the existing appearance engines. The same guarded
 * field and age texture code used by the numeric arena produces these pixels.
 * No model, guessed mesh or provider fallback is added. Author: John Khan.
 */
import { compositeProviderHair } from "../../engines/haircolour/provider-hair.js";
import { olderYoucamFraction, renderProviderOlder } from "../../engines/older-youcam/provider-older.js";
import { relayOwnHighBand, renderAge } from "../../engines/local/age.js";
import { renderClock } from "../../engines/skin/texture-law.js";
import { genderTargets, LABEL as GENDER_LABEL } from "../../engines/local/gender.js";
import { closedLoop, levelFor } from "../../engines/local/gender-levels.js";
import { genderCues, relightGender } from "../../engines/local/gender-relight.js";
import { meshWarp } from "../../engines/warp/mesh.js";
import { apply } from "../../engines/warp/field.js";
import { easeStrength, rootStrength } from "./strength-curve.js";
/** Level to engine amount: Normal (33) -> 72, Extra (66) -> 88, Hyper (100) -> 100, linear between and
 * 0 at Original, so each named level reads clearly and Normal < Extra < Hyper. ASSUMED values, tuned
 * with the Batch 2 probe on the synthetic samples. The eased strength mixes the level. */
export const GENDER_LEVEL_AMOUNT = [[0, 0], [33, 72], [66, 88], [100, 100]];
/** A steeper curve than the colour tools: the face-only warp moves few pixels, so 30 already gives 83%. */
export const GENDER_POWER = 0.15;
/** Ease power for gender strength inside a level (ASSUMED, tuned so the default passes the 8% visibility bar). */
export const GENDER_EASE_K = 2;
export function genderAmount(slider, strength) {
    if (!Number.isFinite(slider) || slider < -100 || slider > 100)
        throw new RangeError("Appearance direction must be -100 to 100.");
    const a = Math.abs(slider);
    let amount = 100;
    for (let k = 1; k < GENDER_LEVEL_AMOUNT.length; k++) {
        const [x0, y0] = GENDER_LEVEL_AMOUNT[k - 1], [x1, y1] = GENDER_LEVEL_AMOUNT[k];
        if (a <= x1) {
            amount = y0 + (y1 - y0) * (a - x0) / (x1 - x0);
            break;
        }
    }
    return Math.sign(slider) * amount * rootStrength(strength, GENDER_POWER);
}
export function applyHeroLayer(image, source, layer) {
    if (!["older", "younger", "gender"].includes(layer.kind))
        return null;
    const points = source.face;
    if (!points || points.length !== 478)
        throw new Error("This simulation needs recorded 478-point face geometry for this photo.");
    if (layer.kind === "gender") {
        const started = renderClock();
        const slider = Number(layer.parameters.slider ?? -33);
        const level = levelFor(slider);
        // Strength inside a level on a gentle ease-out (k = 2: 50 -> 0.75 of the level), so the default reads
        // plainly; every level is scaled the same, so stop spacing holds, and 100 is unchanged. No root squeeze.
        const loop = closedLoop(points, slider, 100 * easeStrength(Number(layer.strength), GENDER_EASE_K), (sl, gain) => genderTargets(points, sl, { scope: "face_only", gain }).points);
        const warp = meshWarp(image.width, image.height, points, loop.points, { guard: true });
        const s = warp.refused ? 0 : warp.strengthUsed;
        const face = points.map((p, i) => [p[0] + s * (loop.points[i][0] - p[0]), p[1] + s * (loop.points[i][1] - p[1]), NaN]); // the app records x, y only: the light model uses its ellipsoid normals
        const warped = apply(image, warp.result.field);
        // Texture Law: bilinear resampling softened the pore band to ~0.8-0.89 of the input; relay the person's own
        // high band through the same field (nearest pixel) wherever the warp moved anything.
        {
            const f = warp.result.field, w = image.width, moved = new Float64Array(w * image.height);
            for (let i = 0; i < moved.length; i++)
                if (Math.abs(f.mapX.data[i] - (i % w)) > 0.02 || Math.abs(f.mapY.data[i] - Math.floor(i / w)) > 0.02)
                    moved[i] = 1;
            relayOwnHighBand(image, warped, f, moved);
        }
        // Shading follows the achieved geometry: same SD the warp actually reached, lit by this photo's light.
        const achievedSd = loop.progress * s;
        // Hyper: the guarded warp saturates (~1.3 SD); the shortfall is carried by guarded relight at the target SD
        // plus brow weight / stubble shadow (masculine) or finer brows / lip colour (feminine). Never more geometry.
        const gap = s > 0 && level.level === "hyper" ? Math.max(0, loop.target - achievedSd) : 0;
        const relit0 = relightGender(warped, face, level.direction * (achievedSd + gap));
        const relit = gap > 0 ? { ...relit0, data: genderCues({ ...warped, data: relit0.data }, face, level.direction * gap) } : relit0;
        const shown = face.map((p) => [p[0], p[1]]);
        return { image: { ...warped, data: relit.data }, label: GENDER_LABEL, face: shown,
            metrics: { level: level.level, direction: level.direction > 0 ? "masculine" : level.direction < 0 ? "feminine" : "original",
                sd_target: Math.round(loop.target * 1000) / 1000, sd_achieved: Math.round(achievedSd * 1000) / 1000,
                sd_reached: loop.reachedTarget && s >= 0.95, engine_slider: loop.slider, engine_gain: Math.round(loop.gain * 1000) / 1000,
                loop_iterations: loop.iterations, scope: "face_only", styling_pending: false,
                strength_used: warp.strengthUsed, min_area_ratio: warp.flips.minAreaRatio, min_jacobian: warp.jacobian.minDet, refused: warp.refused,
                sd_cues: Math.round(gap * 1000) / 1000, light_r2: Math.round(relit.lightR2 * 1000) / 1000, light_reliable: relit.lightReliable, shading_max_ratio_delta: Math.round(relit.maxRatioDelta * 1000) / 1000,
                validated_on_released_photos: false, render_ms: renderClock() - started, texture_source: "own_photo", donor_texture_pixels: 0 } };
    }
    const stop = Number(layer.parameters.stop ?? (layer.kind === "older" ? 3 : 2)), max = layer.kind === "older" ? 5 : 3;
    if (!Number.isInteger(stop) || stop < 1 || stop > max)
        throw new RangeError(`Choose a ${layer.kind} stop from 1 to ${max}.`);
    // Older (YouCam, 2 units): the provider's measured change on her own pixels (removable adapter).
    if (layer.kind === "older" && layer.parameters.older_source === "youcam" && source.providerOlder) {
        const fraction = olderYoucamFraction(stop) * easeStrength(layer.strength);
        const r = renderProviderOlder(image, points, source.hair, source.providerOlder, source.providerGrey, fraction);
        return { image: r.image, label: "Older (YouCam)", face: points.map((p) => [p[0], p[1]]), metrics: { ...r.metrics, stop,
                age_prediction: false, simulation: true, provider: "youcam-aging", validated_on_released_photos: false, texture_source: "own_photo" } };
    }
    // Younger's hair colour: YouCam's result (removable adapter) when the person chose and ran it, else the local toggle.
    const useProvider = layer.kind === "younger" && layer.parameters.hair_colour === true && layer.parameters.hair_source === "youcam" && !!source.providerHair && !!source.hair;
    // The stop carries the look; the eased strength mixes it, so 30 and 50 already read clearly.
    const result = renderAge(image, points, { stop: layer.kind === "older" ? stop : -stop, strength: easeStrength(layer.strength), seed: 1024,
        hairMask: source.hair, layers: { hair: source.hair && (layer.kind === "older" || (layer.parameters.hair_colour === true && !useProvider)) ? 1 : 0 },
        keepHair: layer.kind === "younger" && (layer.parameters.hair_colour !== true || useProvider) });
    if (useProvider && source.providerHair && source.hair)
        result.image = compositeProviderHair(result.image, source.providerHair, source.hair);
    return { image: result.image, label: result.label, face: result.face, metrics: { ...result.metrics, stop: layer.kind === "older" ? stop : -stop,
            age_prediction: false, simulation: true, validated_on_released_photos: false } };
}

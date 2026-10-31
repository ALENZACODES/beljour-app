/** LS1 small 2.5D photo turning on a 478-point XYZ mesh; bounded yaw/pitch, roll fallback.
 * Inspiration: 3DDFA_V2, DECA and FLAME. concept only, no code copied.
 * R4 MediaPipe mesh input, R5 face warp/fold guard, R12 protected inside-oval blend.
 * No missing side of a head is generated or claimed; no network or model fetch.
 * Author: John Khan.
 */
import { LANDMARKS } from "../../data/face/generated/anatomy.js";
import { floatImage, requireColour } from "../core/buffer.js";
import { apply, fromFunction, identity, moveMagnitude } from "../warp/field.js";
import { foldReport, safeStrength, scaledBuilder } from "../warp/fold.js";
import { q1OutsideMask, q4Seam } from "../../quality/metrics.js";
import { turnSupport, protectTurnField, appliedTurnTargets, withBlend } from "./turn-blend.js";
import { faceWidth, rampPx, regulariseTargets, relaxLowJacobian, silhouetteDepth } from "../warp/turn-field.js";
import { meshWarp } from "../warp/mesh.js";
import { turnPyramidComposite } from "./turn-pyramid.js";
import { checkFace, faceFrame } from "../shape/geometry.js";
export const VERSION = "turn-r13/1";
export const PIVOTS = ["nasion", "silhouette"];
export const LABEL = "2.5D photo turn simulation; hidden parts of the head are not reconstructed.";
export const YAW_LIMIT = 8, PITCH_LIMIT = 6, ROLL_LIMIT = 25;
export function checkXYZ(mesh) {
    if (!Array.isArray(mesh) || mesh.length !== 478 || !mesh.every((p) => Array.isArray(p) && p.length === 3 && p.every((v) => Number.isFinite(v) && Math.abs(v) <= 1e6))) {
        throw new RangeError("need 478 finite [x,y,z] pixel-space points");
    }
    checkFace(mesh.map(([x, y]) => [x, y]));
}
/** Recorder XYZ uses x/y fractions and MediaPipe z in x-width units. */
export function normalisedXYZ(mesh, width, height) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 2 || height < 2)
        throw new RangeError("positive image size required");
    if (!Array.isArray(mesh) || mesh.length !== 478 || mesh.some((p) => !Array.isArray(p) || p.length !== 3 || p.some((v) => !Number.isFinite(v)))) {
        throw new RangeError("normalized face mesh needs 478 triples");
    }
    const result = mesh.map(([x, y, z]) => [x * width, y * height, z * width]);
    checkXYZ(result);
    return result;
}
/** `pivot` "nasion" turns about the nose root (R4-R12); "silhouette" about the
 * median depth of the face-oval contour, as a head turning on its neck does. */
export function project(mesh, yaw = 0, pitch = 0, roll = 0, pivot = "nasion") {
    if (!PIVOTS.includes(pivot))
        throw new RangeError("pivot must be nasion or silhouette");
    checkXYZ(mesh);
    if (![yaw, pitch, roll].every(Number.isFinite) || Math.abs(yaw) > YAW_LIMIT || Math.abs(pitch) > PITCH_LIMIT || Math.abs(roll) > ROLL_LIMIT) {
        throw new RangeError("LS1 supports yaw +/-8, pitch +/-6 and roll +/-25 degrees");
    }
    const f = faceFrame(mesh.map(([x, y]) => [x, y]));
    const rad = Math.PI / 180;
    const cyaw = Math.cos(yaw * rad), syaw = Math.sin(yaw * rad);
    const cpitch = Math.cos(pitch * rad), spitch = Math.sin(pitch * rad);
    const croll = Math.cos(roll * rad), sroll = Math.sin(roll * rad);
    const z0 = pivot === "nasion" ? mesh[LANDMARKS.nasion][2] : silhouetteDepth(mesh);
    const points = [], depths = [];
    for (const [x, y, z] of mesh) {
        const u = (x - f.centre[0]) * f.across[0] + (y - f.centre[1]) * f.across[1];
        const v = (x - f.centre[0]) * f.down[0] + (y - f.centre[1]) * f.down[1];
        const depth = Math.max(-f.iod, Math.min(f.iod, z - z0));
        const rotatedU = u * cyaw + depth * syaw;
        const zYaw = depth * cyaw - u * syaw;
        const rotatedV = v * cpitch - zYaw * spitch;
        const zFinal = v * spitch + zYaw * cpitch;
        const rx = rotatedU * croll - rotatedV * sroll, ry = rotatedU * sroll + rotatedV * croll;
        points.push([f.centre[0] + rx * f.across[0] + ry * f.down[0], f.centre[1] + rx * f.across[1] + ry * f.down[1]]);
        depths.push(zFinal + z0);
    }
    return { points, depth: depths, yaw_degrees: yaw, pitch_degrees: pitch, roll_degrees: roll };
}
export function rollFromEyes(mesh) {
    checkXYZ(mesh);
    const a = mesh[LANDMARKS.right_pupil], b = mesh[LANDMARKS.left_pupil];
    const angle = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
    return -Math.max(-ROLL_LIMIT, Math.min(ROLL_LIMIT, angle));
}
/** Explicit fallback, independent of pending depth/segmentation weights. */
export function straighten(image, mesh) {
    requireColour(image);
    const angle = rollFromEyes(mesh), radians = angle * Math.PI / 180;
    const center = faceFrame(mesh.map(([x, y]) => [x, y])).centre;
    const c = Math.cos(radians), s = Math.sin(radians);
    const field = fromFunction(image.width, image.height, (x, y) => {
        const dx = x - center[0], dy = y - center[1];
        return [center[0] + c * dx + s * dy, center[1] - s * dx + c * dy];
    }, 1);
    const editMask = floatImage(image.width, image.height, 1);
    const move = moveMagnitude(field);
    editMask.data.set(Float32Array.from(move.data, (v) => v > 1e-6 ? 1 : 0));
    return { image: apply(image, field), editMask, target: project(mesh, 0, 0, angle).points,
        label: "Roll straighten simulation; outside corners use edge pixels.",
        metrics: { requested_roll_degrees: angle, strength_used: 1, min_det: 1 } };
}
/** Small turn inside the visible oval, made safe at full strength (R13): silhouette
 * pivot, regularised targets, a turn-scaled ramp and per-region bisection; the
 * global Jacobian guard (Q3 > 0.2) still runs last. */
export function renderTurn(image, mesh, options = {}) {
    requireColour(image);
    if (Math.min(image.width, image.height) < 2)
        throw new RangeError("turn image must be at least 2 by 2");
    const before = mesh.map(([x, y]) => [x, y]);
    const yaw = options.yaw ?? 0, pitch = options.pitch ?? 0, roll = options.roll ?? 0;
    const proposed = project(mesh, yaw, pitch, roll, "silhouette").points;
    const frame = faceFrame(before);
    let masks = turnSupport(image.width, image.height, before, options);
    if (options.blendPx === undefined) {
        let deepest = 0;
        for (let i = 0; i < masks.oval.data.length; i++)
            if (masks.oval.data[i] >= 0.5)
                deepest = Math.max(deepest, masks.clearance.data[i]);
        masks = withBlend(masks, rampPx(faceWidth(before, frame.across), yaw, pitch, deepest, masks.rimPx));
    }
    const requested = Math.max(Math.abs(yaw), Math.abs(pitch), Math.abs(roll));
    let final, meshStrength = 1, fieldStrength = 1, triangleMin = 1, trianglePass = true, spatialRetention = 1;
    let targetRetention = 1, cappedVertices = 0, regionsScaled = 0, localMinScale = 1;
    let safeTargets = proposed;
    if (requested === 0)
        final = identity(image.width, image.height);
    else {
        const report = regulariseTargets(before, proposed, frame.iod);
        safeTargets = report.points;
        targetRetention = report.retention;
        cappedVertices = report.capped_vertices;
        const warp = meshWarp(image.width, image.height, before, safeTargets, { guard: true });
        const relaxed = relaxLowJacobian(protectTurnField(warp.result.field, masks), frame.iod);
        const candidate = relaxed.field;
        regionsScaled = relaxed.regions_scaled;
        localMinScale = relaxed.min_scale;
        let rawMove = 0, protectedMove = 0;
        for (const v of moveMagnitude(warp.result.field).data)
            rawMove = Math.max(rawMove, v);
        for (const v of moveMagnitude(candidate).data)
            protectedMove = Math.max(protectedMove, v);
        spatialRetention = rawMove > 1e-12 ? protectedMove / rawMove : 0;
        const guarded = safeStrength(scaledBuilder(candidate));
        final = guarded.field;
        meshStrength = warp.strengthUsed;
        fieldStrength = guarded.strength;
        triangleMin = warp.flips.minAreaRatio;
        trianglePass = warp.flips.passed;
    }
    const warped = apply(image, final);
    const result = requested > 0 ? turnPyramidComposite(image, warped, masks.weights) : warped;
    const move = moveMagnitude(final);
    const editMask = floatImage(image.width, image.height, 1);
    let maxMove = 0, requestedMove = 0, protectedPixels = 0, editablePixels = 0;
    for (let i = 0; i < move.data.length; i++) {
        editMask.data[i] = move.data[i] > 1e-6 ? 1 : 0;
        maxMove = Math.max(maxMove, move.data[i]);
        if (masks.protected.data[i] > 0)
            protectedPixels++;
        if (masks.weights.data[i] > 0)
            editablePixels++;
    }
    for (let i = 0; i < before.length; i++)
        requestedMove = Math.max(requestedMove, Math.hypot(proposed[i][0] - before[i][0], proposed[i][1] - before[i][1]));
    const q1 = q1OutsideMask(image, result, masks.oval), q3 = foldReport(final);
    const q4 = q4Seam(image, result, masks.oval), q4Object = q4Seam(image, result, masks.protected);
    const occluderSupplied = options.protectedMask != null, occluderNonempty = protectedPixels > 0;
    const occluderBandPixels = Number(q4Object.measured.band_pixels);
    // Occluder coverage is distinct from geometric success: an omitted, empty or
    // contour-free mask must not turn Q4's neutral result into measured evidence.
    const occluderMeasured = occluderSupplied && occluderNonempty && occluderBandPixels > 0;
    const effectPass = requested === 0 || (requestedMove > 1e-6 && maxMove >= Math.min(0.02, requestedMove * 0.05));
    const guardStrength = meshStrength * fieldStrength;
    const strength = guardStrength * spatialRetention * targetRetention;
    return { image: result, field: final, editMask,
        target: appliedTurnTargets(before, safeTargets, masks, guardStrength), label: LABEL,
        metrics: { yaw_degrees: yaw, pitch_degrees: pitch, roll_degrees: roll, strength_used: strength,
            mesh_strength: meshStrength, field_strength: fieldStrength, spatial_retention: spatialRetention,
            guard_strength: guardStrength, target_retention: targetRetention, capped_vertices: cappedVertices,
            regions_scaled: regionsScaled, local_min_scale: localMinScale, effective_yaw_degrees: yaw * strength,
            effective_pitch_degrees: pitch * strength, min_area_ratio: triangleMin, min_det: q3.minDet,
            max_move_px: maxMove, requested_move_px: requestedMove, rim_px: masks.rimPx, blend_px: masks.blendPx,
            occluder_mask_supplied: Number(occluderSupplied), occluder_mask_nonempty: Number(occluderNonempty),
            protected_pixels: protectedPixels, q4_occluder_band_pixels: occluderBandPixels,
            q4_occluder_ratio_p90: Number(q4Object.measured.ratio),
            q4_occluder_measured: Number(occluderMeasured),
            editable_pixels: editablePixels, strip_pixels: 0, refused: effectPass ? 0 : 1,
            pyramid_levels: requested > 0 ? 4 : 0 },
        checks: { q1, q3, q4, q4_occluder: q4Object, q4_occluder_measured: occluderMeasured,
            q4_occluder_evidence_pass: occluderMeasured && q4Object.passed,
            effect_pass: effectPass, triangle_guard_pass: trianglePass } };
}

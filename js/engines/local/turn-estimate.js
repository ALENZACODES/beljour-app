/** #47 Head turn on the Previews screen: a small turn of the head, at most the engine's 8 degree
 * limit, through the guarded 2.5D turn engine (turn.ts). When the face points carry depth read on
 * this device, that depth is used. When they do not (estimated points, or a flat reading), depth
 * is estimated from the face outline as a rounded front-facing head, and the result says so.
 * DEPTH_SHARE is ASSUMED. A result that fails any of the engine's own checks is refused and the
 * original kept. Amount 0 returns an exact copy. Face-mapping inspiration: 3DDFA_V2 (depth from a
 * face shape fitted to 2D points); concept only, no code copied. Author: John Khan.
 */
import { CONTOURS } from "../../data/regions/generated/topology.js";
import { requireColour } from "../core/buffer.js";
import { faceFrame, faceUV } from "../shape/geometry.js";
import { LABEL, renderTurn, YAW_LIMIT } from "./turn.js";
export const DEPTH_SHARE = 0.55;
export const ESTIMATED_NOTE = "Depth estimated from the face outline, not read from the photo.";
/** True when every point has a finite depth and the depths are not all the same. */
export function hasDepth(points) {
    if (points.length !== 478 || !points.every((p) => typeof p.z === "number" && Number.isFinite(p.z)))
        return false;
    let lo = Infinity, hi = -Infinity;
    for (const p of points) {
        lo = Math.min(lo, p.z);
        hi = Math.max(hi, p.z);
    }
    return hi - lo > 1e-4;
}
/** Pixel-space points with depth from a half-ellipsoid fitted to the face oval (closer is negative). */
export function estimatedDepth(mesh) {
    const f = faceFrame(mesh);
    let half = 0;
    for (const i of CONTOURS.face_oval)
        half = Math.max(half, Math.abs(faceUV(mesh[i], f)[0]));
    const b = f.length / 2;
    return mesh.map((p) => {
        const [u, v] = faceUV(p, f);
        const du = u / half, dv = (v * f.length - b) / b;
        return [p[0], p[1], -DEPTH_SHARE * half * Math.sqrt(Math.max(0, 1 - du * du - dv * dv))];
    });
}
export function depthMesh(points, width, height) {
    const flat = points.map((p) => [p.x * width, p.y * height]);
    if (hasDepth(points))
        return { mesh: points.map((p) => [p.x * width, p.y * height, p.z * width]), estimated: false };
    return { mesh: estimatedDepth(flat), estimated: true };
}
/** amount -100..100: negative turns toward the left of the picture, positive toward the right. */
export function turnPreview(image, mesh, amount, estimated) {
    requireColour(image);
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount < -100 || amount > 100)
        throw new RangeError("amount must be -100 to 100");
    const label = estimated ? `${LABEL} ${ESTIMATED_NOTE}` : LABEL;
    if (amount === 0)
        return { refused: false, image: { ...image, data: new Uint8Array(image.data) }, label, yaw: 0, effectiveYaw: 0 };
    const yaw = -YAW_LIMIT * amount / 100;
    const out = renderTurn(image, mesh, { yaw });
    const c = out.checks;
    if (!c || !(c.q1.passed && c.q3.passed && c.q4.passed && c.effect_pass && c.triangle_guard_pass)) {
        return { refused: true, message: "This turn did not pass its own safety checks, so your original is kept." };
    }
    return { refused: false, image: out.image, label, yaw, effectiveYaw: out.metrics.effective_yaw_degrees };
}
//# sourceMappingURL=turn-estimate.js.map
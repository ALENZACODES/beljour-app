/** Hair Studio face/photo suitability guard; concept only, no code copied.
 * MediaPipe Face Landmarker: index topology only. OpenFace: coarse 2D pose concept.
 * Facial measurements are not demographics, beauty scores or medical results.
 * Browser and Python use the same landmark index set, thresholds and equations.
 * The 0..1 points come from the existing R4 vision runtime; no new weights.
 * Author: John Khan.
 */
export const POSE_INDICES = {
    leftEye: 33, rightEye: 263, nose: 1, chin: 152, forehead: 10, leftSide: 234, rightSide: 454,
};
export const DEFAULT_POSE_LIMITS = {
    roll: 14, yawProxy: 0.30, minFaceShare: 0.20, borderMargin: 0.015, minInterocular: 12,
};
const NO_POSE = "Face landmarks unavailable; choose a clear front-facing photo.";
function rounded(n, dp) {
    const power = 10 ** dp;
    return Math.round(n * power) / power;
}
function point(raw) {
    if (!raw)
        return null;
    const x = Array.isArray(raw) ? Number(raw[0]) : raw.x;
    const y = Array.isArray(raw) ? Number(raw[1]) : raw.y;
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1)
        return null;
    return { x, y };
}
const fail = (reasons, faceCount, confidence = "unavailable") => ({
    acceptable: false, rollDegrees: null, yawProxy: null, faceShare: null, reasons, confidence, faceCount,
});
export function evaluateHairPose(input) {
    const { points, width, height, faceCount = 1 } = input;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 32 || height < 32 || width > 30000 || height > 30000) {
        throw new RangeError("Invalid photo dimensions");
    }
    if (!Number.isInteger(faceCount) || faceCount < 0)
        throw new RangeError("Invalid face count");
    if (faceCount === 0 || !points || points.length < 455)
        return fail([NO_POSE], faceCount);
    const out = {};
    for (const [key, index] of Object.entries(POSE_INDICES)) {
        const selected = point(points[index]);
        if (!selected)
            return fail(["Face points are incomplete or outside the photograph."], faceCount);
        out[key] = selected;
    }
    const dx = (out.rightEye.x - out.leftEye.x) * width;
    const dy = (out.rightEye.y - out.leftEye.y) * height;
    const iod = Math.hypot(dx, dy);
    if (iod < DEFAULT_POSE_LIMITS.minInterocular)
        return fail(["Face is too small; move closer to the camera."], faceCount, "low");
    const rollDegrees = Math.atan2(dy, dx) * (180 / Math.PI);
    const yawProxy = Math.abs(out.nose.x * width - (out.leftEye.x + out.rightEye.x) * width / 2) / iod;
    const side = Math.abs(out.rightSide.x - out.leftSide.x);
    const vertical = Math.abs(out.chin.y - out.forehead.y);
    const faceShare = Math.sqrt(Math.max(0, Math.min(side * vertical, 1)));
    const reasons = [];
    if (Math.abs(rollDegrees) > DEFAULT_POSE_LIMITS.roll) {
        reasons.push("Head is tilted; straighten the photo or retake facing forward.");
    }
    if (yawProxy > DEFAULT_POSE_LIMITS.yawProxy)
        reasons.push("Face is turned too far for a dependable haircut preview.");
    if (faceShare < DEFAULT_POSE_LIMITS.minFaceShare)
        reasons.push("Face is small in the frame; a closer portrait will work better.");
    const border = DEFAULT_POSE_LIMITS.borderMargin;
    if (Object.values(out).some(({ x, y }) => x < border || x > 1 - border || y < border || y > 1 - border)) {
        reasons.push("Head is near the picture edge; leave more space around the hair.");
    }
    if (faceCount > 1)
        reasons.push("More than one face is present. Select a single-face photo for this hair preview.");
    return { acceptable: !reasons.length, rollDegrees: rounded(rollDegrees, 2),
        yawProxy: rounded(yawProxy, 4), faceShare: rounded(faceShare, 4), reasons,
        confidence: "geometric proxy", faceCount };
}
export function poseMessage(check) {
    if (check.acceptable)
        return "Photo angle looks suitable for a haircut preview. Check the result before sharing.";
    return check.reasons.join(" ");
}
export function poseDecision(input) {
    if (input.acceptable)
        return "ok";
    if (input.confidence === "unavailable" || input.faceCount !== 1)
        return "blocked";
    return "retake";
}
export function syntheticHairPose() {
    // A *labelled* synthetic fixture needs no face tracker; never use this to clear
    // a real photo for upload or a YouCam task.
    return { acceptable: true, rollDegrees: 0, yawProxy: 0, faceShare: 0.6,
        reasons: [], confidence: "geometric proxy", faceCount: 1 };
}
//# sourceMappingURL=pose.js.map
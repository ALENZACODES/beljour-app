/** Body control points for Posture edit from the on-device pose model (MediaPipe Pose Landmarker
 * lite, staged same-origin). One clear person only. The view is chosen from the pose itself:
 * shoulders spread across the frame read as a front view, shoulders stacked as a side view. The
 * points are a starting point; she can re-mark them with the body marking tools.
 * Author: John Khan.
 */
import { fromPose } from "../../engines/local/posture.js";
/** Shoulder span over torso length above which the photo is a front view. ASSUMED. */
export const FRONT_SPAN = 0.35;
export function bodyFromPose(landmarks, width, height) {
    if (!Array.isArray(landmarks) || landmarks.length !== 33)
        return null;
    const px = (i) => [landmarks[i].x * width, landmarks[i].y * height];
    const [ls, rs, lh, rh] = [11, 12, 23, 24].map(px);
    const span = Math.hypot(ls[0] - rs[0], ls[1] - rs[1]);
    const torso = Math.hypot((ls[0] + rs[0]) / 2 - (lh[0] + rh[0]) / 2, (ls[1] + rs[1]) / 2 - (lh[1] + rh[1]) / 2);
    if (!(torso > 8))
        return null;
    try {
        return fromPose(landmarks, width, height, span / torso >= FRONT_SPAN ? "front" : "side");
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=auto-body.js.map
import { defaultVisionClient } from "../vision/client.js";
import { faceMapFor } from "./map-reader.js";
/** The selected face of a photo, from the shared face map (face/map-reader.ts): a picture is read
 * once and every tool that asks about it gets the same points. Null when there is no face or the
 * face reader cannot run here (callers already say so; none invents points). */
export async function readFace(image) {
    const map = await faceMapFor(image);
    const chosen = map.normalized;
    return chosen ? { points: chosen.map((p) => ({ x: p.x, y: p.y, z: p.z })), blendshapes: map.blendshapes } : null;
}
/** Existing recording code wants a sync last-frame reading. Queue at most one
 * worker frame and return the last completed landmarks; do not block rendering. */
export async function loadVideoLandmarker() {
    const vision = defaultVisionClient();
    if (!vision.ready("face-landmarks"))
        return null;
    let busy = false;
    let latest = [];
    let prior = -1;
    return {
        detectForVideo(source, timestampMs) {
            if (!busy && timestampMs > prior) {
                prior = timestampMs;
                busy = true;
                const w = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
                const h = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
                if (w && h) {
                    const scale = Math.min(1, 1024 / Math.max(w, h));
                    void vision.detectImage("face-landmarks", source, Math.round(w * scale), Math.round(h * scale), { maxFaces: 1 })
                        .then((result) => { latest = result.faces?.map((face) => face.landmarks) ?? []; })
                        .catch(() => { latest = []; })
                        .finally(() => { busy = false; });
                }
                else
                    busy = false;
            }
            return { faceLandmarks: latest };
        },
    };
}

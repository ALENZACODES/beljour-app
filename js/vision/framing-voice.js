/** Voice-guided selfie framing (feature 99), for anyone who can't easily see the preview.
 *
 * From the 478 face points of each camera frame (read on this device), one plain cue at a time:
 * come closer or move back, move left or right, raise or lower the camera, level your head,
 * turn to face the camera, then hold still. Directions are from her own point of view, worked
 * out in camera-image coordinates, so they stay right whether or not the preview is mirrored.
 * The guide speaks a cue when it changes, never more than once a MIN_GAP, repeats an unchanged
 * cue only after REPEAT, and says "Ready" once the framing has held for READY_HOLD. Speech is
 * the browser's own (speechSynthesis); without it every cue still goes to a live text region a
 * screen reader reads. No new model: it uses the face points and the head pose already built.
 * Author: John Khan.
 */
import { headPoseFromMesh } from "./geometry.js";
/** Targets for a head-and-shoulders selfie. ASSUMED until measured with low-vision testers. */
export const TARGET = { x: 0.5, y: 0.42, tolerance: 0.08, minShare: 0.32, maxShare: 0.58, maxRoll: 8, maxYaw: 15 };
export const MIN_GAP = 1500, REPEAT = 4000, READY_HOLD = 1000; // milliseconds; ASSUMED
export const CUE_TEXT = {
    no_face: "I can't see your face. Point the camera at your face.",
    closer: "Come a little closer.",
    further: "Move the camera a little further away.",
    move_left: "Move a little to your left.",
    move_right: "Move a little to your right.",
    raise: "Raise the camera a little.",
    lower: "Lower the camera a little.",
    level: "Level your head.",
    face_camera: "Turn to face the camera.",
    hold: "Hold still.",
};
export const READY_TEXT = "Ready. Take the photo when you like.";
/** The one cue for this frame. `points` are pixel coordinates in the camera image; set
 * `mirroredFrame` only when the camera itself delivers a mirrored image. */
export function framingCue(points, width, height, mirroredFrame = false) {
    const none = { cue: "no_face", text: CUE_TEXT.no_face, ready: false, centre: null, share: null, roll: null, yaw: null };
    if (!points || points.length < 478 || !(width > 0 && height > 0))
        return none;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of points) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
    }
    if (x1 < 0 || y1 < 0 || x0 > width || y0 > height)
        return none;
    const cx = (x0 + x1) / 2 / width, cy = (y0 + y1) / 2 / height, share = (x1 - x0) / width;
    const pose = headPoseFromMesh(points.map((p) => ({ x: p[0] / width, y: p[1] / height, z: (p[2] ?? 0) / width })), width, height);
    const out = (cue) => ({ cue, text: CUE_TEXT[cue], ready: cue === "hold", centre: { x: cx, y: cy }, share, roll: pose.rollDegrees, yaw: pose.yawDegrees });
    if (share < TARGET.minShare)
        return out("closer");
    if (share > TARGET.maxShare)
        return out("further");
    // In the camera's own (unmirrored) image her left is the image's right.
    const towardImageRight = cx > TARGET.x + TARGET.tolerance, towardImageLeft = cx < TARGET.x - TARGET.tolerance;
    if (towardImageRight || towardImageLeft) {
        const herLeftIsImageRight = !mirroredFrame;
        const faceToHerLeft = towardImageRight === herLeftIsImageRight;
        return out(faceToHerLeft ? "move_right" : "move_left");
    }
    if (cy > TARGET.y + TARGET.tolerance)
        return out("lower");
    if (cy < TARGET.y - TARGET.tolerance)
        return out("raise");
    if (Math.abs(pose.rollDegrees) > TARGET.maxRoll)
        return out("level");
    if (Math.abs(pose.yawDegrees) > TARGET.maxYaw)
        return out("face_camera");
    return out("hold");
}
/** Speaks cues without nagging: on change (at most every MIN_GAP), repeats after REPEAT, and
 * announces ready once the hold has lasted READY_HOLD. Every spoken line also goes to `show`. */
export class VoiceGuide {
    speak;
    show;
    now;
    last = null;
    holdSince = null;
    readyAnnounced = false;
    constructor(speak, show, now = () => Date.now()) {
        this.speak = speak;
        this.show = show;
        this.now = now;
    }
    get ready() { return this.readyAnnounced; }
    update(f) {
        const t = this.now();
        if (f.cue === "hold") {
            this.holdSince ??= t;
            if (!this.readyAnnounced && t - this.holdSince >= READY_HOLD) {
                this.readyAnnounced = true;
                return this.say("ready", READY_TEXT, t);
            }
        }
        else {
            this.holdSince = null;
            this.readyAnnounced = false;
        }
        const cue = f.cue === "hold" && this.readyAnnounced ? "ready" : f.cue;
        if (cue === "ready")
            return null;
        if (this.last && t - this.last.at < MIN_GAP)
            return null;
        if (this.last?.cue === cue && t - this.last.at < REPEAT)
            return null;
        return this.say(cue, f.text, t);
    }
    say(cue, text, at) {
        this.last = { cue, at };
        this.show(text);
        try {
            this.speak?.(text);
        }
        catch { /* the text line is still there */ }
        return text;
    }
}
/** The browser's own speech, or null where it has none (the text line still works). */
export function browserSpeech() {
    const synth = globalThis.speechSynthesis;
    const Utterance = globalThis.SpeechSynthesisUtterance;
    if (!synth || !Utterance)
        return null;
    return (text) => { synth.cancel(); synth.speak(new Utterance(text)); };
}
//# sourceMappingURL=framing-voice.js.map
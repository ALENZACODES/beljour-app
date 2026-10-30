/** Voice framing panel: the front camera, spoken cues until the selfie is framed, then "Use this
 * photo" opens it in the editor with its own face points. Frames are read on this device and
 * never stored; the camera stops when the panel closes. Author: John Khan.
 */
import { h } from "../dom.js";
import { rgbFromRGBA, uploadedSource } from "../ui/shell/demo.js";
import { appConsent } from "../ui/shell/consent.js";
import { browserSpeech, framingCue, VoiceGuide } from "../vision/framing-voice.js";
import { devicePoints } from "./best-selfie.js";
import { defaultVisionClient } from "../vision/client.js";
export const FRAME_MS = 250; // a cue check four times a second; ASSUMED
function grabFrame(video) {
    const w = video.videoWidth, hgt = video.videoHeight;
    if (!w || !hgt)
        return null;
    const scale = Math.min(1, 640 / Math.max(w, hgt));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(hgt * scale);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx)
        return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return rgbFromRGBA(ctx.getImageData(0, 0, canvas.width, canvas.height));
}
export function voiceFramingScreen(open, deps = {}) {
    const video = h("video", { playsInline: true, muted: true, "aria-hidden": "true", style: { maxWidth: "12rem", transform: "scaleX(-1)" } });
    const cue = h("p", { role: "status", "aria-live": "assertive", class: "voice-framing-cue" }, "Start the camera to hear framing cues.");
    const start = h("button", { type: "button", class: "btn btn-primary" }, "Start voice framing");
    const use = h("button", { type: "button", class: "btn btn-quiet", disabled: true }, "Use this photo");
    const stop = h("button", { type: "button", class: "btn btn-quiet", disabled: true }, "Stop camera");
    const speak = deps.speak === undefined ? browserSpeech() : deps.speak;
    let stream = null, running = 0;
    let latest = null;
    const show = (text) => { cue.textContent = text; };
    const halt = () => {
        running++;
        stream?.getTracks().forEach((t) => t.stop());
        stream = null;
        start.disabled = false;
        stop.disabled = true;
        use.disabled = true;
    };
    const loop = async (ticket, guide) => {
        while (ticket === running) {
            const image = (deps.grab ?? grabFrame)(video);
            if (image) {
                const face = await (deps.points ?? devicePoints)(image);
                if (ticket !== running)
                    return;
                latest = { image, face };
                guide.update(framingCue(face, image.width, image.height));
                use.disabled = !guide.ready;
            }
            await (deps.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))))(FRAME_MS);
        }
    };
    start.addEventListener("click", async () => {
        if (!(deps.consent ?? (() => appConsent.hasVisit))()) {
            show("Confirm adult photo consent before starting the camera.");
            return;
        }
        if (!(deps.modelReady ?? (() => defaultVisionClient().ready("face-landmarks")))()) {
            show("Voice framing needs the on-device face model, which isn't enabled on this device yet. You can still take the photo with the Photo screen.");
            return;
        }
        halt();
        const ticket = running;
        start.disabled = true;
        stop.disabled = false;
        try {
            const acquired = await (deps.getCamera ?? (() => navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } })))();
            if (ticket !== running) {
                acquired.getTracks().forEach((t) => t.stop());
                return;
            }
            stream = acquired;
            video.srcObject = acquired;
            await video.play?.();
            show(speak ? "Listening for your face…" : "Spoken cues aren't available in this browser; this line updates instead.");
            void loop(ticket, new VoiceGuide(speak, show, deps.now));
        }
        catch {
            halt();
            show("The camera is unavailable. You can open a photo from your device instead.");
        }
    });
    stop.addEventListener("click", () => { halt(); show("Camera stopped."); });
    use.addEventListener("click", () => {
        if (!latest)
            return;
        const source = uploadedSource(latest.image, `upload:framed-${Date.now().toString(36)}`);
        open(latest.face ? { ...source, face: latest.face } : source);
        halt();
        show("The photo is open in the editor. No upload occurred.");
    });
    const element = h("section", { class: "voice-framing", "aria-label": "Voice framing" }, h("h2", {}, "Voice framing"), h("p", {}, "Spoken cues help you frame a selfie without watching the screen: closer or further, left or right, up or down, head level, then hold still."), h("p", { class: "fine" }, "Uses your face points, read on this device. Nothing is recorded or uploaded."), video, cue, h("div", { class: "row" }, start, use, stop));
    return { element, dispose: halt };
}
//# sourceMappingURL=voice-framing.js.map
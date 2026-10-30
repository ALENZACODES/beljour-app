/**
 * Reel: apply a makeup look to a vertical clip using only a few YouCam calls.
 *  1. Scan the clip on this device: face points and a brightness histogram, 4 times a second.
 *  2. Pick 3 to 8 keyframes (scene starts, then the most different head poses).
 *  3. Send only those frames to makeup-vto (1 unit each) and learn the colour change per region.
 *  4. Play the clip once, track the face, smooth the points (One Euro filter), and apply the
 *     blended colour change in a WebGL shader while recording the canvas with the audio.
 * The finished file never leaves this device.
 */
import { api } from "../api.js";
import { PALETTE, withAlpha } from "../ui/palette.js";
import { applyStyling } from "../ui/styling-tasks.js";
import { appConsent, PROVIDER_FACTS } from "../ui/shell/consent.js";
import { announce, clear, h, loadImage } from "../dom.js";
import { loadVideoLandmarker, readFace } from "../face/landmarks.js";
import { drawMasks, mixDeltas, REGIONS, regionDelta, splitMasks } from "../reel/colour.js";
import { ColourPass } from "../reel/gl.js";
import { blendWeights, lumaHistogram, poseFromMesh, sceneCuts, selectKeyframes } from "../reel/keyframes.js";
import { LandmarkSmoother } from "../reel/oneEuro.js";
import { errorBox, filePicker } from "../ui/widgets.js";
const SAMPLE_FPS = 4;
const MASK_W = 270, MASK_H = 480;
function seek(video, t) {
    return new Promise((resolve) => {
        const done = () => { video.removeEventListener("seeked", done); resolve(); };
        video.addEventListener("seeked", done);
        video.currentTime = Math.min(t, Math.max(0, video.duration - 0.01));
    });
}
function canvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
}
function pickMime() {
    const options = ["video/mp4;codecs=avc1.640028,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"];
    return options.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "video/webm";
}
export function renderReel(main, ctx) {
    clear(main);
    main.append(h("h1", {}, "Make a reel"), h("p", { class: "lede" }, "Add a vertical clip up to 60 seconds. BELJOUR sends only a few frames to YouCam's Makeup Try On, then carries the look through the whole clip on your device."));
    const look = ctx.tryon.foundation_id || ctx.tryon.lip_id || ctx.tryon.blush_id ? ctx.tryon : null;
    if (!look) {
        main.append(h("p", { class: "notice" }, "First choose a look on the Makeup step, then come back here."), h("button", { class: "btn", onclick: () => ctx.go(ctx.photo ? "tryon" : "photo") }, "Choose a look"));
        return;
    }
    if (!("MediaRecorder" in window) || !document.createElement("canvas").getContext("webgl2")) {
        main.append(h("p", { class: "notice notice-warn" }, "This browser can't record video from a canvas. Try a recent Chrome, Edge or Firefox on a computer."));
        return;
    }
    const status = h("div", { "aria-live": "polite" });
    const progress = h("progress", { max: "100", value: "0", class: "progress", "aria-label": "Progress" });
    const video = h("video", { playsinline: true, class: "reel-src", controls: true });
    const keyCount = h("input", { type: "range", min: "3", max: "8", value: "4", id: "key-count" });
    const keyOut = h("output", { for: "key-count" }, "4 frames, up to 4 units");
    keyCount.addEventListener("input", () => (keyOut.textContent = `${keyCount.value} frames, up to ${keyCount.value} units`));
    const tag = h("input", { type: "checkbox", id: "edited-tag", checked: true });
    // Photo consent for the key frames: each uploaded frame is cleared for makeup only while this is ticked.
    const send = h("input", { type: "checkbox", id: "send-frames", "aria-describedby": "send-frames-facts" });
    const go = h("button", { class: "btn", disabled: true }, "Make my reel");
    const result = h("div", {});
    let file = null;
    const say = (text, pct) => {
        clear(status);
        status.append(h("p", { class: "source" }, text));
        if (pct !== undefined)
            progress.value = pct;
    };
    main.append(h("div", { class: "row" }, filePicker("Choose a clip", "video/*", (f) => {
        file = f;
        video.src = URL.createObjectURL(f);
        video.onloadedmetadata = () => {
            const tall = video.videoHeight >= video.videoWidth;
            if (video.duration > 60.5) {
                say("That clip is longer than 60 seconds. Trim it first.");
                go.disabled = true;
                return;
            }
            say(`${Math.round(video.duration)} seconds, ${video.videoWidth} by ${video.videoHeight}.${tall ? "" : " It isn't vertical, so it will be framed to 9:16."}`);
            go.disabled = false;
        };
    }, false)), video, h("p", { class: "proc" }, h("label", { for: "key-count" }, "Frames sent to YouCam"), keyCount, keyOut), h("p", { class: "check" }, tag, h("label", { for: "edited-tag" }, " Add a small \"edited\" tag in the corner")), h("p", { class: "check" }, send, h("label", { for: "send-frames" }, " Send the chosen frames to YouCam for this makeup preview")), h("details", { id: "send-frames-facts" }, h("summary", {}, "What is sent, and what happens to it"), h("ul", { class: "plain-list" }, ...PROVIDER_FACTS.map((fact) => h("li", {}, fact)))), go, progress, status, result, h("p", { class: "fine" }, "Each new frame costs one YouCam unit. Your clip and the finished reel stay on this device; only the chosen frames are sent, then deleted."));
    go.addEventListener("click", async () => {
        if (!file)
            return;
        if (!send.checked) {
            say("Tick \"Send the chosen frames to YouCam\" first. Nothing has been sent.");
            return;
        }
        if (!appConsent.hasVisit) {
            say("Confirm the visit consent on the Photo step first. Nothing has been sent.");
            return;
        }
        go.disabled = true;
        clear(result);
        try {
            await make(video, look, Number(keyCount.value), tag.checked, say, result);
        }
        catch (err) {
            clear(status);
            status.append(errorBox(err));
        }
        finally {
            go.disabled = false;
        }
    });
}
async function make(video, look, maxKeys, withTag, say, result) {
    const vw = video.videoWidth, vh = video.videoHeight;
    const frameCanvas = canvas(vw, vh);
    const fg = frameCanvas.getContext("2d", { willReadFrequently: true });
    const small = canvas(64, 112);
    const sg = small.getContext("2d", { willReadFrequently: true });
    // 1. scan
    const frames = [];
    const steps = Math.max(1, Math.floor(video.duration * SAMPLE_FPS));
    for (let i = 0; i <= steps; i++) {
        const t = Math.min(video.duration, i / SAMPLE_FPS);
        await seek(video, t);
        fg.drawImage(video, 0, 0, vw, vh);
        sg.drawImage(video, 0, 0, 64, 112);
        const face = await readFace(frameCanvas);
        frames.push({ t, hist: lumaHistogram(sg.getImageData(0, 0, 64, 112).data),
            pose: face ? poseFromMesh(face.points, vw / vh) : null, points: face?.points ?? null });
        say(`Scanning the clip on your device: ${Math.round((i / steps) * 100)}%`, (i / steps) * 30);
    }
    if (!frames.some((f) => f.pose))
        throw new Error("No face was found in the clip, or face tracking isn't available in this browser.");
    const cutTimes = sceneCuts(frames).map((i) => frames[i].t);
    const picks = selectKeyframes(frames, maxKeys);
    // 2. keyframes through YouCam
    const maskCanvas = canvas(MASK_W, MASK_H);
    const mg = maskCanvas.getContext("2d", { willReadFrequently: true });
    const scratch = canvas(MASK_W, MASK_H).getContext("2d");
    const keys = [];
    for (const [n, idx] of picks.entries()) {
        const f = frames[idx];
        say(`Sending frame ${n + 1} of ${picks.length} to YouCam`, 30 + (n / picks.length) * 30);
        await seek(video, f.t);
        fg.drawImage(video, 0, 0, vw, vh);
        const blob = await new Promise((res) => frameCanvas.toBlob((b) => res(b), "image/jpeg", 0.92));
        const photo = await api.uploadPhoto(blob);
        appConsent.grantPhoto(photo.photo_id, ["makeup"]);
        try {
            const r = await applyStyling({ photo_id: photo.photo_id, action: "makeup", ...look });
            const after = await loadImage(r.image);
            const before = canvas(MASK_W, MASK_H).getContext("2d", { willReadFrequently: true });
            before.drawImage(frameCanvas, 0, 0, MASK_W, MASK_H);
            const afterC = canvas(MASK_W, MASK_H).getContext("2d", { willReadFrequently: true });
            afterC.drawImage(after, 0, 0, MASK_W, MASK_H);
            drawMasks(mg, scratch, f.points, MASK_W, MASK_H, 3);
            const masks = splitMasks(mg.getImageData(0, 0, MASK_W, MASK_H).data);
            const b = before.getImageData(0, 0, MASK_W, MASK_H).data, a = afterC.getImageData(0, 0, MASK_W, MASK_H).data;
            const d = {};
            for (const reg of REGIONS)
                d[reg] = regionDelta(b, a, masks[reg]);
            // cheeks sit inside the skin region, so keep only what blush adds on top of foundation
            d.cheeks = [d.cheeks[0] - d.skin[0], d.cheeks[1] - d.skin[1], d.cheeks[2] - d.skin[2]];
            keys.push({ t: f.t, points: f.points, deltas: d });
        }
        finally {
            appConsent.revokePhoto(photo.photo_id);
            await api.deletePhoto(photo.photo_id).catch(() => undefined);
        }
    }
    // 3. render while recording
    const outW = 1080, outH = 1920;
    const glCanvas = canvas(vw, vh);
    const pass = new ColourPass(glCanvas);
    const out = canvas(outW, outH);
    const og = out.getContext("2d");
    const tracker = await loadVideoLandmarker();
    const smoother = new LandmarkSmoother();
    const stream = out.captureStream(30);
    let audioCtx = null;
    try {
        audioCtx = new AudioContext();
        const src = audioCtx.createMediaElementSource(video);
        const dest = audioCtx.createMediaStreamDestination();
        src.connect(dest);
        src.connect(audioCtx.destination); // so you can still hear the clip while it records
        dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    }
    catch { /* no audio track or already connected */ }
    const mime = pickMime();
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise((res) => (rec.onstop = () => res()));
    // cover-fit the source into 9:16
    const scale = Math.max(outW / vw, outH / vh);
    const dw = vw * scale, dh = vh * scale, dx = (outW - dw) / 2, dy = (outH - dh) / 2;
    let lastPts = null, lastSeen = -1;
    const keyTimes = keys.map((k) => k.t);
    const drawFrame = (now) => {
        const t = video.currentTime;
        let pts = null;
        if (tracker) {
            const res = tracker.detectForVideo(video, now);
            const raw = res.faceLandmarks?.[0];
            if (raw) {
                pts = smoother.smooth(raw, t);
                lastPts = pts;
                lastSeen = t;
            }
        }
        if (!pts && lastPts && t - lastSeen < 0.3)
            pts = lastPts;
        if (pts) {
            drawMasks(mg, scratch, pts, MASK_W, MASK_H, 3);
            pass.render(video, maskCanvas, mixDeltas(keys.map((k) => k.deltas), blendWeights(t, keyTimes, cutTimes)));
            og.drawImage(glCanvas, dx, dy, dw, dh);
        }
        else {
            smoother.reset();
            og.drawImage(video, dx, dy, dw, dh);
        }
        if (withTag) {
            og.font = "600 28px system-ui, sans-serif";
            og.fillStyle = withAlpha(PALETTE.plum, 0.75); // burned into the reel: fixed palette
            og.fillRect(outW - 140, outH - 70, 112, 44);
            og.fillStyle = PALETTE.cream;
            og.fillText("edited", outW - 126, outH - 38);
        }
    };
    say("Recording your reel. Keep this tab open until it finishes.", 60);
    video.currentTime = 0;
    await seek(video, 0);
    video.muted = false;
    rec.start(500);
    const hasRvfc = "requestVideoFrameCallback" in HTMLVideoElement.prototype;
    const loop = () => {
        if (video.ended || video.paused)
            return;
        drawFrame(performance.now());
        progressTick();
        if (hasRvfc)
            video.requestVideoFrameCallback(loop);
        else
            requestAnimationFrame(loop);
    };
    const progressTick = () => say("Recording your reel. Keep this tab open until it finishes.", 60 + (video.currentTime / video.duration) * 40);
    const ended = new Promise((res) => video.addEventListener("ended", () => res(), { once: true }));
    await video.play();
    loop();
    await ended;
    rec.stop();
    await stopped;
    await audioCtx?.close().catch(() => undefined);
    const blob = new Blob(chunks, { type: mime.split(";")[0] });
    const ext = mime.includes("mp4") ? "mp4" : "webm";
    const url = URL.createObjectURL(blob);
    say(`Done. ${keys.length} frames used ${keys.length} YouCam units at most; repeats of the same frames are free.`, 100);
    result.append(h("video", { src: url, controls: true, playsinline: true, class: "reel-out" }), h("p", {}, h("a", { href: url, download: `beljour-reel.${ext}`, class: "btn" }, `Download (${ext.toUpperCase()})`)), ext === "webm" ? h("p", { class: "fine" }, "This browser saves WebM. Most apps accept it; to get an MP4, convert it or use a recent Chrome.") : "");
    announce("Your reel is ready.");
}
//# sourceMappingURL=reel.js.map
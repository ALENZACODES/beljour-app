/**
 * Reel: apply a makeup look to a vertical clip, all on this device.
 *  1. Scan the clip: face points and a brightness histogram, 4 times a second.
 *  2. Pick 3 to 8 keyframes (scene starts, then the most different head poses).
 *  3. Draw the look on those frames with the on-device makeup engine and learn the colour change per region.
 *  4. Play the clip once, track the face, smooth the points (One Euro filter), and apply the
 *     blended colour change in a WebGL shader while recording the canvas with the audio.
 * The finished file never leaves this device.
 */
import { ensureConsent } from "../ui/one-consent.js";
import { PALETTE, withAlpha } from "../ui/palette.js";
import { announce, clear, h } from "../dom.js";
import { BLUSHES, drawLook, foundationChoices, LIPS } from "../engines/makeup-local/index.js";
import { matchShades } from "../engines/shade/finder.js";
import { toRGBA } from "../engines/core/buffer.js";
import { pixelPoints } from "./shade-local.js";
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
    main.append(h("h1", {}, "Make a reel"), h("p", { class: "lede" }, "Add a vertical clip up to 60 seconds. BELJOUR draws your look on a few key frames, then carries it through the whole clip. Everything happens on your device."));
    const look = ctx.tryon.foundation_id || ctx.tryon.lip_id || ctx.tryon.blush_id ? ctx.tryon : null;
    if (!look) {
        main.append(h("p", { class: "notice" }, "First choose a look on the Makeup step, then come back here."), h("button", { class: "btn", onclick: () => ctx.go(ctx.photoSrc ? "tryon" : "photo") }, "Choose a look"));
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
    const keyOut = h("output", { for: "key-count" }, "4 frames");
    keyCount.addEventListener("input", () => (keyOut.textContent = `${keyCount.value} frames`));
    const tag = h("input", { type: "checkbox", id: "edited-tag", checked: true });
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
    }, false)), video, h("p", { class: "proc" }, h("label", { for: "key-count" }, "Key frames (more follows fast head turns better, takes longer)"), keyCount, keyOut), h("p", { class: "check" }, tag, h("label", { for: "edited-tag" }, " Add a small \"edited\" tag in the corner")), go, progress, status, result, h("p", { class: "fine" }, "Your clip and the finished reel stay on this device. Nothing is uploaded."));
    go.addEventListener("click", async () => {
        if (!file)
            return;
        if (!(await ensureConsent())) {
            say("No clip opened.");
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
    // 2. the look drawn on the key frames on this device, and the colour change it makes per region
    const maskCanvas = canvas(MASK_W, MASK_H);
    const mg = maskCanvas.getContext("2d", { willReadFrequently: true });
    const scratch = canvas(MASK_W, MASK_H).getContext("2d");
    const lip = LIPS.find((c) => c.id === look.lip_id) ?? null, blush = BLUSHES.find((c) => c.id === look.blush_id) ?? null;
    const keys = [];
    for (const [n, idx] of picks.entries()) {
        const f = frames[idx];
        say(`Drawing the look on key frame ${n + 1} of ${picks.length}`, 30 + (n / picks.length) * 30);
        await seek(video, f.t);
        fg.drawImage(video, 0, 0, vw, vh);
        const frame = { width: vw, height: vh, channels: 4, data: fg.getImageData(0, 0, vw, vh).data };
        const pts = pixelPoints(f.points, vw, vh);
        const read = foundationChoices(frame, pts);
        const measured = "measured" in read ? read.measured : null;
        // The chosen foundation when it is still never lighter on this frame, else the nearest that is.
        const foundation = measured && look.foundation_id ? (matchShades(measured).find((s) => s.id === look.foundation_id) ?? matchShades(measured)[0] ?? null) : null;
        let afterImage;
        try {
            afterImage = drawLook(frame, pts, measured ?? [60, 12, 16], { foundation, lip, blush });
        }
        catch {
            continue;
        } // a frame the engine can't draw on is skipped
        const after = canvas(vw, vh);
        after.getContext("2d").putImageData(new ImageData(toRGBA(afterImage), vw, vh), 0, 0);
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
    if (!keys.length)
        throw new Error("The look couldn't be drawn on any key frame. Try a clip with the face clearly in view.");
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
    say(`Done. The look was drawn on ${keys.length} key frames and carried through the clip on your device.`, 100);
    result.append(h("video", { src: url, controls: true, playsinline: true, class: "reel-out" }), h("p", {}, h("a", { href: url, download: `beljour-reel.${ext}`, class: "btn" }, `Download (${ext.toUpperCase()})`)), ext === "webm" ? h("p", { class: "fine" }, "This browser saves WebM. Most apps accept it; to get an MP4, convert it or use a recent Chrome.") : "");
    announce("Your reel is ready.");
}
//# sourceMappingURL=reel.js.map
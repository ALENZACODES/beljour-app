import { defaultVisionClient } from "../../vision/client.js";
export const MAX_SIDE = 480;
function canvasFor(width, height) {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    return c;
}
function put(canvas, image) {
    const context = canvas.getContext("2d");
    if (!context)
        throw new Error("This browser cannot draw video frames.");
    const rgba = new Uint8ClampedArray(image.width * image.height * 4);
    for (let i = 0; i < image.width * image.height; i++) {
        for (let k = 0; k < 3; k++)
            rgba[i * 4 + k] = image.data[i * image.channels + k];
        rgba[i * 4 + 3] = image.channels === 4 ? image.data[i * 4 + 3] : 255;
    }
    context.putImageData(new ImageData(rgba, image.width, image.height), 0, 0);
}
/** Seek through a chosen clip at `fps` and hand over one frame at a time. */
export async function* clipFrames(file, fps) {
    const url = URL.createObjectURL(file), video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    try {
        await new Promise((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error("This clip could not be opened.")); });
        const scale = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
        const canvas = canvasFor(Math.max(1, Math.round(video.videoWidth * scale)), Math.max(1, Math.round(video.videoHeight * scale)));
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context)
            throw new Error("This browser cannot read video frames.");
        for (let t = 0; t < video.duration; t += 1 / fps) {
            await new Promise((resolve) => { video.onseeked = () => resolve(); video.currentTime = t; });
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
            yield { image: { width: canvas.width, height: canvas.height, channels: 4, data }, t };
        }
    }
    finally {
        video.removeAttribute("src");
        URL.revokeObjectURL(url);
    }
}
/** Face points (pixels) and the person mask for one frame, from the on-device models. */
export async function measureFrame(image, needs) {
    const vision = defaultVisionClient(), canvas = canvasFor(image.width, image.height);
    put(canvas, image);
    let points = null, person = null;
    if (needs.face && vision.ready("face-landmarks")) {
        const result = await vision.detectImage("face-landmarks", canvas, image.width, image.height, { maxFaces: 1 });
        const face = result.faces?.[0];
        if (face && face.landmarks.length === 478)
            points = face.landmarks.map((p) => [p.x * image.width, p.y * image.height]);
    }
    if (needs.person && vision.ready("person-segmentation")) {
        const result = await vision.detectImage("person-segmentation", canvas, image.width, image.height);
        const background = result.output?.segmentation?.channels[0];
        if (background && background.length === image.width * image.height)
            person = background.map((v) => Math.min(1, Math.max(0, 1 - v)));
    }
    return { points, person };
}
export function modelsReady(needs) {
    const vision = defaultVisionClient();
    return (!needs.face || vision.ready("face-landmarks")) && (!needs.person || vision.ready("person-segmentation"));
}
/** Record pushed frames into a clip; created only when she asks to keep the result. */
export function clipRecorder(width, height, fps) {
    const canvas = canvasFor(width, height), stream = canvas.captureStream(fps);
    const options = ["video/mp4", "video/webm;codecs=vp9", "video/webm"];
    const mime = options.find((m) => MediaRecorder.isTypeSupported(m)) ?? "video/webm";
    const recorder = new MediaRecorder(stream, { mimeType: mime }), chunks = [];
    recorder.ondataavailable = (event) => { if (event.data.size)
        chunks.push(event.data); };
    recorder.start();
    return {
        push(image) { put(canvas, image); },
        finish() {
            return new Promise((resolve) => {
                recorder.onstop = () => { stream.getTracks().forEach((track) => track.stop()); resolve(new Blob(chunks, { type: mime })); };
                recorder.stop();
            });
        },
    };
}
/** Camera, frame grab, paint and timing for the live mirror. getCamera is only called by
 * LiveMirror.start after her camera consent; grabbed frames are reused, never stored. */
export function browserMirrorDeps(video, display) {
    let grabber = null;
    return {
        async getCamera() {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
            video.srcObject = stream;
            video.muted = true;
            video.playsInline = true;
            await video.play();
            return stream;
        },
        grab() {
            if (!video.videoWidth || !video.videoHeight)
                return null;
            const scale = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
            const w = Math.max(1, Math.round(video.videoWidth * scale)), h = Math.max(1, Math.round(video.videoHeight * scale));
            grabber ??= canvasFor(w, h);
            if (grabber.width !== w || grabber.height !== h) {
                grabber.width = w;
                grabber.height = h;
            }
            const context = grabber.getContext("2d", { willReadFrequently: true });
            if (!context)
                return null;
            context.drawImage(video, 0, 0, w, h);
            return { width: w, height: h, channels: 4, data: context.getImageData(0, 0, w, h).data };
        },
        measure: measureFrame,
        paint(image) {
            if (display.width !== image.width || display.height !== image.height) {
                display.width = image.width;
                display.height = image.height;
            }
            put(display, image);
        },
        schedule: (callback) => requestAnimationFrame(() => callback()),
        cancel: (id) => cancelAnimationFrame(id),
        now: () => performance.now() / 1000,
    };
}
/** A still PNG of one processed frame, made only when she taps save. */
export async function frameToPng(image) {
    const canvas = canvasFor(image.width, image.height);
    put(canvas, image);
    return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("This frame could not be saved."))), "image/png"));
}

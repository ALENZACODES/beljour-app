/** #111 Face lenses page (web/lenses.html): pick a lens from thumbnails drawn live on an example
 * person, see it on a photo, capture it, or wear it on the live mirror.
 *
 * Pictures: the AI-generated example people the build listed (skin-moment-art.ts presentFiles),
 * her own photo (opened on this device; needs the face reader), or a drawn face when neither is
 * there. Face points come from the face reader through vision/client.ts when the build staged it
 * (as skin-moment.ts checks), otherwise from the example pictures' fixed framing, which the page
 * says. Live: the existing live mirror (reel/live/mirror.ts) with the lens as its per-frame
 * effect and the face reader measuring each frame, only after she agrees to the camera.
 * Nothing is uploaded. Captures go through save/export.ts. Author: John Khan.
 */
import { announce, h, loadImage } from "../dom.js";
import { fromRGBA, toRGBA } from "../engines/core/buffer.js";
import { facePhoto } from "../engines/local/beard.js";
import { symmetricFace } from "../engines/local/face-synthetic.js";
import { LensEffect } from "../lenses/live.js";
import { loadPictures } from "../lenses/pictures.js";
import { LENSES, lensLabel } from "../lenses/recipes.js";
import { NO_PICTURES, applyLens } from "../lenses/render.js";
import { browserMirrorDeps, modelsReady } from "../reel/live/browser.js";
import { LiveMirror } from "../reel/live/mirror.js";
import { downloadFile } from "../save/download.js";
import { canvasEncoder } from "../save/export.js";
import { defaultVisionClient } from "../vision/client.js";
import { faceReaderReady } from "../vision/staged.js";
import { photoPicker } from "../photos/picker.js";
import { framingPoints } from "./shape-art.js";
import { ART_DIR, presentFiles } from "./skin-moment-art.js";
import { EXAMPLE_LABEL, FRAMING_NOTE, NEEDS_READER, NO_FACE, PREVIEW_SIDE, capture, examplePeople, thumbnail } from "./lenses-model.js";
const KIND_TITLES = [["props", "Props"], ["warp", "Fun warps"], ["beauty", "Beauty"], ["effect", "Effects"]];
function paint(canvas, image) {
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext("2d")?.putImageData(new ImageData(toRGBA(image), image.width, image.height), 0, 0);
}
function pixelsOf(img, side = PREVIEW_SIDE) {
    const k = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const ctx = c.getContext("2d");
    if (!ctx)
        throw new Error("This browser cannot draw photos.");
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return fromRGBA(ctx.getImageData(0, 0, c.width, c.height));
}
/** True when the build staged the face reader and it is ready (vision/staged.ts). */
const readerReady = () => faceReaderReady();
async function readPoints(image) {
    const c = document.createElement("canvas");
    paint(c, image);
    const found = await defaultVisionClient().detectImage("face-landmarks", c, image.width, image.height, { maxFaces: 1 });
    const face = found.faces?.[0];
    return face && face.landmarks.length === 478 ? face.landmarks.map((p) => [p.x * image.width, p.y * image.height]) : null;
}
function drawnFace() {
    const w = 480, hgt = 600, pts = symmetricFace(w, hgt, 250, 330);
    return { image: facePhoto(pts, w, hgt, 5), points: pts.map(([x, y]) => [x, y]), note: "",
        label: "Drawn face, not a person: example pictures are not in this build." };
}
/** lenses.html#lens=<id> (Home's today's pick) opens on that lens; anything else on the first. */
export function lensFromHash(hash) {
    const m = /^#?lens=([a-z0-9-]+)$/.exec(hash);
    return (m && LENSES.find((l) => l.id === m[1])) || LENSES[0];
}
export async function renderLenses(root) {
    root.replaceChildren();
    let lens = lensFromHash(globalThis.location?.hash ?? ""), shown = drawnFace(), pictures = NO_PICTURES, saved = 0, thumbRun = 0;
    const status = h("p", { class: "ln-status", "aria-live": "polite" });
    const preview = h("canvas", { class: "ln-preview", role: "img", "aria-label": "Lens preview" });
    const label = h("p", { class: "ln-label" });
    const framing = h("p", { class: "ln-label ln-framing", hidden: true });
    const strength = h("input", { type: "range", id: "ln-strength", min: "0", max: "100", step: "5", value: "100" });
    const saveBtn = h("button", { class: "lg-button lg-primary", type: "button" }, "Capture and save");
    // One labelled grid per kind of lens; `grid` holds them all, for the pressed state and the mirror.
    const grid = h("div", { class: "ln-groups" });
    const groups = new Map(KIND_TITLES.map(([kind, title]) => {
        const g = h("div", { class: "ln-grid", role: "group", "aria-label": title });
        grid.append(h("h3", { class: "ln-kind" }, title), g);
        return [kind, g];
    }));
    const people = h("div", { class: "ln-people", role: "group", "aria-label": "Example people" });
    const title = h("h2", { class: "ln-title" }, lens.title);
    /** While the slider moves, the props redraw alone; the colour pass (much slower) follows on release. */
    const draw = (beauty = true) => {
        const out = applyLens(shown.image, shown.points, lens, Number(strength.value), { sprites: pictures, beauty, precise: !shown.estimated });
        paint(preview, out.image);
        preview.setAttribute("aria-label", `${lens.title} on ${shown.label}`);
        label.textContent = [lensLabel(lens), shown.label].filter(Boolean).join(" ");
        // A note about the picture (no face reader here) is said once, under Picture, not with every lens.
        framing.textContent = shown.note;
        framing.hidden = !shown.note;
        status.textContent = shown.points ? "" : NO_FACE;
    };
    const buttons = LENSES.map((l) => {
        const c = h("canvas", { class: "ln-thumb", "aria-hidden": "true" });
        const b = h("button", { type: "button", class: "ln-lens", "data-lens": l.id, "aria-pressed": String(l === lens) }, c, h("span", {}, l.title));
        b.addEventListener("click", () => {
            lens = l;
            title.textContent = l.title;
            for (const other of grid.querySelectorAll("button"))
                other.setAttribute("aria-pressed", String(other === b));
            draw();
            announce(`${l.title} chosen.`);
        });
        groups.get(l.kind ?? "props").append(b);
        return { l, c };
    });
    /** Thumbnails drawn one at a time, so the page never freezes. */
    const thumbs = () => {
        const run = ++thumbRun;
        let i = 0;
        for (const { c } of buttons)
            delete c.dataset.drawn;
        const next = () => {
            if (run !== thumbRun || i >= buttons.length)
                return;
            const { l, c } = buttons[i++];
            paint(c, thumbnail(shown.image, shown.points, l, pictures, undefined, !shown.estimated));
            c.dataset.drawn = "1";
            setTimeout(next, 0);
        };
        next();
    };
    const show = (next) => { shown = next; draw(); thumbs(); };
    strength.addEventListener("input", () => draw(false));
    strength.addEventListener("change", () => draw());
    saveBtn.addEventListener("click", async () => {
        try {
            const out = applyLens(shown.image, shown.points, lens, Number(strength.value), { sprites: pictures, precise: !shown.estimated }).image;
            const file = await capture(out, lens, ++saved, canvasEncoder());
            downloadFile(file.name, "image/jpeg", file.bytes);
            announce(`Saved ${file.name}.`);
        }
        catch (e) {
            status.textContent = e instanceof Error ? e.message : "This photo could not be saved.";
        }
    });
    // The shared "Add photos" control: her phone's photo library (or camera), plus My photos.
    const upload = photoPicker({ id: "ln-photo", takes: "one", say: (text) => { status.textContent = text; }, onPhotos: async ([f]) => {
            if (!f)
                return;
            const url = URL.createObjectURL(f);
            try {
                const image = pixelsOf(await loadImage(url));
                const points = (await readerReady()) ? await readPoints(image) : null;
                show({ image, points, note: points || (await readerReady()) ? "" : NEEDS_READER, label: "Your photo." });
            }
            catch {
                status.textContent = "This photo could not be opened.";
            }
            finally {
                URL.revokeObjectURL(url);
            }
        } });
    // Live mirror ---------------------------------------------------------------------------
    const video = h("video", { class: "ln-hidden", muted: "", playsinline: "" });
    const live = h("canvas", { class: "ln-live", role: "img", "aria-label": "Live mirror with the lens" });
    const agree = h("input", { type: "checkbox", id: "ln-camera" });
    const startBtn = h("button", { class: "lg-button", type: "button" }, "Start the live mirror");
    const liveNote = h("p", { class: "fine", "aria-live": "polite" });
    let mirror = null;
    startBtn.addEventListener("click", async () => {
        if (mirror?.state === "on") {
            mirror.stop();
            startBtn.textContent = "Start the live mirror";
            return;
        }
        if (!modelsReady({ face: true, person: false }) || !(await readerReady())) {
            liveNote.textContent = "The live mirror needs the face reader, which is not installed in this build.";
            return;
        }
        mirror ??= new LiveMirror(browserMirrorDeps(video, live));
        mirror.setEffect(new LensEffect(lens.id, pictures, false), { face: true, person: false }, Number(strength.value));
        const started = await mirror.start(agree.checked);
        if (started.started) {
            startBtn.textContent = "Stop the live mirror";
            liveNote.textContent = "Camera on. Nothing is recorded or uploaded.";
        }
        else
            liveNote.textContent = started.reason === "camera_consent" ? "Tick the box to turn on the camera." : "The camera could not be opened.";
    });
    grid.addEventListener("click", () => { if (mirror?.state === "on")
        mirror.setEffect(new LensEffect(lens.id, pictures, false), { face: true, person: false }, Number(strength.value)); });
    root.append(h("section", { class: "ln-stage" }, title, preview, label, h("label", { for: strength.id }, "Strength", strength), saveBtn, status), h("section", { class: "ln-source" }, h("h2", {}, "Picture"), people, framing, h("p", { class: "ln-own" }, "Or use your own photo. It stays on this device."), upload.element), h("section", { class: "ln-pick" }, h("h2", {}, "Lenses"), grid), h("section", { class: "ln-livebox" }, h("h2", {}, "Live mirror"), live, video, h("p", { class: "check" }, agree, h("label", { for: agree.id }, "Turn on my camera on this device for the live mirror")), startBtn, liveNote));
    draw();
    thumbs();
    // Example people and lens pictures arrive after first paint.
    const [listed, found, reader] = await Promise.all([presentFiles().catch(() => new Set()), loadPictures().catch(() => NO_PICTURES), readerReady()]);
    pictures = found;
    const examples = examplePeople(listed);
    for (const ex of examples) {
        const url = `${ART_DIR}/${ex.file}`;
        const b = h("button", { type: "button", class: "ln-person", "data-person": String(ex.n) }, h("img", { src: url, alt: "", width: "64", height: "64", loading: "lazy" }), h("span", { class: "visually-hidden" }, `${EXAMPLE_LABEL} ${ex.n}`));
        b.addEventListener("click", async () => {
            try {
                const image = pixelsOf(await loadImage(url));
                const read = reader ? await readPoints(image) : null;
                const points = read ?? framingPoints(image.width, image.height).map(([x, y]) => [x, y]);
                show({ image, points, note: read ? "" : FRAMING_NOTE, label: `${EXAMPLE_LABEL}.`, estimated: !read });
            }
            catch {
                status.textContent = "This example picture could not be opened.";
            }
        });
        people.append(b);
    }
    root.dataset.ready = "1";
    if (examples.length)
        people.firstElementChild.click();
    else {
        people.append(h("p", { class: "fine" }, "Example people are not in this build; a drawn face is shown."));
        draw();
        thumbs();
    }
}
const root = typeof document !== "undefined" ? document.getElementById("ln-root") : null;
if (root)
    void renderLenses(root);
//# sourceMappingURL=lenses.js.map
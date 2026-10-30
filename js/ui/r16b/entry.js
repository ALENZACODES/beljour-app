/** R16 Workstream B local studio UI. Author: John Khan. */
import { h } from "../../dom.js";
import { PHOTO_MARK } from "../palette.js";
import { readFace } from "../../face/landmarks.js";
import { CARDS, card } from "./catalogue.js";
import { Client, Cancelled } from "./client.js";
import { fixture } from "./fixture.js";
import { downloadPng, openLocal } from "./files.js";
import { Session } from "./session.js";
const session = new Session(), client = new Client();
let drawing = [];
let before = false;
function mount(root) {
    const status = h("p", { role: "status", "aria-live": "polite", class: "r16-status" }, "Open a local photo or use the labelled drawn fixture.");
    const input = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp", "aria-label": "Open local photo" });
    const feature = h("select", { "aria-label": "R16 feature" });
    for (const group of [["lips", "Lips"], ["smile", "Smile"], ["skin_more", "Skin & More"]]) {
        const g = h("optgroup", { label: group[1] });
        for (const c of CARDS.filter(x => x.family === group[0]))
            g.append(h("option", { value: c.id }, `${c.id}  · ${c.name} `));
        feature.append(g);
    }
    const style = h("select", { "aria-label": "Style" }), amount = h("input", { type: "range", min: 0, max: 100, value: 35, step: 1, "aria-label": "Amount" }), amountOut = h("output", {}, "35%"), health = h("input", { type: "checkbox", checked: true });
    const summary = h("p", {}), limit = h("p", { class: "r16-note" }), missing = h("ul", { class: "r16-missing" });
    const original = h("canvas", { width: 320, height: 360, "aria-label": "Original local photo" }), result = h("canvas", { width: 320, height: 360, "aria-label": "Simulation result" });
    const run = h("button", { type: "button" }, "Preview locally"), cancel = h("button", { type: "button" }, "Cancel"), compare = h("button", { type: "button" }, "Show original"), save = h("button", { type: "button" }, "Download labelled PNG"), clearRegion = h("button", { type: "button" }, "Clear region"), detect = h("button", { type: "button" }, "Detect local face points"), fixtureButton = h("button", { type: "button" }, "Use labelled drawn fixture");
    const regionHelp = h("p", { class: "r16-note" }, "For checked-region features, click at least three points around the relevant local area. Dental features use a teeth polygon; W50/W53 can add a gum polygon by holding Shift while clicking.");
    const details = h("pre", { class: "r16-details" });
    root.replaceChildren(h("header", { class: "r16-hero" }, h("p", {}, "LOCAL STUDIO · ON THIS DEVICE"), h("h1", {}, "Lips, smile and Skin & More"), h("p", {}, "All previews run in this browser. Simulation labels stay on. Not yet tested on real faces.")), h("main", { class: "r16-layout" }, h("aside", {}, h("section", {}, h("h2", {}, "1. Photo"), input, h("div", { class: "r16-actions" }, fixtureButton, detect), h("p", { class: "r16-note" }, "Photos are not uploaded by this studio.")), h("section", {}, h("h2", {}, "2. Feature"), feature, summary, h("label", {}, "Style ", style), h("label", {}, "Amount ", amount, amountOut), h("label", { class: "r16-check" }, health, " I consent to keeping this skin diary data only in this local session."), limit, missing), h("section", {}, h("h2", {}, "3. Checked region"), regionHelp, clearRegion, h("div", { class: "r16-actions" }, run, cancel, compare, save))), h("section", { class: "r16-work" }, h("div", { class: "r16-canvases" }, h("figure", {}, original, h("figcaption", {}, "Original")), h("figure", {}, result, h("figcaption", {}, "Simulation / region marks"))), status, details)));
    function configure() { const c = card(session.feature); summary.textContent = c.summary; limit.textContent = c.limitation; style.replaceChildren(...c.styles.map(s => h("option", { value: s }, s.replaceAll("_", " ")))); style.hidden = c.styles.length === 0; health.parentElement.hidden = true; refresh(); }
    function refresh() { missing.replaceChildren(...session.reasons().map(x => h("li", {}, x))); run.disabled = session.reasons().length > 0; save.disabled = !session.result; compare.disabled = !session.result; cancel.disabled = false; draw(); }
    function draw() {
        const image = session.image;
        if (!image)
            return;
        for (const c of [original, result]) {
            c.width = image.width;
            c.height = image.height;
        }
        original.getContext("2d")?.putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
        const after = session.result;
        const pixels = after && !before ? after.pixels : image.data;
        const ctx = result.getContext("2d");
        ctx.putImageData(new ImageData(pixels, image.width, image.height), 0, 0);
        ctx.strokeStyle = PHOTO_MARK.core; // drawn on her photo: the fixed mark colour
        ctx.lineWidth = 2;
        if (drawing.length) {
            ctx.beginPath();
            drawing.forEach((p, i) => i ? ctx.lineTo(p[0] * image.width, p[1] * image.height) : ctx.moveTo(p[0] * image.width, p[1] * image.height));
            if (drawing.length > 2)
                ctx.closePath();
            ctx.stroke();
        }
    }
    async function preview() {
        let id = 0;
        try {
            const job = session.job();
            id = job.id;
            status.textContent = "Rendering locally…";
            const r = await client.run(job);
            if (!session.complete(job.id, r))
                return;
            status.textContent = `${r.label}  ${r.warnings.join(" ")}  ${r.elapsedMs.toFixed(0)}  ms on this device.`;
            details.textContent = JSON.stringify(r.metrics, null, 2);
            before = false;
            refresh();
        }
        catch (e) {
            if (id)
                session.fail(id);
            if (e instanceof Cancelled)
                return;
            status.textContent = e instanceof Error ? e.message : "Preview failed";
            refresh();
        }
    }
    result.addEventListener("click", e => {
        const c = card(session.feature);
        if (!c.region)
            return;
        const rect = result.getBoundingClientRect(), p = [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height];
        drawing = [...drawing, p];
        if (drawing.length >= 3) {
            session.setRegion(e.shiftKey ? "gum" : c.family === "smile" ? "teeth" : "region", drawing);
            if (e.shiftKey)
                drawing = [];
        }
        refresh();
    });
    input.addEventListener("change", async () => {
        const f = input.files?.[0];
        if (!f)
            return;
        try {
            session.load(await openLocal(f));
            drawing = [];
            status.textContent = "Photo opened locally. Detect face points for lip features, or mark a checked region where required.";
            configure();
        }
        catch (e) {
            status.textContent = e instanceof Error ? e.message : "Could not open photo";
        }
    });
    fixtureButton.addEventListener("click", () => {
        const f = fixture();
        session.load(f.image, f.landmarks);
        drawing = [];
        for (const r of f.region)
            session.setRegion(r.name, r.points);
        status.textContent = "Labelled drawn fixture loaded. It is not a real face and does not count as quality evidence.";
        configure();
    });
    detect.addEventListener("click", async () => {
        try {
            if (!session.image)
                throw new Error("Open a photo first.");
            const face = await readFace(original);
            if (!face)
                throw new Error("No face was found locally.");
            // readFace gives the shared face map's points already normalised to 0..1 (face/landmarks.ts).
            const pts = face.points.map(p => [p.x, p.y]);
            const img = session.image;
            session.load(img, pts);
            status.textContent = "Local face points attached. Region annotations were cleared.";
            refresh();
        }
        catch (e) {
            status.textContent = e instanceof Error ? e.message : "Local face detection failed.";
        }
    });
    feature.addEventListener("change", () => { session.select(feature.value); drawing = []; configure(); });
    style.addEventListener("change", () => { session.style = style.value; session.invalidate(); refresh(); });
    amount.addEventListener("input", () => { session.amount = Number(amount.value) / 100; amountOut.textContent = `${amount.value} %`; session.invalidate(); refresh(); });
    health.addEventListener("change", () => { session.health_consent = health.checked; session.invalidate(); refresh(); });
    clearRegion.addEventListener("click", () => { drawing = []; session.clearRegions(); refresh(); });
    run.addEventListener("click", () => void preview());
    cancel.addEventListener("click", () => { client.cancel(); status.textContent = "Preview cancelled; original retained."; });
    compare.addEventListener("click", () => { before = !before; compare.textContent = before ? "Show simulation" : "Show original"; draw(); });
    save.addEventListener("click", () => {
        if (!session.result)
            return;
        const c = document.createElement("canvas"), img = session.image;
        c.width = img.width;
        c.height = img.height + 36;
        const ctx = c.getContext("2d");
        ctx.putImageData(new ImageData(session.result.pixels, img.width, img.height), 0, 0);
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, img.height, img.width, 36);
        ctx.fillStyle = "#111";
        ctx.font = "12px system-ui";
        ctx.fillText(`${session.feature}  · SIMULATION · local preview`, 10, img.height + 22);
        downloadPng(c, `beljour-${session.feature.toLowerCase()} -simulation.png`);
    });
    configure();
    return () => client.cancel();
}
const root = document.getElementById("r16b-root");
if (root) {
    const dispose = mount(root);
    window.addEventListener("pagehide", dispose, { once: true });
}
//# sourceMappingURL=entry.js.map
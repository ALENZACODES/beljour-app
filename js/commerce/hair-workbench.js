/** User-controlled local hair simulation on an original, memory-only photo.
 * Brushes and head landmarks are manual evidence, not automatic detection.
 * No uploads, persistent photo state, or provider calls. Author: John Khan.
 */
import { validateLevel } from "./strength.js";
import { catalogue, applyShade } from "../engines/hair_palette/index.js";
import { CoverSession } from "../engines/local/fibre.js";
import { renderStyleForFace } from "../engines/menshair/index.js";
import { availablePresets } from "../engines/menshair/studio.js";
import { selectPortfolio } from "../engines/menshair/portfolio.js";
import { validateAnchors } from "../engines/menshair/render.js";
import { compareLevels } from "./level-board.js";
import { BoardSession, FiveStrengthBoardView } from "./board-view.js";
import { dumpsReceipt, issueReceipt } from "./board-receipt.js";
import { token } from "../ui/palette.js";
const ANCHORS = ["left_temple", "right_temple", "crown", "left_ear", "right_ear", "nape"];
const LABEL = "Local illustration only. Hair coverage and colour are estimates, not clinical or product outcomes.";
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_EDGE = 640;
export function markDisc(mask, width, height, x, y, radius, mark) {
    if (mask.length !== width * height || !Number.isInteger(width) || !Number.isInteger(height) ||
        ![x, y, radius].every(Number.isFinite) || radius < 1 || radius > 64) {
        throw RangeError("Invalid local mark geometry.");
    }
    const left = Math.max(0, Math.floor(x - radius));
    const right = Math.min(width - 1, Math.ceil(x + radius));
    const top = Math.max(0, Math.floor(y - radius));
    const bottom = Math.min(height - 1, Math.ceil(y + radius));
    for (let py = top; py <= bottom; py++) {
        for (let px = left; px <= right; px++) {
            if ((px - x) ** 2 + (py - y) ** 2 <= radius ** 2) {
                mask[py * width + px] = mark ? 255 : 0;
            }
        }
    }
}
export function headFromPoints(points) {
    if (points.length !== ANCHORS.length)
        return null;
    const head = Object.fromEntries(ANCHORS.map((name, index) => [name, [...points[index]]]));
    try {
        validateAnchors(head);
    }
    catch {
        return null;
    }
    return head;
}
function item(tag, text = "") {
    const result = document.createElement(tag);
    result.textContent = text;
    return result;
}
function option(parent, value, text) {
    const child = item("option", text);
    child.value = value;
    parent.append(child);
}
function field(title, control) {
    const label = item("label");
    label.append(item("span", title), control);
    return label;
}
export class LocalHairWorkbench {
    host;
    root = item("section");
    before = item("canvas");
    after = item("canvas");
    status = item("p", "Choose a local photo to mark hair and scalp. No data is uploaded.");
    markMode = item("select");
    kind = item("select");
    shade = item("select");
    style = item("select");
    zone = item("select");
    level = item("input");
    levelText = item("output", "3.0");
    allowLightening = item("input");
    save = item("button", "Save local PNG simulation");
    review = item("button", "Review all five strengths");
    receipt = item("button", "Save settings-only board receipt (JSON)");
    board = new BoardSession();
    boardView = null;
    source = null;
    photoHash = "";
    hair = new Uint8Array(0);
    scalp = new Uint8Array(0);
    points = [];
    cover = new CoverSession();
    styles = null;
    drawing = false;
    cursor = [30, 30];
    current = false;
    version = 0;
    disposed = false;
    constructor(host) {
        this.host = host;
        this.root.id = "hair-local-workbench";
        this.root.className = "commerce-panel hair-palette-workshop";
        this.root.setAttribute("aria-label", "On-device hair simulation on a chosen photo");
        this.status.setAttribute("role", "status");
        this.status.setAttribute("aria-live", "polite");
        const heading = item("h3", "Try local hair cover, colour and short sides on your photo");
        const intro = item("p", "Manual marks only: draw the hair region, then visible scalp for the fibre guide. " +
            "Mark six head points in order to enable a guarded edit. No automatic detection or upload. " + LABEL);
        intro.className = "fineprint";
        const file = item("input");
        file.type = "file";
        file.accept = "image/jpeg,image/png,image/webp";
        file.setAttribute("aria-label", "Choose a photo for on-device hair illustration");
        file.addEventListener("change", () => {
            const chosen = file.files?.[0];
            file.value = "";
            if (chosen)
                void this.open(chosen).catch((error) => this.fail(error));
        });
        for (const [key, title] of [["hair", "Brush: existing hair"], ["scalp", "Brush: visible scalp"],
            ["erase", "Erase marks"], ["landmark", "Mark six head landmarks"]])
            option(this.markMode, key, title);
        for (const [key, title] of [["fibre", "Topical hair fibres"], ["palette", "Hair colour"],
            ["short-sides", "Short sides tonal guide"]])
            option(this.kind, key, title);
        for (const name of ["crown", "parting", "hairline"])
            option(this.zone, name, name);
        option(this.shade, "measured", "Use measured hair colour");
        for (const swatch of catalogue())
            option(this.shade, swatch.id, `${swatch.name} · assumed ${swatch.undertone}`);
        this.level.type = "range";
        this.level.min = "1";
        this.level.max = "5";
        this.level.step = "0.1";
        this.level.value = "3";
        this.level.setAttribute("aria-label", "Hair simulation strength 1.0 through 5.0");
        this.level.addEventListener("input", () => {
            this.revise("slider");
            this.levelText.value = validateLevel(Number(this.level.value)).toFixed(1);
            this.render("moving");
        });
        this.level.addEventListener("change", () => this.render("release"));
        this.allowLightening.type = "checkbox";
        this.allowLightening.addEventListener("change", () => this.render("release"));
        for (const control of [this.kind, this.markMode, this.zone, this.shade, this.style, this.allowLightening]) {
            control.addEventListener("change", () => this.revise("settings"));
        }
        for (const control of [this.kind, this.markMode, this.zone, this.shade, this.style]) {
            control.addEventListener("change", () => this.render("release"));
        }
        this.review.type = "button";
        this.review.addEventListener("click", () => void this.reviewLevels());
        this.receipt.type = "button";
        this.receipt.disabled = true;
        this.receipt.addEventListener("click", () => this.exportReceipt());
        this.save.type = "button";
        this.save.disabled = true;
        this.save.addEventListener("click", () => this.export());
        const reset = item("button", "Clear all manual marks");
        reset.type = "button";
        reset.addEventListener("click", () => {
            this.hair.fill(0);
            this.scalp.fill(0);
            this.points = [];
            this.cover.clear();
            this.current = false;
            this.save.disabled = true;
            this.revise("brush");
            this.paintMarks();
            this.restorePreview();
            this.status.textContent = "Manual regions cleared. No edit is displayed.";
        });
        const controls = item("div");
        controls.className = "commerce-grid";
        controls.append(field("Edit", this.kind), field("Marking tool", this.markMode), field("Fibre zone", this.zone), field("In-house shade (estimate)", this.shade), field("Short-sides concept", this.style), field("Strength (1.0–5.0)", this.level), this.levelText, field("Explicitly permit lighter hair colour", this.allowLightening), reset, this.save, this.review, this.receipt);
        const images = item("div");
        images.className = "commerce-grid";
        for (const [canvas, caption] of [[this.before, "Original photo with manual marks"],
            [this.after, "Guarded simulation preview"]]) {
            const figure = item("figure");
            figure.className = "photo-well";
            canvas.style.maxWidth = "100%";
            canvas.style.height = "auto";
            figure.append(canvas, item("figcaption", caption));
            images.append(figure);
        }
        this.before.style.touchAction = "none";
        this.before.tabIndex = 0;
        this.before.setAttribute("aria-label", "Use pointer or arrow keys to move, and Space to mark. " +
            "Six head points need ordered manual selection.");
        this.before.addEventListener("keydown", (event) => {
            const move = {
                ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, -8], ArrowDown: [0, 8],
            };
            const delta = move[event.key];
            if (delta && this.source) {
                event.preventDefault();
                this.cursor[0] = Math.max(0, Math.min(this.before.width - 1, this.cursor[0] + delta[0]));
                this.cursor[1] = Math.max(0, Math.min(this.before.height - 1, this.cursor[1] + delta[1]));
                this.paintMarks();
            }
            else if ((event.key === " " || event.key === "Enter") && this.source) {
                event.preventDefault();
                this.applyMark(...this.cursor);
                this.cover.clear();
                this.render("release");
            }
        });
        this.before.addEventListener("pointerdown", (event) => {
            if (!this.source)
                return;
            this.drawing = true;
            this.before.setPointerCapture(event.pointerId);
            this.mark(event);
        });
        this.before.addEventListener("pointermove", (event) => {
            if (this.drawing && this.markMode.value !== "landmark")
                this.mark(event);
        });
        for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
            this.before.addEventListener(type, () => {
                if (this.drawing) {
                    this.drawing = false;
                    this.cover.clear();
                    this.render("release");
                }
            });
        }
        this.root.append(heading, intro, field("Open your photo (max 8 MB, processed here)", file), controls, images, this.status);
        this.host.append(this.root);
        this.boardView = new FiveStrengthBoardView(this.root, this.board);
    }
    async init() {
        this.styles = await availablePresets();
        for (const style of selectPortfolio(this.styles))
            option(this.style, style.id, style.name);
        this.status.textContent = "Ready for a local photo. Hair landmarks and regions are never guessed.";
    }
    async open(file) {
        const ticket = ++this.version;
        if (!file.size || file.size > MAX_BYTES || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
            throw Error("Choose a JPEG, PNG or WebP smaller than 8 MB.");
        }
        this.source = null;
        this.current = false;
        this.save.disabled = true;
        this.cover.clear();
        this.revise("photo");
        const bitmap = await createImageBitmap(file);
        try {
            if (this.disposed || ticket !== this.version)
                return;
            if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 30_000_000) {
                throw Error("Photo dimensions are unsupported.");
            }
            const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
            const width = Math.max(8, Math.round(bitmap.width * scale));
            const height = Math.max(8, Math.round(bitmap.height * scale));
            this.before.width = width;
            this.before.height = height;
            this.after.width = width;
            this.after.height = height;
            const ctx = this.before.getContext("2d", { willReadFrequently: true });
            if (!ctx)
                throw Error("This device has no local canvas renderer.");
            ctx.drawImage(bitmap, 0, 0, width, height);
            const bytes = new Uint8Array(ctx.getImageData(0, 0, width, height).data);
            const hashBytes = new Uint8Array(new ArrayBuffer(bytes.byteLength));
            hashBytes.set(bytes);
            const digest = await crypto.subtle.digest("SHA-256", hashBytes);
            if (this.disposed || ticket !== this.version)
                return;
            this.photoHash = Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, "0")).join("");
            this.source = bytes;
            this.cursor[0] = Math.min(30, width - 1);
            this.cursor[1] = Math.min(30, height - 1);
            this.hair = new Uint8Array(width * height);
            this.scalp = new Uint8Array(width * height);
            this.points = [];
            this.current = false;
            this.save.disabled = true;
            this.cover.clear();
            this.paintMarks();
            this.restorePreview();
            this.status.textContent = `Photo kept in browser memory at ${width} × ${height}. ` +
                "Brush the hair and visible scalp, then mark six head points.";
        }
        finally {
            bitmap.close();
        }
    }
    mark(event) {
        if (!this.source)
            return;
        const box = this.before.getBoundingClientRect();
        if (box.width <= 0 || box.height <= 0)
            return;
        const x = Math.min(this.before.width - 1, Math.max(0, (event.clientX - box.left) * this.before.width / box.width));
        const y = Math.min(this.before.height - 1, Math.max(0, (event.clientY - box.top) * this.before.height / box.height));
        this.cursor[0] = x;
        this.cursor[1] = y;
        this.applyMark(x, y);
    }
    applyMark(x, y) {
        this.revise(this.markMode.value === "landmark" ? "head" : "brush");
        if (this.markMode.value === "landmark") {
            this.points.push([x / this.before.width, y / this.before.height]);
            if (this.points.length > 6)
                this.points = [[x / this.before.width, y / this.before.height]];
        }
        else {
            const mode = this.markMode.value;
            const mask = mode === "scalp" ? this.scalp : this.hair;
            markDisc(mask, this.before.width, this.before.height, x, y, 12, mode !== "erase");
            if (mode === "erase")
                markDisc(this.scalp, this.before.width, this.before.height, x, y, 12, false);
            if (mode === "scalp")
                markDisc(this.hair, this.before.width, this.before.height, x, y, 12, true);
        }
        this.paintMarks();
    }
    paintMarks() {
        if (!this.source)
            return;
        const width = this.before.width, height = this.before.height;
        const pixels = new Uint8ClampedArray(this.source);
        for (let i = 0; i < width * height; i++) {
            if (this.hair[i])
                pixels[i * 4 + 2] = Math.min(255, pixels[i * 4 + 2] + 30);
            if (this.scalp[i])
                pixels[i * 4] = Math.min(255, pixels[i * 4] + 40);
        }
        const ctx = this.before.getContext("2d");
        if (!ctx)
            return;
        ctx.putImageData(new ImageData(pixels, width, height), 0, 0);
        ctx.strokeStyle = token("plum"); // on-screen marking marks only; never saved
        ctx.strokeRect(this.cursor[0] - 5, this.cursor[1] - 5, 10, 10);
        ctx.fillStyle = token("plum");
        this.points.forEach(([x, y], index) => {
            ctx.beginPath();
            ctx.arc(x * width, y * height, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillText(String(index + 1), x * width + 6, y * height + 2);
        });
        if (this.points.length < 6)
            this.status.textContent =
                `Marked ${this.points.length}/6 head points: next ${ANCHORS[this.points.length]}. ` + LABEL;
    }
    render(phase) {
        this.current = false;
        this.save.disabled = true;
        if (!this.source || !this.styles)
            return;
        const head = headFromPoints(this.points);
        if (!head) {
            this.save.disabled = true;
            this.restorePreview();
            this.status.textContent = "no_mesh: mark valid left/right temples, crown, left/right ears and nape.";
            return;
        }
        const width = this.before.width, height = this.before.height;
        const level = validateLevel(Number(this.level.value));
        const hair = { width, height, channels: 1,
            data: Float64Array.from(this.hair, (value) => value ? 1 : 0) };
        const scalp = { width, height, channels: 1,
            data: Float64Array.from(this.scalp, (value) => value ? 1 : 0) };
        try {
            let pixels;
            let label = LABEL;
            const image = new Uint8Array(this.source);
            if (this.kind.value === "fibre") {
                const colour = this.shade.value === "measured" ? undefined :
                    catalogue().find((shade) => shade.id === this.shade.value)?.rgb;
                const result = this.cover.render({ width, height, channels: 4, data: image }, hair, scalp, { photoHash: this.photoHash, zone: this.zone.value, level, landmarks: head,
                    paletteRgb: colour, phase });
                if (!result.rendered) {
                    this.status.textContent = `${result.code}: ${result.reason}`;
                    this.save.disabled = true;
                    this.restorePreview();
                    return;
                }
                pixels = new Uint8Array(result.image.data);
                if (phase === "moving" && (result.image.width !== width || result.image.height !== height)) {
                    this.drawResult(pixels, result.image.width, result.image.height);
                    this.status.textContent = "Low-resolution guarded preview. Release slider for full image. " + LABEL;
                    this.save.disabled = true;
                    this.restorePreview();
                    return;
                }
                label = `Illustrated scalp-show ${result.beforeShare.toFixed(2)} to ${result.afterShare.toFixed(2)}. ` + LABEL;
            }
            else if (this.kind.value === "palette") {
                if (this.shade.value === "measured") {
                    this.status.textContent = "Choose an original colour swatch for a recolour simulation.";
                    this.restorePreview();
                    return;
                }
                const result = applyShade(image, width, height, this.hair, head, this.shade.value, level, { allowLightening: this.allowLightening.checked });
                if (!result.rendered) {
                    this.status.textContent = `${result.code}: ${result.reason}`;
                    this.save.disabled = true;
                    this.restorePreview();
                    return;
                }
                pixels = result.pixels;
            }
            else {
                const result = renderStyleForFace(image, width, height, this.hair, head, this.style.value, level, this.styles);
                if (!result.rendered) {
                    this.status.textContent = `${result.code}: ${result.reason}`;
                    this.save.disabled = true;
                    this.restorePreview();
                    return;
                }
                pixels = result.pixels;
                label = `${result.styleId}: ${result.affectedPixels} illustration pixels edited. ` + LABEL;
            }
            this.drawResult(pixels, width, height);
            this.status.textContent = label;
            this.current = true;
            this.save.disabled = false;
        }
        catch (error) {
            this.current = false;
            this.save.disabled = true;
            this.fail(error);
            this.restorePreview();
        }
    }
    revise(reason) {
        this.board.invalidate(reason);
        this.receipt.disabled = true;
        this.boardView?.refresh();
    }
    /** User-triggered: all five actual stops for the current marks and settings. */
    async reviewLevels() {
        const head = headFromPoints(this.points);
        if (!this.source || !this.styles)
            return;
        const width = this.before.width, height = this.before.height;
        const { ticket, signal } = this.board.start();
        this.boardView?.refresh();
        let choice;
        if (this.kind.value === "fibre") {
            choice = { kind: "fibre", zone: this.zone.value, photoHash: this.photoHash,
                shadeId: this.shade.value === "measured" ? null : this.shade.value };
        }
        else if (this.kind.value === "palette") {
            choice = { kind: "palette", shadeId: this.shade.value, allowLightening: this.allowLightening.checked };
        }
        else {
            choice = { kind: "short-sides", styleId: this.style.value, source: this.styles };
        }
        try {
            if (choice.kind === "palette" && choice.shadeId === "measured") {
                throw Error("Choose an original colour swatch before reviewing five strengths.");
            }
            const result = await compareLevels({ pixels: new Uint8Array(this.source), width, height,
                hair: new Uint8Array(this.hair), scalp: new Uint8Array(this.scalp), landmarks: head }, choice, { signal });
            if (this.board.finish(ticket, result))
                this.receipt.disabled = false;
        }
        catch (error) {
            this.board.fail(ticket, error);
        }
        this.boardView?.refresh();
    }
    exportReceipt() {
        const board = this.board.exportRequest();
        if (!board)
            return;
        const blob = new Blob([dumpsReceipt(issueReceipt(board))], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = item("a");
        link.href = url;
        link.download = "beljour-five-strength-receipt.json";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
    }
    restorePreview() {
        if (!this.source)
            return;
        this.drawResult(new Uint8Array(this.source), this.before.width, this.before.height);
    }
    drawResult(pixels, width, height) {
        this.after.width = width;
        this.after.height = height;
        const ctx = this.after.getContext("2d");
        if (!ctx)
            throw Error("Canvas preview is unavailable.");
        ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
    }
    export() {
        if (!this.current)
            return;
        this.after.toBlob((blob) => {
            if (!blob || this.disposed)
                return;
            const url = URL.createObjectURL(blob);
            const link = item("a");
            link.href = url;
            link.download = "beljour-local-hair-simulation.png";
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1500);
        }, "image/png");
    }
    fail(error) {
        this.status.textContent = error instanceof Error ? error.message : "Unable to run local hair preview.";
    }
    dispose() {
        this.disposed = true;
        this.version++;
        this.board.invalidate("photo");
        this.source = null;
        this.cover.clear();
        this.root.remove();
    }
}
export async function setupHairWorkbench() {
    const host = document.getElementById("hair-gallery");
    if (!host)
        return;
    const workbench = new LocalHairWorkbench(host);
    try {
        await workbench.init();
    }
    catch {
        workbench.dispose();
    }
}
//# sourceMappingURL=hair-workbench.js.map
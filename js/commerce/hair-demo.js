/** Offline hairstyle-tone gallery using only an original geometric illustration.
 * No photo uploads, synthetic portrait classification, model downloads, external
 * provider, generated haircut or reconstruction. The explicit mask is derived
 * from pixels painted with our own illustration's known hair colour, not from
 * a real person's pixels. Author: John Khan.
 */
import { syntheticPortrait } from "./image.js";
import { availablePresets, renderCanvasStyle } from "../engines/menshair/studio.js";
import { DEFAULT_ANCHORS, SIMULATION_LABEL } from "../engines/menshair/render.js";
import { renderColour, renderPaletteFibres, SWATCHES } from "../engines/menshair/palette.js";
import { DEFAULT_CONSULTATION, findConcepts, parseConsultation, stylistBrief } from "../engines/menshair/consultation.js";
export const BROWSE_CATEGORIES = ["all", "masculine", "feminine", "unisex"];
/** Mask only the known painted dark-hair colour of syntheticPortrait().
 * This is **not** an automated hair detector. An unrelated uploaded photo must
 * never be passed to this colour-keyed illustration demonstration.
 */
export function syntheticIllustrationMask(image, width, height) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 8 || height < 8 ||
        width * height > 800_000 || image.length !== width * height * 4) {
        throw Error("The synthetic illustration has unsupported dimensions or channels.");
    }
    const mask = new Uint8Array(width * height);
    for (let pixel = 0; pixel < mask.length; pixel += 1) {
        const offset = pixel * 4;
        const r = image[offset], g = image[offset + 1], b = image[offset + 2];
        // Intentionally narrow support; ambiguous edge pixels are NOT classified.
        if (image[offset + 3] === 255 && Math.abs(r - 85) <= 2 &&
            Math.abs(g - 64) <= 2 && Math.abs(b - 56) <= 2)
            mask[pixel] = 255;
    }
    return mask;
}
export function illustratedFibreGuide(pixels, originalHair, width, height) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 8 || height < 8 ||
        width * height > 800_000 || pixels.length !== width * height * 4 ||
        originalHair.length !== width * height) {
        throw Error("A verified synthetic illustration and exact painted mask are required.");
    }
    const before = new Uint8ClampedArray(pixels);
    const remainingHair = new Uint8Array(originalHair);
    const topicalScalp = new Uint8Array(originalHair.length);
    let left = width, right = 0, top = height, bottom = 0, hairCount = 0;
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const index = y * width + x;
            if (originalHair[index] !== 255)
                continue;
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
            hairCount++;
        }
    if (hairCount < 100 || right <= left || bottom <= top) {
        throw Error("Not enough painted hair support for a local fibre demonstration.");
    }
    const centreX = (left + right) / 2;
    const centreY = top + (bottom - top) * .24;
    const radiusX = Math.max(3, (right - left) * .24);
    const radiusY = Math.max(3, (bottom - top) * .25);
    let illustratedPixels = 0;
    for (let y = top; y <= bottom; y++)
        for (let x = left; x <= right; x++) {
            const index = y * width + x;
            if (originalHair[index] !== 255)
                continue;
            const dx = (x + .5 - centreX) / radiusX;
            const dy = (y + .5 - centreY) / radiusY;
            if (dx * dx + dy * dy > 1)
                continue;
            const offset = index * 4;
            // Deliberately authored drawing colours, not measured human scalp pigments.
            before[offset] = 174;
            before[offset + 1] = 142;
            before[offset + 2] = 119;
            remainingHair[index] = 0;
            topicalScalp[index] = 255;
            illustratedPixels++;
        }
    if (illustratedPixels < 20)
        throw Error("The illustrated topical patch has insufficient support.");
    return { before, remainingHair, topicalScalp, illustratedPixels };
}
/** Return a standalone canvas from already validated RGBA bytes. No network. */
function drawBytes(bytes, width, height) {
    if (bytes.length !== width * height * 4)
        throw Error("Colour preview output is not RGBA.");
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx)
        throw Error("Canvas could not display a local colour effect.");
    ctx.putImageData(new ImageData(new Uint8ClampedArray(bytes), width, height), 0, 0);
    return canvas;
}
/** Presentation refers only to a style-browse category, never a person's gender. */
export function browseHairstyles(styles, category, query = "") {
    if (!BROWSE_CATEGORIES.includes(category) || query.length > 120)
        throw Error("Invalid style browser filter.");
    const text = query.trim().toLocaleLowerCase("en");
    return styles.filter((style) => (category === "all" || (style.presentation ?? "unisex") === category) &&
        (!text || style.name.toLocaleLowerCase("en").includes(text) || style.family.includes(text)))
        .slice().sort((a, b) => a.name.localeCompare(b.name, "en") || a.id.localeCompare(b.id, "en"));
}
function element(id) {
    const found = document.getElementById(id);
    if (!found)
        throw Error(`Missing hairstyle gallery element: ${id}`);
    return found;
}
function status(message) { element("hair-status").textContent = message; }
function makeIllustration() {
    const source = syntheticPortrait().canvas;
    const dest = document.createElement("canvas");
    // Bounded resolution avoids competing with the main photo editor on mobile.
    dest.width = 320;
    dest.height = 360;
    const context = dest.getContext("2d", { willReadFrequently: true });
    if (!context)
        throw Error("Browser canvas is required to view the local style guide.");
    context.drawImage(source, 0, 0, dest.width, dest.height);
    return dest;
}
/** Wire a genuine local renderer to a *drawn* portrait. It intentionally never
 * reads a visitor photo, and continues working when YouCam has zero units.
 */
export async function setupHairDemo() {
    const button = element("hair-render");
    const browse = element("hair-category");
    const search = element("hair-search");
    const select = element("hair-style");
    button.disabled = true;
    status("Loading original local hairstyle references; no remote styling API is required.");
    try {
        const catalogue = await availablePresets();
        const illustration = makeIllustration();
        const source = illustration.getContext("2d", { willReadFrequently: true });
        if (!source)
            throw Error("Could not read the synthetic illustration.");
        const mask = syntheticIllustrationMask(source.getImageData(0, 0, illustration.width, illustration.height).data, illustration.width, illustration.height);
        const covered = mask.reduce((n, value) => n + Number(value > 0), 0);
        if (covered < 500 || covered >= illustration.width * illustration.height / 2) {
            throw Error("The illustrated hair mask does not meet our privacy boundaries.");
        }
        const original = illustration.toDataURL("image/png");
        element("hair-original").src = original;
        element("hair-result").src = original;
        const all = catalogue.styles;
        let revision = 0;
        function refresh() {
            const options = browseHairstyles(all, browse.value, search.value);
            const previouslySelected = select.value;
            select.replaceChildren();
            for (const item of options) {
                const row = document.createElement("option");
                row.value = item.id;
                row.textContent = item.name;
                select.append(row);
            }
            if (options.some((item) => item.id === previouslySelected))
                select.value = previouslySelected;
            button.disabled = options.length === 0;
            status(options.length ? `${options.length} original local style concepts. ${SIMULATION_LABEL}` :
                "No styles match those words. Change the filter; the original picture remains unchanged.");
        }
        // The recommendation engine operates on written preferences only. The editor
        // never supplies pixels, landmarks, biometrics or identity to this branch.
        const consult = element("hair-recommend");
        const clearConsult = element("hair-clear-recommendations");
        const consultStatus = element("hair-consult-status");
        const consultList = element("hair-consult-list");
        consult.disabled = false;
        clearConsult.disabled = true;
        function chosen() {
            const raw = { ...DEFAULT_CONSULTATION,
                texture: element("hair-texture").value,
                desired_length: element("hair-length-preference").value,
                fade: element("hair-fade-preference").value,
                fade_shape: element("hair-shape-preference").value,
                presentation: browse.value === "all" ? "any" : browse.value,
                scalp_visibility: element("hair-scalp-preference").value,
                maintenance_minutes: Number(element("hair-maintenance-preference").value),
                require_short_sides: element("hair-short-sides-only").checked,
                prefer_volume: element("hair-volume-preference").checked,
            };
            return parseConsultation(raw);
        }
        function renderConcepts(recommendations, preferences) {
            consultList.replaceChildren();
            for (const recommendation of recommendations) {
                const item = document.createElement("li");
                const pick = document.createElement("button");
                pick.type = "button";
                pick.className = "button-muted";
                pick.textContent = `${recommendation.style.name} — ${recommendation.reasons.slice(0, 2).join("; ")}`;
                pick.addEventListener("click", () => {
                    const selected = Array.from(select.options).find((option) => option.value === recommendation.style.id);
                    if (!selected) {
                        consultStatus.textContent = "This reference is outside the current browse/search filter. Clear your search to preview it.";
                        return;
                    }
                    select.value = selected.value;
                    const brief = stylistBrief(recommendation.style, preferences);
                    const questions = brief["questions"];
                    const first = Array.isArray(questions) && typeof questions[0] === "string"
                        ? questions[0] : "Ask your stylist about this guide.";
                    consultStatus.textContent = `${recommendation.style.name}: ${first} Local simulation only; not a verified haircut.`;
                    select.focus();
                });
                item.append(pick);
                consultList.append(item);
            }
            clearConsult.disabled = recommendations.length === 0;
        }
        consult.addEventListener("click", () => {
            const turn = ++revision;
            try {
                const p = chosen();
                // Apply visible catalogue filters, then use the authored Python/TS
                // numeric score to explain selected results. Do not infer gender.
                const subset = browseHairstyles(all, browse.value, search.value);
                const recommendations = subset.length > 0 ? findConcepts(subset, p, Math.min(8, subset.length)) : [];
                if (revision !== turn)
                    return;
                renderConcepts(recommendations, p);
                consultStatus.textContent = recommendations.length > 0
                    ? `${recommendations.length} matched reference concepts, with explanations. No photograph examined, no network request. All visuals are unverified tonal simulations.`
                    : "No local references match those settings. Broaden the search or choose another preference.";
            }
            catch (reason) {
                renderConcepts([], DEFAULT_CONSULTATION);
                consultStatus.textContent = reason instanceof Error ? reason.message : "Choose a valid styling preference.";
            }
        });
        clearConsult.addEventListener("click", () => {
            consultList.replaceChildren();
            clearConsult.disabled = true;
            consultStatus.textContent = "Showing all original local concepts. Your choices are not stored or uploaded.";
            revision += 1;
            refresh();
        });
        browse.addEventListener("change", () => { revision += 1; refresh(); });
        search.addEventListener("input", () => { revision += 1; refresh(); });
        button.addEventListener("click", () => {
            const current = select.value;
            const requested = ++revision;
            button.disabled = true;
            try {
                const style = all.find((row) => row.id === current);
                if (!style)
                    throw Error("That locally authored hairstyle is not listed.");
                const output = renderCanvasStyle(illustration, mask, DEFAULT_ANCHORS, style);
                if (requested !== revision)
                    return;
                element("hair-result").src = output.toDataURL("image/png");
                status(`${style.name}. ${SIMULATION_LABEL} No hair was added or removed. ${covered} painted hair pixels were eligible; no uploaded photo, YouCam call or paid unit.`);
            }
            catch (reason) {
                if (requested === revision)
                    status(reason instanceof Error ? reason.message :
                        "The local concept could not be rendered; the original illustration is still visible.");
            }
            finally {
                button.disabled = select.options.length === 0;
            }
        });
        // Separate local-only palette and cosmetic fibres keep all photograph data
        // out of the feature. Only the already drawn illustration is eligible.
        const shadeChoice = element("hair-colour-swatch");
        for (const shade of SWATCHES) {
            const option = document.createElement("option");
            option.value = shade.id;
            option.textContent = `${shade.name} · fictional ${shade.family} display shade`;
            shadeChoice.append(option);
        }
        shadeChoice.value = "local-chestnut";
        const guide = illustratedFibreGuide(source.getImageData(0, 0, illustration.width, illustration.height).data, mask, illustration.width, illustration.height);
        const fibreImage = drawBytes(guide.before, illustration.width, illustration.height);
        const tintStrength = element("hair-colour-strength");
        const tintRegion = element("hair-colour-region");
        const fibreStrength = element("hair-fibre-strength");
        const fibreBefore = element("hair-fibre-original");
        const fibreAfter = element("hair-fibre-result");
        fibreBefore.src = fibreImage.toDataURL("image/png");
        fibreAfter.src = fibreBefore.src;
        const guideSource = fibreImage.getContext("2d", { willReadFrequently: true });
        if (!guideSource)
            throw Error("Local topical colour example is not available.");
        const baseImage = source.getImageData(0, 0, illustration.width, illustration.height).data;
        const topicalPixels = guideSource.getImageData(0, 0, illustration.width, illustration.height).data;
        // Purely illustrative density; this is not a measured scalp or real fixture.
        const density = new Float64Array(mask.length);
        density.fill(.18);
        let colourRevision = 0;
        function paintPalette() {
            const current = ++colourRevision;
            try {
                const swatchId = shadeChoice.value;
                const strength = Number(tintStrength.value);
                const region = tintRegion.value;
                const colour = renderColour(baseImage, illustration.width, illustration.height, mask, DEFAULT_ANCHORS, { swatch_id: swatchId, strength, region, preserve_highlights: 60 });
                const fibres = renderPaletteFibres(topicalPixels, illustration.width, illustration.height, guide.remainingHair, guide.topicalScalp, density, DEFAULT_ANCHORS, { swatch_id: swatchId, strength: Number(fibreStrength.value), density_gain: 88 });
                if (current !== colourRevision)
                    return;
                element("hair-colour-result").src =
                    drawBytes(colour.after, illustration.width, illustration.height).toDataURL("image/png");
                fibreAfter.src = drawBytes(fibres.after, illustration.width, illustration.height).toDataURL("image/png");
                element("hair-colour-status").textContent = `${SWATCHES.find(s => s.id === swatchId)?.name ?? "Selected shade"}: ` +
                    `${colour.metrics.edited_pixels} eligible illustration pixels recoloured locally. ` +
                    `Screen-only approximation; not actual dye matching, no photo examined.`;
                element("hair-fibre-status").textContent =
                    `Drawn patch of ${guide.illustratedPixels} pixels; synthetic scalp-show ratio ` +
                        `${fibres.metrics.scalp_show_before.toFixed(3)} → ${fibres.metrics.scalp_show_after.toFixed(3)}. ` +
                        `This is not real coverage or a treatment result. No model, provider or upload.`;
            }
            catch (err) {
                element("hair-colour-status").textContent =
                    err instanceof Error ? err.message : "The cosmetic preview cannot be drawn.";
            }
        }
        for (const control of [shadeChoice, tintStrength, tintRegion, fibreStrength]) {
            control.addEventListener("change", paintPalette);
            control.addEventListener("input", paintPalette);
        }
        paintPalette();
        refresh();
    }
    catch (error) {
        button.disabled = true;
        status(error instanceof Error ? error.message : "This device cannot open the optional local haircut gallery.");
    }
}
//# sourceMappingURL=hair-demo.js.map
/** Local photo checks and simulations; no borrowed skin scores or inferred age.
 * YouCam Skin Analysis is the separate consented product flow. Author: John Khan. */
import { apiBase } from "../api.js";
import { announce, clear, h } from "../dom.js";
import { analyse, classifyPhoto } from "../engines/local/enhance.js";
import { renderAge } from "../engines/local/age.js";
import { skinMatchSection } from "./skin-match.js";
import { localPreviewDependencies, localPreviewError, measuredMesh, needsLocalPhoto, texturePreview } from "./local-preview.js";
import { touchUpSection } from "./skin-touch-up.js";
import { photoFixSection } from "./photo-fix.js";
/** Reads old saved settings only; the current screen does not infer these concerns. */
export const SIMULATION_KEY = {
    wrinkle: "wrinkle", radiance: "radiance", oiliness: "oiliness", acne: "acne", eye_bag: "eye_bags",
    dark_circle_v2: "dark_circle", age_spot: "spots", pore: "pores", texture: "texture", redness: "redness",
};
export function simulationDefaults(scores) {
    const result = {};
    [...scores].sort((a, b) => a.raw_score - b.raw_score).filter(s => s.raw_score < 80).slice(0, 3)
        .forEach(score => { const key = SIMULATION_KEY[score.concern]; if (key)
        result[key] = .5; });
    return result;
}
const CONDITIONS = {
    normal: "No rescue condition detected", low_light: "Low light", blurry: "Blur", noisy: "Noise", old: "Faded scan",
};
export function renderSkin(main, ctx, dependencies = localPreviewDependencies) {
    clear(main);
    if (needsLocalPhoto(ctx))
        return;
    const source = ctx.photoSrc, points = ctx.face?.points;
    let revision = 0;
    const output = h("div", { "aria-live": "polite" });
    const status = h("p", { class: "fine" });
    main.append(h("h1", {}, "Skin and photo preview"), h("p", { class: "lede" }, "Local simulation. Check the lighting and texture in this photo before comparing a look."), h("p", { class: "notice" }, "Photo checks cannot measure skin health, diagnose a concern or estimate your age. Your original stays unchanged."));
    const check = h("button", { class: "btn", type: "button" }, "Check this photo locally");
    check.addEventListener("click", async () => {
        const own = ++revision;
        check.disabled = true;
        try {
            const image = await dependencies.read(source);
            if (own !== revision || ctx.photoSrc !== source || !output.isConnected)
                return;
            const analysis = analyse(image), condition = classifyPhoto(image, analysis);
            clear(output);
            output.append(h("h2", {}, "Local photo check"), h("p", {}, CONDITIONS[condition.primary] ?? condition.primary.replaceAll("_", " ")), h("dl", {}, h("dt", {}, "Noise estimate"), h("dd", {}, `${analysis.noise_sigma.toFixed(1)} on the photo's pixel scale`), h("dt", {}, "Mean light level"), h("dd", {}, analysis.mean_luminance.toFixed(3)), h("dt", {}, "Clipped highlights"), h("dd", {}, `${(analysis.clipped_bright * 100).toFixed(1)}% of pixels`)), h("p", { class: "fine" }, "Lighting and camera settings affect this reading. No cosmetic concern score is produced."));
            announce("Local photo check ready.");
        }
        catch (error) {
            if (own === revision && ctx.photoSrc === source) {
                clear(output);
                output.append(localPreviewError(error));
            }
        }
        finally {
            check.disabled = false;
        }
    });
    main.append(check, output);
    if (points?.length === 478) {
        const texture = h("button", { class: "btn", type: "button" }, "Preview gentle texture smoothing");
        const softer = h("button", { class: "btn btn-quiet", type: "button" }, "Preview softer age-look texture");
        const older = h("button", { class: "btn btn-quiet", type: "button" }, "Preview older age-look texture");
        const preview = h("div", { "aria-live": "polite" });
        const run = async (kind) => {
            const own = ++revision;
            texture.disabled = softer.disabled = older.disabled = true;
            try {
                const image = await dependencies.read(source);
                if (own !== revision || ctx.photoSrc !== source || ctx.face?.points !== points || !preview.isConnected)
                    return;
                const mesh = measuredMesh(points, image.width, image.height);
                const result = kind === "texture" ? texturePreview(image, mesh, .5) : renderAge(image, mesh, { stop: kind === "softer" ? -2 : 3, seed: 12345 }).image;
                clear(preview);
                preview.append(dependencies.paint(result, kind === "texture" ? "Gentle texture preview. No treatment claim." : "Age-look texture. No biological age is inferred and future appearance is not predicted."));
                status.textContent = "Local simulation ready. Nothing was uploaded.";
            }
            catch (error) {
                if (own === revision && ctx.photoSrc === source) {
                    clear(preview);
                    preview.append(localPreviewError(error));
                }
            }
            finally {
                texture.disabled = softer.disabled = older.disabled = false;
            }
        };
        texture.addEventListener("click", () => run("texture"));
        softer.addEventListener("click", () => run("softer"));
        older.addEventListener("click", () => run("older"));
        main.append(h("section", {}, h("h2", {}, "Local texture simulations"), texture, h("div", { class: "row" }, softer, older), status, preview), touchUpSection(ctx, dependencies), photoFixSection(ctx, dependencies));
    }
    else
        main.append(h("p", { class: "notice" }, "Texture and age-look previews need face points. No saved face will be substituted."));
    if (apiBase() && ctx.photo)
        main.append(skinMatchSection(ctx));
    else
        main.append(h("section", {}, h("h2", {}, "YouCam Skin Analysis product matching"), h("p", {}, "The local tools above work here. Consented YouCam product matching needs the configured API and your own uploaded photo.")));
    main.append(h("p", { class: "fine" }, "General cosmetic information, not medical advice."));
}
//# sourceMappingURL=skin.js.map
/** Photo studio and illustration looks in the editor: one tap adds or reuses the layer.
 * Studio tools work from her person area; relight, headshot and authenticity also need her
 * face points, and each says so instead of guessing. Nothing here is generative, a default
 * or a preset. Author: John Khan.
 */
import { h } from "../dom.js";
import { BACKDROPS } from "../engines/studio/backdrops.js";
import { INDUSTRIES } from "../engines/studio/headshot.js";
import { LOOKS } from "../engines/studio/illustration.js";
import { NEEDS_FACE, STUDIO_LAYER_TOOLS, STUDIO_TOOL_NAMES } from "../ui/shell/studio-layer.js";
export const STUDIO_NOTES = Object.freeze({
    blur: "Blurs only what is behind you, from your person area. No depth is measured.",
    replace: "Places you on a drawn backdrop. Your own pixels are unchanged.",
    relight: "A soft key light across your face. Your face's average brightness stays the same.",
    headshot: "Backdrop, soft light and a light even-tone retouch, with square and 4:5 crops. Nothing is generated.",
    authentic: "Light, contrast and a 4:5 crop only, then a Still Her check. No reshaping or smoothing.",
});
function latest(editor, kind) {
    return [...editor.document.layers].reverse().find((row) => row.kind === kind);
}
function choose(editor, kind, params) {
    const found = latest(editor, kind);
    if (!found)
        return editor.add(kind, { ...params });
    editor.choose(found.id);
    for (const [key, value] of Object.entries(params))
        editor.param(found.id, key, value);
    editor.update(found.id, { enabled: true });
    return editor.selected;
}
/** Select or add the studio layer with `tool`; refuses a face tool when there are no face points. */
export function chooseStudioTool(editor, tool, params = {}) {
    if (!STUDIO_LAYER_TOOLS.includes(tool))
        throw new RangeError(`unknown studio tool ${tool}`);
    if (!editor.source.person)
        throw new RangeError("Mark the person area or run the person segmenter on this device first.");
    if (NEEDS_FACE.has(tool) && editor.source.face?.length !== 478)
        throw new RangeError("This tool needs your face points; read them on this device first.");
    if (params.backdrop !== undefined && !Object.hasOwn(BACKDROPS, String(params.backdrop)))
        throw new RangeError("unknown backdrop");
    if (params.industry !== undefined && !Object.hasOwn(INDUSTRIES, String(params.industry)))
        throw new RangeError("unknown industry");
    return choose(editor, "studio", { tool, ...params });
}
export function chooseIllustration(editor, look) {
    if (!Object.hasOwn(LOOKS, look))
        throw new RangeError(`unknown illustration look ${look}`);
    return choose(editor, "illustration", { look });
}
export function photoStudioScreen(editor, changed) {
    const selected = editor.selected?.kind === "studio" ? editor.selected : undefined;
    const out = h("p", { class: "fine", "aria-live": "polite" });
    const run = (tool, params = {}) => {
        try {
            chooseStudioTool(editor, tool, params);
            out.textContent = STUDIO_NOTES[tool];
        }
        catch (error) {
            out.textContent = error instanceof Error ? error.message : String(error);
        }
        changed();
    };
    const backdrop = h("select", { "aria-label": "Backdrop" }, ...Object.values(BACKDROPS).map((b) => h("option", { value: b.id }, `${b.name} (${b.group})`)));
    backdrop.value = String(selected?.parameters.backdrop ?? "chinon");
    const industry = h("select", { "aria-label": "Industry" }, ...Object.values(INDUSTRIES).map((row) => h("option", { value: row.id }, row.name)));
    industry.value = String(selected?.parameters.industry ?? "technology");
    const buttons = STUDIO_LAYER_TOOLS.map((tool) => h("button", { type: "button", class: "btn btn-quiet",
        "aria-pressed": String(selected?.parameters.tool === tool),
        onclick: () => run(tool, tool === "replace" ? { backdrop: backdrop.value } : tool === "headshot" ? { industry: industry.value } : {}) }, STUDIO_TOOL_NAMES[tool]));
    backdrop.addEventListener("change", () => run("replace", { backdrop: backdrop.value }));
    industry.addEventListener("change", () => run("headshot", { industry: industry.value }));
    if (!out.textContent)
        out.textContent = editor.source.person ? "Choose a studio tool." : "Mark the person area or run the person segmenter on this device first.";
    return h("section", { class: "photo-studio-screen", "aria-label": "Photo studio" }, h("h2", {}, "Photo studio"), h("div", { class: "row" }, ...buttons), h("label", {}, "Backdrop ", backdrop), h("label", {}, "Industry ", industry), out, h("p", { class: "fine" }, "Edited photo, not generated. Your original stays unchanged."));
}
export function illustrationScreen(editor, changed) {
    const active = editor.selected?.kind === "illustration" ? String(editor.selected.parameters.look) : "";
    const out = h("p", { class: "fine", "aria-live": "polite" });
    const buttons = Object.entries(LOOKS).map(([look, row]) => h("button", { type: "button", class: "btn btn-quiet",
        "aria-pressed": String(look === active), onclick: () => {
            try {
                chooseIllustration(editor, look);
                out.textContent = `${row.name}: drawn from your own photo.`;
            }
            catch (error) {
                out.textContent = error instanceof Error ? error.message : String(error);
            }
            changed();
        } }, row.name));
    return h("section", { class: "illustration-screen", "aria-label": "Illustration" }, h("h2", {}, "Illustration"), h("div", { class: "row" }, ...buttons), out, h("p", { class: "fine" }, "Illustration filter on your own photo. Your face shape is unchanged; no costume or face is generated."));
}
//# sourceMappingURL=photo-studio.js.map
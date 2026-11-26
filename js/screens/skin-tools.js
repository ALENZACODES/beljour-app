/** Skin tools in the editor: Smooth, Foundation, Freckles, Tan, Matte, Glow and Even tone, each one tap on
 * the current photo's skin layer. Output comes from the ordered shell layer
 * (web/src/ui/shell/skin-layer.ts). Tan removal lightens skin, so its button stays
 * disabled until she ticks the lightening box; unticking it puts the tan direction back
 * to add. Nothing here is a default or a preset. Author: John Khan.
 */
import { h } from "../dom.js";
import { GLOWS } from "../engines/skin/finish.js";
import { SKIN_LAYER_TOOLS as TOOLS, SKIN_TOOL_NAMES } from "../ui/shell/skin-layer.js";
export const SKIN_NOTES = Object.freeze({
    smooth: "Smooths spots, blotches and fine lines and keeps your pores. Your average skin lightness never rises.",
    foundation: "A foundation in your matched shade, from jaw to hairline, evening colour and patches; pores stay. Never lighter than your skin.",
    freckles: "Adds drawn freckles over the nose and cheeks. Your own freckles and moles stay as they are.",
    tan: "Adds a tan by your undertone. Removing a tan lightens skin; its button says so.",
    matte: "Softens shine spots and gives back the colour shine washes out. Texture stays.",
    glow: "Lifts the light your face already catches. Your average skin lightness stays the same.",
    tone: "Evens blotchy colour and redness. It never lightens skin and keeps your marks.",
});
function latest(editor, tool) {
    return [...editor.document.layers].reverse().find((row) => row.kind === "skin" && row.parameters.tool === tool);
}
/** Select or add the skin layer for `tool` and apply `params`. Validates before touching history. */
export function chooseSkinTool(editor, tool, params = {}) {
    if (!TOOLS.includes(tool))
        throw new RangeError(`unknown skin tool ${tool}`);
    if (params.direction === "remove" && params.allow_lightening !== true) {
        throw new RangeError("Tan removal lightens skin; use the Remove tan button to run it.");
    }
    if (params.style !== undefined && !Object.hasOwn(GLOWS, String(params.style)))
        throw new RangeError("unknown glow");
    const found = latest(editor, tool);
    if (!found)
        return editor.add("skin", { tool, ...params });
    editor.choose(found.id);
    // Lightening permission goes on before a removal and comes off after it, so no
    // intermediate history state asks for removal without permission.
    const order = Object.entries(params).sort(([a], [b]) => (a === "allow_lightening" ? -1 : b === "allow_lightening" ? 1 : 0));
    if (params.allow_lightening === false)
        order.reverse();
    for (const [key, value] of order)
        editor.param(found.id, key, value);
    editor.update(found.id, { enabled: true });
    return editor.selected;
}
export function skinToolsScreen(editor, changed) {
    const selected = editor.selected?.kind === "skin" ? editor.selected : undefined;
    const active = selected ? String(selected.parameters.tool) : "";
    const out = h("p", { class: "fine", "aria-live": "polite" });
    const run = (tool, params = {}) => {
        try {
            chooseSkinTool(editor, tool, params);
            out.textContent = SKIN_NOTES[tool];
        }
        catch (error) {
            out.textContent = error instanceof Error ? error.message : String(error);
        }
        changed();
    };
    const buttons = TOOLS.map((tool) => h("button", { type: "button", class: "btn btn-quiet", "aria-pressed": String(tool === active),
        onclick: () => run(tool, tool === "tan" ? { direction: "add", allow_lightening: false } : {}) }, SKIN_TOOL_NAMES[tool]));
    const glows = h("select", { "aria-label": "Glow look" }, ...Object.entries(GLOWS).map(([id, look]) => h("option", { value: id }, look.name)));
    glows.value = String(selected?.parameters.style ?? "cassis");
    glows.addEventListener("change", () => run("glow", { style: glows.value }));
    // Tan removal is a choice made by pressing its own labelled button: no extra checkbox.
    const remove = h("button", { type: "button", class: "btn btn-quiet",
        onclick: () => run("tan", { allow_lightening: true, direction: "remove" }) }, "Remove tan (lightens skin)");
    try {
        const metrics = editor.rendered().metrics.filter((m) => typeof m.tool === "string");
        if (!out.textContent)
            out.textContent = metrics.length ? `${metrics.length} skin edit${metrics.length === 1 ? "" : "s"} on this photo.` : "Choose a skin tool.";
    }
    catch {
        out.textContent = "The last preview is still here. Adjust the selected layer to try again.";
    }
    return h("section", { class: "skin-tools-screen", "aria-label": "Skin tools" }, h("h2", {}, "Skin"), h("div", { class: "row" }, ...buttons), h("label", {}, "Glow look ", glows), remove, out, h("p", { class: "fine" }, "Local simulation, not medical advice. Your original stays unchanged."));
}
//# sourceMappingURL=skin-tools.js.map
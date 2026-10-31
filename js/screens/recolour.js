/** W39 controls for the curl-preserving local renderer. Author: John Khan. */
import { h } from "../dom.js";
import { HairPainter, hairPainterSection } from "./hair-painter.js";
export const CURL_PATTERNS = ["not specified", "1", "2A", "2B", "2C", "3A", "3B", "3C", "4A", "4B", "4C"];
export function recolourScreen(editor, changed) {
    const source = editor.source;
    const section = h("section", { class: "recolour-screen", "aria-label": "Curl-preserving recolour" }, h("h2", {}, "Colour that keeps your curl pattern"), h("p", { class: "fine" }, "Local simulation. We recolour the hair you mark without moving strands, reshaping curls or changing hair volume. Real colour results are not tested."));
    section.append(hairPainterSection(source.image, new HairPainter(source.image.width, source.image.height, source.hair, source.hairPaint), (hair, placement) => { editor.setHair(hair, placement); changed(); }));
    if (source.hair) {
        const colour = h("input", { type: "color", value: "#6B3F2A", "aria-label": "Target hair colour" });
        const pattern = h("select", { "aria-label": "Your curl pattern, optional" }, ...CURL_PATTERNS.map(id => h("option", { value: id }, id)));
        const status = h("p", { "aria-live": "polite", class: "fine" });
        const run = h("button", { type: "button", class: "btn", onclick: () => {
                try {
                    editor.add("recolour", { colour: colour.value, curl_pattern: pattern.value }, 30);
                    changed();
                }
                catch (error) {
                    status.textContent = error instanceof Error ? error.message : "This recolour could not run.";
                }
            } }, "Preview this hair colour");
        section.append(h("label", {}, "Target colour ", colour), h("label", {}, "Curl pattern (your description) ", pattern), run, status);
    }
    return section;
}

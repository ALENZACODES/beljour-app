/** W98 in the editor; output comes from the active ordered shell layer, including
 * its WebGL2/CPU capability path. Author: John Khan.
 */
import { h } from "../dom.js";
import { CAVEAT, presetIds, preset } from "../engines/shade/lighting.js";
export function chooseLighting(editor, id) {
    preset(id);
    const layer = [...editor.document.layers].reverse().find(row => row.kind === "lighting");
    if (layer) {
        editor.choose(layer.id);
        editor.param(layer.id, "preset", id);
        editor.update(layer.id, { enabled: true, strength: 100 });
    }
    else
        editor.add("lighting", { preset: id }, 100);
}
export function lightingScreen(editor, changed) {
    const selected = [...editor.document.layers].reverse().find(layer => layer.kind === "lighting");
    const active = String(selected?.parameters.preset ?? "daylight");
    const out = h("p", { class: "fine", "aria-live": "polite" });
    const apply = (id) => { chooseLighting(editor, id); changed(); };
    const first = ["daylight", "office", "evening"];
    const buttons = first.map(id => h("button", { type: "button", class: "btn btn-quiet", "aria-pressed": String(id === active),
        onclick: () => apply(id) }, preset(id).label));
    const options = h("select", { "aria-label": "More lighting simulations" }, ...presetIds().map(id => h("option", { value: id }, preset(id).label)));
    options.value = active;
    options.addEventListener("change", () => apply(options.value));
    try {
        const measured = editor.rendered().metrics.find(m => m.lighting === active);
        out.textContent = measured ? `Sampled whole-photo colour shift: ΔE ${Number(measured.shift_delta_e).toFixed(2)}. ${measured.backend === "webgl2" ? "Graphics preview." : "On-device preview."}`
            : "Choose a light to compare it with your current look.";
    }
    catch {
        out.textContent = "The last preview is still here. Adjust the selected layer to try again.";
    }
    return h("section", { class: "lighting-screen", "aria-label": "Lighting Simulator" }, h("h2", {}, "See this look in"), h("div", { class: "row" }, ...buttons), h("label", {}, "More lights ", options), out, h("p", { class: "fine" }, `Local simulation. ${CAVEAT}`), h("p", { class: "fine" }, "The capture is treated as daylight balanced. A tinted original can change this estimate. Hair and skin are relit together."));
}
//# sourceMappingURL=lighting.js.map
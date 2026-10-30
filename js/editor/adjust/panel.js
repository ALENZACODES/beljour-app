/** The Adjust and Colour mixer panels in the Studio's Edit panel.
 *
 * Every slider previews live while it moves (the Studio paints a fast preview) and commits one
 * undo step when it is let go; each has its own reset, and a double-click on a slider resets it
 * too. The first change adds the tool's layer; until then nothing is in the stack.
 * Author: John Khan.
 */
import { h } from "../../dom.js";
import { ADJUST_GROUPS, ADJUST_SLIDERS, MIXER_CHANNELS, MIXER_HUES, SKIN_PROTECT_KEY, mixerKey, readAdjust, readMixer, withMixer, withSlider } from "./params.js";
import { candidate, choiceRow, commit, frameScheduler, layerOf, rememberFocus, signed, sliderRow } from "./kit.js";
import { PIPELINE_ORDER } from "./stack.js";
const panelState = { group: "Light", hue: "orange" };
function withoutStart(params) {
    const next = { ...params };
    delete next.start;
    return next;
}
/** The order note shown under the photo-adjustment panels. */
export function orderNote() {
    return h("details", { class: "ed-order" }, h("summary", {}, "Where these edits sit"), h("ol", { class: "shell-hint" }, ...PIPELINE_ORDER.map((row) => h("li", {}, h("strong", {}, row.stage), ` ${row.tools}.`))));
}
export function adjustScreen(host) {
    const { editor } = host, layer = layerOf(editor, "adjust"), params = layer?.parameters ?? {};
    const values = readAdjust(params), schedule = frameScheduler();
    const status = h("p", { class: "shell-hint", role: "status", "aria-live": "polite" });
    const formatOf = (key) => key === "exposure" ? (v) => `${v > 0 ? "+" : ""}${v.toFixed(2)} EV` : signed;
    const group = h("div", { class: "ed-group" });
    const fill = () => {
        group.replaceChildren(...ADJUST_SLIDERS.filter((s) => s.group === panelState.group).map((spec) => sliderRow({
            key: spec.key, label: spec.label, min: spec.min, max: spec.max, step: spec.step, value: values[spec.key], neutral: spec.neutral,
            hint: spec.hint, format: formatOf(spec.key),
            onInput: (v) => schedule(() => host.live?.(candidate(editor, "adjust", withSlider(withoutStart(params), spec.key, v), layer))),
            onCommit: (v) => commit(host, "adjust", withSlider(withoutStart(params), spec.key, v), `${spec.label} ${formatOf(spec.key)(v)}`, layer),
            onReset: () => commit(host, "adjust", withSlider(withoutStart(params), spec.key, spec.neutral), `Reset ${spec.label}`, layer),
        })));
    };
    fill();
    const tabs = choiceRow("Adjust group", ADJUST_GROUPS.map((g) => ({ id: g, label: g })), panelState.group, (id) => {
        panelState.group = id;
        for (const b of tabs.querySelectorAll("button"))
            b.setAttribute("aria-pressed", String(b.dataset.choice === id));
        fill();
    }, "adjust-group");
    const changedCount = ADJUST_SLIDERS.filter((s) => !s.shapes && values[s.key] !== s.neutral).length;
    const resetAll = h("button", { type: "button", class: "shell-button", "data-focus-key": "adjust:reset-all" }, "Reset all adjustments");
    resetAll.disabled = !layer || Object.keys(params).length === 0;
    resetAll.addEventListener("click", () => commit(host, "adjust", {}, "Reset all adjustments", layer));
    status.textContent = changedCount ? `${changedCount} slider${changedCount === 1 ? "" : "s"} changed. Strength scales them all.` : "Every slider starts at no change.";
    const panel = h("section", { class: "ed-panel", "aria-label": "Adjust" }, tabs, group, h("div", { class: "ed-actions" }, resetAll), status, orderNote());
    rememberFocus(panel, "adjust");
    return panel;
}
export function mixerScreen(host) {
    const { editor } = host, layer = layerOf(editor, "mixer"), params = layer?.parameters ?? {};
    const { values, skinProtect } = readMixer(params), schedule = frameScheduler();
    const hue = MIXER_HUES.find((x) => x.id === panelState.hue) ?? MIXER_HUES[1];
    const swatches = h("div", { class: "ed-swatches", role: "radiogroup", "aria-label": "Colour to change" }, ...MIXER_HUES.map((x) => {
        const changed = MIXER_CHANNELS.some((c) => values[mixerKey(x.id, c.id)] !== 0);
        const b = h("button", { type: "button", role: "radio", class: `ed-swatch ed-hue-${x.id}`, "aria-checked": String(x.id === hue.id),
            "data-hue": x.id, "data-focus-key": `hue:${x.id}`, title: x.label }, h("span", { class: "ed-swatch-dot", "aria-hidden": "true" }), x.label, changed ? h("span", { class: "ed-changed", "aria-label": "changed" }, " •") : null);
        b.addEventListener("click", () => { panelState.hue = x.id; host.changed(); });
        return b;
    }));
    const set = (h0, ch, v) => withoutStart(withMixer(params, h0, ch, v));
    const sliders = MIXER_CHANNELS.map((c) => sliderRow({
        key: mixerKey(hue.id, c.id), label: `${hue.label} ${c.label.toLowerCase()}`, min: -100, max: 100, step: 1,
        value: values[mixerKey(hue.id, c.id)], neutral: 0,
        onInput: (v) => schedule(() => host.live?.(candidate(editor, "mixer", set(hue.id, c.id, v), layer))),
        onCommit: (v) => commit(host, "mixer", set(hue.id, c.id, v), `${hue.label} ${c.label.toLowerCase()} ${signed(v)}`, layer),
        onReset: () => commit(host, "mixer", set(hue.id, c.id, 0), `Reset ${hue.label} ${c.label.toLowerCase()}`, layer),
    }));
    const protect = h("input", { type: "checkbox", id: "ed-skin-protect", "data-focus-key": "mixer:skin" });
    protect.checked = skinProtect;
    protect.addEventListener("change", () => {
        const next = withoutStart(params);
        if (protect.checked)
            delete next[SKIN_PROTECT_KEY];
        else
            next[SKIN_PROTECT_KEY] = false;
        commit(host, "mixer", next, protect.checked ? "Protect skin tones on" : "Protect skin tones off", layer);
    });
    const resetAll = h("button", { type: "button", class: "shell-button", "data-focus-key": "mixer:reset-all" }, "Reset all colours");
    resetAll.disabled = !layer || Object.keys(params).filter((k) => k !== SKIN_PROTECT_KEY).length === 0;
    resetAll.addEventListener("click", () => commit(host, "mixer", skinProtect ? {} : { [SKIN_PROTECT_KEY]: false }, "Reset all colours", layer));
    const panel = h("section", { class: "ed-panel", "aria-label": "Colour mixer" }, swatches, ...sliders, h("p", { class: "shell-check-row" }, protect, h("label", { for: "ed-skin-protect" }, "Protect skin tones")), h("p", { class: "shell-hint" }, skinProtect ? "Skin tones keep their colour while you change oranges and reds."
        : "Skin protection is off: orange and red changes reach skin too."), h("div", { class: "ed-actions" }, resetAll), orderNote());
    rememberFocus(panel, "mixer");
    return panel;
}
//# sourceMappingURL=panel.js.map
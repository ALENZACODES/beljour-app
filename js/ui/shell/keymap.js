/** Studio keyboard map. One table drives both the key handler and the shortcuts dialog.
 *
 * Rules that keep it accessible:
 *  - Typing in a field is never hijacked: inside inputs, selects and text areas only Escape
 *    is handled, so native text undo still works there.
 *  - Inside a dialog, only Escape is handled (the dialog traps Tab itself).
 *  - Single-character shortcuts (tool letters, digits, brackets) can be switched off
 *    (WCAG 2.1.4), and never fire with Ctrl, Cmd or Alt held.
 *
 * Author: John Khan.
 */
import { CATALOGUE } from "./catalogue.js";
import { COMPARE_MODES, MODE_INFO } from "./compare.js";
const toolKeys = CATALOGUE.filter((t) => t.shortcut).map((t) => ({ key: t.shortcut.toLowerCase(), id: t.id, title: t.title }));
export const SHORTCUTS = Object.freeze([
    { keys: "Ctrl+Z / ⌘Z", does: "Undo", group: "Edit", single: false },
    { keys: "Ctrl+Shift+Z / ⌘⇧Z / Ctrl+Y", does: "Redo", group: "Edit", single: false },
    ...toolKeys.map((t) => ({ keys: t.key.toUpperCase(), does: `Open ${t.title}`, group: "Tools", single: true })),
    ...COMPARE_MODES.map((m) => ({ keys: MODE_INFO[m].key, does: `Compare: ${MODE_INFO[m].title}`, group: "Compare", single: true })),
    { keys: "[ and ]", does: "Previous or next compare mode", group: "Compare", single: true },
    { keys: "\\ (hold)", does: "Show the original while held", group: "Compare", single: true },
    { keys: "Arrow keys", does: "Move the split line or the loupe (picture focused); Shift for bigger steps", group: "Compare", single: false },
    { keys: "Space", does: "Hold view: toggle the original. Flicker: switch or pause", group: "Compare", single: false },
    { keys: "+ and −", does: "Zoom the picture (loupe zoom in Loupe mode)", group: "View", single: true },
    { keys: "?", does: "Show these shortcuts", group: "View", single: true },
    { keys: "Esc", does: "Close a dialog or stop holding", group: "View", single: false },
    { keys: ". and ,", does: "Next or previous demo scene, while the tour is open", group: "Demo", single: true },
]);
export function resolveKey(event, options) {
    const key = event.key;
    if (key === "Escape")
        return event.type === "keydown" ? { type: "escape" } : null;
    if (event.inDialog || event.editable)
        return null;
    const chord = Boolean(event.ctrlKey || event.metaKey);
    if (event.type === "keyup") {
        return key === "\\" && options.singleKeys && !chord && !event.altKey ? { type: "hold", on: false } : null;
    }
    if (chord && !event.altKey) {
        const lower = key.toLowerCase();
        if (lower === "z")
            return event.shiftKey ? { type: "redo" } : { type: "undo" };
        if (lower === "y" && !event.shiftKey)
            return { type: "redo" };
        return null;
    }
    if (chord || event.altKey || !options.singleKeys)
        return null;
    if (key === "\\")
        return event.repeat ? null : { type: "hold", on: true };
    if (event.repeat)
        return null;
    const mode = COMPARE_MODES.find((m) => MODE_INFO[m].key === key);
    if (mode)
        return { type: "compare", mode };
    if (key === "[")
        return { type: "compare-step", step: -1 };
    if (key === "]")
        return { type: "compare-step", step: 1 };
    if (key === "+" || key === "=")
        return { type: "zoom", direction: 1 };
    if (key === "-" || key === "_")
        return { type: "zoom", direction: -1 };
    if (key === "?")
        return { type: "help" };
    if (options.demoActive && (key === "." || key === ","))
        return { type: "demo-step", step: key === "." ? 1 : -1 };
    const tool = toolKeys.find((t) => t.key === key.toLowerCase());
    if (tool && !event.shiftKey)
        return { type: "studio", id: tool.id };
    return null;
}
/** Shortcut keys must not collide: each single key does one thing. */
export function shortcutCollisions() {
    const seen = new Map(), clashes = [];
    const claim = (key, what) => {
        const k = key.toLowerCase();
        if (seen.has(k))
            clashes.push(`${key}: ${seen.get(k)} and ${what}`);
        else
            seen.set(k, what);
    };
    for (const t of toolKeys)
        claim(t.key, t.title);
    for (const m of COMPARE_MODES)
        claim(MODE_INFO[m].key, MODE_INFO[m].title);
    for (const [k, what] of [["[", "previous mode"], ["]", "next mode"], ["\\", "hold"], ["+", "zoom in"], ["=", "zoom in"],
        ["-", "zoom out"], ["_", "zoom out"], ["?", "help"], [".", "next scene"], [",", "previous scene"]])
        claim(k, what);
    return clashes;
}
//# sourceMappingURL=keymap.js.map
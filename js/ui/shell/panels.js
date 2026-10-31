/** Phone layout: on a narrow screen the studio shows the picture plus one panel at a time,
 * chosen from a tab bar (Tools, Edit, Layers, History). On wider screens every panel shows.
 * The breakpoint matches shell.css and compare-layout.ts. Author: John Khan.
 */
import { PHONE_MAX } from "./compare-layout.js";
import { rovingIndex } from "./focus.js";
export const PANELS = ["tools", "edit", "layers", "history"];
export const PANEL_LABELS = { tools: "Tools", edit: "Edit", layers: "Layers", history: "History" };
export function isPhone(width) {
    if (!Number.isFinite(width) || width <= 0)
        throw new RangeError("Viewport width must be positive");
    return width <= PHONE_MAX;
}
/** Which panels are visible at this width with this tab active. */
export function panelVisibility(width, active) {
    const phone = isPhone(width);
    return Object.fromEntries(PANELS.map((id) => [id, !phone || id === active]));
}
export class PanelTabs {
    current;
    listeners = new Set();
    constructor(initial = "edit") {
        if (!PANELS.includes(initial))
            throw new RangeError("Unknown panel");
        this.current = initial;
    }
    get active() { return this.current; }
    subscribe(fn) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
    select(id) {
        if (!PANELS.includes(id))
            throw new RangeError("Unknown panel");
        if (id === this.current)
            return;
        this.current = id;
        for (const fn of this.listeners)
            fn(id);
    }
    /** Arrow keys, Home and End move between tabs and select them (automatic activation). */
    key(key) {
        const next = rovingIndex(PANELS.length, PANELS.indexOf(this.current), key, "horizontal");
        if (next === null)
            return null;
        this.select(PANELS[next]);
        return this.current;
    }
    /** After a tool is chosen on a phone, show its settings. */
    followTool() { this.select("edit"); }
}

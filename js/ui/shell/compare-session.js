/** Compare state for one studio page: the mode, the split line, the loupe and flicker.
 *
 * Display state only. Like R8's hold-to-compare, nothing here enters the undo history or
 * changes a pixel of the source; switching modes never creates an edit. Every control can be
 * reached from the keyboard (the brief's accessibility baseline), and describe() gives the
 * text a screen reader announces for the current view.
 *
 * Author: John Khan.
 */
import { COMPARE_MODES, DEFAULT_FLICKER_MS, MODE_INFO, clampUnit, flickerFrame, flickerPeriod, isCompareMode, splitOrientation } from "./compare.js";
export const LOUPE_ZOOMS = [2, 3, 4, 6, 8];
export function defaultCompareState() {
    return { mode: "hold", position: 0.5, loupe: { x: 0.5, y: 0.5, zoom: 3 }, flickerMs: DEFAULT_FLICKER_MS,
        playing: false, manual: "after", held: false, differenceGain: 4 };
}
export function normaliseCompareState(input = {}) {
    const base = defaultCompareState();
    const mode = input.mode ?? base.mode;
    if (!isCompareMode(mode))
        throw new RangeError("Unknown compare mode");
    const zoom = input.loupe?.zoom ?? base.loupe.zoom;
    if (!LOUPE_ZOOMS.includes(zoom))
        throw new RangeError("Loupe zoom must be 2, 3, 4, 6 or 8×");
    const gain = input.differenceGain ?? base.differenceGain;
    if (!(Number.isFinite(gain) && gain >= 1 && gain <= 64))
        throw new RangeError("Difference gain must be 1–64");
    const manual = input.manual ?? base.manual;
    if (manual !== "before" && manual !== "after")
        throw new RangeError("Manual frame must be before or after");
    return {
        mode,
        position: clampUnit(input.position ?? base.position),
        loupe: { x: clampUnit(input.loupe?.x ?? base.loupe.x), y: clampUnit(input.loupe?.y ?? base.loupe.y), zoom },
        flickerMs: flickerPeriod(input.flickerMs ?? base.flickerMs),
        playing: Boolean(input.playing ?? base.playing),
        manual, held: Boolean(input.held ?? base.held), differenceGain: gain,
    };
}
const percent = (v) => `${Math.round(v * 100)}%`;
export class CompareSession {
    reducedMotion;
    value;
    listeners = new Set();
    constructor(initial = {}, reducedMotion = false) {
        this.reducedMotion = reducedMotion;
        this.value = normaliseCompareState(initial);
        if (reducedMotion)
            this.value.playing = false;
    }
    get state() { return { ...this.value, loupe: { ...this.value.loupe } }; }
    get mode() { return this.value.mode; }
    subscribe(listener) {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }
    set(next) {
        const merged = normaliseCompareState({ ...this.value, ...next, loupe: { ...this.value.loupe, ...(next.loupe ?? {}) } });
        if (this.reducedMotion)
            merged.playing = false;
        if (JSON.stringify(merged) === JSON.stringify(this.value))
            return;
        this.value = merged;
        for (const listener of this.listeners)
            listener(this.state);
    }
    setMode(mode) {
        if (!isCompareMode(mode))
            throw new RangeError("Unknown compare mode");
        // Leaving hold or flicker must never leave the original stuck on screen.
        this.set({ mode, held: false, playing: mode === "flicker" ? !this.reducedMotion : false, manual: "after" });
    }
    cycle(step) {
        const i = COMPARE_MODES.indexOf(this.value.mode);
        const next = COMPARE_MODES[(i + step + COMPARE_MODES.length) % COMPARE_MODES.length];
        this.setMode(next);
        return next;
    }
    setPosition(position) { this.set({ position: clampUnit(position) }); }
    nudge(step) { this.setPosition(this.value.position + step); }
    setLoupe(x, y) { this.set({ loupe: { ...this.value.loupe, x: clampUnit(x), y: clampUnit(y) } }); }
    moveLoupe(dx, dy) { this.setLoupe(this.value.loupe.x + dx, this.value.loupe.y + dy); }
    zoomLoupe(direction) {
        const i = LOUPE_ZOOMS.indexOf(this.value.loupe.zoom);
        const zoom = LOUPE_ZOOMS[Math.min(LOUPE_ZOOMS.length - 1, Math.max(0, i + direction))];
        this.set({ loupe: { ...this.value.loupe, zoom } });
        return zoom;
    }
    setLoupeZoom(zoom) { this.set({ loupe: { ...this.value.loupe, zoom } }); }
    hold(on) { this.set({ held: on }); }
    setPlaying(on) { this.set({ playing: on && !this.reducedMotion }); }
    togglePlay() {
        if (this.reducedMotion) {
            this.set({ manual: this.value.manual === "after" ? "before" : "after" });
            return false;
        }
        this.set({ playing: !this.value.playing });
        return this.value.playing;
    }
    toggleManual() { this.set({ manual: this.value.manual === "after" ? "before" : "after" }); }
    setFlickerMs(ms) { this.set({ flickerMs: flickerPeriod(ms) }); }
    setGain(gain) { this.set({ differenceGain: gain }); }
    /** Which picture a single-pane mode shows at this moment. */
    showing(elapsedMs = 0) {
        const s = this.value;
        if (s.mode === "hold")
            return s.held ? "before" : "after";
        if (s.mode === "flicker")
            return flickerFrame(elapsedMs, s.flickerMs, s.playing, s.manual);
        return "composite";
    }
    /** Keys handled while the compare stage has focus. Global digits are in keymap.ts. */
    key(input) {
        if (input.ctrlKey || input.metaKey || input.altKey)
            return { handled: false };
        const s = this.value, fine = input.shiftKey ? 0.01 : 0.05;
        const split = splitOrientation(s.mode);
        if (split) {
            const back = split === "horizontal" ? ["ArrowUp"] : ["ArrowLeft", "ArrowUp"];
            const forward = split === "horizontal" ? ["ArrowDown"] : ["ArrowRight", "ArrowDown"];
            if (back.includes(input.key)) {
                this.nudge(-fine);
                return { handled: true, announce: `Line at ${percent(this.value.position)}` };
            }
            if (forward.includes(input.key)) {
                this.nudge(fine);
                return { handled: true, announce: `Line at ${percent(this.value.position)}` };
            }
            if (input.key === "Home") {
                this.setPosition(0);
                return { handled: true, announce: "Showing only the edit" };
            }
            if (input.key === "End") {
                this.setPosition(1);
                return { handled: true, announce: "Showing only the original" };
            }
            if (input.key === "PageUp" || input.key === "PageDown") {
                this.nudge(input.key === "PageUp" ? -0.25 : 0.25);
                return { handled: true, announce: `Line at ${percent(this.value.position)}` };
            }
        }
        if (s.mode === "loupe") {
            const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
            const step = input.shiftKey ? 0.1 : 0.02;
            if (moves[input.key]) {
                this.moveLoupe(moves[input.key][0] * step, moves[input.key][1] * step);
                return { handled: true, announce: `Loupe at ${percent(this.value.loupe.x)} across, ${percent(this.value.loupe.y)} down` };
            }
            if (input.key === "+" || input.key === "=")
                return { handled: true, announce: `Loupe ${this.zoomLoupe(1)}×` };
            if (input.key === "-" || input.key === "_")
                return { handled: true, announce: `Loupe ${this.zoomLoupe(-1)}×` };
        }
        if (input.key === " " || input.key === "Spacebar") {
            if (s.mode === "hold") {
                this.hold(!s.held);
                return { handled: true, announce: this.value.held ? "Showing the original" : "Showing the edit" };
            }
            if (s.mode === "flicker") {
                if (this.reducedMotion || !s.playing)
                    this.toggleManual();
                else
                    this.togglePlay();
                return { handled: true, announce: this.describe() };
            }
        }
        if (input.key === "p" && s.mode === "flicker" && !this.reducedMotion) {
            return { handled: true, announce: this.togglePlay() ? "Flicker playing" : "Flicker paused" };
        }
        if (input.key === "Escape" && (s.held || s.playing)) {
            this.set({ held: false, playing: false, manual: "after" });
            return { handled: true, announce: "Showing the edit" };
        }
        return { handled: false };
    }
    /** Plain text of what is on screen, for the stage's accessible description. */
    describe(elapsedMs = 0) {
        const s = this.value, info = MODE_INFO[s.mode];
        switch (s.mode) {
            case "hold": return s.held ? "Hold view: showing the original photo." : "Hold view: showing the edited photo. Press and hold, or press Space, for the original.";
            case "split-vertical": return `Split view: original on the left ${percent(s.position)}, edit on the right.`;
            case "split-horizontal": return `Split view: original in the top ${percent(s.position)}, edit below.`;
            case "split-diagonal": return `Diagonal split: original above the line, edit below. Line at ${percent(s.position)}.`;
            case "flicker": {
                const frame = this.showing(elapsedMs);
                return s.playing ? `Flicker view, playing every ${s.flickerMs} ms.` : `Flicker view, paused on the ${frame === "before" ? "original" : "edit"}. Press Space to switch.`;
            }
            case "loupe": return `Loupe at ${s.loupe.zoom}× near ${percent(s.loupe.x)} across and ${percent(s.loupe.y)} down: original left, edit right.`;
            case "difference": return "What changed: coloured pixels changed, blue a little and red a lot. Grey pixels did not change.";
            default: return `${info.title}: ${info.summary}`;
        }
    }
}
//# sourceMappingURL=compare-session.js.map
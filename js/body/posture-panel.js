/** Seven-fix posture panel: native buttons, 1.0-5.0 decimal sliders and a visible warning.
 * Uses textContent only (never HTML), stores nothing and makes no network request. The
 * identity level is user-controlled; head protection itself stays on regardless.
 * Author: John Khan.
 */
import { SIMULATION_LABEL } from "../engines/local/posture.js";
import { PosturePanelState } from "./posture-panel-state.js";
export const BLOCK_MESSAGES = {
    photo_required: "Add a photo first.",
    view_required: "Confirm whether the photo is a front or side view.",
    wrong_view: "This fix needs the other view.",
    person_mask_required: "Mark the person outline first.",
    head_mask_required: "Mark the head to protect first.",
    identity_guard_required: "Identity protection is unavailable, so this face-adjacent fix is off.",
};
function slider(label, value) {
    const wrap = document.createElement("label");
    const text = document.createElement("span");
    text.textContent = label;
    const input = document.createElement("input");
    input.type = "range";
    input.min = "1";
    input.max = "5";
    input.step = "0.1";
    input.value = value.toFixed(1);
    const output = document.createElement("output");
    output.textContent = value.toFixed(1);
    wrap.append(text, input, output);
    return { wrap, input, output };
}
export function mountPosturePanel(parent, options = {}) {
    const model = new PosturePanelState();
    const root = document.createElement("section");
    root.className = "posture-panel";
    root.setAttribute("aria-label", "Posture photo simulation");
    const warning = document.createElement("p");
    warning.className = "posture-warning";
    warning.textContent = SIMULATION_LABEL;
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const list = document.createElement("div");
    list.className = "posture-fixes";
    const buttons = new Map();
    for (const entry of model.snapshot().fixes) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = `${entry.id} ${entry.name}`;
        button.addEventListener("click", () => choose(entry.fix));
        buttons.set(entry.fix, button);
        list.append(button);
    }
    const level = slider("Strength", model.level);
    const lock = slider("Identity protection", model.lockLevel);
    const note = document.createElement("p");
    note.className = "posture-fix-note";
    root.append(warning, list, level.wrap, lock.wrap, note, status);
    parent.append(root);
    let disposed = false;
    const render = (snapshot) => {
        for (const entry of snapshot.fixes) {
            const button = buttons.get(entry.fix);
            button.disabled = !entry.enabled;
            button.setAttribute("aria-pressed", String(snapshot.selected === entry.fix));
            button.title = entry.reason ? BLOCK_MESSAGES[entry.reason] : entry.warning;
        }
        level.input.disabled = snapshot.selected === null;
        level.input.value = snapshot.level.toFixed(1);
        level.output.textContent = snapshot.level.toFixed(1);
        lock.input.value = snapshot.lockLevel.toFixed(1);
        lock.output.textContent = snapshot.lockLevel.toFixed(1);
        const selected = snapshot.fixes.find((entry) => entry.fix === snapshot.selected);
        const blocked = snapshot.fixes.find((entry) => entry.reason !== null && entry.reason !== "wrong_view");
        note.textContent = selected?.warning || (snapshot.selected ? "" : blocked?.reason ? BLOCK_MESSAGES[blocked.reason] : "");
        options.onChange?.(snapshot);
        return snapshot;
    };
    const guarded = (action) => {
        if (disposed)
            return;
        try {
            render(action());
        }
        catch (error) {
            status.textContent = error instanceof Error ? error.message : "That change is not available.";
        }
    };
    const choose = (fix) => guarded(() => {
        const snapshot = model.select(fix);
        options.onPreview?.(fix, snapshot.level, snapshot.lockLevel);
        return snapshot;
    });
    const levelFrom = (input) => Math.round(Number(input.value) * 10) / 10;
    level.input.addEventListener("input", () => guarded(() => {
        const snapshot = model.setLevel(levelFrom(level.input));
        options.onPreview?.(snapshot.selected, snapshot.level, snapshot.lockLevel);
        return snapshot;
    }));
    level.input.addEventListener("change", () => guarded(() => {
        const snapshot = model.setLevel(levelFrom(level.input));
        options.onRelease?.(snapshot.selected, snapshot.level, snapshot.lockLevel);
        return snapshot;
    }));
    lock.input.addEventListener("change", () => guarded(() => {
        const snapshot = model.setLock(levelFrom(lock.input));
        if (snapshot.selected)
            options.onRelease?.(snapshot.selected, snapshot.level, snapshot.lockLevel);
        return snapshot;
    }));
    render(model.snapshot());
    return {
        element: root,
        setPhoto: (photo) => render(model.setPhoto(photo)),
        setGuardAvailable: (available) => render(model.setGuardAvailable(available)),
        setStatus: (message) => { status.textContent = String(message); },
        show: (fix, value, lockValue) => {
            model.select(fix);
            model.setLevel(value);
            return render(model.setLock(lockValue));
        },
        state: () => model.snapshot(),
        dispose: () => {
            if (disposed)
                return;
            disposed = true;
            root.remove();
        },
    };
}
//# sourceMappingURL=posture-panel.js.map
/** Self-contained, accessible A7 controls for an existing photo editor.
 * No automatic screen mounting; Workstream D may install this through a public hook.
 * State stays in memory and never contains raw photo bytes or landmarks.
 * Author: John Khan.
 */
import { validateLevel } from "../engines/proportions/golden.js";
function textElement(tag, content) {
    const element = document.createElement(tag);
    element.textContent = content;
    return element;
}
export function createGoldenWidget(options) {
    if (typeof options.onPreview !== "function")
        throw new TypeError("preview callback required");
    const root = document.createElement("section");
    root.className = "golden-control";
    root.setAttribute("aria-label", "Golden-ratio shaping preview");
    const heading = textElement("h3", "Golden-ratio shaping");
    const context = textElement("p", "Optional geometry guide, not a beauty score. No slimming is applied by default.");
    const label = textElement("label", "Strength 1.0 · unchanged");
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "1";
    slider.max = "5";
    slider.step = ".1";
    slider.value = "1";
    slider.setAttribute("aria-label", "Golden-ratio shaping strength");
    slider.disabled = true;
    label.append(slider);
    const lockLabel = textElement("label", "Protect my face (on by default)");
    const lock = document.createElement("input");
    lock.type = "checkbox";
    lock.checked = true;
    lock.setAttribute("aria-label", "Keep identity lock on");
    lockLabel.prepend(lock);
    const stateText = textElement("output", "No face found. Choose a photo with a detected face.");
    stateText.setAttribute("role", "status");
    stateText.setAttribute("aria-live", "polite");
    const selectLabel = textElement("label", "Choose a detected face");
    const select = document.createElement("select");
    select.setAttribute("aria-label", "Choose a detected face");
    select.disabled = true;
    selectLabel.append(select);
    root.append(heading, context, label, lockLabel, selectLabel, stateText);
    let current = {
        level: 1, identityLock: true, available: false, faceCount: 0,
        selectedIndex: null, message: "No face found",
    };
    let disposed = false;
    function onSlider() {
        if (disposed || !current.available || current.selectedIndex === null)
            return;
        const value = validateLevel(Number(slider.value));
        current = { ...current, level: value };
        label.firstChild.textContent = `Strength ${value.toFixed(1)} · ${value === 1 ? "unchanged" : "preview"}`;
        options.onPreview(value, current.identityLock);
    }
    function onLock() {
        if (disposed)
            return;
        current = { ...current, identityLock: lock.checked };
        if (current.available && current.selectedIndex !== null)
            options.onPreview(current.level, lock.checked);
    }
    function onFace() {
        if (disposed || !current.available)
            return;
        const index = Number(select.value);
        if (!Number.isInteger(index) || index < 0 || index >= current.faceCount)
            return;
        current = { ...current, selectedIndex: index };
        options.onSelectFace?.(index);
        options.onPreview(current.level, current.identityLock);
    }
    slider.addEventListener("input", onSlider);
    lock.addEventListener("change", onLock);
    select.addEventListener("change", onFace);
    function update(next) {
        if (disposed)
            return;
        const valid = next.available && Number.isInteger(next.faceCount) && next.faceCount > 0 &&
            next.selectedIndex !== null && Number.isInteger(next.selectedIndex) &&
            next.selectedIndex >= 0 && next.selectedIndex < next.faceCount;
        current = { ...current, ...next, available: valid };
        slider.disabled = !valid;
        select.disabled = !valid || next.faceCount <= 1;
        select.replaceChildren();
        if (valid) {
            for (let index = 0; index < next.faceCount; index++) {
                const option = document.createElement("option");
                option.value = String(index);
                option.textContent = `Face ${index + 1}`;
                select.append(option);
            }
            select.value = String(next.selectedIndex);
        }
        stateText.textContent = valid ? next.message : "No face found or no verified editable mask.";
    }
    function dispose() {
        if (disposed)
            return;
        disposed = true;
        slider.removeEventListener("input", onSlider);
        lock.removeEventListener("change", onLock);
        select.removeEventListener("change", onFace);
        root.remove();
    }
    return { element: root, state: () => ({ ...current }), update, dispose };
}

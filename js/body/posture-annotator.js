/** Native, accessible annotation controls for the body studio.
 * The user chooses the view, draws the person outline and a separately confirmed head
 * outline (by clicking the stage), and places every control point, by clicking or by
 * typing coordinates. Nothing is detected automatically. Text uses textContent only.
 * Author: John Khan.
 */
import { SIDE_OPTIONAL } from "../engines/local/posture.js";
import { viewPoints } from "./posture-intake.js";
export const GAP_MESSAGES = {
    photo_required: "Open a photo.",
    view_required: "Choose front or side view.",
    person_outline_required: "Draw the person outline.",
    head_outline_required: "Draw the head outline to protect.",
    head_confirmation_required: "Confirm the head outline.",
    control_points_required: "Place every control point.",
};
const POINT_LABELS = {
    right_shoulder: "Right shoulder", left_shoulder: "Left shoulder", right_hip: "Right hip", left_hip: "Left hip",
    mid_chest: "Mid chest", navel: "Navel", ear: "Ear", neck_base: "Base of neck", shoulder: "Shoulder",
    mid_back: "Mid back", hip: "Hip", knee: "Knee", ankle: "Ankle (optional)",
};
function button(text, onClick) {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = text;
    element.addEventListener("click", onClick);
    return element;
}
function numberInput(label) {
    const wrap = document.createElement("label");
    const text = document.createElement("span");
    text.textContent = label;
    const input = document.createElement("input");
    input.type = "number";
    input.step = "0.5";
    wrap.append(text, input);
    return { wrap, input };
}
export function mountPostureAnnotator(parent, intake, onError = () => { }) {
    let mode = "person";
    let draft = [];
    const root = document.createElement("section");
    root.className = "posture-annotator";
    root.setAttribute("aria-label", "Mark the photo");
    const views = [["front", 0, "Front view"], ["side", -1, "Side view, facing left"],
        ["side", 1, "Side view, facing right"]];
    const viewButtons = views.map(([view, facing, text]) => button(text, () => act(() => intake.setView(view, facing))));
    const modes = [["person", "Draw person outline"], ["head", "Draw head outline"],
        ["points", "Place control points"]];
    const modeButtons = modes.map(([value, text]) => button(text, () => { setMode(value); }));
    const undo = button("Undo last outline point", () => { draft = draft.slice(0, -1); refresh(); });
    const finish = button("Finish outline", () => finishOutline());
    const confirm = document.createElement("input");
    confirm.type = "checkbox";
    const confirmLabel = document.createElement("label");
    const confirmText = document.createElement("span");
    confirmText.textContent = "The head outline covers the whole head";
    confirmLabel.append(confirm, confirmText);
    confirm.addEventListener("change", () => act(() => intake.confirmHead(confirm.checked)));
    const select = document.createElement("select");
    select.setAttribute("aria-label", "Control point");
    const x = numberInput("x (pixels)"), y = numberInput("y (pixels)");
    const setPoint = button("Set point", () => act(() => intake.setPoint(select.value, [Number(x.input.value), Number(y.input.value)])));
    const missing = document.createElement("ul");
    missing.setAttribute("aria-label", "Still needed");
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const accept = button("Accept markings", () => act(() => {
        intake.accept();
        return intake.snapshot();
    }));
    root.append(...viewButtons, ...modeButtons, undo, finish, confirmLabel, select, x.wrap, y.wrap, setPoint, accept, missing, status);
    parent.append(root);
    let disposed = false;
    function act(change) {
        if (disposed)
            return;
        try {
            change();
            status.textContent = "";
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "That marking was not accepted.";
            status.textContent = message;
            onError(message);
        }
        refresh();
    }
    function setMode(next) {
        mode = next;
        draft = [];
        refresh();
    }
    function finishOutline() {
        if (mode === "points")
            return;
        const points = draft;
        act(() => (mode === "person" ? intake.setPersonOutline(points) : intake.setHeadOutline(points)));
        draft = [];
        refresh();
    }
    function place(point) {
        if (mode !== "points") {
            draft = [...draft, [point[0], point[1]]];
            refresh();
            return;
        }
        const name = select.value;
        act(() => intake.setPoint(name, point));
        const next = intake.missing().includes("control_points_required")
            ? viewPoints(intake.snapshot().view ?? "front").find((item) => !(item in intake.snapshot().points))
            : undefined;
        if (next)
            select.value = next;
    }
    function refresh() {
        const snapshot = intake.snapshot();
        views.forEach(([view, facing], index) => {
            viewButtons[index].setAttribute("aria-pressed", String(snapshot.view === view && snapshot.facing === facing));
            viewButtons[index].disabled = snapshot.digest === null;
        });
        modes.forEach(([value], index) => modeButtons[index].setAttribute("aria-pressed", String(mode === value)));
        undo.disabled = draft.length === 0;
        finish.disabled = mode === "points" || draft.length < 3;
        confirm.checked = snapshot.headConfirmed;
        confirm.disabled = snapshot.head === null;
        const names = snapshot.view ? [...viewPoints(snapshot.view), ...(snapshot.view === "side" ? SIDE_OPTIONAL : [])] : [];
        const chosen = names.includes(select.value) ? select.value : names[0] ?? "";
        select.replaceChildren(...names.map((name) => {
            const option = document.createElement("option");
            option.value = name;
            option.textContent = `${POINT_LABELS[name] ?? name}${name in snapshot.points ? " (placed)" : ""}`;
            return option;
        }));
        select.value = chosen;
        select.disabled = names.length === 0;
        setPoint.disabled = names.length === 0;
        accept.disabled = snapshot.missing.length > 0;
        missing.replaceChildren(...snapshot.missing.map((gap) => {
            const item = document.createElement("li");
            item.textContent = GAP_MESSAGES[gap];
            return item;
        }));
    }
    const unsubscribe = intake.subscribe(() => refresh());
    refresh();
    return {
        element: root,
        get mode() { return mode; },
        get draft() { return draft.map(([px, py]) => [px, py]); },
        setMode,
        place,
        finishOutline,
        refresh,
        dispose() {
            if (disposed)
                return;
            disposed = true;
            unsubscribe();
            root.remove();
        },
    };
}
//# sourceMappingURL=posture-annotator.js.map
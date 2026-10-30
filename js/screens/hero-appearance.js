/** Appearance controls and the actual photo/mesh capability boundary.
 * A pending model cannot be replaced by invented points. Released fixtures must
 * match the selected file's SHA-256 and original dimensions. Author: John Khan.
 */
import { h } from "../dom.js";
import { STOPS as GENDER_STOPS } from "../engines/local/gender.js";
import { validateFixture } from "../vision/fixtures.js";
import { detectedFaces, faceMapFor } from "../face/map-reader.js";
import { studioMapKey } from "./face-map.js";
import { appearanceStackReport, StackError } from "../ui/shell/appearance-stack.js";
/** The joint check line when age and the gender appearance are both on; empty otherwise. */
export function stackLine(editor) {
    const on = editor.document.layers.filter(l => l.enabled && l.strength > 0 && ["older", "younger", "gender"].includes(l.kind));
    if (!on.some(l => l.kind === "gender") || !on.some(l => l.kind !== "gender"))
        return "";
    try {
        return appearanceStackReport(editor.source, editor.document.layers, editor.rendered().image).text;
    }
    catch (error) {
        return error instanceof StackError ? error.message : String(error);
    }
}
export function chooseAppearance(editor, kind, value) {
    const valid = kind === "gender" ? Number.isFinite(value) && value >= -100 && value <= 100
        : Number.isInteger(value) && value >= 1 && value <= (kind === "older" ? 5 : 3);
    if (!valid)
        throw new RangeError("Choose an available appearance stop.");
    const key = kind === "gender" ? "slider" : "stop";
    // One selection state with the strip and Add (controller.ts pick): one undo step, and Add keeps this layer.
    editor.pick(kind, { [key]: value }, kind === "gender" ? `appearance ${value}` : `stop ${value}`);
}
export async function matchingFaceFixture(raw, source) {
    if (source.kind !== "uploaded" || !source.fileSha256 || !source.fileDimensions)
        throw new Error("Reopen the matching photo in a browser with SHA-256 support first.");
    const fixture = await validateFixture(raw);
    if (fixture.image.sha256 !== source.fileSha256)
        throw new Error("These recorded points belong to a different photo (SHA-256 mismatch).");
    if (fixture.image.width !== source.fileDimensions[0] || fixture.image.height !== source.fileDimensions[1])
        throw new Error("Recorded dimensions do not match this photo's orientation.");
    if (!fixture.faces.length)
        throw new Error("This recording has no face landmarks. No face will be invented.");
    return fixture;
}
/** Faces from the shared face map (face/map-reader.ts), keyed by the photo: the same reading the
 * Face map panel and every other tool use. No face found is a result, not an invented face. */
async function detect(source) {
    const map = await faceMapFor(source.image, { key: studioMapKey(source) });
    if (map.status === "unavailable")
        return { ok: false, source: "manual", error: `${map.reason} Load matching recorded points or try the drawn example.` };
    return { ok: true, source: "local-model", faces: detectedFaces(map) };
}
export function heroAppearanceScreen(editor, changed, deps = {}) {
    const kind = editor.document.studio, sourceId = editor.source.id;
    const status = h("p", { role: "status", "aria-live": "polite", class: "fine" });
    const picks = h("div", { class: "row", "aria-label": "Choose the face to edit" });
    const current = () => { if (sourceId !== editor.source.id)
        throw new Error("The photo changed. Read points for the new photo first."); };
    const attach = (points) => { current(); editor.setFace(points); changed(); };
    const showFaces = (faces) => {
        picks.replaceChildren(...faces.map((face, index) => h("button", { type: "button", class: "btn btn-quiet", onclick: () => {
                try {
                    attach(face.points);
                }
                catch (error) {
                    status.textContent = error instanceof Error ? error.message : String(error);
                }
            } }, `Use face ${index + 1}`)));
        // Two to six faces: each can get its own edits, kept inside that face (save/multi-face.ts).
        if (faces.length >= 2 && faces.length <= 6)
            picks.append(h("button", { type: "button", class: "btn", onclick: () => {
                    try {
                        current();
                        editor.setFaces(faces.map(face => face.points));
                        changed();
                        status.textContent = `${faces.length} faces ready. Pick a face chip above the photo to edit it; each face's edits stay inside that face.`;
                    }
                    catch (error) {
                        status.textContent = error instanceof Error ? error.message : String(error);
                    }
                } }, "Edit each face separately"));
        status.textContent = `${faces.length} recorded face${faces.length === 1 ? "" : "s"}. Choose one${faces.length >= 2 && faces.length <= 6 ? ", or edit each face separately" : ""}. Attaching points resets existing edits.`;
    };
    const read = h("button", { type: "button", class: "btn btn-quiet", onclick: async () => {
            read.disabled = true;
            try {
                // The photo on screen was opened under the single consent (built-in samples need none).
                if (!(await (deps.consent ?? (() => true))()))
                    throw new Error("No face points were read.");
                status.textContent = "Face reader loading on this device…";
                current();
                const source = editor.source, result = await (deps.detect ?? detect)(source);
                current();
                if (!result.ok)
                    throw new Error(result.error ?? "Face reading is unavailable.");
                if (!result.faces?.length)
                    throw new Error("No face found. Try a clear front-facing photo.");
                showFaces(result.faces.map(face => ({ id: face.id,
                    points: face.landmarks.map(point => [point.x * source.image.width, point.y * source.image.height]) })));
            }
            catch (error) {
                status.textContent = error instanceof Error ? error.message : String(error);
            }
            finally {
                read.disabled = false;
            }
        } }, "Find face points on this device");
    const fixture = h("input", { type: "file", accept: "application/json,.json", "aria-label": "Matching recorded face points" });
    fixture.disabled = editor.source.kind !== "uploaded";
    fixture.addEventListener("change", async () => {
        const file = fixture.files?.[0];
        fixture.value = "";
        if (!file)
            return;
        try {
            if (!(await (deps.consent ?? (() => true))()))
                throw new Error("No face points were attached.");
            if (file.size > 28_000_000)
                throw new Error("Recorded points file is too large.");
            current();
            const source = editor.source;
            const record = await matchingFaceFixture(JSON.parse(await file.text()), source);
            current();
            showFaces(record.faces.map(face => ({ id: face.id,
                points: face.landmarks.map(([x, y]) => [x * source.image.width, y * source.image.height]) })));
        }
        catch (error) {
            status.textContent = error instanceof Error ? error.message : String(error);
        }
    });
    const controls = h("div", { class: "row" });
    const stack = h("p", { class: "fine", role: "status" }, ["older", "younger", "gender"].includes(kind) ? stackLine(editor) : "");
    if (["older", "younger", "gender"].includes(kind)) {
        const values = kind === "gender" ? GENDER_STOPS : Array.from({ length: kind === "older" ? 5 : 3 }, (_, i) => i + 1);
        for (const value of values) {
            const name = kind === "gender" ? value === 0 ? "Original" : `${Math.abs(value) === 33 ? "Normal" : Math.abs(value) === 66 ? "Extra" : "Hyper"} ${value < 0 ? "feminine" : "masculine"}`
                : `${kind === "older" ? "Older" : "Younger"} ${value}`;
            controls.append(h("button", { type: "button", class: "btn btn-quiet", disabled: editor.source.face?.length !== 478,
                onclick: () => { try {
                    chooseAppearance(editor, kind, value);
                    changed();
                    stack.textContent = stackLine(editor);
                }
                catch (error) {
                    status.textContent = error instanceof Error ? error.message : String(error);
                } } }, name));
        }
    }
    const layer = [...editor.document.layers].reverse().find(row => row.kind === kind);
    return h("section", { class: "hero-appearance-screen", "aria-label": "Appearance simulation" }, h("h2", {}, kind === "gender" ? "Choose an appearance" : kind === "beard" ? "Face points for this photo" : `${kind === "older" ? "Older" : "Younger"} appearance`), controls, stack, h("p", { class: "fine" }, `Overall strength: ${layer?.strength ?? 30} of 100. Starts gently; adjust Strength below.${kind === "gender" ? " Original returns this appearance layer to zero change." : ""}`), h("p", { class: "fine" }, "Local simulation. Face-only geometry; no hidden makeup or hairstyle. Not a prediction of age, identity or sex. Real-face quality is not yet validated."), editor.source.face ? h("p", { class: "fine" }, editor.source.kind === "sample" ? "Drawn example with synthetic points. Open your own photo for a real-photo edit." : "Using face points attached to this photo.") : null, read, h("label", {}, "Or load matching recorded points ", fixture), picks, status, h("p", { class: "fine" }, "Points are read locally. A recording must match the photo hash and orientation. Face points stay in memory and are never included in saved looks."));
}
//# sourceMappingURL=hero-appearance.js.map
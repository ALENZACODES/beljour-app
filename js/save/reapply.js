import { readiness } from "../ui/shell/catalogue.js";
import { applyLocalLayer, nextFace } from "../ui/shell/pipeline.js";
import { RENDER_KINDS } from "../ui/shell/types.js";
import { applyLook } from "./looks.js";
import { TOOLS, latest, version } from "./recipe.js";
export const MESH_POINTS = 478;
const KINDS = RENDER_KINDS;
function rgb(photo) {
    if (photo.channels === 3)
        return { width: photo.width, height: photo.height, channels: 3, data: new Uint8Array(photo.data) };
    if (photo.channels !== 4)
        throw new RangeError("a photo is RGB or RGBA");
    const out = new Uint8Array(photo.width * photo.height * 3);
    for (let p = 0; p < photo.width * photo.height; p++)
        for (let c = 0; c < 3; c++)
            out[p * 3 + c] = photo.data[p * 4 + c];
    return { width: photo.width, height: photo.height, channels: 3, data: out };
}
/** The rendered colour back in the input's layout; an RGBA photo keeps its own alpha untouched. */
function restore(input, out) {
    if (out.width !== input.width || out.height !== input.height)
        throw new RangeError("a step changed the photo size");
    const n = input.width * input.height;
    const data = new Uint8Array(n * input.channels);
    for (let p = 0; p < n; p++) {
        for (let c = 0; c < 3; c++)
            data[p * input.channels + c] = out.data[p * out.channels + c];
        if (input.channels === 4)
            data[p * 4 + 3] = input.data[p * 4 + 3];
    }
    return { width: input.width, height: input.height, channels: input.channels, data };
}
export function layerFor(step, dose, index = 0) {
    return { id: `reapply-${index}`, kind: step.tool, name: TOOLS[step.tool]?.label ?? step.tool, enabled: true,
        opacity: 1, strength: Math.max(0, Math.min(100, step.strength * dose)), parameters: { ...step.settings },
        provenance: "local", simulation: !["enhance", "filters"].includes(step.tool), origin: "photo" };
}
/** Why a step can or can't run on this photo, before anything renders. */
export function planSteps(steps, source) {
    return steps.map((step, index) => {
        const label = TOOLS[step.tool]?.label ?? step.tool;
        if (step.provider === "youcam")
            return { index, tool: step.tool, runs: false, reason: `${label} needs YouCam, which re-applying on this device never calls.` };
        if (!KINDS.includes(step.tool))
            return { index, tool: step.tool, runs: false, reason: `${label} can't be re-applied on this device yet.` };
        const ready = readiness(step.tool, source);
        return { index, tool: step.tool, runs: ready.ready, reason: ready.ready ? "" : ready.reason ?? `${label} isn't ready on this photo.` };
    });
}
/** The engine for one photo: every local tool, through the studio's own renderer. Steps run in
 * order, and a step that moves the face (age reshape, gender) hands its points to the next one,
 * as the editor's layer stack does. */
export function localEngine(source) {
    const engine = {};
    let face = source.face;
    for (const kind of KINDS) {
        engine[kind] = (photo, step, dose) => {
            const img = rgb(photo);
            const result = applyLocalLayer(img, { ...source, image: img, face }, layerFor(step, dose));
            face = nextFace(face, result.face, 1);
            return restore(photo, result.image);
        };
    }
    return engine;
}
/** The saved face points, but only for the very photo they were read on. */
export function savedFaceFor(saved, photo) {
    if (!saved || !photo.fileSha256)
        return null;
    const [w, h] = saved.identity.dimensions;
    if (saved.identity.reference !== photo.fileSha256 || w !== photo.image.width || h !== photo.image.height)
        return null;
    return saved.mesh.length === MESH_POINTS ? saved.mesh.map((p) => p.slice(0, 2)) : null;
}
/** Re-apply one version (default: newest) of a saved look to a photo. A step that can't run, or
 * that its renderer refuses on this photo, is skipped with its reason; the rest still run. */
export function reapply(look, source, options = {}) {
    const chosen = options.version === undefined ? latest(look) : version(look, options.version);
    const own = source.face && source.face.length === MESH_POINTS;
    const borrowed = own ? null : savedFaceFor(options.savedFace ?? null, source);
    const photo = borrowed ? { ...source, face: borrowed.map((p) => [p[0], p[1]]) } : source;
    const plan = planSteps(chosen.steps, photo);
    const reasons = new Map(plan.filter((p) => !p.runs).map((p) => [p.tool, p.reason]));
    const all = localEngine(photo);
    const refused = [];
    const engine = {};
    for (const p of plan) {
        if (!p.runs)
            continue;
        // A renderer that refuses on this photo (an identity guard, say) leaves the photo as it was
        // for that step; the look's other steps still run.
        engine[p.tool] = (current, step, dose) => {
            try {
                return all[p.tool](current, step, dose);
            }
            catch (error) {
                refused.push({ tool: p.tool, reason: error instanceof Error ? error.message : String(error) });
                return { ...current, data: new Uint8Array(current.data) };
            }
        };
    }
    const report = applyLook(look, { width: source.image.width, height: source.image.height, channels: source.image.channels, data: source.image.data }, engine, { version: chosen.version, dose: options.dose, youcamAvailable: false });
    const applied = [...report.applied];
    for (const r of refused)
        applied.splice(applied.indexOf(r.tool), 1);
    return { photo: report.photo, applied, plan, face: own ? "this-photo" : borrowed ? "saved-for-this-photo" : "none",
        skipped: [...report.skipped.map((s) => ({ tool: s.tool, reason: reasons.get(s.tool) ?? s.reason })), ...refused] };
}

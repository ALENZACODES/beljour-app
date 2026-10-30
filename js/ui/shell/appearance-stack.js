import { renderAge } from "../../engines/local/age.js";
import { genderTargets } from "../../engines/local/gender.js";
import { meshWarp } from "../../engines/warp/mesh.js";
import { moveMagnitude } from "../../engines/warp/field.js";
import { regionMask } from "../../data/regions/index.js";
import { stillYou } from "../../layout/still-you.js";
import { nextFace } from "./pipeline.js";
export const AGE_KINDS = ["older", "younger"];
export const STACK_NOTE = "Age texture first, then the appearance change, so creases follow the new face shape.";
export const STACK_REFUSALS = {
    older_and_younger: "Older and Younger cannot be on at the same time. Turn one off.",
    repeated_appearance: "Use one layer for each appearance; adjust its strength instead of adding another.",
};
export class StackError extends RangeError {
    code;
    constructor(code) {
        super(STACK_REFUSALS[code]);
        this.code = code;
        this.name = "StackError";
    }
}
const isAge = (layer) => AGE_KINDS.includes(layer.kind);
/** Refuse contradictory stacks; return the layers with age moved ahead of the gender layer. */
export function appearanceOrder(layers) {
    const kinds = layers.map((l) => l.kind);
    if (kinds.includes("older") && kinds.includes("younger"))
        throw new StackError("older_and_younger");
    for (const kind of ["older", "younger", "gender"])
        if (kinds.filter((k) => k === kind).length > 1)
            throw new StackError("repeated_appearance");
    const gender = layers.findIndex((l) => l.kind === "gender"), age = layers.findIndex(isAge);
    if (gender < 0 || age < 0 || age < gender)
        return { layers: [...layers], reordered: false };
    const out = layers.filter((l) => !isAge(l));
    out.splice(out.findIndex((l) => l.kind === "gender"), 0, layers[age]);
    return { layers: out, reordered: true };
}
/** Joint check of a rendered stack against the original. `after` is the pipeline's output. */
export function appearanceStackReport(source, layers, after) {
    const { layers: ordered, reordered } = appearanceOrder(layers.filter((l) => l.enabled && l.opacity > 0 && l.strength > 0));
    const age = ordered.find(isAge), gender = ordered.find((l) => l.kind === "gender"), points = source.face;
    const before = source.image, { width, height } = before;
    const allowed = new Uint8Array(width * height);
    let guardScale = null, ageStrength = null;
    if (points && points.length === 478) {
        let face = points;
        if (age) {
            const stop = Number(age.parameters.stop ?? 1);
            const result = renderAge(before, points, { stop: age.kind === "older" ? stop : -stop, strength: age.strength / 100, seed: 1024,
                hairMask: source.hair, layers: { hair: source.hair ? 1 : 0 } });
            ageStrength = result.metrics.strength_used;
            face = nextFace(points, result.face, age.opacity) ?? points;
            result.editMask.data.forEach((v, i) => { if (v > 0)
                allowed[i] = 1; });
        }
        if (gender) {
            const requested = Number(gender.parameters.slider ?? -33) * gender.strength / 100;
            const start = face.map(([x, y]) => [x, y]);
            const warp = meshWarp(width, height, start, genderTargets(start, requested, { scope: "face_only" }).points, { guard: true });
            guardScale = warp.strengthUsed;
            moveMagnitude(warp.result.field).data.forEach((v, i) => { if (v > 1e-9)
                allowed[i] = 1; });
        }
    }
    let changed = 0, outside = 0;
    for (let i = 0; i < width * height; i++) {
        let differs = false;
        for (let c = 0; c < 3; c++)
            if (before.data[i * before.channels + c] !== after.data[i * after.channels + c])
                differs = true;
        if (!differs)
            continue;
        changed++;
        if (!allowed[i])
            outside++;
    }
    const skin = points && points.length >= 468 ? regionMask("skin", points, width, height, { normalized: false, supersample: 2 }) : undefined;
    const still = stillYou(before, after, { skin, face: points, edited: changed > 0 });
    const stacked = Boolean(age && gender);
    const passed = outside === 0 && !still.lightened && (guardScale === null || guardScale > 0);
    const text = `${stacked ? "Stacked: " + STACK_NOTE + " " : ""}${passed ? "Joint check passed" : "Joint check failed"}: `
        + `${outside === 0 ? "changes stay in the face areas" : `${outside} pixels changed outside the face areas`}, `
        + `${still.marksKept} of ${still.marksFound} marks kept, ${still.lightened ? "skin lightened" : "skin not lightened"}.`;
    return { stacked, reordered, note: stacked ? STACK_NOTE : null, changedPixels: changed, changedOutside: outside, guardScale,
        ageStrengthUsed: ageStrength, marksFound: still.marksFound, marksKept: still.marksKept, lightened: still.lightened, passed, text };
}
//# sourceMappingURL=appearance-stack.js.map
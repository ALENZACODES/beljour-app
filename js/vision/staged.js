/** Which browser models this build staged: the same-origin list dist/models/availability.json
 * that scripts/copy-models.mjs writes. Reading it sends nothing about the person or her photo
 * (a plain GET of this site's own file), and a model is only ever requested when this list
 * names it. Shared by the Skin Moment and Face lenses pages. Author: John Khan. */
import { defaultVisionClient } from "./client.js";
let staged = null;
/** The staged model ids (read once per page; empty when the list is missing). */
export function stagedModels(fetcher = fetch) {
    staged ??= fetcher("models/availability.json", { cache: "no-cache" })
        .then((r) => (r.ok ? r.json() : { models: [] }))
        .then((j) => new Set(Array.isArray(j.models) ? j.models.filter((m) => typeof m === "string") : []))
        .catch(() => new Set());
    return staged;
}
/** True when the face reader is staged in this build and the vision client can run it. */
export async function faceReaderReady(vision = defaultVisionClient()) {
    return vision.ready("face-landmarks") && (await stagedModels()).has("face-landmarker-478");
}
//# sourceMappingURL=staged.js.map
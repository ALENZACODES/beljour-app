export const STUDIO_IDS = ["enhance", "hair-fibre", "beard", "posture", "face-makeup", "makeup", "hair-style", "filters", "portrait", "lighting", "recolour", "balayage", "older", "younger", "gender", "skin", "under-eye", "teeth", "shave", "grey", "studio", "illustration", "adjust", "mixer", "curves", "selective", "crop", "retouch"];
export const LOCAL_KINDS = ["enhance", "hair-fibre", "beard", "posture", "face-makeup", "portrait", "lighting", "recolour", "balayage", "older", "younger", "gender", "skin", "under-eye", "teeth", "shave", "grey", "studio", "illustration", "retouch"];
/** The photo-adjustment and crop tools (web/src/editor): photo edits, not simulations; the
 * pipeline runs them in fixed stages around the other layers (editor/adjust/stack.ts). */
export const ADJUST_KINDS = ["adjust", "mixer", "curves", "selective", "crop"];
/** Kinds this device renders: the local engines and, from R11, the filter looks (web/src/filters). */
export const RENDER_KINDS = [...LOCAL_KINDS, "filters", ...ADJUST_KINDS];
/** Whether a layer of this kind is a simulation (a change to her) rather than a photo edit. */
export function isSimulationKind(kind) {
    return kind !== "enhance" && kind !== "filters" && !ADJUST_KINDS.includes(kind);
}

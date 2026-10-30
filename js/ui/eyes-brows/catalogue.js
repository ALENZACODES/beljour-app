/** Eyes, lashes, brows and four original procedural looks. Author: John Khan.
 * These are implemented simulations. Real-face acceptance remains unproven until
 * the separately frozen box benchmark records evidence for every required slice.
 * "eye-makeup" (#35) layers shadow, liner and mascara in one look on the same engine.
 */
import { LOOKS } from "../../engines/eyes/makeup.js";
function choices(values) {
    return values.map(value => ({ value, label: value.replaceAll("_", " ") }));
}
export const FEATURES = [
    { id: "W59", name: "Lash extension map", family: "eyes", requiresMesh: true, requiresHair: false,
        requiresTraces: false, requiresAdult: false, choices: choices(["classic", "hybrid", "volume", "mega"]),
        summary: "Choose extension density and inspect a map fitted to each lash line.",
        limitation: "Added extensions are drawn simulations. Dense extensions on sparse natural lashes may be unrealistic." },
    { id: "W60", name: "Lash shape guide", family: "eyes", requiresMesh: true, requiresHair: false,
        requiresTraces: false, requiresAdult: false, choices: choices(["cat", "doll", "wispy", "kitten", "fox"]),
        summary: "Compare length placement on your own eye shape, with anatomy warnings.",
        limitation: "Shape suggestions are geometric guides, not a professional fit assessment." },
    { id: "W61", name: "Your lash lift and tint", family: "eyes", requiresMesh: true, requiresHair: false,
        requiresTraces: true, requiresAdult: false, choices: choices(["lifting", "tint"]),
        summary: "Lift traced lashes while retaining their measured length and count.",
        limitation: "Trace visible lashes first. Unseen lashes cannot be reconstructed from a photograph." },
    { id: "W62", name: "Strip and cluster fitting", family: "eyes", requiresMesh: true, requiresHair: false,
        requiresTraces: false, requiresAdult: false, choices: choices(["strip", "cluster", "half_strip"]),
        summary: "Fit an original strip or cluster arrangement to each eye width.",
        limitation: "Original design only. This is not a product match; check clearance if you wear glasses." },
    { id: "W63", name: "Mascara on your lashes", family: "eyes", requiresMesh: true, requiresHair: false,
        requiresTraces: true, requiresAdult: false, choices: choices(["lengthening", "volumising", "tubing"]),
        summary: "Coat observed upper and lower lashes, including a controlled smudge state.",
        limitation: "Lash count is preserved. A sparse set of traced lashes remains sparse." },
    { id: "W64", name: "Wing and tightline", family: "eyes", requiresMesh: true, requiresHair: false,
        requiresTraces: false, requiresAdult: false, choices: choices(["wing", "batwing", "tightline", "soft_wing"]),
        summary: "Place a wing separately on each lid without reshaping either eye.",
        limitation: "A front photograph cannot establish eyelid fold behaviour in every expression." },
    { id: "W65", name: "Graphic and soft liner", family: "eyes", requiresMesh: true, requiresHair: false,
        requiresTraces: false, requiresAdult: false, choices: choices(["floating", "double_wing", "smoked_pencil", "gel", "shadow"]),
        summary: "Compare floating crease, double wing and soft liner within available lid space.",
        limitation: "Low contrast is disclosed. It never silently makes your liner thicker." },
    { id: "W66", name: "Shadow placement", family: "eyes", requiresMesh: true, requiresHair: false,
        requiresTraces: false, requiresAdult: false, choices: choices(["cut_crease", "halo", "smokey"]),
        summary: "Place crease, halo or smokey shadow around the anatomy you select.",
        limitation: "Digital pigment payoff is an assumption; real products and lighting vary." },
    { id: "W67", name: "Shadow in changing light", family: "eyes", requiresMesh: true, requiresHair: false,
        requiresTraces: false, requiresAdult: false, choices: choices(["foil", "duochrome"]),
        summary: "Move a light angle through a continuous foil or duochrome simulation.",
        limitation: "Optical simulation, not measured product reflectance. No extra glitter is added." },
    { id: "W69", name: "Brow tint", family: "brows", requiresMesh: true, requiresHair: false,
        requiresTraces: false, requiresAdult: false, choices: choices(["settled", "first_week", "faded"]),
        summary: "Tint observed brow hairs with a first-week comparison and grey resistance.",
        limitation: "This cannot fill missing hairs. Sparse skin remains visible." },
    { id: "W70", name: "Brow lamination", family: "brows", requiresMesh: true, requiresHair: false,
        requiresTraces: false, requiresAdult: false, choices: [],
        summary: "Redirect observed hair detail without smoothing the skin underneath.",
        limitation: "Short or sparse brows produce a limited result; no growth is implied." },
    { id: "W71", name: "Hair-stroke brow preview", family: "brows", requiresMesh: true, requiresHair: false,
        requiresTraces: false, requiresAdult: true, choices: choices(["healed", "fresh", "faded"]),
        summary: "Inspect individual simulated pigment strokes, with healed as the default.",
        limitation: "18+ consultation preview only. Healing, retention and pigment response cannot be predicted." },
    { id: "W72", name: "Powder and nano comparison", family: "brows", requiresMesh: true, requiresHair: false,
        requiresTraces: false, requiresAdult: true, choices: choices(["powder", "nano", "microblading"]),
        summary: "Compare capped powder density and original stroke techniques on the same brow.",
        limitation: "18+ consultation preview. Digital pigment is not a treatment recommendation." },
    { id: "W73", name: "Brow geometry guide", family: "brows", requiresMesh: true, requiresHair: false,
        requiresTraces: false, requiresAdult: false, choices: [],
        summary: "Adjust a visible shape guide while keeping the natural difference between your brows.",
        limitation: "A geometry overlay, not a lift or thinning promise. Your brow pixels are retained." },
    { id: "W74", name: "Progress scenario diary", family: "brows", requiresMesh: true, requiresHair: false,
        requiresTraces: false, requiresAdult: false, choices: choices(["brows", "lashes"]),
        summary: "Explore explicitly hypothetical length and density scenarios over time.",
        limitation: "No efficacy or typical growth claim. Ask a professional about product suitability and side effects." },
    { id: "W75", name: "Anatomy-led placement", family: "eyes", requiresMesh: true, requiresHair: false,
        requiresTraces: false, requiresAdult: false, choices: [],
        summary: "Choose a technique native to hooded, monolid or deep-set anatomy for each eye.",
        limitation: "Artist and real-model review is pending. This changes makeup placement only." },
    { id: "W76", name: "Coloured liner and mascara", family: "eyes", requiresMesh: true, requiresHair: false,
        requiresTraces: false, requiresAdult: false, choices: choices(["navy", "burgundy", "forest"]),
        summary: "Compare three original colour families without changing your iris colour.",
        limitation: "The screen is not colour-calibrated. Mascara requires traced lashes." },
    { id: "eye-makeup", name: "Eye makeup: shadow, liner and mascara", family: "eyes", requiresMesh: true, requiresHair: false,
        requiresTraces: false, requiresAdult: false, choices: Object.entries(LOOKS).map(([value, look]) => ({ value, label: look.name })),
        summary: "Layer eyeshadow, liner and mascara in one original look, placed on each eye's own measured shape.",
        limitation: "Mascara needs traced lashes and is left off without them. Colours are estimates, not a product result." },
    { id: "ink-study", name: "Ink Study", family: "artistic", requiresMesh: true, requiresHair: true,
        requiresTraces: false, requiresAdult: false, choices: [],
        summary: "Posterised cel shading and ink edges, with marked hair and eye colours protected.",
        limitation: "Procedural illustration. Mark the hair first so protection does not rely on a guess." },
    { id: "pigment-oil", name: "Pigment Oil", family: "artistic", requiresMesh: false, requiresHair: false,
        requiresTraces: false, requiresAdult: false, choices: [],
        summary: "Edge-aware oil texture made from your photograph without a face warp.",
        limitation: "Procedural painting texture. It does not generate clothing or change your proportions." },
    { id: "rain-expression", name: "Rain Expression", family: "artistic", requiresMesh: true, requiresHair: false,
        requiresTraces: false, requiresAdult: true, choices: [],
        summary: "An opt-in expression warp with asymmetric brows and drawn tear tracks.",
        limitation: "Playful expression simulation, not a photoreal prediction of emotion." },
    { id: "meadow-crown", name: "Meadow Crown", family: "artistic", requiresMesh: true, requiresHair: true,
        requiresTraces: false, requiresAdult: false, choices: [],
        summary: "Original drawn flowers anchored to your head, with foreground hair retained.",
        limitation: "Manually marked foreground hair controls occlusion. No outside artwork is used." },
];
export function featureById(id) {
    const item = FEATURES.find(feature => feature.id === id);
    if (!item)
        throw new RangeError("Unknown eyes, brows or art feature.");
    return item;
}
export function unavailableReasons(id, evidence) {
    const feature = featureById(id);
    const reasons = [];
    if (!evidence.photo)
        reasons.push("Open a photo or a labelled drawn fixture first.");
    if (feature.requiresMesh && !evidence.mesh)
        reasons.push("This feature needs checked face points for this photo.");
    if (feature.requiresHair && !evidence.hair)
        reasons.push("Mark visible hair, or explicitly confirm that no hair is visible.");
    if (feature.requiresTraces && evidence.traces === 0)
        reasons.push("Trace at least one visible lash; missing lashes are never invented.");
    if (feature.requiresAdult && !evidence.adultConfirmed)
        reasons.push("This consultation simulation requires your 18+ confirmation.");
    return reasons;
}
//# sourceMappingURL=catalogue.js.map
/** Demo scene format (beljour-demo-scene/1): a drawn sample, local layers and a compare view.
 *
 * Scenes are data, so a new demo beat is a new record, not new code. Validation is strict:
 * unknown keys, provider layers, options an engine doesn't have, or a posture fix for the
 * wrong view are all refused, so a scene can never quietly send anything or show a tool that
 * isn't really there. Scenes use drawn samples only: no person, so no consent is needed.
 *
 * Author: John Khan.
 */
import { FINISHES as MAKEUP_FINISHES, LOOKS as MAKEUP_LOOKS } from "../engines/beauty/makeup.js";
import { presetIds } from "../engines/shade/lighting.js";
import { LEVELS } from "../engines/haircolour/generated/levels.js";
import { MODES } from "../engines/local/enhance.js";
import { STYLES } from "../engines/local/beard.js";
import { PRODUCTS } from "../engines/local/strands.js";
import { FIXES } from "../engines/local/posture.js";
import { GLOWS } from "../engines/skin/finish.js";
import { SHIFTS as UNDERTONES } from "../engines/skin/glow-tan.js";
import { SKIN_LAYER_TOOLS as SKIN_TOOLS } from "../ui/shell/skin-layer.js";
import { STAGES as GREY_STAGES } from "../engines/haircolour/grey.js";
import { portraitLook } from "../filters/portrait/looks.js";
import { LOOKS as ILLUSTRATION_LOOKS } from "../engines/studio/illustration.js";
import { BACKDROPS } from "../engines/studio/backdrops.js";
import { INDUSTRIES } from "../engines/studio/headshot.js";
import { SIDES } from "../engines/studio/relight.js";
import { STUDIO_LAYER_TOOLS } from "../ui/shell/studio-layer.js";
import { FACE_SAMPLE_IDS, SAMPLE_IDS } from "../ui/shell/demo.js";
import { normaliseCompareState } from "../ui/shell/compare-session.js";
import { LOCAL_KINDS } from "../ui/shell/types.js";
export const DEMO_SCHEMA = "beljour-demo-scene/1";
export class SceneError extends Error {
    constructor(message) { super(message); this.name = "SceneError"; }
}
const SAMPLE_VIEW = { "body-front": "front", "body-side": "side" };
const NEEDS = {
    older: FACE_SAMPLE_IDS, younger: FACE_SAMPLE_IDS, gender: FACE_SAMPLE_IDS, enhance: SAMPLE_IDS, lighting: SAMPLE_IDS, recolour: ["crown", "coily"], balayage: [], beard: FACE_SAMPLE_IDS, "hair-fibre": ["crown"], posture: ["body-front", "body-side"], "face-makeup": FACE_SAMPLE_IDS, skin: FACE_SAMPLE_IDS,
    portrait: FACE_SAMPLE_IDS, "under-eye": FACE_SAMPLE_IDS, "teeth": FACE_SAMPLE_IDS, "shave": FACE_SAMPLE_IDS, "grey": ["crown", "coily"],
    studio: FACE_SAMPLE_IDS, illustration: SAMPLE_IDS, retouch: [],
};
function only(record, keys, where) {
    for (const key of Object.keys(record))
        if (!keys.includes(key))
            throw new SceneError(`${where} has an unknown field "${key}"`);
}
function obj(value, where) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new SceneError(`${where} must be an object`);
    return value;
}
function text(value, where, max) {
    if (typeof value !== "string" || !value.trim() || value.length > max)
        throw new SceneError(`${where} must be text of 1–${max} characters`);
    return value;
}
function unit(value, where, min, max) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max)
        throw new SceneError(`${where} must be ${min}–${max}`);
    return value;
}
const makeupColour = (v) => v === "none" || (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v));
export function validateLayer(raw, sample, index) {
    const where = `Layer ${index + 1}`;
    const value = obj(raw, where);
    only(value, ["kind", "params", "strength", "opacity"], where);
    const kind = value.kind;
    if (typeof kind !== "string" || !LOCAL_KINDS.includes(kind))
        throw new SceneError(`${where} must be a local tool; demo scenes never use the provider`);
    const local = kind;
    if (!NEEDS[local].includes(sample))
        throw new SceneError(`${where}: ${local} doesn't run on the ${sample} sample`);
    const params = obj(value.params ?? {}, `${where} options`);
    const allowed = {
        older: { stop: value => Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 5 },
        younger: { stop: value => Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 3 },
        gender: { slider: value => typeof value === "number" && Number.isFinite(value) && value >= -100 && value <= 100 },
        lighting: { preset: value => typeof value === "string" && presetIds().includes(value) },
        recolour: { colour: value => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value),
            curl_pattern: value => typeof value === "string" && /^(not specified|1|[234][ABC])$/.test(value) },
        // Placement needs the user's markings; no scene fabricates a painted mask.
        balayage: { target_level: value => Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 10,
            history: value => typeof value === "string" && value in LEVELS.lift_per_session,
            toner: value => typeof value === "string" && value in LEVELS.toners,
            softness: value => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 64 },
        enhance: { mode: (v) => typeof v === "string" && (v === "auto" || v in MODES) },
        beard: { style: (v) => typeof v === "string" && v in STYLES, length: (v) => Number.isInteger(v) && Number(v) >= 1 && Number(v) <= 5,
            colour: (v) => typeof v === "string" && /^#[0-9A-Fa-f]{6}$/.test(v) },
        "hair-fibre": { product: (v) => typeof v === "string" && PRODUCTS.includes(v) },
        portrait: { look: (v) => typeof v === "string" && portraitLook(v) !== null },
        posture: { fix: (v) => typeof v === "string" && v in FIXES && FIXES[v].view === SAMPLE_VIEW[sample],
            band_share: (v) => typeof v === "number" && v >= 0.01 && v <= 0.1, cap_share: (v) => typeof v === "number" && v >= 0.01 && v <= 0.12 },
        // A demo scene may add a tan but never remove one: removal lightens skin and is her choice only.
        skin: { tool: (v) => typeof v === "string" && SKIN_TOOLS.includes(v),
            style: (v) => typeof v === "string" && v in GLOWS, undertone: (v) => typeof v === "string" && v in UNDERTONES,
            direction: (v) => v === "add", density: (v) => typeof v === "number" && v >= 0 && v <= 100,
            redness: (v) => typeof v === "number" && v >= 0 && v <= 100 },
        "face-makeup": { look: (v) => typeof v === "string" && MAKEUP_LOOKS.some((look) => look.id === v),
            lip: makeupColour, blush: makeupColour, shadow: makeupColour, liner: makeupColour,
            finish: (v) => typeof v === "string" && MAKEUP_FINISHES.includes(v) },
        "under-eye": { include_bags: (v) => typeof v === "boolean" },
        "teeth": {},
        "shave": {},
        "grey": { stage: (v) => typeof v === "string" && GREY_STAGES.includes(v) },
        studio: { tool: (v) => typeof v === "string" && STUDIO_LAYER_TOOLS.includes(v),
            backdrop: (v) => typeof v === "string" && Object.hasOwn(BACKDROPS, v), side: (v) => typeof v === "string" && Object.hasOwn(SIDES, v),
            industry: (v) => typeof v === "string" && Object.hasOwn(INDUSTRIES, v) },
        illustration: { look: (v) => typeof v === "string" && Object.hasOwn(ILLUSTRATION_LOOKS, v) },
        // Brush strokes are hers, painted on her photo; no demo scene paints them for her.
        retouch: {},
    };
    const checked = {};
    for (const [key, v] of Object.entries(params)) {
        const ok = allowed[local][key];
        if (!ok)
            throw new SceneError(`${where}: ${local} has no option "${key}"`);
        if (!ok(v))
            throw new SceneError(`${where}: "${key}" isn't a valid ${local} option`);
        checked[key] = v;
    }
    return { kind: local, params: checked, strength: unit(value.strength ?? 66, `${where} strength`, 0, 100),
        opacity: unit(value.opacity ?? 1, `${where} opacity`, 0, 1) };
}
export function validateScene(raw) {
    const value = obj(raw, "Scene");
    only(value, ["schema", "id", "title", "line", "sample", "layers", "select", "compare"], "Scene");
    if (value.schema !== DEMO_SCHEMA)
        throw new SceneError(`Scene schema must be ${DEMO_SCHEMA}`);
    const id = text(value.id, "Scene id", 40);
    if (!/^[a-z][a-z0-9-]{1,39}$/.test(id))
        throw new SceneError("Scene id must be a short lowercase token");
    const sample = value.sample;
    if (typeof sample !== "string" || !SAMPLE_IDS.includes(sample))
        throw new SceneError("Scene sample must be one of the drawn samples");
    if (!Array.isArray(value.layers) || value.layers.length < 1 || value.layers.length > 6)
        throw new SceneError("A scene has 1–6 layers");
    const layers = value.layers.map((l, i) => validateLayer(l, sample, i));
    let select;
    if (value.select !== undefined) {
        if (!Number.isInteger(value.select) || Number(value.select) < 0 || Number(value.select) >= layers.length)
            throw new SceneError("Selected layer index is out of range");
        select = Number(value.select);
    }
    let compare;
    try {
        compare = normaliseCompareState(obj(value.compare ?? {}, "Compare"));
    }
    catch (error) {
        throw new SceneError(`Compare: ${error instanceof Error ? error.message : String(error)}`);
    }
    return { schema: DEMO_SCHEMA, id, title: text(value.title, "Scene title", 60), line: text(value.line, "Scene line", 160),
        sample: sample, layers, select, compare };
}

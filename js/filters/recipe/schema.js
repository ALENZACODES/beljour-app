/**
 * Recipe schema beljour-filter/1 (filters-plan.md §3.2): the types of the generated catalogue
 * and a validator with the same rules as api/plumb_api/filters/recipe/schema.py, so a hand
 * edit to web/src/filters/data/generated/recipes.ts is caught by the browser tests as well.
 * Author: John Khan.
 */
import { checkPoints } from "../colour/curves.js";
import { BANDS, BAND_LIMITS, OPS, SCALES } from "../colour/ops.js";
import "../spatial/glow.js";
import "../light/position.js";
import "../light/border.js";
import "../spatial/halation.js";
import "../spatial/grain.js";
import "../spatial/structure.js";
export const FORMAT = "beljour-filter/1";
export const TABS = ["Natural", "Warm", "Cool", "Contrast", "Classic", "Vintage", "Fade", "Pastel", "Film-style",
    "Cinematic", "Clean", "Monochrome", "Light", "Lens", "Frames", "Crowns", "Fun", "Art", "Seasonal", "Beauty"];
export const EDITORIAL_FAMILIES = ["Masthead", "Editorial Day", "Cover Evening", "Salon Suite", "Heritage"];
export const EDITORIAL_LIGHTS = ["Window", "Studio", "Evening"];
export const STATUSES = ["Build", "Stretch", "Post"];
export const MASK_CLASSES = ["hair", "face-skin", "body-skin", "clothes", "background", "person"];
export const FACE_REGIONS = ["lips", "brows", "lashes", "eyelids", "cheeks", "region"];
export const DEFAULT_STRENGTH = { 1: 30 };
const ID = /^[A-Z]{1,3}[0-9]{1,3}$/;
const ROUND = /^FX[0-9]{1,2}$/;
const PENDING_ROUND = /^(FX|R)[0-9]{1,2}$/;
const STAGE_ID = /^[a-z][a-zA-Z0-9-]{0,23}$/;
const LIKE_SOURCE = /^(report#[0-9]{1,3}|assumed)$/;
const finite = (x) => typeof x === "number" && Number.isFinite(x);
export function checkParams(spec, params, where) {
    if (!params || typeof params !== "object" || Array.isArray(params))
        return [`${where}: params must be an object`];
    const problems = [];
    for (const [key, value] of Object.entries(params)) {
        if (FACE_REGIONS.includes(key)) {
            problems.push(`${where}: aims at a face region (${key}); makeup goes through YouCam`);
            continue;
        }
        const p = spec.params[key];
        if (!p) {
            problems.push(`${where}: ${spec.name} has no parameter ${JSON.stringify(key)}`);
            continue;
        }
        if (p.kind === "stat") {
            problems.push(`${where}: ${key} is measured from the photo, not written in a recipe`);
            continue;
        }
        if (p.kind === "number" || p.kind === "fixed" || p.kind === "angle") {
            if (!finite(value))
                problems.push(`${where}: ${key} must be a finite number`);
            else if (p.kind !== "angle" && !(value >= p.lo && value <= p.hi))
                problems.push(`${where}: ${key} ${value} is outside ${p.lo}..${p.hi}`);
            else if (spec.name === "spatial.grain" && key === "seed" && !Number.isInteger(value)) {
                problems.push(`${where}: grain seed must be an unsigned integer`);
            }
        }
        else if (p.kind === "points") {
            try {
                checkPoints(value);
            }
            catch (e) {
                problems.push(`${where}: ${key}: ${e.message}`);
            }
        }
        else if (p.kind === "matrix") {
            const ok = Array.isArray(value) && value.length === 3 && value.every((r) => Array.isArray(r) && r.length === 3
                && r.every((x) => finite(x) && x >= p.lo && x <= p.hi));
            if (!ok)
                problems.push(`${where}: ${key} must be a 3 x 3 matrix of numbers in ${p.lo}..${p.hi}`);
        }
        else if (p.kind === "bands") {
            if (!value || typeof value !== "object") {
                problems.push(`${where}: bands must be an object`);
                continue;
            }
            for (const [band, entry] of Object.entries(value)) {
                if (!BANDS.includes(band)) {
                    problems.push(`${where}: unknown band ${JSON.stringify(band)}`);
                    continue;
                }
                for (const [k, v] of Object.entries((entry ?? {}))) {
                    const limit = BAND_LIMITS[k];
                    if (limit === undefined)
                        problems.push(`${where}: band ${band} has no setting ${JSON.stringify(k)}`);
                    else if (!finite(v) || Math.abs(v) > limit)
                        problems.push(`${where}: band ${band} ${k} must be within +-${limit}`);
                }
            }
        }
    }
    return problems;
}
export function checkStage(stage, where) {
    if (!stage || typeof stage !== "object")
        return [`${where}: a stage is an object`];
    const s = stage;
    const problems = Object.keys(s).filter((k) => !["op", "params", "scale", "id"].includes(k)).map((k) => `${where}: unknown stage field ${JSON.stringify(k)}`);
    const spec = OPS.get(String(s.op));
    if (!spec)
        return [...problems, `${where}: unknown op ${JSON.stringify(s.op)}`];
    if (!SCALES.includes(s.scale ?? "linear"))
        problems.push(`${where}: scale must be one of ${SCALES.join(", ")}`);
    if (s.id !== undefined && !STAGE_ID.test(String(s.id)))
        problems.push(`${where}: stage id ${JSON.stringify(s.id)} must be a short lower-case token`);
    return [...problems, ...checkParams(spec, s.params ?? {}, `${where} ${spec.name}`)];
}
export function checkRecipe(r, addons) {
    const where = String(r?.id ?? "?");
    const required = ["id", "name", "version", "class", "tab", "status", "round", "rank", "like", "description", "defaults", "limits",
        "editorial", "needs", "stages", "seed", "safety", "provenance"];
    const missing = required.filter((k) => !(k in (r ?? {})));
    if (missing.length)
        return missing.map((k) => `${where}: missing field ${k}`);
    const problems = [];
    if (!ID.test(r.id))
        problems.push(`${where}: id must look like C08 or M01`);
    if (typeof r.name !== "string" || !r.name.length || r.name.length > 40)
        problems.push(`${where}: name must be 1-40 characters`);
    if (!Number.isInteger(r.version) || r.version < 1)
        problems.push(`${where}: version is a whole number from 1`);
    if (!Number.isInteger(r.class) || r.class < 1 || r.class > 20)
        problems.push(`${where}: class must be 1-20`);
    if (!TABS.includes(r.tab))
        problems.push(`${where}: unknown tab ${JSON.stringify(r.tab)}`);
    if (!STATUSES.includes(r.status))
        problems.push(`${where}: status must be Build, Stretch or Post`);
    if (!ROUND.test(r.round))
        problems.push(`${where}: round must look like FX1`);
    if (!Number.isInteger(r.rank) || r.rank < 1)
        problems.push(`${where}: rank is a whole number from 1`);
    const like = r.like;
    if (!(like && Number.isInteger(like.score) && like.score >= 1 && like.score <= 5 && LIKE_SOURCE.test(String(like.source)) && like.reason)) {
        problems.push(`${where}: like needs a 1-5 score, a source and a reason`);
    }
    if (typeof r.description !== "string" || !r.description.length || r.description.length > 80)
        problems.push(`${where}: description must be 1-80 characters`);
    const grade = r.editorial;
    if (grade === null || typeof grade !== "object" || Array.isArray(grade)) {
        problems.push(`${where}: editorial must declare family and light`);
    }
    else {
        const record = grade;
        if (!EDITORIAL_FAMILIES.includes(record.family)) {
            problems.push(`${where}: editorial.family must be one of ${EDITORIAL_FAMILIES.join(", ")}`);
        }
        if (!EDITORIAL_LIGHTS.includes(record.light)) {
            problems.push(`${where}: editorial.light must be one of ${EDITORIAL_LIGHTS.join(", ")}`);
        }
        if (Object.keys(record).sort().join(",") !== "family,light") {
            problems.push(`${where}: editorial only declares family and light`);
        }
    }
    const d = r.defaults;
    if (!Number.isInteger(d.strength) || d.strength < 0 || d.strength > 100)
        problems.push(`${where}: default strength is a whole number 0-100`);
    else if (DEFAULT_STRENGTH[r.class] !== undefined && d.strength !== DEFAULT_STRENGTH[r.class])
        problems.push(`${where}: class ${r.class} looks start at ${DEFAULT_STRENGTH[r.class]}`);
    for (const k of ["guard", "protectSkin", "backgroundOnly"])
        if (typeof d[k] !== "boolean")
            problems.push(`${where}: defaults.${k} must be true or false`);
    for (const a of d.addons ?? []) {
        if (!finite(a.amount) || a.amount < 0 || a.amount > 100)
            problems.push(`${where}: an add-on is {id, amount 0-100}`);
        else if (addons && !addons.has(a.id))
            problems.push(`${where}: unknown add-on ${JSON.stringify(a.id)}`);
    }
    const lim = r.limits;
    if (!["none", "fun"].includes(lim.geometry))
        problems.push(`${where}: limits.geometry must be none or fun`);
    if (lim.geometry === "fun" && !lim.funTab)
        problems.push(`${where}: geometry 'fun' only in the Fun tab`);
    if (lim.funTab && r.tab !== "Fun")
        problems.push(`${where}: funTab recipes sit in the Fun tab`);
    if (!["full", "lightness"].includes(lim.guardMode ?? "full"))
        problems.push(`${where}: guardMode must be full or lightness`);
    for (const s of r.stages ?? []) {
        const spec = OPS.get(s.op);
        if (spec?.family === "geometry" && !(lim.funTab && lim.geometry === "fun"))
            problems.push(`${where}: ${spec.name} moves geometry; needs funTab and geometry 'fun'`);
    }
    if ((r.needs.masks ?? []).some((m) => !MASK_CLASSES.includes(m)))
        problems.push(`${where}: needs.masks may list only ${MASK_CLASSES.join(", ")}`);
    if (r.needs.depth)
        problems.push(`${where}: the depth model stays off for filters (ruling R3)`);
    if (!Array.isArray(r.stages) || r.stages.length < 1 || r.stages.length > 16)
        problems.push(`${where}: 1-16 stages`);
    const ids = new Set();
    (r.stages ?? []).forEach((s, i) => {
        problems.push(...checkStage(s, `${where} stage ${i + 1}`));
        if (s.id !== undefined) {
            if (ids.has(s.id))
                problems.push(`${where}: stage id ${s.id} is used twice`);
            ids.add(s.id);
        }
    });
    const names = new Set();
    for (const p of r.presets ?? []) {
        if (typeof p.name !== "string" || !p.name.length || p.name.length > 24) {
            problems.push(`${where}: a preset needs a name of 1-24 characters`);
            continue;
        }
        if (names.has(p.name))
            problems.push(`${where} preset ${p.name}: name used twice`);
        names.add(p.name);
        for (const sid of Object.keys(p.patch ?? {}))
            if (!ids.has(sid))
                problems.push(`${where} preset ${p.name}: patches unknown stage ${JSON.stringify(sid)}`);
        (p.append ?? []).forEach((s, i) => problems.push(...checkStage(s, `${where} preset ${p.name} extra stage ${i + 1}`)));
        for (const item of p.pending ?? []) {
            const last = String(item).split(/\s+/).pop() ?? "";
            if (!PENDING_ROUND.test(last))
                problems.push(`${where} preset ${p.name}: pending parts say which round builds them`);
        }
    }
    if (r.seed !== "photo" && !(Number.isInteger(r.seed) && r.seed >= 0 && r.seed < 2 ** 32))
        problems.push(`${where}: seed is 'photo' or a 32-bit number`);
    if (typeof r.safety?.eyesClear !== "boolean" || typeof r.safety?.faceClear !== "boolean")
        problems.push(`${where}: safety needs eyesClear and faceClear`);
    if (!String(r.provenance?.writtenFrom ?? "").includes("filters-plan.md"))
        problems.push(`${where}: provenance.writtenFrom must cite filters-plan.md`);
    return problems;
}
export function checkCatalogue(data) {
    if (data.format !== FORMAT)
        return ["catalogue: unknown format"];
    const addons = new Map(data.addons.map((a) => [a.id, a]));
    const problems = [];
    const ids = new Map(), names = new Map(), ranks = new Map();
    for (const r of data.recipes) {
        problems.push(...checkRecipe(r, addons));
        ids.set(r.id, (ids.get(r.id) ?? 0) + 1);
        const key = r.name.toLocaleLowerCase("en");
        if (names.has(key) && names.get(key) !== r.id)
            problems.push(`${r.id}: name ${r.name} is also ${names.get(key)}`);
        names.set(key, r.id);
        if (ranks.has(r.rank))
            problems.push(`${r.id}: rank ${r.rank} is also ${ranks.get(r.rank)}`);
        ranks.set(r.rank, r.id);
    }
    for (const [id, n] of ids)
        if (n > 1)
            problems.push(`${id}: id used ${n} times`);
    const rows = new Map(data.ranking.map((row) => [row.id, row]));
    for (const r of data.recipes) {
        const row = rows.get(r.id);
        if (!row)
            problems.push(`${r.id}: not in the ranking`);
        else if (row.rank !== r.rank || row.name !== r.name || row.like !== r.like.score)
            problems.push(`${r.id}: rank, name or score differs from the ranking`);
    }
    for (const a of data.addons) {
        if (a.manualOnly !== undefined && typeof a.manualOnly !== "boolean") {
            problems.push(`add-on ${a.id}: manualOnly must be a boolean`);
        }
        if (a.manualOnly && !a.built)
            problems.push(`add-on ${a.id}: manualOnly needs a built stage`);
        if (a.built && !a.stage)
            problems.push(`add-on ${a.id}: a built add-on names its stage`);
        if (a.built && a.stage)
            problems.push(...checkStage(a.stage, `add-on ${a.id}`));
        if (!a.built && !ROUND.test(a.round))
            problems.push(`add-on ${a.id}: an add-on not built yet names its round`);
    }
    return problems;
}
//# sourceMappingURL=schema.js.map
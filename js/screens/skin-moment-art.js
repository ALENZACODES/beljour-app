/** Images on the Skin Moment page. Each slot has a fixed file name in web/assets/skin-moment/
 * (screen art plus a "-dark" version) and faces/ (the AI-generated example people, named as in
 * skin-moment-faces.ts). The build writes
 * index.json listing the files that are really there (scripts/copy-static.mjs), so the page asks
 * for an image only when it exists and never shows a broken one. Until then, and whenever a file
 * fails to load, each slot draws its own line illustration, coloured from the page's tokens so it
 * fits light and dark. The illustrations are our own drawings; no third-party art.
 * Author: John Khan.
 */
import { isProductFile, productFile, PRODUCT_TYPES } from "./skin-moment-products.js";
export const ART_DIR = "assets/skin-moment";
export const SCREEN_ART = [
    "welcome-hero", "moment-buy", "moment-breakout", "moment-checkin", "consent",
    "tip-good-light", "tip-face-camera", "tip-hair-back", "tip-no-filter", "tip-fill-frame",
    "scanning", "plan-today", "plan-this-week", "plan-stop", "plan-dermatologist",
    "checkin-better", "checkin-same", "checkin-worse", "checkin-too-soon", "empty-history",
    "error-no-face", "error-too-dark", "error-offline", "units-out", "delete-done",
    "tryon-intro", "privacy", "about",
];
/** Wide (3:2) slots; every other slot is square. */
export const WIDE = new Set(["welcome-hero", "consent", "empty-history", "tryon-intro", "privacy", "about"]);
export const FACE_COUNTS = { day0: 60, day42: 60, foundation: 60 };
export const AI_PERSON = "AI-generated example person";
export function faceFile(n, kind) {
    if (!Number.isInteger(n) || n < 1 || n > FACE_COUNTS[kind])
        throw new RangeError(`no face ${n} for ${kind}`);
    return `faces/face-${String(n).padStart(2, "0")}-${kind}.png`;
}
/** Concern icons (concerns/concern-<name>.png, plum line on a cream circle), keyed by the
 * concern ids YouCam and the saved examples use (api/plumb_api/data/skin_guide.json). All twelve
 * are in assets/skin-moment/concerns/; a concern with no icon here shows none. */
export const CONCERN_ICONS = {
    moisture: "moisture", oiliness: "oiliness", redness: "redness", pore: "pores", texture: "texture",
    dark_circle_v2: "dark-circles", wrinkle: "fine-lines",
    age_spot: "spots", firmness: "firmness", radiance: "radiance", eye_bag: "eye-bags", acne: "acne",
};
export function concernFile(concern) {
    const name = CONCERN_ICONS[concern];
    return name ? `concerns/concern-${name}.png` : null;
}
/** Interface icons (ui/ui-<name>.png, the same plum line style), for the plan cards, planner
 * steps, units line, consent and check-in. Names are fixed; a missing file shows nothing or, where
 * the page already has an illustration, that illustration. */
export const UI_ICONS = ["today", "this-week", "stop", "dermatologist", "unit-coin", "cache-saved", "consent-tick",
    "delete-photo", "slider", "checkin-calendar", "trend-up", "no-real-change", "shade-match", "coverage",
    "privacy-lock", "planner-step", "selfie-frame", "good-light"];
/** Whether a file name is one of the fixed slots (screen art, its -dark twin, a face, a concern
 * icon, an interface icon or a product picture). */
export function isSlotFile(file) {
    if (file.startsWith("products/"))
        return isProductFile(file);
    const ui = /^ui\/ui-([a-z-]+)\.png$/.exec(file);
    if (ui)
        return UI_ICONS.includes(ui[1]);
    const icon = /^concerns\/concern-([a-z-]+)\.png$/.exec(file);
    if (icon)
        return Object.values(CONCERN_ICONS).includes(icon[1]);
    const art = /^([a-z-]+)\.png$/.exec(file);
    // "error-too-dark" is itself a slot name, so try the whole name before a "-dark" twin.
    if (art && [art[1], art[1].replace(/-dark$/, "")].some((n) => SCREEN_ART.includes(n)))
        return true;
    const face = /^faces\/face-(\d\d)-(day0|day42|foundation)\.png$/.exec(file);
    return !!face && Number(face[1]) >= 1 && Number(face[1]) <= FACE_COUNTS[face[2]];
}
/** The file to show for a slot: the dark version in dark mode when there is one, else the light
 * one, else null (draw the built-in illustration). */
export function artFile(name, present, dark) {
    if (dark && present.has(`${name}-dark.png`))
        return `${name}-dark.png`;
    return present.has(`${name}.png`) ? `${name}.png` : null;
}
/* ------------------------------ built-in drawings ------------------------------ */
// Classes: b = backdrop, l = line, f = paper fill, a = accent (blush), p = primary tint,
// s = skin; t1..t6 = six skin tones for the group drawing. Colours live in skin-moment.css.
const face = (cx, cy, r, extra = "") => {
    const ex = r * 0.34, ey = cy - r * 0.08, my = cy + r * 0.42;
    return `<path class="p" d="M${cx - r * 0.86} ${cy - r * 0.1}C${cx - r * 0.9} ${cy - r * 1.2} ${cx + r * 0.9} ${cy - r * 1.2} ${cx + r * 0.86} ${cy - r * 0.1}Z"/>`
        + `<ellipse class="s l" cx="${cx}" cy="${cy}" rx="${r * 0.72}" ry="${r * 0.9}"/>`
        + `<path class="l" d="M${cx - r * 0.72} ${cy - r * 0.3}C${cx - r * 0.5} ${cy - r * 0.95} ${cx + r * 0.5} ${cy - r * 0.95} ${cx + r * 0.72} ${cy - r * 0.3}"/>`
        + `<path class="l" d="M${cx - ex - r * 0.1} ${ey}h${r * 0.2}M${cx + ex - r * 0.1} ${ey}h${r * 0.2}"/>`
        + `<path class="l" d="M${cx - r * 0.2} ${my}q${r * 0.2} ${r * 0.14} ${r * 0.4} 0"/>` + extra;
};
const phone = (x, y, w, hgt, inner = "") => `<rect class="f l" x="${x}" y="${y}" width="${w}" height="${hgt}" rx="${w * 0.16}"/>`
    + `<path class="l" d="M${x + w * 0.38} ${y + 6}h${w * 0.24}"/>` + inner;
const check = (x, y, s) => `<path class="l" d="M${x} ${y}l${s * 0.35} ${s * 0.35}l${s * 0.65} -${s * 0.7}"/>`;
const sq = (body) => `<svg viewBox="0 0 160 160" aria-hidden="true" focusable="false"><circle class="b" cx="80" cy="80" r="74"/>${body}</svg>`;
const wide = (body) => `<svg viewBox="0 0 240 160" aria-hidden="true" focusable="false"><rect class="b" x="6" y="6" width="228" height="148" rx="18"/>${body}</svg>`;
const chart = (line, band = true) => sq(`<path class="l" d="M38 44v76h88"/>${band ? `<rect class="p" x="40" y="72" width="84" height="22" rx="4"/>` : ""}<path class="l thick" d="${line}"/>`);
const DRAW = {
    "welcome-hero": wide(`<circle class="a" cx="186" cy="44" r="16"/><path class="l" d="M186 18v-6M206 26l4-4M166 26l-4-4M212 44h6"/>`
        + `<path class="f l" d="M44 136V70a40 40 0 0 1 80 0v66Z"/>${face(84, 86, 26)}`
        + `${phone(140, 74, 34, 58, `<circle class="p" cx="157" cy="100" r="8"/><path class="l" d="M148 116h18"/>`)}<path class="l" d="M24 136h192"/>`),
    "moment-buy": sq(`<rect class="f l" x="40" y="70" width="38" height="56" rx="8"/><rect class="p l" x="50" y="56" width="18" height="14" rx="3"/>`
        + `<path class="l" d="M59 56V40"/><ellipse class="a l" cx="59" cy="36" rx="8" ry="6"/><path class="l" d="M48 96h22"/>`
        + `${phone(88, 46, 38, 70, `<circle class="s l" cx="107" cy="76" r="10"/>`)}${check(98, 100, 18)}`),
    "moment-breakout": sq(`<path class="f l" d="M44 128V72a36 36 0 0 1 72 0v56Z"/>${face(80, 86, 26, `<circle class="a" cx="86" cy="104" r="3.2"/>`)}`),
    "moment-checkin": sq(`<rect class="f l" x="24" y="52" width="46" height="56" rx="6"/>${face(47, 82, 14)}`
        + `<rect class="f l" x="90" y="52" width="46" height="56" rx="6"/>${face(113, 82, 14)}`
        + `<path class="l" d="M72 80h14m-5-5 5 5-5 5"/><circle class="a" cx="113" cy="120" r="8"/>${check(109, 120, 8)}`),
    consent: wide(`${phone(80, 22, 66, 118, `<rect class="p l" x="92" y="52" width="14" height="14" rx="3"/>${check(95, 59, 8)}<path class="l" d="M112 59h22"/>`
        + `<rect class="p l" x="92" y="80" width="14" height="14" rx="3"/>${check(95, 87, 8)}<path class="l" d="M112 87h22"/><rect class="a" x="92" y="108" width="42" height="12" rx="6"/>`)}`
        + `<rect class="f l" x="160" y="84" width="36" height="30" rx="5"/><path class="l" d="M168 84v-8a10 10 0 0 1 20 0v8"/><circle class="a" cx="178" cy="99" r="4"/>`),
    "tip-good-light": sq(`<circle class="a" cx="44" cy="52" r="12"/><path class="l" d="M44 30v-6M26 52h-6M31 39l-4-4M31 65l-4 4"/>`
        + `<path class="p" d="M58 52 112 70v40L58 60Z" opacity=".6"/>${face(104, 88, 26)}`),
    "tip-face-camera": sq(`${face(70, 82, 28)}${phone(108, 58, 26, 46)}<path class="l dash" d="M84 76h22"/>`),
    "tip-hair-back": sq(`${face(80, 84, 30)}<path class="l" d="M52 74c-8 6-8 20 0 26"/><path class="a l" d="M40 70c-10 6-12 26-2 36"/><path class="l" d="M110 56c10 8 12 22 6 34"/>`),
    "tip-no-filter": sq(`${phone(56, 32, 48, 96)}<path class="a" d="M80 62l5 12 12 5-12 5-5 12-5-12-12-5 12-5Z"/><circle class="l" cx="80" cy="79" r="22"/><path class="l" d="M64 95 96 63"/>`),
    "tip-fill-frame": sq(`${phone(48, 26, 64, 108)}<ellipse class="l dash" cx="80" cy="80" rx="22" ry="30"/>${face(80, 82, 20)}`),
    scanning: sq(`<ellipse class="l dash" cx="80" cy="80" rx="38" ry="48"/>${face(80, 82, 30)}<rect class="a sweep" x="34" y="78" width="92" height="4" rx="2"/>`),
    "plan-today": sq(`<path class="a" d="M46 104a34 34 0 0 1 68 0Z"/><path class="l" d="M80 58v-10M50 72l-7-6M110 72l7-6M30 104h100"/>`
        + `<rect class="f l" x="96" y="92" width="18" height="30" rx="4"/><rect class="p" x="100" y="86" width="10" height="6" rx="2"/><path class="l" d="M40 122h48"/>`),
    "plan-this-week": sq(`<rect class="f l" x="32" y="44" width="96" height="78" rx="8"/><path class="l" d="M32 62h96M52 36v14M108 36v14"/>`
        + `${[0, 1, 2, 3, 4, 5, 6].map((i) => `<rect class="p" x="${38 + i * 13}" y="72" width="9" height="9" rx="2"/><rect class="p" x="${38 + i * 13}" y="92" width="9" height="9" rx="2"/>`).join("")}`
        + `<circle class="a" cx="55.5" cy="76.5" r="5"/><circle class="a" cx="81.5" cy="96.5" r="5"/><circle class="a" cx="107.5" cy="76.5" r="5"/>`),
    "plan-stop": sq(`<rect class="f l" x="40" y="70" width="48" height="46" rx="8"/><rect class="p l" x="36" y="60" width="56" height="12" rx="4"/>`
        + `<path class="l" d="M50 92h28M50 102h18"/><circle class="a" cx="112" cy="58" r="20"/><path class="l thick" d="M98 72 126 44"/><circle class="l" cx="112" cy="58" r="20"/>`),
    "plan-dermatologist": sq(`<rect class="f l" x="52" y="44" width="56" height="82" rx="4"/><rect class="p" x="60" y="54" width="40" height="30" rx="3"/>`
        + `<circle class="l" cx="98" cy="90" r="3"/><circle class="a" cx="80" cy="30" r="13"/><path class="l thick" d="M80 23v14M73 30h14"/><path class="l" d="M36 126h88"/>`),
    "checkin-better": chart("M44 106c18-4 30-14 40-24s22-22 36-30"),
    "checkin-same": chart("M44 84c20-3 40 3 60-1s14-1 18 0"),
    "checkin-worse": chart("M44 64c20 2 34 12 46 20s20 14 32 16"),
    "checkin-too-soon": sq(`<path class="f l" d="M56 36h48M56 124h48M60 36c0 26 40 26 40 44S60 98 60 124h40c0-26-40-26-40-44s40-18 40-44"/>`
        + `<path class="a" d="M70 120c6-10 14-10 20 0Z"/><path class="a l" d="M106 66c12-10 24-6 26 2-10 6-20 6-26-2Z"/>`),
    "empty-history": wide(`<rect class="f l" x="84" y="30" width="72" height="88" rx="4"/><rect class="p" x="94" y="40" width="52" height="68" rx="2"/>`
        + `<path class="l dash" d="M108 74h24M120 62v24"/><path class="l" d="M40 124h160"/><circle class="a" cx="186" cy="110" r="10"/><path class="l" d="M186 100c0-10 6-16 14-18"/>`),
    "error-no-face": sq(`<ellipse class="l dash" cx="80" cy="80" rx="34" ry="46"/><path class="l thick" d="M70 66a10 10 0 1 1 14 9c-4 2-4 5-4 9"/><circle class="a" cx="80" cy="98" r="4"/>`),
    "error-too-dark": sq(`<path class="p" d="M66 76h28l18 44H48Z" opacity=".55"/><path class="f l" d="M64 52h32l-6 24H70Z"/><path class="l" d="M80 76v44M64 122h32"/><circle class="a" cx="80" cy="84" r="5"/>`),
    "error-offline": sq(`${phone(52, 30, 56, 100)}<path class="p l" d="M64 86a12 12 0 0 1 4-23 16 16 0 0 1 28 2 10 10 0 0 1 2 21Z"/><path class="l thick" d="M76 96v12M86 96v12"/>`),
    "units-out": sq(`<path class="f l" d="M48 64h64l-6 56a6 6 0 0 1-6 6H60a6 6 0 0 1-6-6Z"/><rect class="p l" x="44" y="54" width="72" height="12" rx="4"/>`
        + `<path class="l" d="M80 106V84"/><path class="a l" d="M80 90c-12-2-16-10-16-16 10 0 16 6 16 16Zm0-6c8-8 16-8 20-6-2 8-10 10-20 6Z"/>`),
    "delete-done": sq(`<rect class="f l" x="34" y="44" width="56" height="70" rx="4"/><rect class="p" x="42" y="52" width="40" height="44" rx="2"/>`
        + `<circle class="p" cx="98" cy="58" r="3"/><circle class="p" cx="106" cy="72" r="2.5"/><circle class="p" cx="100" cy="88" r="2"/><circle class="a" cx="112" cy="104" r="16"/>${check(104, 104, 16)}`),
    "tryon-intro": wide(`<rect class="f l" x="64" y="20" width="112" height="120" rx="10"/>${face(120, 84, 38)}`
        + `<path class="a" d="M120 46a38 46 0 0 1 0 0v76c26 0 28-30 28-38s-2-38-28-38Z" opacity=".45"/>`
        + `<path class="l thick" d="M120 26v108"/><circle class="f l" cx="120" cy="80" r="9"/><path class="l" d="M116 76l-3 4 3 4M124 76l3 4-3 4"/>`),
    privacy: wide(`<path class="p l" d="M120 22 160 36v34c0 30-18 50-40 62-22-12-40-32-40-62V36Z"/>${phone(104, 50, 32, 58)}`
        + `<path class="f l" d="M180 98h28l-3 34h-22Z"/><path class="l" d="M176 98h36M188 92h12"/><circle class="a" cx="56" cy="110" r="10"/>${check(51, 110, 10)}`),
    about: wide(`${[0, 1, 2, 3, 4, 5].map((i) => {
        const cx = 34 + i * 34.4, cy = i % 2 ? 92 : 80;
        return `<path class="p" d="M${cx - 14} ${cy - 2}c0-22 28-22 28 0Z"/><ellipse class="t${i + 1} l" cx="${cx}" cy="${cy}" rx="11" ry="14"/>`
            + `<path class="l" d="M${cx - 15} ${cy + 40}c0-14 6-22 15-22s15 8 15 22"/><rect class="f l" x="${cx - 5}" y="${cy + 18}" width="10" height="16" rx="2"/>`;
    }).join("")}<path class="l" d="M18 136h204"/>`),
};
export function drawing(name) { return DRAW[name]; }
/* ------------------------------ loading in the page ------------------------------ */
let present = null;
/** The files the build found in web/assets/skin-moment, read once per page. */
export function presentFiles(fetcher = fetch) {
    present ??= fetcher(`${ART_DIR}/index.json`, { cache: "no-cache" })
        .then((r) => (r.ok ? r.json() : { files: [] }))
        .then((j) => new Set(Array.isArray(j.files) ? j.files.filter((f) => typeof f === "string" && isSlotFile(f)) : []))
        .catch(() => new Set());
    return present;
}
const darkQuery = () => typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
/** A slot as an element: the built-in drawing now, swapped for the real image once it is known
 * to exist; it follows a light/dark switch. `alt` empty means decorative. */
export function art(name, opts = {}) {
    const box = document.createElement("div");
    box.className = `sm-art ${WIDE.has(name) ? "sm-art-wide" : "sm-art-square"} ${opts.className ?? ""}`.trim();
    box.dataset.art = name;
    const alt = opts.alt ?? "";
    const drawn = () => {
        box.innerHTML = DRAW[name];
        box.dataset.source = "drawn";
        if (alt) {
            box.setAttribute("role", "img");
            box.setAttribute("aria-label", alt);
        }
        else
            box.setAttribute("aria-hidden", "true");
    };
    drawn();
    const q = darkQuery();
    const pick = (files) => {
        const file = artFile(name, files, !!q?.matches);
        if (!file) {
            if (box.dataset.source !== "drawn")
                drawn();
            return;
        }
        if (box.dataset.file === file)
            return;
        const img = new Image();
        img.alt = alt;
        img.decoding = "async";
        img.onload = () => { box.replaceChildren(img); box.dataset.source = "file"; box.dataset.file = file; box.removeAttribute("role"); box.removeAttribute("aria-label"); box.removeAttribute("aria-hidden"); };
        img.onerror = () => { drawn(); };
        img.src = `${ART_DIR}/${file}`;
    };
    void presentFiles().then((files) => {
        pick(files);
        q?.addEventListener?.("change", () => pick(files));
    });
    return box;
}
/** An example face image, or null when that file isn't in the folder. */
export async function exampleFace(n, kind) {
    const file = faceFile(n, kind);
    return (await presentFiles()).has(file) ? `${ART_DIR}/${file}` : null;
}
/** A concern's icon beside its text label: nothing until the picture is known to exist. The
 * label is text, so the picture is decorative (alt=""). */
export function concernIcon(concern) {
    const box = document.createElement("span");
    box.className = "sm-concern-icon";
    box.setAttribute("aria-hidden", "true");
    const file = concernFile(concern);
    if (!file)
        return box;
    void presentFiles().then((files) => {
        if (!files.has(file))
            return;
        const img = new Image();
        img.alt = "";
        img.decoding = "async";
        img.width = 36;
        img.height = 36;
        img.onload = () => { box.replaceChildren(img); box.classList.add("has-icon"); };
        img.src = `${ART_DIR}/${file}`;
    });
    return box;
}
/** A product type's picture beside a plan step or product, small, with alt text naming the
 * product type; nothing until the build lists the file, and nothing if it fails to load. */
export function productPicture(id, size = 40) {
    const box = document.createElement("span");
    box.className = "sm-product-pic";
    if (!id)
        return box;
    box.dataset.product = id;
    void presentFiles().then((files) => {
        const file = productFile(id);
        if (!files.has(file))
            return;
        const img = new Image();
        img.alt = PRODUCT_TYPES[id];
        img.decoding = "async";
        img.width = size;
        img.height = size;
        img.onload = () => { box.replaceChildren(img); box.className = "sm-product-pic has-pic"; };
        img.onerror = () => { box.replaceChildren(); box.className = "sm-product-pic"; };
        img.src = `${ART_DIR}/${file}`;
    });
    return box;
}
/** An interface icon, or nothing until its picture is known to exist (decorative: the text says
 * the same). With `fallback`, that element shows until the icon is found, then is replaced. */
export function uiIcon(name, fallback, size = 28) {
    const box = document.createElement("span");
    box.className = "sm-ui-icon";
    box.setAttribute("aria-hidden", "true");
    if (fallback)
        box.append(fallback);
    void presentFiles().then((files) => {
        const file = `ui/ui-${name}.png`;
        if (!files.has(file))
            return;
        const img = new Image();
        img.alt = "";
        img.decoding = "async";
        img.width = size;
        img.height = size;
        img.onload = () => { box.replaceChildren(img); box.classList.add("has-icon"); };
        img.src = `${ART_DIR}/${file}`;
    });
    return box;
}
//# sourceMappingURL=skin-moment-art.js.map
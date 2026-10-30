/** The lens recipes: each lens is a list of props anchored to the face, optional particles, and
 * an optional colour or smoothing pass from the existing local engines.
 *
 * Prop layer: `name` is its file slot (web/assets/lenses/<lens-id>/<name>.png, a square
 * transparent picture with the prop centred); `draw` is the drawn fallback used until that
 * picture exists (fallbacks.ts). The prop's square box is `scale` face widths wide, placed at
 * `anchor` plus `offset` (face widths, along the face's own right and down), turned with the
 * head plus `turn` degrees, and slid with head yaw by `depth` (0 flat on the face plane, 1 as
 * far forward as the nose tip). `bob` moves it gently up and down on video (face widths and
 * seconds per cycle). `when` shows it only while the mouth is open or the brows are raised.
 * Particle layer: many copies of one small picture (`name`, optionally alternating with `alt`)
 * that fall, rise, orbit the head or twinkle, in the face's own frame so they follow her.
 * `boost` doubles them while the trigger holds. Every size, offset and count is ASSUMED, chosen
 * on drawn faces. Names are ours, in the app's French place style; all designs are our own.
 * Author: John Khan.
 */
import { ANCHORS } from "./anchors.js";
import { BEAUTY_LABEL } from "./beauty.js";
import { EFFECT_LABEL, EFFECTS } from "./effects.js";
import { DRAWINGS } from "./fallbacks.js";
import { FUN_WARP_LABEL, WARPS } from "./warps.js";
const crownAt = (name, draw, dy, scale, extra = {}) => ({ name, anchor: "forehead", offset: [0, dy], scale, draw, depth: 0.2, ...extra });
const glassesLayer = (draw) => ({ name: "glasses", anchor: "eyes", offset: [0, 0.02], scale: 1.12, draw, depth: 0.75, glass: true });
const nose = (draw, scale = 0.42) => ({ name: "nose", anchor: "nose", offset: [0, 0.01], scale, draw, depth: 1 });
export const LENSES = [
    { id: "flower-crown", title: "Couronne de Grasse", theme: "flower crown",
        layers: [crownAt("crown", "flower-ring", -0.12, 1.3, { art: { offset: [0, 0.02], scale: 1.35 } })], beauty: { look: "C03", lookShare: 0.4 } },
    { id: "butterfly-crown", title: "Papillons de Giverny", theme: "butterfly crown", layers: [crownAt("crown", "butterfly-arc", -0.16, 1.2, { art: { offset: [0, 0.02], scale: 1.3 } }),
            { name: "float", anchor: "face", offset: [0, -0.35], scale: 1.9, draw: "butterflies-scatter", bob: [0.03, 2.4],
                art: { offset: [0.62, -0.5], scale: 0.75 } }] },
    { id: "heart-glasses", title: "Coeurs de Nice", theme: "heart glasses", layers: [glassesLayer("heart-glasses")] },
    { id: "star-glasses", title: "Étoiles d'Antibes", theme: "star glasses", layers: [glassesLayer("star-glasses")] },
    { id: "round-shades", title: "Riviera ronde", theme: "round shades", layers: [glassesLayer("round-glasses")] },
    { id: "cat-eye-shades", title: "Chat de Cannes", theme: "cat-eye shades", layers: [glassesLayer("cat-eye-glasses")] },
    { id: "bunny-ears", title: "Lapin de Rambouillet", theme: "soft bunny ears", layers: [crownAt("ears", "bunny-ears", -0.36, 1.3, { art: { offset: [0, -0.4], scale: 2.6, clip: 0.76 } }), nose("bunny-nose")] },
    { id: "kitten-ears", title: "Chaton de Montmartre", theme: "kitten ears", layers: [crownAt("ears", "kitten-ears", -0.3, 1.3), nose("kitten-nose")] },
    { id: "fox-ears", title: "Renard de Sologne", theme: "fox ears", layers: [crownAt("ears", "fox-ears", -0.32, 1.35), nose("fox-nose")] },
    { id: "bear-ears", title: "Ourson des Vosges", theme: "bear ears", layers: [crownAt("ears", "bear-ears", -0.26, 1.35), nose("bear-nose", 0.3)] },
    { id: "deer-antlers", title: "Cerf de Chambord", theme: "deer antlers", layers: [crownAt("antlers", "antlers", -0.45, 1.5),
            { name: "freckles", anchor: "cheeks", offset: [0, 0], scale: 1.0, draw: "fawn-spots", opacity: 0.8, depth: 0.4 }] },
    { id: "halo", title: "Auréole de Vézelay", theme: "halo", layers: [crownAt("halo", "halo", -0.42, 1.1, { blend: "screen", bob: [0.015, 3] })], beauty: { smooth: 30 } },
    { id: "devil-horns", title: "Cornes de Carcassonne", theme: "devil horns", layers: [crownAt("horns", "horns", -0.18, 1.1)] },
    { id: "tiara", title: "Diadème de Versailles", theme: "tiara", layers: [crownAt("tiara", "tiara", -0.1, 0.8)], beauty: { smooth: 25 } },
    { id: "crown", title: "Couronne de Reims", theme: "crown", layers: [crownAt("crown", "crown", -0.28, 0.75)] },
    { id: "sparkle-freckles", title: "Paillettes de Collioure", theme: "sparkle freckles",
        layers: [{ name: "freckles", anchor: "cheeks", offset: [0, -0.03], scale: 1.0, draw: "glitter-freckles", depth: 0.5 }] },
    { id: "glitter-tears", title: "Larmes d'Arles", theme: "glitter tears",
        layers: [{ name: "tears", anchor: "eyes", offset: [0, 0.14], scale: 0.7, draw: "tears", depth: 0.4 }] },
    { id: "heart-cheeks", title: "Joues de Menton", theme: "heart cheeks",
        layers: [{ name: "cheeks", anchor: "cheeks", offset: [0, 0], scale: 1.05, draw: "heart-pair", blend: "multiply", opacity: 0.55, depth: 0.4 }],
        beauty: { look: "C07", lookShare: 0.4 } },
    { id: "blush-hearts", title: "Petits coeurs de Lyon", theme: "blush hearts",
        layers: [{ name: "float", anchor: "face", offset: [0, -0.3], scale: 1.9, draw: "hearts-scatter", bob: [0.03, 2] }] },
    { id: "petal-shower", title: "Pluie de pétales", theme: "petal shower", layers: [],
        particles: [{ name: "particle", draw: "petal", alt: { name: "particle-2", draw: "blossom" }, motion: "fall", count: 18, size: 0.12, speed: 0.12, spread: 2.4 }] },
    { id: "snow", title: "Neige de Chamonix", theme: "snow", layers: [crownAt("hat", "beanie", -0.3, 1.25)],
        particles: [{ name: "particle", draw: "snowflake", motion: "fall", count: 22, size: 0.08, speed: 0.08, spread: 2.6 }] },
    { id: "sparkle-rain", title: "Pluie d'étoiles", theme: "sparkle rain", layers: [],
        particles: [{ name: "particle", draw: "sparkle", motion: "fall", count: 20, size: 0.09, speed: 0.15, spread: 2.4, boost: "mouth-open" }] },
    { id: "bubbles", title: "Bulles de Biarritz", theme: "bubbles", layers: [],
        particles: [{ name: "particle", draw: "bubble", motion: "rise", count: 12, size: 0.16, speed: 0.1, spread: 2.2, boost: "mouth-open" }] },
    { id: "butterflies", title: "Envol de Provence", theme: "butterflies", layers: [],
        particles: [{ name: "particle", draw: "butterfly-lavender", alt: { name: "particle-2", draw: "butterfly-blush" }, motion: "orbit", count: 6, size: 0.2, speed: 0.12, spread: 1.6 }] },
    { id: "rainbow", title: "Arc-en-ciel d'Étretat", theme: "rainbow", layers: [crownAt("arc", "rainbow", -0.55, 1.8, { depth: 0 })] },
    { id: "sunburst", title: "Soleil de Biarritz", theme: "sunburst",
        layers: [{ name: "rays", anchor: "face", offset: [0, -0.08], scale: 2.6, draw: "rays", blend: "screen", opacity: 0.6 }], beauty: { look: "C02", lookShare: 0.5 } },
    { id: "neon-outline", title: "Néon de Pigalle", theme: "neon outline",
        layers: [{ name: "frame", anchor: "face", offset: [0, -0.04], scale: 2.0, draw: "neon-frame", blend: "screen" }] },
    { id: "lip-gloss", title: "Gloss de Saint-Tropez", theme: "lip gloss shine",
        layers: [{ name: "shine", anchor: "mouth", offset: [0, -0.01], scale: 0.45, draw: "gloss", blend: "screen", depth: 0.9 }], beauty: { smooth: 20 } },
    { id: "lash-flutter", title: "Cils de Deauville", theme: "lash flutter",
        layers: [{ name: "lashes", anchor: "eyes", offset: [0, -0.02], scale: 0.95, draw: "lashes", depth: 0.6 }], beauty: { smooth: 20 } },
    { id: "moon-stars", title: "Nuit de Saint-Malo", theme: "moon and stars", layers: [crownAt("headband", "moon-band", -0.12, 1.2)],
        particles: [{ name: "particle", draw: "star", motion: "twinkle", count: 10, size: 0.07, speed: 0.5, spread: 1.7, boost: "brow-raise" }] },
    // Fun warps: the guarded mesh warp, labelled as a fun warp.
    ...[
        ["big-eyes", "Grands yeux d'Annecy", "big eyes"], ["tiny-face", "Petit minois de Colmar", "tiny face"],
        ["long-face", "Visage long de Rocamadour", "long face"], ["chubby-cheeks", "Joues rondes de Dijon", "chubby cheeks"],
        ["puffer", "Poisson-lune de Sète", "puffer"], ["alien-head", "Martien de Millau", "alien head"],
        ["wide-smile", "Grand sourire de Nantes", "wide smile"], ["mini-mouth", "Bouche mini de Honfleur", "mini mouth"],
        ["bulge", "Bulle de Bordeaux", "bulge"], ["mirror", "Miroir de Chenonceau", "mirror-symmetric face"],
    ].map(([warp, title, theme]) => ({ id: `warp-${warp}`, title, theme, kind: "warp", layers: [], warp: { kind: warp, amount: 1 } })),
    // One-tap beauty: local skin tools and multiply-only tints; never lighter.
    { id: "soft-glam", title: "Glam doux de Monaco", theme: "soft glam", kind: "beauty", layers: [], makeup: [
            { step: "smooth", strength: 25 }, { step: "shadow", strength: 45, colour: [176, 120, 120] }, { step: "liner", strength: 70, colour: [60, 36, 40] },
            { step: "blush", strength: 35, colour: [232, 150, 150] }, { step: "lips", strength: 45, colour: [196, 110, 116] }
        ] },
    { id: "no-makeup-glow", title: "Éclat nu d'Évian", theme: "no-makeup glow", kind: "beauty", layers: [], makeup: [
            { step: "tone", strength: 30 }, { step: "glow", strength: 45 }, { step: "lips", strength: 18, colour: [214, 150, 150] }
        ] },
    { id: "rosy-cheeks", title: "Joues roses de Provins", theme: "rosy cheeks", kind: "beauty", layers: [], makeup: [
            { step: "blush", strength: 42, colour: [236, 140, 150] }, { step: "lips", strength: 20, colour: [220, 140, 150] }
        ] },
    { id: "bold-lip", title: "Rouge d'Avignon", theme: "bold lip", kind: "beauty", layers: [], makeup: [
            { step: "lips", strength: 80, colour: [170, 30, 52] }, { step: "liner", strength: 50, colour: [50, 30, 34] }
        ] },
    { id: "smoky-eye", title: "Smoky de Marseille", theme: "smoky eye", kind: "beauty", layers: [], makeup: [
            { step: "shadow", strength: 70, colour: [96, 84, 96] }, { step: "liner", strength: 85, colour: [30, 24, 28] },
            { step: "lips", strength: 25, colour: [196, 140, 140] }
        ] },
    { id: "dewy-skin", title: "Rosée de Gérardmer", theme: "dewy skin", kind: "beauty", layers: [], makeup: [
            { step: "smooth", strength: 30 }, { step: "glow", strength: 60 }
        ] },
    { id: "matte-finish", title: "Mat de Toulouse", theme: "matte finish", kind: "beauty", layers: [], makeup: [
            { step: "matte", strength: 60 }, { step: "tone", strength: 25 }, { step: "lips", strength: 30, colour: [190, 120, 120] }
        ] },
    { id: "freckle-kiss", title: "Baiser de Quimper", theme: "freckle kiss", kind: "beauty", layers: [], makeup: [
            { step: "freckles", strength: 55, density: 55 }, { step: "blush", strength: 30, colour: [236, 160, 150] }
        ] },
    { id: "sun-kissed", title: "Hâle de Saint-Jean-de-Luz", theme: "sun-kissed", kind: "beauty", layers: [], makeup: [
            { step: "tan", strength: 40 }, { step: "glow", strength: 35 }, { step: "blush", strength: 30, colour: [226, 150, 120] }
        ] },
    { id: "evening", title: "Soir de Strasbourg", theme: "evening", kind: "beauty", layers: [], makeup: [
            { step: "matte", strength: 35 }, { step: "shadow", strength: 55, colour: [120, 80, 110] }, { step: "liner", strength: 85, colour: [26, 20, 24] },
            { step: "blush", strength: 30, colour: [210, 120, 130] }, { step: "lips", strength: 70, colour: [128, 34, 60] }
        ] },
    // Effects: colour, light and overlays drawn by our own code.
    ...[
        ["film", "Pellicule de La Ciotat", "film grain and light leak"], ["vhs", "Cassette de Roubaix", "VHS lines"],
        ["comic", "Encre d'Angoulême", "comic ink outline"], ["pastel", "Rêve pastel d'Albi", "pastel dream"],
        ["golden", "Heure dorée de Saint-Émilion", "golden hour"], ["rain", "Pluie de Brest", "rain on glass"],
        ["stars", "Ciel du Pic du Midi", "starfield"], ["bokeh", "Coeurs flous de Valence", "bokeh hearts"],
        ["kaleido", "Kaléidoscope de Chartres", "mirror kaleidoscope background"], ["neon-rim", "Néon de Lille", "neon rim light"],
    ].map(([effect, title, theme]) => ({ id: `fx-${effect}`, title, theme, kind: "effect", layers: [], effect })),
];
export const PROPS_LABEL = "Face lens: our own drawn props on this photo. A simulation.";
/** The label every result of this lens carries. */
export function lensLabel(lens) {
    const kind = lens.kind ?? "props";
    return kind === "warp" ? FUN_WARP_LABEL : kind === "beauty" ? BEAUTY_LABEL : kind === "effect" ? EFFECT_LABEL : PROPS_LABEL;
}
export function lensById(id) {
    const found = LENSES.find((l) => l.id === id);
    if (!found)
        throw new RangeError(`no lens ${JSON.stringify(id)}`);
    return found;
}
/** Every picture slot: one per prop layer and per particle picture, in recipe order. */
export function lensSlots(lenses = LENSES) {
    const out = [];
    for (const l of lenses) {
        for (const p of l.layers)
            out.push({ lens: l.id, layer: p.name, file: `${l.id}/${p.name}.png`, draw: p.draw });
        for (const p of l.particles ?? []) {
            out.push({ lens: l.id, layer: p.name, file: `${l.id}/${p.name}.png`, draw: p.draw });
            if (p.alt)
                out.push({ lens: l.id, layer: p.alt.name, file: `${l.id}/${p.alt.name}.png`, draw: p.alt.draw });
        }
    }
    return out;
}
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Problems with a set of recipes (empty when they are all usable). */
export function checkLenses(lenses = LENSES) {
    const problems = [], ids = new Set(), titles = new Set();
    for (const l of lenses) {
        if (!SLUG.test(l.id) || ids.has(l.id))
            problems.push(`${l.id}: bad or repeated id`);
        if (!l.title || titles.has(l.title))
            problems.push(`${l.id}: bad or repeated title`);
        ids.add(l.id);
        titles.add(l.title);
        if (!l.layers.length && !l.particles?.length && !l.warp && !l.makeup?.length && !l.effect)
            problems.push(`${l.id}: nothing to draw`);
        if (l.warp && (!WARPS.includes(l.warp.kind) || !(l.warp.amount > 0 && l.warp.amount <= 1)))
            problems.push(`${l.id}: bad warp`);
        if (l.effect && !EFFECTS.includes(l.effect))
            problems.push(`${l.id}: unknown effect`);
        for (const st of l.makeup ?? [])
            if (!(st.strength > 0 && st.strength <= 100))
                problems.push(`${l.id}: makeup strength must be in (0, 100]`);
        if ((l.kind === "warp") !== !!l.warp || (l.kind === "beauty") !== !!l.makeup || (l.kind === "effect") !== !!l.effect)
            problems.push(`${l.id}: kind does not match its parts`);
        const names = new Set();
        for (const p of l.layers) {
            if (!SLUG.test(p.name) || names.has(p.name))
                problems.push(`${l.id}/${p.name}: bad or repeated layer name`);
            names.add(p.name);
            if (!ANCHORS.includes(p.anchor))
                problems.push(`${l.id}/${p.name}: unknown anchor ${p.anchor}`);
            if (!(p.scale > 0 && p.scale <= 4))
                problems.push(`${l.id}/${p.name}: scale must be in (0, 4]`);
            if (!(p.draw in DRAWINGS))
                problems.push(`${l.id}/${p.name}: no drawn fallback ${p.draw}`);
            if (p.depth !== undefined && !(p.depth >= 0 && p.depth <= 1))
                problems.push(`${l.id}/${p.name}: depth must be 0..1`);
            if (p.opacity !== undefined && !(p.opacity > 0 && p.opacity <= 1))
                problems.push(`${l.id}/${p.name}: opacity must be in (0, 1]`);
        }
        for (const p of l.particles ?? []) {
            for (const [n, d] of [[p.name, p.draw], ...(p.alt ? [[p.alt.name, p.alt.draw]] : [])]) {
                if (!SLUG.test(n) || names.has(n))
                    problems.push(`${l.id}/${n}: bad or repeated layer name`);
                names.add(n);
                if (!(d in DRAWINGS))
                    problems.push(`${l.id}/${n}: no drawn fallback ${d}`);
            }
            if (!(Number.isInteger(p.count) && p.count >= 1 && p.count <= 40))
                problems.push(`${l.id}/${p.name}: count must be 1..40`);
        }
    }
    return problems;
}
//# sourceMappingURL=recipes.js.map
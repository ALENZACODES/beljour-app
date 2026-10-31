/** Home's "Today" section: one time-aware line about her routine (feature 134) and today's pick
 * (feature 138), one face lens or story template chosen by the date alone
 * (engines/skin-daily pick), linking straight to it. With nothing saved on this device the
 * routine card invites her to set one up, so a first visit still sees a finished section.
 * Reads only this device's storage; nothing is fetched, nothing is tracked.
 *
 * LENS_PICKS and STORY_PICKS are the ids and names of lenses/recipes.ts LENSES and
 * editor/create/story.ts STORIES, copied here so Home does not load the lens and story engines
 * (web/test/home-today.test.mjs fails if they drift apart). Author: John Khan.
 */
import { h } from "../dom.js";
import { localDay, pick } from "../engines/skin-daily/index.js";
import { timeLine } from "../engines/skin-daily/routine.js";
import { DailyStore } from "../engines/skin-daily/store.js";
import { LENS_FILES } from "../lenses/assets.js";
/** [id, title, what it is]: the 60 face lenses, in LENSES order. */
export const LENS_PICKS = [
    ["flower-crown", "Couronne de Grasse", "flower crown"],
    ["butterfly-crown", "Papillons de Giverny", "butterfly crown"],
    ["heart-glasses", "Coeurs de Nice", "heart glasses"],
    ["star-glasses", "Étoiles d'Antibes", "star glasses"],
    ["round-shades", "Riviera ronde", "round shades"],
    ["cat-eye-shades", "Chat de Cannes", "cat-eye shades"],
    ["bunny-ears", "Lapin de Rambouillet", "soft bunny ears"],
    ["kitten-ears", "Chaton de Montmartre", "kitten ears"],
    ["fox-ears", "Renard de Sologne", "fox ears"],
    ["bear-ears", "Ourson des Vosges", "bear ears"],
    ["deer-antlers", "Cerf de Chambord", "deer antlers"],
    ["halo", "Auréole de Vézelay", "halo"],
    ["devil-horns", "Cornes de Carcassonne", "devil horns"],
    ["tiara", "Diadème de Versailles", "tiara"],
    ["crown", "Couronne de Reims", "crown"],
    ["sparkle-freckles", "Paillettes de Collioure", "sparkle freckles"],
    ["glitter-tears", "Larmes d'Arles", "glitter tears"],
    ["heart-cheeks", "Joues de Menton", "heart cheeks"],
    ["blush-hearts", "Petits coeurs de Lyon", "blush hearts"],
    ["petal-shower", "Pluie de pétales", "petal shower"],
    ["snow", "Neige de Chamonix", "snow"],
    ["sparkle-rain", "Pluie d'étoiles", "sparkle rain"],
    ["bubbles", "Bulles de Biarritz", "bubbles"],
    ["butterflies", "Envol de Provence", "butterflies"],
    ["rainbow", "Arc-en-ciel d'Étretat", "rainbow"],
    ["sunburst", "Soleil de Biarritz", "sunburst"],
    ["neon-outline", "Néon de Pigalle", "neon outline"],
    ["lip-gloss", "Gloss de Saint-Tropez", "lip gloss shine"],
    ["lash-flutter", "Cils de Deauville", "lash flutter"],
    ["moon-stars", "Nuit de Saint-Malo", "moon and stars"],
    ["warp-big-eyes", "Grands yeux d'Annecy", "big eyes"],
    ["warp-tiny-face", "Petit minois de Colmar", "tiny face"],
    ["warp-long-face", "Visage long de Rocamadour", "long face"],
    ["warp-chubby-cheeks", "Joues rondes de Dijon", "chubby cheeks"],
    ["warp-puffer", "Poisson-lune de Sète", "puffer"],
    ["warp-alien-head", "Martien de Millau", "alien head"],
    ["warp-wide-smile", "Grand sourire de Nantes", "wide smile"],
    ["warp-mini-mouth", "Bouche mini de Honfleur", "mini mouth"],
    ["warp-bulge", "Bulle de Bordeaux", "bulge"],
    ["warp-mirror", "Miroir de Chenonceau", "mirror-symmetric face"],
    ["soft-glam", "Glam doux de Monaco", "soft glam"],
    ["no-makeup-glow", "Éclat nu d'Évian", "no-makeup glow"],
    ["rosy-cheeks", "Joues roses de Provins", "rosy cheeks"],
    ["bold-lip", "Rouge d'Avignon", "bold lip"],
    ["smoky-eye", "Smoky de Marseille", "smoky eye"],
    ["dewy-skin", "Rosée de Gérardmer", "dewy skin"],
    ["matte-finish", "Mat de Toulouse", "matte finish"],
    ["freckle-kiss", "Baiser de Quimper", "freckle kiss"],
    ["sun-kissed", "Hâle de Saint-Jean-de-Luz", "sun-kissed"],
    ["evening", "Soir de Strasbourg", "evening"],
    ["fx-film", "Pellicule de La Ciotat", "film grain and light leak"],
    ["fx-vhs", "Cassette de Roubaix", "VHS lines"],
    ["fx-comic", "Encre d'Angoulême", "comic ink outline"],
    ["fx-pastel", "Rêve pastel d'Albi", "pastel dream"],
    ["fx-golden", "Heure dorée de Saint-Émilion", "golden hour"],
    ["fx-rain", "Pluie de Brest", "rain on glass"],
    ["fx-stars", "Ciel du Pic du Midi", "starfield"],
    ["fx-bokeh", "Coeurs flous de Valence", "bokeh hearts"],
    ["fx-kaleido", "Kaléidoscope de Chartres", "mirror kaleidoscope background"],
    ["fx-neon-rim", "Néon de Lille", "neon rim light"],
];
/** [id, label, what it does]: the 8 story templates, in STORIES order. */
export const STORY_PICKS = [
    ["trocadero", "Trocadéro", "A full photo with a title band across it"],
    ["pont-neuf", "Pont Neuf", "Before and after, one above the other"],
    ["saint-germain", "Saint-Germain", "Three moments in a strip"],
    ["rive-gauche", "Rive Gauche", "A quote card with a round photo"],
    ["etretat", "Étretat", "Two tilted prints with a caption"],
    ["montparnasse", "Montparnasse", "A full photo with words at the top and bottom"],
    ["belleville", "Belleville", "Four photos with a title band in the middle"],
    ["honfleur", "Honfleur", "An arched window photo with a title under it"],
];
/** Today's pick for a local date: the same for everyone on that date. */
export function todaysPick(day, lensFiles = LENS_FILES) {
    const p = pick(day, LENS_PICKS.map((x) => x[0]), STORY_PICKS.map((x) => x[0]));
    if (p.kind === "lens") {
        const [, title, theme] = LENS_PICKS.find((x) => x[0] === p.id);
        const file = lensFiles.find((f) => f.startsWith(`${p.id}/`)) ?? null;
        return { kind: "lens", id: p.id, title, what: `Face lens: ${theme}`, href: `lenses.html#lens=${encodeURIComponent(p.id)}`,
            action: "Try this lens", picture: file ? `assets/lenses/${file}` : null };
    }
    const [, title, does] = STORY_PICKS.find((x) => x[0] === p.id);
    return { kind: "story", id: p.id, title, what: `Story template: ${does.charAt(0).toLowerCase()}${does.slice(1)}`,
        href: `studio.html#story=${encodeURIComponent(p.id)}`, action: "Make this story", picture: null };
}
/** Fill <section id="home-today"> and show it. */
export function mountHomeToday(doc = document, store = new DailyStore(), now = () => new Date()) {
    const slot = doc.getElementById("home-today");
    if (!slot)
        return;
    const when = now(), day = localDay(when);
    const routine = store.routine();
    const line = timeLine(routine, store.ticks(day), when, day);
    const p = todaysPick(day);
    const routineCard = h("div", { class: "home-today-card home-today-routine" }, h("p", { class: "lg-caps" }, "Your skin today"), h("h3", {}, line.title), h("p", {}, line.line), h("a", { class: "lg-button lg-primary", href: "skin-day.html#routine" }, routine ? "Open my routine" : "Set up my routine"), h("p", { class: "lg-small" }, "No face scan. Routine, product diary, skin log and reminders, kept on this device."));
    const pickCard = h("div", { class: `home-today-card home-today-pick home-today-${p.kind}` }, p.picture ? h("img", { class: "home-today-pic", src: p.picture, alt: "", width: "96", height: "96", loading: "lazy", decoding: "async" })
        : h("span", { class: "home-today-glyph", "aria-hidden": "true" }, p.kind === "lens" ? "✦" : "▯"), h("div", {}, h("p", { class: "lg-caps" }, "Today's pick"), h("h3", {}, p.title), h("p", {}, p.what), h("a", { class: "lg-link", href: p.href }, p.action, h("span", { "aria-hidden": "true" }, " →")), h("p", { class: "lg-small" }, "A new pick each day, the same for everyone. Nothing about you chooses it.")));
    slot.replaceChildren(h("h2", { id: "home-today-title", class: "lg-hidden" }, "Today"), routineCard, pickCard);
    slot.hidden = false;
}

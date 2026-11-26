/** Synthetic sample photos (fictional adults, no metadata) offered next to every photo upload. */
export const SAMPLE_LABEL = "Synthetic sample, not a real person";
/** Tone reference bands on the ITA scale (the six used by the Arena). */
export function toneBand(ita) {
    return ita > 55 ? "very light" : ita > 41 ? "light" : ita > 28 ? "intermediate" : ita > 10 ? "tan" : ita > -30 ? "brown" : "dark";
}
/** Short form for a sample tile: "tan · ITA 13". */
export function toneShort(s) {
    return s.ita === undefined ? "" : `${toneBand(s.ita)} · ITA ${Math.round(s.ita)}`;
}
/** "tone reference: tan (ITA 13, measured on this photo)", or "" when there is no single face. */
export function toneLabel(s) {
    return s.ita === undefined ? "" : `tone reference: ${toneBand(s.ita)} (ITA ${Math.round(s.ita)}, measured on this photo)`;
}
// Every sample is a synthetic picture of an invented adult, listed under corpora in licences.json:
// the app's example faces (assets/skin-moment/faces), the sample photos (assets/samples) and the
// high-resolution example people (assets/people).
// Only pictures that exist in the repository are offered (web/test/studio-defaults-offered.test.mjs).
export const SAMPLE_PHOTOS = [
    { file: "person-1.jpg", name: "Woman, light skin, freckles (high resolution)", use: "portrait", ita: 48.5 },
    { file: "person-2.jpg", name: "Woman, light-medium skin (high resolution)", use: "portrait", ita: 34.2 },
    { file: "person-3.jpg", name: "Woman, medium olive skin (high resolution)", use: "portrait", ita: 41.5 },
    { file: "person-4.jpg", name: "Woman, tan skin (high resolution)", use: "portrait", ita: 29.3 },
    { file: "person-5.jpg", name: "Woman, deep skin, coily hair (high resolution)", use: "portrait", ita: 12.8 },
    { file: "person-6.jpg", name: "Woman, very deep skin, grey hair (high resolution)", use: "age", ita: -19.1 },
    { file: "face-02-day0.png", name: "Woman, neutral expression", use: "portrait", ita: 43.2 },
    { file: "sample-portrait-woman-smile-teeth.jpg", name: "Woman, smiling", use: "teeth", ita: 44.4 },
    { file: "sample-portrait-under-eye.jpg", name: "Close-up, under-eye", use: "under-eye", ita: 52.4 },
    { file: "face-01-day0.png", name: "Close-up, freckles", use: "skin", ita: 46.9 },
    { file: "face-06-day0.png", name: "Older woman", use: "age", ita: 19.7 },
    { file: "face-03-day0.png", name: "Man, clean-shaven", use: "beard", ita: 41.0 },
    { file: "face-05-day0.png", name: "Man, beard", use: "beard", ita: 33.6 },
    { file: "face-40-day0.png", name: "Man, deep skin tone", use: "skin", ita: -43.5 },
    { file: "sample-portrait-three-quarter.jpg", name: "Three-quarter view", use: "pose", ita: -2.1 },
    { file: "sample-id-photo-headroom.jpg", name: "ID-style photo", use: "id", ita: 15.5 },
    { file: "sample-light-window.jpg", name: "Window light", use: "lighting", ita: 51.5 },
    { file: "sample-light-studio.jpg", name: "Studio light", use: "lighting", ita: 45.1 },
    { file: "sample-light-evening.jpg", name: "Evening light", use: "lighting", ita: 17.2 },
    { file: "sample-low-light-selfie.jpg", name: "Low-light selfie", use: "lighting", ita: -2.7 },
    { file: "sample-hair-long-straight-brunette.jpg", name: "Long straight hair", use: "hair", ita: 46.9 },
    { file: "sample-hair-curly-coily.jpg", name: "Curly hair", use: "hair", ita: 11.0 },
    { file: "sample-hair-grey-roots.jpg", name: "Grey roots", use: "hair", ita: 26.9 },
    { file: "sample-studio-busy-background.jpg", name: "Busy background", use: "background", ita: 50.4 },
    { file: "sample-full-body-standing.jpg", name: "Full body, standing", use: "body" },
    { file: "sample-full-body-leaning.jpg", name: "Full body, leaning", use: "body" },
    { file: "sample-group-four-adults.jpg", name: "Group of four adults", use: "group" },
];
export const sampleUrl = (s) => s.file.startsWith("face-") ? `assets/skin-moment/faces/${s.file}`
    : s.file.startsWith("person-") ? `assets/people/${s.file}` : `assets/samples/${s.file}`;
/** Fetch one sample from this site as a File (same origin, nothing leaves the device). */
export async function sampleFile(s) {
    const response = await fetch(sampleUrl(s));
    if (!response.ok)
        throw new Error("That sample photo could not be loaded.");
    return new File([await response.blob()], s.file, { type: s.file.endsWith(".png") ? "image/png" : "image/jpeg" });
}
//# sourceMappingURL=samples.js.map
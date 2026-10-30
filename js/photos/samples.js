/** Synthetic sample photos (fictional adults, no metadata) offered next to every photo upload. */
export const SAMPLE_LABEL = "Synthetic sample, not a real person";
export const SAMPLE_PHOTOS = [
    { file: "sample-portrait-woman-neutral.jpg", name: "Woman, neutral expression", use: "portrait" },
    { file: "sample-portrait-woman-smile-teeth.jpg", name: "Woman, smiling", use: "teeth" },
    { file: "sample-portrait-under-eye.jpg", name: "Close-up, under-eye", use: "under-eye" },
    { file: "sample-skin-freckles-blemishes.jpg", name: "Close-up, freckles", use: "skin" },
    { file: "sample-portrait-older-woman.jpg", name: "Older woman", use: "age" },
    { file: "sample-portrait-man-clean-shaven.jpg", name: "Man, clean-shaven", use: "beard" },
    { file: "sample-portrait-man-full-beard.jpg", name: "Man, full beard", use: "beard" },
    { file: "sample-portrait-tan-deep-skin-man.jpg", name: "Man, deep skin tone", use: "skin" },
    { file: "sample-portrait-three-quarter.jpg", name: "Three-quarter view", use: "pose" },
    { file: "sample-id-photo-headroom.jpg", name: "ID-style photo", use: "id" },
    { file: "sample-low-light-selfie.jpg", name: "Low-light selfie", use: "lighting" },
    { file: "sample-hair-long-straight-brunette.jpg", name: "Long straight hair", use: "hair" },
    { file: "sample-hair-curly-coily.jpg", name: "Curly hair", use: "hair" },
    { file: "sample-hair-grey-roots.jpg", name: "Grey roots", use: "hair" },
    { file: "sample-studio-busy-background.jpg", name: "Busy background", use: "background" },
    { file: "sample-full-body-standing.jpg", name: "Full body, standing", use: "body" },
    { file: "sample-full-body-leaning.jpg", name: "Full body, leaning", use: "body" },
    { file: "sample-group-four-adults.jpg", name: "Group of four adults", use: "group" },
];
export const sampleUrl = (s) => `assets/samples/${s.file}`;
/** Fetch one sample from this site as a File (same origin, nothing leaves the device). */
export async function sampleFile(s) {
    const response = await fetch(sampleUrl(s));
    if (!response.ok)
        throw new Error("That sample photo could not be loaded.");
    return new File([await response.blob()], s.file, { type: "image/jpeg" });
}
//# sourceMappingURL=samples.js.map
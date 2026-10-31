/** Consent-free drawn samples from existing R7 generators, no downloaded people/photos.
 * User uploads are read and resized entirely on device; never invoke fetch here.
 * Author: John Khan.
 */
import { fromRGBA } from "../../engines/core/buffer.js";
import { frontFigure, sideFigure } from "../../engines/local/figures.js";
import { symmetricFace } from "../../engines/local/face-synthetic.js";
import { facePhoto } from "../../engines/local/beard.js";
import { syntheticCrown } from "../../engines/local/fibre.js";
import { scene, addNoise, lowLight } from "../../engines/local/enhance.js";
import { regionMask } from "../../data/regions/index.js";
import { coilyPortrait, headroomPortrait, teethPortrait } from "../../engines/local/sample-portraits.js";
export const SAMPLE_IDS = ["low-light", "crown", "portrait", "id-headroom", "coily", "teeth", "body-front", "body-side"];
export const SAMPLE_NAMES = {
    "low-light": "Low-light chart", crown: "Drawn crown", portrait: "Drawn portrait",
    "id-headroom": "Drawn ID photo, headroom above", coily: "Drawn portrait, coily hair", teeth: "Drawn smile, teeth showing",
    "body-front": "Front-body figure", "body-side": "Side-body figure",
};
/** The drawn samples that carry a face (the face tools can use any of them). */
export const FACE_SAMPLE_IDS = ["portrait", "id-headroom", "coily", "teeth"];
export function makeSample(id) {
    if (id === "low-light") {
        const img = addNoise(lowLight(scene(240, 200), 0.4), 8, 5);
        return { id: `sample:${id}`, kind: "sample", label: SAMPLE_NAMES[id], image: img, disposable: true };
    }
    if (id === "crown") {
        const item = syntheticCrown({ width: 224, height: 224, seed: 4 });
        return { id: `sample:${id}`, kind: "sample", label: SAMPLE_NAMES[id], image: item.image,
            crown: item.region, hair: { ...item.region, data: Float32Array.from(item.hair) }, disposable: true };
    }
    if (id === "portrait") {
        const face = symmetricFace(272, 336, 168, 218);
        const image = facePhoto(face, 272, 336, 5);
        // The drawn face is drawn inside exactly this oval, so it is the sample's person area.
        const person = regionMask("face_oval", face, 272, 336, { normalized: false, supersample: 2 });
        return { id: `sample:${id}`, kind: "sample", label: SAMPLE_NAMES[id], image, face, person, disposable: true };
    }
    if (id === "id-headroom" || id === "coily" || id === "teeth") {
        const drawn = id === "id-headroom" ? headroomPortrait() : id === "coily" ? coilyPortrait() : teethPortrait();
        return { id: `sample:${id}`, kind: "sample", label: SAMPLE_NAMES[id], image: drawn.image, face: drawn.face,
            person: drawn.person, ...(drawn.hair ? { hair: drawn.hair } : {}), disposable: true };
    }
    if (id === "body-front") {
        const item = frontFigure({ width: 200, height: 260, lean: 5, shoulderDrop: 7, seed: 4 });
        return { id: `sample:${id}`, kind: "sample", label: SAMPLE_NAMES[id], image: item.image,
            person: item.person, body: item.controls, disposable: true };
    }
    if (id === "body-side") {
        const item = sideFigure({ width: 200, height: 260, facing: 1, headForward: 12, roundShoulder: 6,
            slouch: 5, sway: 6, belly: 4 });
        return { id: `sample:${id}`, kind: "sample", label: SAMPLE_NAMES[id], image: item.image,
            person: item.person, body: item.controls, disposable: true };
    }
    throw new RangeError("Unknown drawn sample");
}
/** Convert a local image to RGB; make alpha explicit against white. No EXIF survives. */
export function rgbFromRGBA(img) {
    const source = fromRGBA(img), output = new Uint8Array(img.width * img.height * 3);
    for (let i = 0; i < img.width * img.height; i++) {
        const a = source.data[i * 4 + 3] / 255;
        for (let k = 0; k < 3; k++)
            output[i * 3 + k] = Math.round(source.data[i * 4 + k] * a + 255 * (1 - a));
    }
    return { width: img.width, height: img.height, channels: 3, data: output };
}
export async function readLocalImage(file, maxSide = 640) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type))
        throw new Error("Use a JPEG, PNG or WebP photo.");
    if (file.size > 15 * 1024 * 1024)
        throw new Error("Choose an image under 15 MB.");
    if (!(Number.isFinite(maxSide) && maxSide >= 64 && maxSide <= 2048))
        throw new RangeError("Invalid preview size");
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    try {
        if (bitmap.width < 8 || bitmap.height < 8)
            throw new Error("Photo is too small.");
        const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
        const width = Math.max(8, Math.round(bitmap.width * scale)), height = Math.max(8, Math.round(bitmap.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx)
            throw new Error("2D canvas isn't available in this browser");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(bitmap, 0, 0, width, height);
        return rgbFromRGBA(ctx.getImageData(0, 0, width, height));
    }
    finally {
        bitmap.close();
    }
}
/** An uploaded file is isolated from provider work until a separate explicit upload. */
export function uploadedSource(image, id) {
    if (!/^upload:[a-zA-Z0-9-]{1,50}$/.test(id))
        throw new RangeError("Invalid photo token");
    if (image.width < 8 || image.height < 8 || image.width * image.height > 2048 * 2048)
        throw new RangeError("Image is too large");
    return { id, image, kind: "uploaded", label: "Photo on this device", disposable: true };
}

import { FRAME_HEIGHT, FRAME_WIDTH, stateForFrame, } from "./frame-cache-contract.js";
import { drawContinuousPreview } from "./preview.js";
/** Does not expose a live adapter, network callback, or user-selected file. */
export function createDrawnFrameRenderer(doc, current) {
    return async (id, expected) => {
        const initial = current();
        if (initial.state.sourceRevision !== expected.sourceRevision
            || initial.state.selectedId !== expected.selectedId
            || initial.subjects.source !== "drawn") {
            throw new Error("Drawn frame source changed");
        }
        const full = doc.createElement("canvas");
        const reduced = doc.createElement("canvas");
        try {
            const result = drawContinuousPreview(initial.original, full, stateForFrame(expected, id), initial.subjects, true);
            if (result.visual !== "illustration" || !result.protectedBystanders) {
                throw new Error("Bystander-safe drawing unavailable");
            }
            reduced.width = FRAME_WIDTH;
            reduced.height = FRAME_HEIGHT;
            const context = reduced.getContext("2d", { willReadFrequently: true });
            if (!context)
                throw new Error("Canvas thumbnails unavailable");
            context.drawImage(full, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
            const pixels = context.getImageData(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
            if (pixels.width !== FRAME_WIDTH || pixels.height !== FRAME_HEIGHT) {
                throw new Error("Invalid canvas readback dimensions");
            }
            return {
                id,
                width: FRAME_WIDTH,
                height: FRAME_HEIGHT,
                rgba: new Uint8ClampedArray(pixels.data),
                provenance: "local-rendered-illustration",
                providerVerified: false,
                unitsSpent: 0,
            };
        }
        finally {
            full.width = 0;
            full.height = 0;
            reduced.width = 0;
            reduced.height = 0;
        }
    };
}

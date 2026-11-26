import { measure } from "./ratios.js";
export function checkedProportions(mesh, reference = "golden") {
    try {
        const report = measure(mesh, reference);
        for (const reading of report.ratios) {
            if (typeof reading.value === "number" && !Number.isFinite(reading.value)) {
                return { module: "proportions", refused: true, code: "invalid_geometry", message: "non-finite ratio" };
            }
            if (Array.isArray(reading.value) && !reading.value.every(Number.isFinite)) {
                return { module: "proportions", refused: true, code: "invalid_geometry", message: "non-finite shares" };
            }
        }
        return { module: "proportions", refused: false, report };
    }
    catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 120) : "invalid geometry";
        const code = message.includes("no length") ? "no_face_length" :
            message.includes("no width") ? "no_face_width" : "invalid_geometry";
        return { module: "proportions", refused: true, code, message };
    }
}
//# sourceMappingURL=guarded.js.map
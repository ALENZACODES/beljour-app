/** Explicit, on-device file creation with a non-removable in-pixel simulation mark. */
import { judgeFileName, } from "../../layout/judge-contract.js";
import { paintJudgeLook } from "./judge-canvas.js";
export async function encodeJudgeCanvas(canvas, format) {
    if (format !== "image/png" && format !== "image/jpeg") {
        throw new RangeError("Unsupported Judge Mode export format");
    }
    return new Promise((resolve, reject) => {
        try {
            canvas.toBlob((blob) => {
                if (!blob || !blob.size) {
                    reject(new Error("The file could not be created on this device."));
                    return;
                }
                resolve(blob);
            }, format, format === "image/jpeg" ? 0.9 : undefined);
        }
        catch {
            reject(new Error("The file could not be created on this device."));
        }
    });
}
export async function prepareJudgeDownload(doc, source, state, subject = null, allowUntracked = true) {
    if (!state.source)
        throw new Error("Choose an image before exporting.");
    const canvas = doc.createElement("canvas");
    try {
        // The true argument is intentional and cannot be replaced by a setting.
        paintJudgeLook(source, canvas, state, state.size, true, subject, allowUntracked);
        const file = await encodeJudgeCanvas(canvas, state.format);
        return {
            file,
            filename: judgeFileName(state.format),
            width: canvas.width,
            height: canvas.height,
        };
    }
    finally {
        canvas.width = 0;
        canvas.height = 0;
    }
}
/** Link activation happens only after a person presses Save. */
export function startJudgeDownload(doc, result, urls = URL, defer = (task) => { setTimeout(task, 2000); }) {
    const url = urls.createObjectURL(result.file);
    const anchor = doc.createElement("a");
    anchor.href = url;
    anchor.download = result.filename;
    anchor.hidden = true;
    doc.body.append(anchor);
    try {
        anchor.click();
    }
    finally {
        anchor.remove();
        defer(() => urls.revokeObjectURL(url));
    }
}
export function judgeExportDescription(format, size) {
    const type = format === "image/png" ? "PNG" : "JPEG";
    const width = size === "large" ? 768 : 512;
    const height = size === "large" ? 960 : 640;
    return `${type}, ${width} × ${height} pixels. "SIMULATION — ILLUSTRATIVE DEMO" is burned into the image.`;
}
//# sourceMappingURL=judge-export.js.map
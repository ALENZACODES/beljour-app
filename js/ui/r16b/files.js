export async function openLocal(file) {
    if (file.size > 12 * 1024 * 1024)
        throw new RangeError("Photo exceeds 12 MB local limit.");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
        throw new RangeError("Use JPEG, PNG or WebP.");
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    try {
        const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height)), w = Math.max(8, Math.round(bmp.width * scale)), h = Math.max(8, Math.round(bmp.height * scale));
        const c = new OffscreenCanvas(w, h), ctx = c.getContext("2d");
        if (!ctx)
            throw new Error("Canvas unavailable");
        ctx.drawImage(bmp, 0, 0, w, h);
        const d = ctx.getImageData(0, 0, w, h);
        return { width: w, height: h, channels: 4, data: d.data };
    }
    finally {
        bmp.close();
    }
}
export function downloadPng(canvas, name) {
    canvas.toBlob(blob => {
        if (!blob)
            return;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 0);
    }, "image/png");
}
//# sourceMappingURL=files.js.map
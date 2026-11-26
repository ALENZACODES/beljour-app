export const downloadFile = (name, type, bytes) => {
    const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    document.body.append(anchor);
    try {
        anchor.click();
    }
    finally {
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);
    }
};
//# sourceMappingURL=download.js.map
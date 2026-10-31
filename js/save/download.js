export const downloadFile = (name, type, bytes) => {
    const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    document.body.append(anchor);
    // The URL lives long enough for every browser to start the download (some read it after the
    // click returns, and a URL revoked at once gives a silent, failed download), then it is freed.
    try {
        anchor.click();
    }
    finally {
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
};

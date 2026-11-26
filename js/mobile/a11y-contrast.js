function bounded(channel) {
    if (!Number.isFinite(channel) || channel < 0 || channel > 255)
        throw new RangeError("Invalid RGB channel");
    return channel;
}
export function parseOpaqueColour(text) {
    const input = text.trim().toLowerCase();
    const hex = /^#([0-9a-f]{6})$/.exec(input);
    if (hex) {
        const encoded = hex[1];
        return [parseInt(encoded.slice(0, 2), 16), parseInt(encoded.slice(2, 4), 16), parseInt(encoded.slice(4), 16)];
    }
    const short = /^#([0-9a-f]{3})$/.exec(input);
    if (short) {
        const [r, g, b] = short[1].split("");
        return [parseInt(r + r, 16), parseInt(g + g, 16), parseInt(b + b, 16)];
    }
    const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(1(?:\.0+)?))?\s*\)$/.exec(input);
    if (rgb) {
        const channels = rgb.slice(1, 4).map(Number);
        if (channels.some((number) => number > 255))
            return null;
        return [bounded(channels[0]), bounded(channels[1]), bounded(channels[2])];
    }
    return null;
}
function linear(value) {
    const normalized = bounded(value) / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}
export function luminance(rgb) {
    return 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2]);
}
export function contrastRatio(foreground, background) {
    const one = luminance(foreground);
    const two = luminance(background);
    return (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05);
}
/** This threshold is the WCAG AA ordinary-text contrast requirement, not certification. */
export function contrastGrade(foreground, background) {
    const fg = parseOpaqueColour(foreground);
    const bg = parseOpaqueColour(background);
    if (!fg || !bg)
        return { ratio: null, grade: "unknown" };
    const ratio = contrastRatio(fg, bg);
    return { ratio, grade: ratio >= 4.5 ? "passes-normal-text" : "low" };
}
//# sourceMappingURL=a11y-contrast.js.map
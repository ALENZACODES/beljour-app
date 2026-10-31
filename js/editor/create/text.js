/** Text on photos: the bundled and system fonts, Beljour's five text styles, and the line layout
 * (wrapping, alignment, the box a text layer occupies).
 *
 * Fonts are only what ships with the page: Fraunces (assets/fonts, SIL OFL 1.1, loaded by
 * theme.css) and the device's own sans, serif and mono stacks. Nothing is downloaded.
 * Layout is done in page units with an injected measurer, so it is the same in a test as on the
 * canvas: words wrap greedily inside the box width, a word longer than the width breaks between
 * characters, and explicit new lines are kept.
 * Author: John Khan.
 */
export const FONTS = {
    fraunces: { label: "Fraunces", css: '"Fraunces", Georgia, serif', weight: 600 },
    sans: { label: "Sans", css: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif', weight: 700 },
    serif: { label: "Serif", css: 'Georgia, "Times New Roman", Times, serif', weight: 700 },
    mono: { label: "Mono", css: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace', weight: 600 },
};
export const FONT_IDS = Object.keys(FONTS);
/** Beljour's text styles, named for Paris streets and quarters like the filter looks. */
export const TEXT_STYLES = {
    rivoli: { label: "Rivoli", does: "Plain letters" },
    montmartre: { label: "Montmartre", does: "Letters with an outline" },
    marais: { label: "Marais", does: "Letters on a coloured band" },
    odeon: { label: "Odéon", does: "Letters with a soft shadow" },
    pigalle: { label: "Pigalle", does: "Glowing neon letters" },
};
export const TEXT_STYLE_IDS = Object.keys(TEXT_STYLES);
export const ALIGNS = ["left", "center", "right"];
export const MAX_TEXT = 280, MAX_LINES = 12;
export const LINE_HEIGHT = 1.22; // ASSUMED: comfortable for display type
export const MIN_SIZE = 12, MAX_SIZE = 400; // page units (a page is 1000 wide)
export function fontCss(font, size) {
    const f = FONTS[font];
    return `${f.weight} ${Math.max(1, Math.round(size * 100) / 100)}px ${f.css}`;
}
export function checkText(text) {
    const clean = String(text ?? "").replace(/\r\n?/g, "\n");
    if (clean.length > MAX_TEXT)
        throw new RangeError(`Text is up to ${MAX_TEXT} characters.`);
    if (/[\u0000-\u0009\u000b-\u001f\u007f]/.test(clean))
        throw new RangeError("Text can't hold control characters.");
    return clean;
}
/** Break one paragraph into lines no wider than `width`. */
function wrapParagraph(words, width, w) {
    const lines = [];
    let line = "";
    const pushWord = (word) => {
        // a word wider than the box breaks between characters
        let rest = word;
        while (w(rest) > width && rest.length > 1) {
            let cut = 1;
            while (cut < rest.length && w(rest.slice(0, cut + 1)) <= width)
                cut++;
            lines.push(rest.slice(0, cut));
            rest = rest.slice(cut);
        }
        line = rest;
    };
    for (const word of words) {
        if (!line) {
            pushWord(word);
            continue;
        }
        const candidate = `${line} ${word}`;
        if (w(candidate) <= width)
            line = candidate;
        else {
            lines.push(line);
            pushWord(word);
        }
    }
    lines.push(line);
    return lines;
}
/** Lay out text inside a box `boxWidth` units wide. Line x is the line's left edge and y its
 * vertical middle, both relative to the box centre. The box is as tall as the lines. */
export function layoutText(text, opts, measure) {
    const size = Math.min(MAX_SIZE, Math.max(MIN_SIZE, opts.size));
    if (!(opts.boxWidth > 0))
        throw new RangeError("A text box needs a width");
    const w = (s) => measure(s, opts.font, size);
    const paragraphs = checkText(text).split("\n");
    let raw = [];
    for (const p of paragraphs)
        raw = raw.concat(wrapParagraph(p.split(/[ \t]+/).filter(Boolean), opts.boxWidth, w));
    if (raw.length > MAX_LINES)
        raw = raw.slice(0, MAX_LINES);
    const lineHeight = size * LINE_HEIGHT;
    const height = Math.max(1, raw.length) * lineHeight;
    const half = opts.boxWidth / 2;
    const lines = raw.map((t, i) => {
        const lw = w(t);
        const x = opts.align === "left" ? -half : opts.align === "right" ? half - lw : -lw / 2;
        return { text: t, width: lw, x, y: -height / 2 + lineHeight * (i + 0.5) };
    });
    return { lines, width: opts.boxWidth, height, lineHeight };
}
/** The padding a style draws outside the letters (band, outline, glow), in units of font size. */
export function stylePad(style) {
    return style === "marais" ? 0.3 : style === "pigalle" ? 0.35 : style === "montmartre" ? 0.12 : style === "odeon" ? 0.15 : 0;
}
/** A measurer that works without a canvas (tests, and before a font has loaded): a fixed
 * advance per character class, roughly matching proportional fonts. ASSUMED widths. */
export const approxMeasure = (text, font, size) => {
    if (font === "mono")
        return text.length * 0.6 * size;
    let em = 0;
    for (const ch of text)
        em += /[il.,'!|:;]/.test(ch) ? 0.28 : /[mwMW@]/.test(ch) ? 0.85 : /[A-Z]/.test(ch) ? 0.66 : ch === " " ? 0.27 : 0.53;
    return em * size;
};

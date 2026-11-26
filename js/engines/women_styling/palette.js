export const SWATCHES = [
    { key: 'sand', name: 'Soft Sand', rgb: [190, 142, 118], family: 'warm', depth: 'medium' },
    { key: 'petal', name: 'Rose Petal', rgb: [192, 113, 135], family: 'cool', depth: 'light' },
    { key: 'berry', name: 'Dusky Berry', rgb: [126, 70, 110], family: 'cool', depth: 'deep' },
    { key: 'clay', name: 'Warm Clay', rgb: [171, 100, 83], family: 'warm', depth: 'medium' },
    { key: 'orchid', name: 'Muted Orchid', rgb: [155, 116, 159], family: 'cool', depth: 'medium' },
    { key: 'cocoa', name: 'Cocoa Veil', rgb: [115, 77, 65], family: 'neutral', depth: 'deep' },
    { key: 'taupe', name: 'Quiet Taupe', rgb: [140, 121, 119], family: 'neutral', depth: 'medium' },
    { key: 'coral', name: 'Coral Cloud', rgb: [206, 130, 115], family: 'warm', depth: 'light' },
    { key: 'rosewood', name: 'Rosewood', rgb: [151, 85, 94], family: 'neutral', depth: 'medium' },
    { key: 'fig', name: 'Fig', rgb: [117, 75, 100], family: 'cool', depth: 'deep' },
    { key: 'gold', name: 'Muted Gold', rgb: [171, 137, 88], family: 'warm', depth: 'medium' },
    { key: 'plum', name: 'Plum Shadow', rgb: [99, 69, 111], family: 'cool', depth: 'deep' },
    { key: 'peach', name: 'Peach Wash', rgb: [219, 166, 137], family: 'warm', depth: 'light' },
    { key: 'lavender', name: 'Lavender Mist', rgb: [172, 153, 190], family: 'cool', depth: 'light' },
    { key: 'moss', name: 'Moss Hint', rgb: [122, 144, 111], family: 'neutral', depth: 'medium' },
    { key: 'umber', name: 'Warm Umber', rgb: [112, 79, 64], family: 'warm', depth: 'deep' },
    { key: 'neutral', name: 'Neutral Veil', rgb: [169, 135, 126], family: 'neutral', depth: 'medium' },
    { key: 'slate', name: 'Soft Slate', rgb: [119, 130, 154], family: 'cool', depth: 'medium' },
];
export function checkedRGB(value, name) {
    if (!Array.isArray(value) || value.length !== 3 ||
        !value.every(v => Number.isInteger(v) && v >= 0 && v <= 255)) {
        throw new Error(`${name} must contain three RGB integers in 0..255`);
    }
    return [value[0], value[1], value[2]];
}
export function mixRGB(a, b, percent) {
    if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
        throw new Error('mix percent must be 0..100');
    }
    return [0, 1, 2].map(i => Math.floor((a[i] * (100 - percent) + b[i] * percent + 50) / 100));
}
export function referenceFromOutfit(outfit, mode) {
    if (mode === 'complement') {
        const inverted = [255 - outfit[0], 255 - outfit[1], 255 - outfit[2]];
        return mixRGB([156, 118, 130], inverted, 45);
    }
    if (mode === 'analogous')
        return [outfit[1], outfit[2], outfit[0]];
    if (mode === 'muted')
        return mixRGB(outfit, [137, 125, 124], 60);
    throw new Error(`Unknown outfit mode ${mode}`);
}
export function pickSwatch(family, depth = 'medium') {
    if (!['warm', 'cool', 'neutral'].includes(family) || !['light', 'medium', 'deep'].includes(depth)) {
        throw new Error('Choose an approved display family and depth');
    }
    const swatches = SWATCHES.filter(s => s.family === family);
    const result = swatches.find(s => s.depth === depth) ?? swatches[0];
    if (!result)
        throw new Error('No matching display swatch');
    return result;
}
export function suggestedPalette(family, outfit) {
    const base = pickSwatch(family);
    const colour = outfit ?? base.rgb;
    return [...SWATCHES].sort((a, b) => {
        const familyA = a.family === family ? 0 : 1;
        const familyB = b.family === family ? 0 : 1;
        if (familyA !== familyB)
            return familyA - familyB;
        const distance = (s) => Math.abs(s.rgb[0] - colour[0]) + Math.abs(s.rgb[1] - colour[1]) + Math.abs(s.rgb[2] - colour[2]);
        return distance(a) - distance(b) || a.key.localeCompare(b.key);
    }).slice(0, 4);
}
//# sourceMappingURL=palette.js.map
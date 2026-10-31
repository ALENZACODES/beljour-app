/** Labelled drawn fixture and geometry for browser acceptance only. Author: John Khan. */
export function fixture() {
    const width = 320, height = 360, data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const skin = 188 + Math.round(10 * Math.sin(x * .03));
            data[i] = skin;
            data[i + 1] = 132;
            data[i + 2] = 108;
            data[i + 3] = 255;
        }
    const pts = Array.from({ length: 478 }, () => [.5, .5]);
    const lip = [[.39, .66], [.43, .64], [.47, .635], [.5, .64], [.53, .635], [.57, .64], [.61, .66], [.58, .69], [.54, .705], [.5, .71], [.46, .705], [.42, .69]];
    const ids = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 308];
    ids.forEach((id, i) => pts[id] = lip[i]);
    [324, 318, 402, 317, 14, 87, 178, 88, 95, 78, 191, 80, 81, 82, 13, 312, 311, 310, 415].forEach((id, i) => pts[id] = lip[i % lip.length]);
    return { image: { width, height, channels: 4, data }, landmarks: pts, region: [{ name: "teeth", points: [[.43, .67], [.57, .67], [.56, .69], [.44, .69]] }, { name: "gum", points: [[.44, .665], [.56, .665], [.55, .675], [.45, .675]] }] };
}

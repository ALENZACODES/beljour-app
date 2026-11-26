/** An original photo border measured in absolute frame coordinates.
 * The Python mirror is api/plumb_api/filters/light/border.py.
 * Created by John Khan.
 */
import { fixed, num, register } from "../colour/ops.js";
import { decode1, encode1, smoothstep } from "../colour/space.js";
export function borderWeight(params, frame, x, y) {
    const nearest = Math.min(x, frame.width - x, y, frame.height - y);
    const distance = nearest / (params.width * Math.min(frame.width, frame.height));
    return 1 - smoothstep(0, 1, distance);
}
export function border(block, params, frame) {
    const amount = params.amount;
    if (amount <= 0)
        return { ...block, data: Float64Array.from(block.data) };
    const out = Float64Array.from(block.data);
    const destination = (params.tone + 1) / 2;
    for (let row = 0; row < block.height; row++) {
        const y = row + frame.y0 + 0.5;
        for (let col = 0; col < block.width; col++) {
            const x = col + frame.x0 + 0.5;
            const weight = amount * borderWeight(params, frame, x, y);
            const i = (row * block.width + col) * 3;
            for (let channel = 0; channel < 3; channel++) {
                out[i + channel] = encode1(decode1(out[i + channel]) * (1 - weight)
                    + destination * weight);
            }
        }
    }
    return { width: block.width, height: block.height, data: out };
}
register({
    name: "light.border", family: "light", skinHue: false, image: border,
    params: {
        amount: num(0, 0, 1, "border strength"),
        width: fixed(0.07, 0.015, 0.25, "width as a share of short side"),
        tone: fixed(-1, -1, 1, "white at +1, dark at -1"),
    },
    help: "Photographic white or dark border, full-frame coordinates",
});
//# sourceMappingURL=border.js.map
/** Original GPU colour ops (free-library plan §5, "GPUImage-style" role, our own shaders).
 *
 * Each op has: a GLSL ES 3.00 fragment shader, a CPU reference with the same arithmetic, a
 * neutral parameter set (the identity), and parameter bounds. The CPU reference is the
 * contract: the WebGL2 path must agree with it within `GPU_TOLERANCE` per channel.
 *
 * Colour and alpha contract:
 * - Textures hold premultiplied RGBA in [0, 1] (WebGL default for uploads with
 *   UNPACK_PREMULTIPLY_ALPHA_WEBGL). Ops un-premultiply, change colour, clamp, and
 *   re-premultiply, so a transparent edge never gains a dark or bright halo.
 * - Exposure works in linear light (sRGB decoded); contrast, saturation and balance work on
 *   display-encoded values, as photo editors' sliders do. Both choices are written here and
 *   in the shader so preview and export cannot drift.
 * - The masked composite mixes premultiplied values, the halo-free way.
 * No third-party presets, LUTs or filter names. Author: John Khan.
 */
/** Max per-channel difference allowed between GPU and CPU outputs (8-bit: one level). */
export const GPU_TOLERANCE = 1 / 255 + 1e-6;
export const VERTEX = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;
const HEADER = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_src;
out vec4 o_colour;
vec3 unpremul(vec4 c) { return c.a > 0.0 ? c.rgb / c.a : vec3(0.0); }
vec4 premul(vec3 rgb, float a) { return vec4(clamp(rgb, 0.0, 1.0) * a, a); }
float toLinear(float c) { return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4); }
float toSrgb(float c) { return c <= 0.0031308 ? c * 12.92 : 1.055 * pow(c, 1.0 / 2.4) - 0.055; }
`;
export const SHADERS = Object.freeze({
    exposure: {
        id: "exposure", label: "Exposure", composite: false,
        bounds: { stops: [-2, 2] }, neutral: { stops: 0 },
        fragment: HEADER + `uniform float u_stops;
void main() {
  vec4 c = texture(u_src, v_uv);
  vec3 rgb = unpremul(c);
  float gain = exp2(u_stops);
  vec3 lin = vec3(toLinear(rgb.r), toLinear(rgb.g), toLinear(rgb.b)) * gain;
  lin = clamp(lin, 0.0, 1.0);
  o_colour = premul(vec3(toSrgb(lin.r), toSrgb(lin.g), toSrgb(lin.b)), c.a);
}
`,
    },
    contrast: {
        id: "contrast", label: "Contrast", composite: false,
        bounds: { amount: [-1, 1] }, neutral: { amount: 0 },
        fragment: HEADER + `uniform float u_amount;
void main() {
  vec4 c = texture(u_src, v_uv);
  vec3 rgb = unpremul(c);
  o_colour = premul((rgb - 0.5) * (1.0 + u_amount) + 0.5, c.a);
}
`,
    },
    saturation: {
        id: "saturation", label: "Saturation", composite: false,
        bounds: { amount: [-1, 1] }, neutral: { amount: 0 },
        fragment: HEADER + `uniform float u_amount;
void main() {
  vec4 c = texture(u_src, v_uv);
  vec3 rgb = unpremul(c);
  float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
  o_colour = premul(mix(vec3(luma), rgb, 1.0 + u_amount), c.a);
}
`,
    },
    balance: {
        id: "balance", label: "Colour balance", composite: false,
        bounds: { warmth: [-1, 1], tint: [-1, 1] }, neutral: { warmth: 0, tint: 0 },
        fragment: HEADER + `uniform float u_warmth;
uniform float u_tint;
void main() {
  vec4 c = texture(u_src, v_uv);
  vec3 rgb = unpremul(c);
  vec3 gain = vec3(1.0 + 0.1 * u_warmth, 1.0 - 0.1 * u_tint, 1.0 - 0.1 * u_warmth);
  o_colour = premul(rgb * gain, c.a);
}
`,
    },
    matrix: {
        id: "matrix", label: "Lighting colour transform", composite: false,
        bounds: { m00: [-4, 4], m01: [-4, 4], m02: [-4, 4], m10: [-4, 4], m11: [-4, 4], m12: [-4, 4], m20: [-4, 4], m21: [-4, 4], m22: [-4, 4] },
        neutral: { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0, m20: 0, m21: 0, m22: 1 },
        fragment: HEADER + `uniform float u_m00; uniform float u_m01; uniform float u_m02;
uniform float u_m10; uniform float u_m11; uniform float u_m12;
uniform float u_m20; uniform float u_m21; uniform float u_m22;
void main() {
  vec4 c = texture(u_src, v_uv);
  vec3 rgb = unpremul(c);
  vec3 v = vec3(toLinear(rgb.r), toLinear(rgb.g), toLinear(rgb.b));
  vec3 outlin = vec3(dot(v, vec3(u_m00, u_m01, u_m02)),
    dot(v, vec3(u_m10, u_m11, u_m12)), dot(v, vec3(u_m20, u_m21, u_m22)));
  o_colour = premul(vec3(toSrgb(outlin.r), toSrgb(outlin.g), toSrgb(outlin.b)), c.a);
}
`,
    },
    composite: {
        id: "composite", label: "Masked composite", composite: true,
        bounds: { opacity: [0, 1] }, neutral: { opacity: 1 },
        fragment: `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_src;
uniform sampler2D u_layer;
uniform sampler2D u_mask;
uniform float u_opacity;
out vec4 o_colour;
void main() {
  vec4 base = texture(u_src, v_uv);
  vec4 top = texture(u_layer, v_uv);
  float m = clamp(texture(u_mask, v_uv).r * u_opacity, 0.0, 1.0);
  o_colour = mix(base, top, m);
}
`,
    },
});
export function checkParams(op, params) {
    const spec = SHADERS[op];
    if (!spec)
        throw new RangeError(`unknown GPU op ${String(op)}`);
    const out = {};
    for (const [key, [lo, hi]] of Object.entries(spec.bounds)) {
        const value = params[key] ?? spec.neutral[key];
        if (typeof value !== "number" || !Number.isFinite(value) || value < lo || value > hi) {
            throw new RangeError(`${spec.label}: ${key} must be a number from ${lo} to ${hi}`);
        }
        out[key] = value;
    }
    for (const key of Object.keys(params))
        if (!(key in spec.bounds))
            throw new RangeError(`${spec.label}: unknown setting ${key}`);
    return out;
}
export function isNeutral(op, params) {
    const p = checkParams(op, params);
    return Object.entries(SHADERS[op].neutral).every(([k, v]) => p[k] === v);
}
const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
export const toLinear = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
export const toSrgb = (c) => c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
function perPixel(src, f) {
    const out = new Float32Array(src.data.length);
    const d = src.data;
    for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3];
        if (a <= 0) {
            out[i] = out[i + 1] = out[i + 2] = out[i + 3] = 0;
            continue;
        }
        const [r, g, b] = f(d[i] / a, d[i + 1] / a, d[i + 2] / a);
        out[i] = clamp01(r) * a;
        out[i + 1] = clamp01(g) * a;
        out[i + 2] = clamp01(b) * a;
        out[i + 3] = a;
    }
    return { width: src.width, height: src.height, data: out };
}
export function cpuOp(op, src, params) {
    const p = checkParams(op, params);
    switch (op) {
        case "exposure": {
            const gain = Math.pow(2, p.stops);
            const ch = (c) => toSrgb(clamp01(toLinear(c) * gain));
            return perPixel(src, (r, g, b) => [ch(r), ch(g), ch(b)]);
        }
        case "contrast": {
            const k = 1 + p.amount;
            return perPixel(src, (r, g, b) => [(r - 0.5) * k + 0.5, (g - 0.5) * k + 0.5, (b - 0.5) * k + 0.5]);
        }
        case "saturation": {
            const k = 1 + p.amount;
            return perPixel(src, (r, g, b) => {
                const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                return [l + (r - l) * k, l + (g - l) * k, l + (b - l) * k];
            });
        }
        case "matrix": {
            return perPixel(src, (r, g, b) => {
                const x = toLinear(r), y = toLinear(g), z = toLinear(b);
                return [toSrgb(p.m00 * x + p.m01 * y + p.m02 * z),
                    toSrgb(p.m10 * x + p.m11 * y + p.m12 * z),
                    toSrgb(p.m20 * x + p.m21 * y + p.m22 * z)];
            });
        }
        case "balance": {
            const gr = 1 + 0.1 * p.warmth, gg = 1 - 0.1 * p.tint, gb = 1 - 0.1 * p.warmth;
            return perPixel(src, (r, g, b) => [r * gr, g * gg, b * gb]);
        }
    }
}
/** Premultiplied mix of base and layer by mask*opacity: no halo at alpha edges. */
export function cpuComposite(base, layer, mask, params = {}) {
    const p = checkParams("composite", params);
    if (base.width !== layer.width || base.height !== layer.height || mask.length !== base.width * base.height) {
        throw new RangeError("composite inputs must be the same size");
    }
    const out = new Float32Array(base.data.length);
    for (let px = 0; px < mask.length; px++) {
        const m = clamp01(mask[px] * p.opacity);
        for (let c = 0; c < 4; c++) {
            const i = px * 4 + c;
            out[i] = base.data[i] * (1 - m) + layer.data[i] * m;
        }
    }
    return { width: base.width, height: base.height, data: out };
}
/** Straight 8-bit RGBA to premultiplied float. */
export function fromBytes(width, height, bytes) {
    if (bytes.length !== width * height * 4)
        throw new RangeError("RGBA byte length does not match the size");
    const data = new Float32Array(bytes.length);
    for (let i = 0; i < bytes.length; i += 4) {
        const a = bytes[i + 3] / 255;
        data[i] = bytes[i] / 255 * a;
        data[i + 1] = bytes[i + 1] / 255 * a;
        data[i + 2] = bytes[i + 2] / 255 * a;
        data[i + 3] = a;
    }
    return { width, height, data };
}
/** Premultiplied float back to straight 8-bit RGBA (round half up, as GL readback does). */
export function toBytes(img) {
    const out = new Uint8ClampedArray(img.data.length);
    for (let i = 0; i < img.data.length; i += 4) {
        const a = clamp01(img.data[i + 3]);
        out[i + 3] = Math.round(a * 255);
        for (let c = 0; c < 3; c++)
            out[i + c] = a > 0 ? Math.round(clamp01(img.data[i + c] / a) * 255) : 0;
    }
    return out;
}

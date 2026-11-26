/** The develop colour pass on the GPU: one WebGL2 fragment shader, line for line the CPU
 * reference in colour.ts, run through the repo's GPU helpers (web/src/engines/gpu: the Device
 * with its context-loss handling, the capability probe and the resource pool that releases
 * every texture). Only the colour pass runs here; the spatial steps stay on the CPU.
 *
 * Inputs are exact: pixels are fetched with texelFetch (no filtering), the local base and the
 * curves table are float textures read texel by texel with the same interpolation sums as the
 * CPU. The output is an 8-bit target read back once. Agreement with the CPU is checked in a
 * real browser (web/test/editor-gpu-parity.test.mjs) and must stay within one level.
 * When WebGL2 is missing, lost, too small for the photo or fails, the CPU runs the same pass.
 * Author: John Khan.
 */
import { Device } from "../../engines/gpu/device.js";
import { probe } from "../../engines/gpu/capabilities.js";
import { GL } from "../../engines/gpu/gl.js";
import { CURVE_SIZE, HUE_CENTRES, SHOULDER_KNEE } from "./colour.js";
import { useColourRunner } from "./stack.js";
const R32F = 0x822e, RGBA32F = 0x8814;
const f = (v) => Number.isInteger(v) ? `${v}.0` : String(v);
const centres = HUE_CENTRES.map(f);
const hueSums = Array.from({ length: 8 }, (_, i) => `dh += w[${i}] * u_mh${i}; ds += w[${i}] * u_ms${i}; dl += w[${i}] * u_ml${i};`).join("\n    ");
export const VERTEX_SHADER = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;
export const COLOUR_SHADER = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D u_src;
uniform sampler2D u_base;
uniform sampler2D u_lut;
uniform float u_a_on, u_a_op, u_exposure, u_brilliance, u_highlights, u_shadows, u_contrast, u_black, u_white;
uniform float u_wb_r, u_wb_g, u_wb_b, u_sat, u_vib, u_use_base, u_base_w, u_base_h, u_base_f;
uniform float u_m_on, u_m_op, u_m_skin, u_c_on, u_c_op;
${Array.from({ length: 8 }, (_, i) => `uniform float u_mh${i}, u_ms${i}, u_ml${i};`).join("\n")}
out vec4 o_colour;

float clamp01(float v) { return clamp(v, 0.0, 1.0); }
float toLin(float c) { return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4); }
float toEnc(float l) { return l <= 0.0031308 ? l * 12.92 : 1.055 * pow(l, 1.0 / 2.4) - 0.055; }
float sstep(float e0, float e1, float x) { float t = clamp01((x - e0) / (e1 - e0)); return t * t * (3.0 - 2.0 * t); }
float shoulder(float y, float amount) {
  if (y <= ${f(SHOULDER_KNEE)}) return y;
  float k = ${f(SHOULDER_KNEE)};
  float rolled = k + (1.0 - k) * (1.0 - exp(-(y - k) / (1.0 - k)));
  float hard = y < 1.0 ? y : 1.0;
  return hard + (rolled - hard) * amount;
}
vec3 hsv(vec3 c) {
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)), d = mx - mn;
  if (d <= 0.0) return vec3(0.0, 0.0, mx);
  float h;
  if (mx == c.r) h = 60.0 * ((c.g - c.b) / d);
  else if (mx == c.g) h = 60.0 * ((c.b - c.r) / d + 2.0);
  else h = 60.0 * ((c.r - c.g) / d + 4.0);
  if (h < 0.0) h += 360.0;
  return vec3(h, mx > 0.0 ? d / mx : 0.0, mx);
}
float hsvCh(float k, float offset) { return clamp01(abs(fract(k + offset) * 6.0 - 3.0) - 1.0); }
vec3 fromHsv(float h, float s, float v) {
  float k = h / 360.0;
  return vec3(v * (1.0 + (hsvCh(k, 1.0) - 1.0) * s), v * (1.0 + (hsvCh(k, 2.0 / 3.0) - 1.0) * s), v * (1.0 + (hsvCh(k, 1.0 / 3.0) - 1.0) * s));
}
float skinWeight(vec3 c) {
  vec3 q = hsv(c);
  float d = abs(q.x - 22.0);
  if (d > 180.0) d = 360.0 - d;
  float wh = 1.0 - sstep(16.0, 28.0, d);
  float ws = sstep(0.08, 0.16, q.y) * (1.0 - sstep(0.78, 0.92, q.y));
  return wh * ws * sstep(0.08, 0.18, q.z);
}
float sCurve(float v, float g) { return v < 0.5 ? 0.5 * pow(2.0 * v, g) : 1.0 - 0.5 * pow(2.0 * (1.0 - v), g); }
vec3 mixLinear(vec3 before, vec3 after, float amount) {
  if (amount >= 1.0) return after;
  return vec3(toEnc(toLin(before.r) + (toLin(after.r) - toLin(before.r)) * amount),
    toEnc(toLin(before.g) + (toLin(after.g) - toLin(before.g)) * amount),
    toEnc(toLin(before.b) + (toLin(after.b) - toLin(before.b)) * amount));
}
float gamutLimit(vec3 c, float y) {
  float k = 1e6;
  for (int i = 0; i < 3; i++) {
    float d = c[i] - y;
    if (d > 1e-9) k = min(k, (1.0 - y) / d);
    else if (d < -1e-9) k = min(k, y / -d);
  }
  return k;
}
vec3 scaleChroma(vec3 c, float k) {
  float y = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  float limit = gamutLimit(c, y);
  float use = k > limit ? limit : k;
  return clamp(vec3(y) + (c - vec3(y)) * use, 0.0, 1.0);
}
float baseAt(ivec2 p) {
  float bw = u_base_w, bh = u_base_h;
  float fx = min(bw - 1.0, max(0.0, (float(p.x) + 0.5) / u_base_f - 0.5));
  float fy = min(bh - 1.0, max(0.0, (float(p.y) + 0.5) / u_base_f - 0.5));
  float x0 = floor(fx), y0 = floor(fy), x1 = min(bw - 1.0, x0 + 1.0), y1 = min(bh - 1.0, y0 + 1.0);
  float tx = fx - x0, ty = fy - y0;
  float a = texelFetch(u_base, ivec2(int(x0), int(y0)), 0).r, b = texelFetch(u_base, ivec2(int(x1), int(y0)), 0).r;
  float c = texelFetch(u_base, ivec2(int(x0), int(y1)), 0).r, e = texelFetch(u_base, ivec2(int(x1), int(y1)), 0).r;
  float top = a + (b - a) * tx, bottom = c + (e - c) * tx;
  return top + (bottom - top) * ty;
}
float lutAt(float v, int ch) {
  float x = clamp01(v) * ${f(CURVE_SIZE - 1)};
  float i0 = floor(x);
  float i1 = i0 + 1.0 < ${f(CURVE_SIZE)} ? i0 + 1.0 : i0;
  float t = x - i0;
  float a = texelFetch(u_lut, ivec2(int(i0), 0), 0)[ch], b = texelFetch(u_lut, ivec2(int(i1), 0), 0)[ch];
  return a + (b - a) * t;
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec3 px = texelFetch(u_src, p, 0).rgb;
  float skin = skinWeight(px);
  if (u_a_on > 0.5) {
    vec3 before = px;
    float base = u_use_base > 0.5 ? baseAt(p) : 0.5;
    float sw = clamp01(1.0 - base / 0.6); sw *= sw;
    float hw = clamp01((base - 0.4) / 0.6); hw *= hw;
    float stops = u_exposure + 1.2 * u_shadows * sw + u_highlights * hw + u_brilliance * (0.8 * sw - 0.6 * hw);
    float gain = exp2(stops), roll = clamp01(stops);
    vec3 wb = vec3(u_wb_r, u_wb_g, u_wb_b);
    for (int c = 0; c < 3; c++) px[c] = toEnc(clamp01(shoulder(toLin(px[c]) * gain, roll) * wb[c]));
    float inB = 0.12 * max(0.0, u_black), outB = 0.12 * max(0.0, -u_black);
    float inW = 1.0 - 0.12 * max(0.0, u_white), outW = 1.0 - 0.12 * max(0.0, -u_white);
    float gamma = u_contrast >= 0.0 ? 1.0 + u_contrast : 1.0 / (1.0 - 0.6 * u_contrast);
    for (int c = 0; c < 3; c++) px[c] = sCurve(outB + (outW - outB) * clamp01((px[c] - inB) / (inW - inB)), gamma);
    float mx = max(px.r, max(px.g, px.b)), mn = min(px.r, min(px.g, px.b));
    float sat = mx > 1e-6 ? (mx - mn) / mx : 0.0;
    float k = (1.0 + u_vib * (1.0 - sat) * (1.0 - 0.85 * skin)) * (1.0 + u_sat);
    if (k != 1.0) px = scaleChroma(px, k);
    px = mixLinear(before, px, u_a_op);
  }
  if (u_m_on > 0.5) {
    vec3 before = px;
    vec3 q = hsv(px);
    float gate = sstep(0.03, 0.15, q.y) * sstep(0.03, 0.12, q.z) * (u_m_skin > 0.5 ? 1.0 - 0.95 * skin : 1.0);
    float c[9] = float[9](${centres.join(", ")}, ${f(HUE_CENTRES[0] + 360)});
    float w[8] = float[8](0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
    bool found = false;
    for (int i = 0; i < 8; i++) {
      float a = c[i], b = c[i + 1];
      float hh = q.x < a ? q.x + 360.0 : q.x;
      if (!found && hh >= a && hh < b) {
        float t = (hh - a) / (b - a), st = t * t * (3.0 - 2.0 * t);
        w[i] = 1.0 - st; w[(i + 1) % 8] = st; found = true;
      }
    }
    if (!found) w[0] = 1.0;
    float dh = 0.0, ds = 0.0, dl = 0.0;
    ${hueSums}
    dh *= gate * 30.0; ds *= gate; dl *= gate * 0.9;
    if (dh != 0.0 || ds != 0.0 || dl != 0.0) {
      float hh = q.x + dh;
      if (hh < 0.0) hh += 360.0; else if (hh >= 360.0) hh -= 360.0;
      vec3 rgb = fromHsv(hh, clamp01(q.y * (1.0 + ds)), q.z);
      float gain = exp2(dl), roll = clamp01(dl);
      for (int ch = 0; ch < 3; ch++) px[ch] = toEnc(clamp01(shoulder(toLin(rgb[ch]) * gain, roll)));
      px = mixLinear(before, px, u_m_op);
    }
  }
  if (u_c_on > 0.5) {
    vec3 before = px;
    for (int ch = 0; ch < 3; ch++) px[ch] = lutAt(px[ch], ch);
    px = mixLinear(before, px, u_c_op);
  }
  o_colour = vec4(clamp(px, 0.0, 1.0), 1.0);
}
`;
export class ColourGpu {
    kind = "webgl2";
    device;
    compiled = null;
    failedGeneration = null;
    /** Why the last run used the CPU (empty after a GPU run). */
    lastReason = "";
    constructor(canvas) { this.device = canvas ? new Device(canvas) : null; }
    compile(gl, generation) {
        if (this.compiled && this.compiled.generation === generation && this.device.pool.has(this.compiled.program))
            return this.compiled;
        const pool = this.device.pool;
        const shader = (type, src) => {
            const s = gl.createShader(type);
            if (!s)
                throw new Error("could not create a shader");
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, GL.COMPILE_STATUS)) {
                const log = gl.getShaderInfoLog(s) ?? "";
                gl.deleteShader(s);
                throw new Error("colour shader did not compile: " + log.slice(0, 300));
            }
            return s;
        };
        const vs = shader(GL.VERTEX_SHADER, VERTEX_SHADER), fs = shader(GL.FRAGMENT_SHADER, COLOUR_SHADER);
        const program = gl.createProgram();
        if (!program)
            throw new Error("could not create a program");
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        if (!gl.getProgramParameter(program, GL.LINK_STATUS)) {
            const log = gl.getProgramInfoLog(program) ?? "";
            gl.deleteProgram(program);
            throw new Error("colour program did not link: " + log.slice(0, 300));
        }
        const vao = gl.createVertexArray(), buffer = gl.createBuffer();
        if (!vao || !buffer)
            throw new Error("could not create the quad");
        gl.bindVertexArray(vao);
        gl.bindBuffer(GL.ARRAY_BUFFER, buffer);
        gl.bufferData(GL.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), GL.STATIC_DRAW);
        const loc = gl.getAttribLocation(program, "a_pos");
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, GL.FLOAT, false, 0, 0);
        const locs = new Map();
        const names = ["u_src", "u_base", "u_lut", "u_a_on", "u_a_op", "u_exposure", "u_brilliance", "u_highlights", "u_shadows", "u_contrast",
            "u_black", "u_white", "u_wb_r", "u_wb_g", "u_wb_b", "u_sat", "u_vib", "u_use_base", "u_base_w", "u_base_h", "u_base_f",
            "u_m_on", "u_m_op", "u_m_skin", "u_c_on", "u_c_op", ...Array.from({ length: 8 }, (_, i) => [`u_mh${i}`, `u_ms${i}`, `u_ml${i}`]).flat()];
        for (const name of names)
            locs.set(name, gl.getUniformLocation(program, name));
        const live = () => !gl.isContextLost();
        this.compiled = {
            program: pool.own("program", program, () => { if (live())
                gl.deleteProgram(program); }, 0, "develop colour program"),
            vao: pool.own("vertex-array", vao, () => { if (live())
                gl.deleteVertexArray(vao); }, 0, "develop quad"),
            buffer: pool.own("buffer", buffer, () => { if (live())
                gl.deleteBuffer(buffer); }, 24, "develop quad buffer"),
            locs, generation,
        };
        return this.compiled;
    }
    texture(gl, internal, format, type, width, height, pixels, target) {
        const texture = gl.createTexture();
        if (!texture)
            throw new Error("could not create a texture");
        gl.bindTexture(GL.TEXTURE_2D, texture);
        for (const [k, v] of [[GL.TEXTURE_MIN_FILTER, GL.NEAREST], [GL.TEXTURE_MAG_FILTER, GL.NEAREST], [GL.TEXTURE_WRAP_S, GL.CLAMP_TO_EDGE], [GL.TEXTURE_WRAP_T, GL.CLAMP_TO_EDGE]])
            gl.texParameteri(GL.TEXTURE_2D, k, v);
        gl.pixelStorei(GL.UNPACK_ALIGNMENT, 1);
        gl.pixelStorei(GL.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(GL.TEXTURE_2D, 0, internal, width, height, 0, format, type, pixels);
        let framebuffer = null;
        if (target) {
            framebuffer = gl.createFramebuffer();
            gl.bindFramebuffer(GL.FRAMEBUFFER, framebuffer);
            gl.framebufferTexture2D(GL.FRAMEBUFFER, GL.COLOR_ATTACHMENT0, GL.TEXTURE_2D, texture, 0);
            const ok = gl.checkFramebufferStatus(GL.FRAMEBUFFER) === GL.FRAMEBUFFER_COMPLETE;
            gl.bindFramebuffer(GL.FRAMEBUFFER, null);
            if (!ok) {
                gl.deleteFramebuffer(framebuffer);
                gl.deleteTexture(texture);
                throw new Error("render target is not complete on this GPU");
            }
        }
        const handle = { texture, framebuffer };
        const bytes = width * height * (internal === GL.RGBA8 ? 4 : internal === R32F ? 4 : 16);
        return this.device.pool.own("texture", handle, () => {
            if (gl.isContextLost())
                return;
            if (handle.framebuffer)
                gl.deleteFramebuffer(handle.framebuffer);
            gl.deleteTexture(handle.texture);
        }, bytes, target ? "develop target" : "develop input");
    }
    run(rgb, width, height, u, base) {
        const gl = this.device?.gl ?? null, caps = probe(gl, { width, height });
        if (!gl || caps.path !== "gpu") {
            this.lastReason = caps.reasons.join(" ") || "The graphics path is unavailable.";
            return null;
        }
        if (this.failedGeneration === this.device.generation) {
            this.lastReason = "The graphics path failed earlier in this session.";
            return null;
        }
        const pool = this.device.pool, owned = [];
        try {
            const { program, vao, locs } = this.compile(gl, this.device.generation);
            const rgba = new Uint8Array(width * height * 4);
            for (let i = 0; i < width * height; i++) {
                rgba[i * 4] = rgb[i * 3];
                rgba[i * 4 + 1] = rgb[i * 3 + 1];
                rgba[i * 4 + 2] = rgb[i * 3 + 2];
                rgba[i * 4 + 3] = 255;
            }
            const src = this.texture(gl, GL.RGBA8, GL.RGBA, GL.UNSIGNED_BYTE, width, height, rgba, false);
            owned.push(src);
            const baseTex = base ? this.texture(gl, R32F, GL.RED, GL.FLOAT, base.width, base.height, Float32Array.from(base.data), false)
                : this.texture(gl, R32F, GL.RED, GL.FLOAT, 1, 1, new Float32Array([0.5]), false);
            owned.push(baseTex);
            const lut = new Float32Array(CURVE_SIZE * 4);
            if (u.curves)
                for (let i = 0; i < CURVE_SIZE; i++)
                    for (let c = 0; c < 3; c++)
                        lut[i * 4 + c] = u.curves.table[i * 3 + c];
            const lutTex = this.texture(gl, RGBA32F, GL.RGBA, GL.FLOAT, CURVE_SIZE, 1, lut, false);
            owned.push(lutTex);
            const dst = this.texture(gl, GL.RGBA8, GL.RGBA, GL.UNSIGNED_BYTE, width, height, null, true);
            owned.push(dst);
            gl.useProgram(program.handle);
            gl.bindVertexArray(vao.handle);
            gl.bindFramebuffer(GL.FRAMEBUFFER, dst.handle.framebuffer);
            gl.viewport(0, 0, width, height);
            [["u_src", src], ["u_base", baseTex], ["u_lut", lutTex]].forEach(([name, tex], unit) => {
                gl.activeTexture(GL.TEXTURE0 + unit);
                gl.bindTexture(GL.TEXTURE_2D, tex.handle.texture);
                gl.uniform1i(locs.get(name) ?? null, unit);
            });
            const set = (name, v) => gl.uniform1f(locs.get(name) ?? null, v);
            const a = u.adjust;
            set("u_a_on", a ? 1 : 0);
            set("u_a_op", a?.opacity ?? 1);
            set("u_exposure", a?.exposure ?? 0);
            set("u_brilliance", a?.brilliance ?? 0);
            set("u_highlights", a?.highlights ?? 0);
            set("u_shadows", a?.shadows ?? 0);
            set("u_contrast", a?.contrast ?? 0);
            set("u_black", a?.black ?? 0);
            set("u_white", a?.white ?? 0);
            set("u_wb_r", a?.wb[0] ?? 1);
            set("u_wb_g", a?.wb[1] ?? 1);
            set("u_wb_b", a?.wb[2] ?? 1);
            set("u_sat", a?.saturation ?? 0);
            set("u_vib", a?.vibrance ?? 0);
            set("u_use_base", base ? 1 : 0);
            set("u_base_w", base?.width ?? 1);
            set("u_base_h", base?.height ?? 1);
            set("u_base_f", base?.factor ?? 1);
            const m = u.mixer;
            set("u_m_on", m ? 1 : 0);
            set("u_m_op", m?.opacity ?? 1);
            set("u_m_skin", m?.skinProtect === false ? 0 : 1);
            for (let i = 0; i < 8; i++) {
                set(`u_mh${i}`, m?.hue[i] ?? 0);
                set(`u_ms${i}`, m?.sat[i] ?? 0);
                set(`u_ml${i}`, m?.lum[i] ?? 0);
            }
            set("u_c_on", u.curves ? 1 : 0);
            set("u_c_op", u.curves?.opacity ?? 1);
            gl.drawArrays(GL.TRIANGLES, 0, 3);
            gl.pixelStorei(GL.PACK_ALIGNMENT, 1);
            const back = new Uint8Array(width * height * 4);
            gl.readPixels(0, 0, width, height, GL.RGBA, GL.UNSIGNED_BYTE, back);
            gl.bindFramebuffer(GL.FRAMEBUFFER, null);
            if (gl.isContextLost())
                throw new Error("The graphics context was lost.");
            const out = new Uint8Array(width * height * 3);
            for (let i = 0; i < width * height; i++) {
                out[i * 3] = back[i * 4];
                out[i * 3 + 1] = back[i * 4 + 1];
                out[i * 3 + 2] = back[i * 4 + 2];
            }
            this.lastReason = "";
            return out;
        }
        catch (error) {
            this.failedGeneration = this.device.generation;
            this.lastReason = error instanceof Error ? error.message : String(error);
            return null;
        }
        finally {
            for (const r of owned)
                if (pool.has(r))
                    pool.release(r);
        }
    }
    /** Live GPU resources (for the leak test). */
    counts() { return this.device?.pool.counts() ?? null; }
    dispose() { this.compiled = null; this.device?.dispose(); }
}
let shared;
/** The browser's runner, made on first use (an offscreen canvas in a page or a worker). */
export function browserColourGpu() {
    if (shared !== undefined)
        return shared;
    let canvas = null;
    try {
        if (typeof OffscreenCanvas !== "undefined")
            canvas = new OffscreenCanvas(1, 1);
        else if (typeof document !== "undefined" && typeof document.createElement === "function")
            canvas = document.createElement("canvas");
    }
    catch {
        canvas = null;
    }
    shared = canvas ? new ColourGpu(canvas) : null;
    return shared;
}
/** Register the browser runner as the pipeline's default (called once by the Studio page). */
export function installColourGpu() { useColourRunner(browserColourGpu); }
//# sourceMappingURL=gpu.js.map
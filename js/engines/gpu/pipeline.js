/** Ordered colour passes on the GPU, with the CPU reference as an interchangeable backend
 * (free-library plan §5-6, P0 step 4).
 *
 * - One recipe, one pass order, for preview and export: the backends differ, the steps don't.
 * - Neutral steps are skipped, so a neutral recipe returns the photo unchanged (exactly).
 * - Masked steps render the op into a scratch target and composite it in premultiplied space.
 * - Targets are reused between renders of the same size; per-render uploads are released in
 *   `finally`, even when a render is cancelled or throws.
 * - An AbortSignal is checked before every pass; a cancelled render throws RenderAborted and
 *   never returns a half-finished image.
 * - Tiled rendering splits large photos into tiles (all P0 ops are per-pixel, so tiles need no
 *   overlap); the result equals the full-frame render.
 * Author: John Khan.
 */
import { GL } from "./gl.js";
import { ResourcePool } from "./resources.js";
import { SHADERS, VERTEX, checkParams, cpuComposite, cpuOp, isNeutral, } from "./shaders/ops.js";
export class RenderAborted extends Error {
    constructor(message = "The render was cancelled.") {
        super(message);
        this.name = "AbortError";
    }
}
export function checkImage(image) {
    if (!image || !Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 1 || image.height < 1) {
        throw new RangeError("image size must be positive whole numbers");
    }
    if (!(image.data instanceof Float32Array) || image.data.length !== image.width * image.height * 4) {
        throw new RangeError("image data must be premultiplied RGBA floats");
    }
}
export function checkSteps(steps, width, height) {
    if (!Array.isArray(steps) || steps.length > 64)
        throw new RangeError("a render takes 0 to 64 steps");
    for (const step of steps) {
        if (!step || step.op === "composite" || !(step.op in SHADERS))
            throw new RangeError(`unknown colour op ${String(step?.op)}`);
        checkParams(step.op, step.params ?? {});
        if (step.opacity !== undefined && !(Number.isFinite(step.opacity) && step.opacity >= 0 && step.opacity <= 1)) {
            throw new RangeError("opacity must be 0 to 1");
        }
        if (step.mask !== undefined) {
            if (!(step.mask instanceof Float32Array) || step.mask.length !== width * height)
                throw new RangeError("a step mask must match the photo size");
            for (const v of step.mask)
                if (!(v >= 0 && v <= 1))
                    throw new RangeError("mask values must be 0 to 1");
        }
    }
}
/** Steps that change nothing: neutral params, zero opacity or an all-zero mask. */
export function isNoOp(step) {
    if (isNeutral(step.op, step.params ?? {}))
        return true;
    if (step.opacity === 0)
        return true;
    if (step.mask) {
        for (const v of step.mask)
            if (v > 0)
                return false;
        return true;
    }
    return false;
}
export class CpuBackend {
    kind = "cpu";
    pool = new ResourcePool();
    tex(width, height, channels, data) {
        const t = { width, height, channels, data: data ?? new Float32Array(width * height * channels) };
        return this.pool.own("cpu-image", t, () => { t.data = new Float32Array(0); }, t.data.byteLength, "cpu target");
    }
    upload(image) { return this.tex(image.width, image.height, 4, Float32Array.from(image.data)); }
    uploadMask(width, height, mask) { return this.tex(width, height, 1, Float32Array.from(mask)); }
    allocate(width, height) { return this.tex(width, height, 4); }
    live(r) {
        if (!this.pool.has(r))
            throw new RangeError("target was released");
        return r.handle;
    }
    run(op, params, src, dst) {
        const s = this.live(src), d = this.live(dst);
        d.data.set(cpuOp(op, { width: s.width, height: s.height, data: s.data }, params).data);
    }
    composite(base, layer, mask, opacity, dst) {
        const b = this.live(base), l = this.live(layer), m = this.live(mask), d = this.live(dst);
        const out = cpuComposite({ width: b.width, height: b.height, data: b.data }, { width: l.width, height: l.height, data: l.data }, m.data, { opacity });
        d.data.set(out.data);
    }
    read(target) {
        const t = this.live(target);
        return { width: t.width, height: t.height, data: Float32Array.from(t.data) };
    }
}
/** Round to IEEE half precision, as an RGBA16F target stores values. */
export function toHalf(v) {
    if (!Number.isFinite(v) || v === 0)
        return v;
    const e = Math.floor(Math.log2(Math.abs(v)));
    const step = Math.pow(2, Math.max(e, -14) - 10);
    return Math.round(v / step) * step;
}
export class WebGL2Backend {
    gl;
    format;
    kind = "webgl2";
    pool;
    programs = new Map();
    quad = null;
    constructor(gl, format, pool) {
        this.gl = gl;
        this.format = format;
        this.pool = pool ?? new ResourcePool();
    }
    ensureLive() {
        if (this.gl.isContextLost())
            throw new RenderAborted("The graphics context was lost.");
    }
    texture(width, height, mask, pixels, withFramebuffer) {
        this.ensureLive();
        const gl = this.gl;
        const texture = gl.createTexture();
        if (!texture)
            throw new Error("could not create a texture");
        gl.bindTexture(GL.TEXTURE_2D, texture);
        for (const [k, v] of [[GL.TEXTURE_MIN_FILTER, GL.NEAREST], [GL.TEXTURE_MAG_FILTER, GL.NEAREST],
            [GL.TEXTURE_WRAP_S, GL.CLAMP_TO_EDGE], [GL.TEXTURE_WRAP_T, GL.CLAMP_TO_EDGE]])
            gl.texParameteri(GL.TEXTURE_2D, k, v);
        gl.pixelStorei(GL.UNPACK_ALIGNMENT, 1);
        gl.pixelStorei(GL.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); // data arrives premultiplied already
        const half = this.format === "rgba16f";
        if (mask)
            gl.texImage2D(GL.TEXTURE_2D, 0, half ? GL.R16F : GL.R8, width, height, 0, GL.RED, half ? GL.FLOAT : GL.UNSIGNED_BYTE, pixels);
        else
            gl.texImage2D(GL.TEXTURE_2D, 0, half ? GL.RGBA16F : GL.RGBA8, width, height, 0, GL.RGBA, half ? GL.FLOAT : GL.UNSIGNED_BYTE, pixels);
        let framebuffer = null;
        if (withFramebuffer) {
            framebuffer = gl.createFramebuffer();
            gl.bindFramebuffer(GL.FRAMEBUFFER, framebuffer);
            gl.framebufferTexture2D(GL.FRAMEBUFFER, GL.COLOR_ATTACHMENT0, GL.TEXTURE_2D, texture, 0);
            const status = gl.checkFramebufferStatus(GL.FRAMEBUFFER);
            gl.bindFramebuffer(GL.FRAMEBUFFER, null);
            if (status !== GL.FRAMEBUFFER_COMPLETE) {
                gl.deleteFramebuffer(framebuffer);
                gl.deleteTexture(texture);
                throw new Error("render target is not complete on this GPU");
            }
        }
        const tex = { width, height, texture, framebuffer, mask };
        const bytes = width * height * (mask ? 1 : 4) * (half ? 2 : 1);
        return this.pool.own("texture", tex, () => {
            if (gl.isContextLost())
                return;
            if (tex.framebuffer)
                gl.deleteFramebuffer(tex.framebuffer);
            gl.deleteTexture(tex.texture);
        }, bytes, mask ? "mask texture" : "colour texture");
    }
    upload(image) {
        const pixels = this.format === "rgba16f" ? Float32Array.from(image.data)
            : Uint8Array.from(image.data, (v) => Math.round(Math.min(1, Math.max(0, v)) * 255));
        return this.texture(image.width, image.height, false, pixels, true);
    }
    uploadMask(width, height, mask) {
        const pixels = this.format === "rgba16f" ? Float32Array.from(mask) : Uint8Array.from(mask, (v) => Math.round(v * 255));
        return this.texture(width, height, true, pixels, false);
    }
    allocate(width, height) { return this.texture(width, height, false, null, true); }
    compile(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        if (!shader)
            throw new Error("could not create a shader");
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, GL.COMPILE_STATUS)) {
            const log = gl.getShaderInfoLog(shader) ?? "";
            gl.deleteShader(shader);
            throw new Error("shader did not compile: " + log.slice(0, 200));
        }
        return shader;
    }
    program(op) {
        const cached = this.programs.get(op);
        if (cached && this.pool.has(cached.program))
            return cached;
        const gl = this.gl;
        const vs = this.compile(GL.VERTEX_SHADER, VERTEX), fs = this.compile(GL.FRAGMENT_SHADER, SHADERS[op].fragment);
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
            throw new Error("shader program did not link: " + log.slice(0, 200));
        }
        const owned = this.pool.own("program", program, () => { if (!gl.isContextLost())
            gl.deleteProgram(program); }, 0, `${op} program`);
        const uniforms = new Map();
        for (const name of ["u_src", "u_layer", "u_mask", ...Object.keys(SHADERS[op].bounds).map((k) => "u_" + k)]) {
            uniforms.set(name, gl.getUniformLocation(program, name));
        }
        const entry = { program: owned, uniforms };
        this.programs.set(op, entry);
        return entry;
    }
    bindQuad(program) {
        const gl = this.gl;
        if (!this.quad || !this.pool.has(this.quad.vao)) {
            const vao = gl.createVertexArray(), buffer = gl.createBuffer();
            if (!vao || !buffer)
                throw new Error("could not create the quad");
            gl.bindVertexArray(vao);
            gl.bindBuffer(GL.ARRAY_BUFFER, buffer);
            gl.bufferData(GL.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), GL.STATIC_DRAW);
            const loc = gl.getAttribLocation(program, "a_pos");
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, 2, GL.FLOAT, false, 0, 0);
            this.quad = {
                vao: this.pool.own("vertex-array", vao, () => { if (!gl.isContextLost())
                    gl.deleteVertexArray(vao); }, 0, "quad"),
                buffer: this.pool.own("buffer", buffer, () => { if (!gl.isContextLost())
                    gl.deleteBuffer(buffer); }, 24, "quad buffer"),
            };
        }
        else
            gl.bindVertexArray(this.quad.vao.handle);
    }
    live(r) {
        if (!this.pool.has(r))
            throw new RangeError("target was released");
        return r.handle;
    }
    draw(op, uniforms, textures, dst) {
        this.ensureLive();
        const gl = this.gl;
        const { program, uniforms: locs } = this.program(op);
        gl.useProgram(program.handle);
        this.bindQuad(program.handle);
        gl.bindFramebuffer(GL.FRAMEBUFFER, dst.framebuffer);
        gl.viewport(0, 0, dst.width, dst.height);
        textures.forEach(([name, tex], unit) => {
            gl.activeTexture(GL.TEXTURE0 + unit);
            gl.bindTexture(GL.TEXTURE_2D, tex.texture);
            gl.uniform1i(locs.get(name) ?? null, unit);
        });
        for (const [key, value] of Object.entries(uniforms))
            gl.uniform1f(locs.get("u_" + key) ?? null, value);
        gl.drawArrays(GL.TRIANGLES, 0, 3);
        gl.bindFramebuffer(GL.FRAMEBUFFER, null);
    }
    run(op, params, src, dst) {
        this.draw(op, params, [["u_src", this.live(src)]], this.live(dst));
    }
    composite(base, layer, mask, opacity, dst) {
        this.draw("composite", { opacity }, [["u_src", this.live(base)], ["u_layer", this.live(layer)], ["u_mask", this.live(mask)]], this.live(dst));
    }
    read(target) {
        this.ensureLive();
        const gl = this.gl, t = this.live(target);
        gl.bindFramebuffer(GL.FRAMEBUFFER, t.framebuffer);
        gl.pixelStorei(GL.PACK_ALIGNMENT, 1);
        let data;
        if (this.format === "rgba16f") {
            data = new Float32Array(t.width * t.height * 4);
            gl.readPixels(0, 0, t.width, t.height, GL.RGBA, GL.FLOAT, data);
        }
        else {
            const bytes = new Uint8Array(t.width * t.height * 4);
            gl.readPixels(0, 0, t.width, t.height, GL.RGBA, GL.UNSIGNED_BYTE, bytes);
            data = Float32Array.from(bytes, (v) => v / 255);
        }
        gl.bindFramebuffer(GL.FRAMEBUFFER, null);
        return { width: t.width, height: t.height, data };
    }
}
// ---------------------------------------------------------------------------------------------
export class Pipeline {
    backend;
    targets = null;
    disposed = false;
    revisionCounter = 0;
    constructor(backend) {
        this.backend = backend;
    }
    reusable(width, height) {
        const key = `${width}x${height}`;
        if (this.targets && this.targets.key === key && this.backend.pool.has(this.targets.ping))
            return this.targets;
        this.releaseTargets();
        this.targets = { key, ping: this.backend.allocate(width, height), pong: this.backend.allocate(width, height), scratch: this.backend.allocate(width, height) };
        return this.targets;
    }
    releaseTargets() {
        if (!this.targets)
            return;
        for (const r of [this.targets.ping, this.targets.pong, this.targets.scratch])
            if (this.backend.pool.has(r))
                this.backend.pool.release(r);
        this.targets = null;
    }
    render(image, steps, options = {}) {
        if (this.disposed)
            throw new Error("the render pipeline was disposed");
        checkImage(image);
        checkSteps(steps, image.width, image.height);
        const revision = options.revision ?? ++this.revisionCounter;
        const abortCheck = () => { if (options.signal?.aborted)
            throw new RenderAborted(); };
        abortCheck();
        const active = steps.filter((s) => !isNoOp(s));
        if (!active.length) {
            return { image: { width: image.width, height: image.height, data: Float32Array.from(image.data) }, revision, passes: 0, skipped: steps.length, backend: this.backend.kind };
        }
        const owned = [];
        try {
            const { ping, pong, scratch } = this.reusable(image.width, image.height);
            const source = this.backend.upload(image);
            owned.push(source);
            let current = source;
            let passes = 0;
            const next = () => current === ping ? pong : ping;
            for (const step of active) {
                abortCheck();
                const params = checkParams(step.op, step.params ?? {});
                const opacity = step.opacity ?? 1;
                if (!step.mask && opacity === 1) {
                    const dst = next();
                    this.backend.run(step.op, params, current, dst);
                    current = dst;
                    passes++;
                }
                else {
                    this.backend.run(step.op, params, current, scratch);
                    passes++;
                    abortCheck();
                    const maskData = step.mask ?? new Float32Array(image.width * image.height).fill(1);
                    const mask = this.backend.uploadMask(image.width, image.height, maskData);
                    owned.push(mask);
                    const dst = next();
                    this.backend.composite(current, scratch, mask, opacity, dst);
                    current = dst;
                    passes++;
                    this.backend.pool.release(mask);
                    owned.splice(owned.indexOf(mask), 1);
                }
            }
            abortCheck();
            return { image: this.backend.read(current), revision, passes, skipped: steps.length - active.length, backend: this.backend.kind };
        }
        finally {
            for (const r of owned)
                if (this.backend.pool.has(r))
                    this.backend.pool.release(r);
        }
    }
    /** Render in tiles of at most `tile` pixels a side; equal to `render` for per-pixel ops. */
    renderTiled(image, steps, tile, options = {}) {
        checkImage(image);
        checkSteps(steps, image.width, image.height);
        if (!Number.isInteger(tile) || tile < 16)
            throw new RangeError("tile size must be a whole number of at least 16");
        const out = new Float32Array(image.data.length);
        let passes = 0, skipped = 0;
        const revision = options.revision ?? ++this.revisionCounter;
        for (let y0 = 0; y0 < image.height; y0 += tile) {
            for (let x0 = 0; x0 < image.width; x0 += tile) {
                const w = Math.min(tile, image.width - x0), h = Math.min(tile, image.height - y0);
                const sub = new Float32Array(w * h * 4);
                for (let y = 0; y < h; y++)
                    sub.set(image.data.subarray(((y0 + y) * image.width + x0) * 4, ((y0 + y) * image.width + x0 + w) * 4), y * w * 4);
                const subSteps = steps.map((s) => {
                    if (!s.mask)
                        return s;
                    const m = new Float32Array(w * h);
                    for (let y = 0; y < h; y++)
                        m.set(s.mask.subarray((y0 + y) * image.width + x0, (y0 + y) * image.width + x0 + w), y * w);
                    return { ...s, mask: m };
                });
                const res = this.render({ width: w, height: h, data: sub }, subSteps, { signal: options.signal, revision });
                passes += res.passes;
                skipped += res.skipped;
                for (let y = 0; y < h; y++)
                    out.set(res.image.data.subarray(y * w * 4, (y + 1) * w * 4), ((y0 + y) * image.width + x0) * 4);
            }
        }
        return { image: { width: image.width, height: image.height, data: out }, revision, passes, skipped, backend: this.backend.kind };
    }
    dispose() {
        if (this.disposed)
            return;
        this.releaseTargets();
        this.disposed = true;
    }
}
//# sourceMappingURL=pipeline.js.map
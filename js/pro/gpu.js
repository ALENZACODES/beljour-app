import { PRO_FRAGMENT_SHADER, PRO_VERTEX_SHADER } from "./gpu-shaders.js";
import { cropMaskMapping, rasterMask } from "./masks.js";
import { CanvasProSurface, drawLabel } from "./render.js";
import { projectSource } from "./source-projection.js";
import { ProInputError, requireDimensions } from "./types.js";
export class ProGpuError extends Error {
    code;
    constructor(code) {
        super("Local GPU editing is unavailable. The CPU renderer may be used instead.");
        this.code = code;
        this.name = "ProGpuError";
    }
}
function requireGlObject(value, code) {
    if (value === null)
        throw new ProGpuError(code);
    return value;
}
/** RGBA8 image-table bytes. Each texel holds R[x], G[x], B[x], 255. */
export function packedCurveTable(curves) {
    const table = new Uint8Array(256 * 4);
    for (let i = 0; i < 256; i++) {
        const offset = i * 4;
        table[offset] = curves.red[i];
        table[offset + 1] = curves.green[i];
        table[offset + 2] = curves.blue[i];
        table[offset + 3] = 255;
    }
    return table;
}
export class ProGpuPass {
    gl;
    shaders = [];
    textures = [];
    buffers = [];
    vertexArrays = [];
    program = null;
    disposed = false;
    renders = 0;
    released = { programs: 0, shaders: 0, textures: 0, buffers: 0, arrays: 0 };
    constructor(gl) {
        this.gl = gl;
        try {
            this.install();
        }
        catch (error) {
            this.dispose();
            throw error;
        }
    }
    get renderCount() {
        return this.renders;
    }
    get stats() {
        return {
            releasedPrograms: this.released.programs,
            releasedShaders: this.released.shaders,
            releasedTextures: this.released.textures,
            releasedBuffers: this.released.buffers,
            releasedVertexArrays: this.released.arrays,
        };
    }
    compile(kind, source) {
        const gl = this.gl;
        const shader = requireGlObject(gl.createShader(kind), "PRO_GPU_SHADER_ALLOCATION");
        this.shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            throw new ProGpuError("PRO_GPU_SHADER_COMPILE");
        }
        return shader;
    }
    texture() {
        const gl = this.gl;
        const texture = requireGlObject(gl.createTexture(), "PRO_GPU_TEXTURE_ALLOCATION");
        this.textures.push(texture);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return texture;
    }
    install() {
        const gl = this.gl;
        const vertex = this.compile(gl.VERTEX_SHADER, PRO_VERTEX_SHADER);
        const fragment = this.compile(gl.FRAGMENT_SHADER, PRO_FRAGMENT_SHADER);
        this.program = requireGlObject(gl.createProgram(), "PRO_GPU_PROGRAM_ALLOCATION");
        gl.attachShader(this.program, vertex);
        gl.attachShader(this.program, fragment);
        gl.linkProgram(this.program);
        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            throw new ProGpuError("PRO_GPU_PROGRAM_LINK");
        }
        const vertexArray = requireGlObject(gl.createVertexArray(), "PRO_GPU_VERTEX_ARRAY");
        this.vertexArrays.push(vertexArray);
        gl.bindVertexArray(vertexArray);
        const buffer = requireGlObject(gl.createBuffer(), "PRO_GPU_BUFFER_ALLOCATION");
        this.buffers.push(buffer);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        for (let i = 0; i < 3; i++)
            this.texture();
        gl.useProgram(this.program);
        const uniforms = ["frameImage", "curveTable", "maskImage"];
        const program = this.program;
        uniforms.forEach((name, slot) => {
            const location = gl.getUniformLocation(program, name);
            if (location === null)
                throw new ProGpuError("PRO_GPU_UNIFORM");
            gl.uniform1i(location, slot);
        });
    }
    /** Upload an already-projected 2D canvas and one top-first mask byteplane.
     * WebGL canvas pixel coordinates count upwards; typed mask rows count downwards.
     * The fragment shader reverses mask Y, while UNPACK_FLIP_Y_WEBGL handles the
     * canvas source. Nearest texelFetch mirrors the CPU byte LUT.
     */
    draw(frame, width, height, curves, mask) {
        if (this.disposed || this.program === null)
            throw new ProGpuError("PRO_GPU_DISPOSED");
        requireDimensions(width, height);
        if (mask.length !== width * height) {
            throw new ProInputError("GPU mask dimensions do not match the photo", "PRO_MASK_INVALID");
        }
        if (curves.red.length !== 256 || curves.green.length !== 256 || curves.blue.length !== 256) {
            throw new ProInputError("Each tone LUT must contain 256 entries", "PRO_CURVE_INVALID");
        }
        const gl = this.gl;
        gl.viewport(0, 0, width, height);
        gl.disable(gl.BLEND);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(this.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.textures[0]);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.textures[1]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, packedCurveTable(curves));
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.textures[2]);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, width, height, 0, gl.RED, gl.UNSIGNED_BYTE, Uint8Array.from(mask));
        gl.bindVertexArray(this.vertexArrays[0]);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        const error = gl.getError();
        if (error !== gl.NO_ERROR || gl.isContextLost()) {
            throw new ProGpuError("PRO_GPU_RENDER_FAILED");
        }
        this.renders++;
    }
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        const gl = this.gl;
        gl.bindVertexArray(null);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        gl.useProgram(null);
        for (const texture of this.textures.splice(0)) {
            gl.deleteTexture(texture);
            this.released.textures++;
        }
        for (const buffer of this.buffers.splice(0)) {
            gl.deleteBuffer(buffer);
            this.released.buffers++;
        }
        for (const array of this.vertexArrays.splice(0)) {
            gl.deleteVertexArray(array);
            this.released.arrays++;
        }
        if (this.program !== null) {
            gl.deleteProgram(this.program);
            this.program = null;
            this.released.programs++;
        }
        for (const shader of this.shaders.splice(0)) {
            gl.deleteShader(shader);
            this.released.shaders++;
        }
    }
}
function newCanvas(width, height) {
    if (typeof OffscreenCanvas !== "undefined")
        return new OffscreenCanvas(width, height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
}
function context2d(canvas) {
    const context = canvas.getContext("2d");
    if (!context)
        throw new ProInputError("Local canvas is unavailable", "PRO_CANVAS_MISSING");
    return context;
}
/** A surface with the existing 2D encoder and original Simulation label.
 * Any GPU failure is recovered by drawing the entire photo via the CPU oracle;
 * no partly rendered GPU result is exported and no output is uploaded.
 */
export class GpuProSurface {
    fallback;
    canvas;
    gpuEnabled = true;
    lastBackend = "cpu";
    constructor(width, height) {
        this.fallback = new CanvasProSurface(width, height);
        this.canvas = this.fallback.canvas;
    }
    get backend() {
        return this.lastBackend;
    }
    draw(source, geometry, curves, label, matte, masks = []) {
        if (curves.neutral || !this.gpuEnabled) {
            this.lastBackend = "cpu";
            this.fallback.draw(source, geometry, curves, label, matte, masks);
            return;
        }
        let pipeline = null;
        try {
            const projected = newCanvas(geometry.width, geometry.height);
            projectSource(context2d(projected), source, geometry, false);
            const glCanvas = newCanvas(geometry.width, geometry.height);
            const gl = glCanvas.getContext("webgl2", {
                preserveDrawingBuffer: true,
                premultipliedAlpha: false,
                alpha: true,
            });
            if (!gl)
                throw new ProGpuError("PRO_GPU_UNAVAILABLE");
            pipeline = new ProGpuPass(gl);
            const coverage = masks.length === 0
                ? new Uint8Array(geometry.width * geometry.height).fill(255)
                : rasterMask(masks, geometry.width, geometry.height, cropMaskMapping(geometry, source.width, source.height));
            pipeline.draw(projected, geometry.width, geometry.height, curves, coverage);
            const ctx = context2d(this.canvas);
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, geometry.width, geometry.height);
            if (matte) {
                ctx.fillStyle = "#fff";
                ctx.fillRect(0, 0, geometry.width, geometry.height);
            }
            ctx.drawImage(glCanvas, 0, 0);
            if (label)
                drawLabel(ctx, label, geometry.width, geometry.height);
            this.lastBackend = "gpu";
        }
        catch {
            this.gpuEnabled = false;
            this.lastBackend = "cpu";
            this.fallback.draw(source, geometry, curves, label, matte, masks);
        }
        finally {
            pipeline?.dispose();
        }
    }
    encode(mime, quality) {
        return this.fallback.encode(mime, quality);
    }
}

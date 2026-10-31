const VERT = `#version 300 es
in vec2 pos;
out vec2 uv;
void main() {
  uv = vec2((pos.x + 1.0) * 0.5, 1.0 - (pos.y + 1.0) * 0.5);
  gl_Position = vec4(pos, 0.0, 1.0);
}`;
const FRAG = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 color;
uniform sampler2D frame;
uniform sampler2D masks;
uniform vec3 dSkin;
uniform vec3 dLips;
uniform vec3 dCheeks;

vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 toSrgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float f(float t) { return t > 0.008856 ? pow(t, 1.0 / 3.0) : 7.787 * t + 16.0 / 116.0; }
float finv(float t) { float t3 = t * t * t; return t3 > 0.008856 ? t3 : (t - 16.0 / 116.0) / 7.787; }

vec3 rgbToLab(vec3 rgb) {
  vec3 l = toLinear(rgb);
  float x = dot(l, vec3(0.4124564, 0.3575761, 0.1804375)) / 0.95047;
  float y = dot(l, vec3(0.2126729, 0.7151522, 0.0721750));
  float z = dot(l, vec3(0.0193339, 0.1191920, 0.9503041)) / 1.08883;
  float fx = f(x), fy = f(y), fz = f(z);
  return vec3(116.0 * fy - 16.0, 500.0 * (fx - fy), 200.0 * (fy - fz));
}

vec3 labToRgb(vec3 lab) {
  float fy = (lab.x + 16.0) / 116.0;
  float fx = fy + lab.y / 500.0;
  float fz = fy - lab.z / 200.0;
  vec3 xyz = vec3(finv(fx) * 0.95047, finv(fy), finv(fz) * 1.08883);
  vec3 lin = vec3(
    dot(xyz, vec3(3.2404542, -1.5371385, -0.4985314)),
    dot(xyz, vec3(-0.9692660, 1.8760108, 0.0415560)),
    dot(xyz, vec3(0.0556434, -0.2040259, 1.0572252)));
  return toSrgb(clamp(lin, 0.0, 1.0));
}

void main() {
  vec4 src = texture(frame, uv);
  vec3 m = texture(masks, uv).rgb;
  if (m.r + m.g + m.b < 0.002) { color = src; return; }
  vec3 lab = rgbToLab(src.rgb) + m.r * dSkin + m.g * dLips + m.b * dCheeks;
  color = vec4(labToRgb(lab), 1.0);
}`;
export class ReelGpuError extends Error {
    code;
    constructor(code) {
        super("The local reel colour pass is unavailable");
        this.code = code;
        this.name = "ReelGpuError";
    }
}
/** Lifetime is explicit: the caller must invoke dispose() in a finally block.
 * All GL allocations, including those before a compile/link failure, are owned.
 * No global WebGL state or frame textures are retained after dispose().
 */
export class ColourPass {
    canvas;
    gl;
    shaders = [];
    textures = [];
    buffers = [];
    vertexArrays = [];
    prog = null;
    disposed = false;
    loc = {};
    freed = { shaders: 0, programs: 0, buffers: 0, textures: 0, arrays: 0 };
    constructor(canvas) {
        this.canvas = canvas;
        const gl = canvas.getContext("webgl2", {
            preserveDrawingBuffer: true,
            premultipliedAlpha: false,
        });
        if (!gl)
            throw new ReelGpuError("REEL_GPU_UNAVAILABLE");
        this.gl = gl;
        try {
            this.setup();
        }
        catch (error) {
            this.dispose();
            throw error;
        }
    }
    get resources() {
        return {
            shaders: this.freed.shaders,
            programs: this.freed.programs,
            buffers: this.freed.buffers,
            textures: this.freed.textures,
            vertexArrays: this.freed.arrays,
            disposed: this.disposed,
        };
    }
    compile(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        if (!shader)
            throw new ReelGpuError("REEL_GPU_SHADER_ALLOCATION");
        this.shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            throw new ReelGpuError("REEL_GPU_SHADER_COMPILE");
        }
        return shader;
    }
    texture() {
        const gl = this.gl;
        const texture = gl.createTexture();
        if (!texture)
            throw new ReelGpuError("REEL_GPU_TEXTURE_ALLOCATION");
        this.textures.push(texture);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return texture;
    }
    setup() {
        const gl = this.gl;
        const vertex = this.compile(gl.VERTEX_SHADER, VERT);
        const fragment = this.compile(gl.FRAGMENT_SHADER, FRAG);
        const program = gl.createProgram();
        if (!program)
            throw new ReelGpuError("REEL_GPU_PROGRAM_ALLOCATION");
        this.prog = program;
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new ReelGpuError("REEL_GPU_PROGRAM_LINK");
        }
        const vertexArray = gl.createVertexArray();
        if (!vertexArray)
            throw new ReelGpuError("REEL_GPU_VERTEX_ARRAY");
        this.vertexArrays.push(vertexArray);
        gl.bindVertexArray(vertexArray);
        const buffer = gl.createBuffer();
        if (!buffer)
            throw new ReelGpuError("REEL_GPU_BUFFER_ALLOCATION");
        this.buffers.push(buffer);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const position = gl.getAttribLocation(program, "pos");
        if (position < 0)
            throw new ReelGpuError("REEL_GPU_ATTRIBUTE");
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        this.texture();
        this.texture();
        gl.useProgram(program);
        for (const [name, index] of [["frame", 0], ["masks", 1]]) {
            const location = gl.getUniformLocation(program, name);
            if (!location)
                throw new ReelGpuError("REEL_GPU_UNIFORM");
            this.loc[name] = location;
            gl.uniform1i(location, index);
        }
        for (const name of ["dSkin", "dLips", "dCheeks"]) {
            const location = gl.getUniformLocation(program, name);
            if (!location)
                throw new ReelGpuError("REEL_GPU_UNIFORM");
            this.loc[name] = location;
        }
    }
    render(frame, masks, d) {
        if (this.disposed || !this.prog)
            throw new ReelGpuError("REEL_GPU_DISPOSED");
        const gl = this.gl;
        if (gl.isContextLost())
            throw new ReelGpuError("REEL_GPU_CONTEXT_LOST");
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.useProgram(this.prog);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.textures[0]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.textures[1]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, masks);
        gl.uniform3fv(this.loc.dSkin, d.skin);
        gl.uniform3fv(this.loc.dLips, d.lips);
        gl.uniform3fv(this.loc.dCheeks, d.cheeks);
        gl.bindVertexArray(this.vertexArrays[0]);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        if (gl.getError() !== gl.NO_ERROR)
            throw new ReelGpuError("REEL_GPU_RENDER_FAILED");
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
            this.freed.textures++;
        }
        for (const buffer of this.buffers.splice(0)) {
            gl.deleteBuffer(buffer);
            this.freed.buffers++;
        }
        for (const array of this.vertexArrays.splice(0)) {
            gl.deleteVertexArray(array);
            this.freed.arrays++;
        }
        if (this.prog) {
            gl.deleteProgram(this.prog);
            this.prog = null;
            this.freed.programs++;
        }
        for (const shader of this.shaders.splice(0)) {
            gl.deleteShader(shader);
            this.freed.shaders++;
        }
    }
}

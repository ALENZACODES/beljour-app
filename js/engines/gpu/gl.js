/** The slice of WebGL2 this app uses, as a structural type, plus the numeric constants.
 * Keeping it small lets tests run the real pipeline code against a recording fake in node,
 * and makes it obvious which GPU features the editor depends on. Author: John Khan.
 */
export const GL = Object.freeze({
    TEXTURE_2D: 0x0de1, TEXTURE0: 0x84c0, RGBA: 0x1908, RGBA8: 0x8058, RGBA16F: 0x881a, R8: 0x8229, R16F: 0x822d, RED: 0x1903,
    UNSIGNED_BYTE: 0x1401, FLOAT: 0x1406, HALF_FLOAT: 0x140b, TEXTURE_MIN_FILTER: 0x2801, TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802, TEXTURE_WRAP_T: 0x2803, NEAREST: 0x2600, LINEAR: 0x2601, CLAMP_TO_EDGE: 0x812f,
    FRAMEBUFFER: 0x8d40, COLOR_ATTACHMENT0: 0x8ce0, FRAMEBUFFER_COMPLETE: 0x8cd5, ARRAY_BUFFER: 0x8892,
    STATIC_DRAW: 0x88e4, TRIANGLES: 0x0004, VERTEX_SHADER: 0x8b31, FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81, LINK_STATUS: 0x8b82, MAX_TEXTURE_SIZE: 0x0d33, MAX_RENDERBUFFER_SIZE: 0x84e8,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241, UNPACK_FLIP_Y_WEBGL: 0x9240, PACK_ALIGNMENT: 0x0d05,
    UNPACK_ALIGNMENT: 0x0cf5, NO_ERROR: 0,
});
//# sourceMappingURL=gl.js.map
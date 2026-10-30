/** Original shader pair: quantized display-encoded RGB LUT, 8-bit mask coverage.
 * The output framebuffer is unpremultiplied. Transparent source pixels are not
 * recoloured. The CPU oracle is blendMaskedPixels in masks.ts.
 */
export const PRO_VERTEX_SHADER = `#version 300 es
precision highp float;
layout(location = 0) in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}`;
export const PRO_FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D frameImage;
uniform sampler2D curveTable;
uniform sampler2D maskImage;
out vec4 outputColour;
void main() {
  ivec2 position = ivec2(gl_FragCoord.xy);
  vec4 original = texelFetch(frameImage, position, 0);
  int maskHeight = textureSize(maskImage, 0).y;
  ivec2 maskPosition = ivec2(position.x, maskHeight - 1 - position.y);
  float coverage = texelFetch(maskImage, maskPosition, 0).r;
  if (coverage <= 0.0 || original.a <= 0.0) {
    outputColour = original;
    return;
  }
  ivec3 indices = ivec3(round(original.rgb * 255.0));
  float red = texelFetch(curveTable, ivec2(indices.r, 0), 0).r;
  float green = texelFetch(curveTable, ivec2(indices.g, 0), 0).g;
  float blue = texelFetch(curveTable, ivec2(indices.b, 0), 0).b;
  outputColour = vec4(mix(original.rgb, vec3(red, green, blue), coverage), original.a);
}`;
//# sourceMappingURL=gpu-shaders.js.map
/** Cross-language byte digest parity against an independent Python reference.
 * Checked source art is procedural, not a user face. Author: John Khan.
 */
import { resizeNeutralTiled } from './neutral-resize.js';
import { referenceNeutralResize } from './neutral-reference.js';
const VECTORS = [
    { width: 1, height: 1, channels: 3, scale: 2,
        sha256: '8527c6ed7e9607e1290503a1bcba9f5c64961ad88836518336080e850f41799e' },
    { width: 1, height: 1, channels: 3, scale: 4,
        sha256: '9417406b04fba445f08ca030842b43b3112038ff62702a59dbe6d8b285442a60' },
    { width: 1, height: 1, channels: 4, scale: 2,
        sha256: 'cda4229e59bce1cf867b4d0ef45baf5f3c71a88e4b7090daecdf3c20523b8f23' },
    { width: 1, height: 1, channels: 4, scale: 4,
        sha256: 'b28ff0e0ed1498403a8d5724e1ad2397c1db0d165b61b9b3bc70c34f1bc1c2be' },
    { width: 3, height: 5, channels: 3, scale: 2,
        sha256: '716aa2042a9be54b1525cf5d0444a79a87453fdd378dfee47a8d6f1fabb232a7' },
    { width: 3, height: 5, channels: 3, scale: 4,
        sha256: '7b5f300a244bc2cc575c5685e854c4954e09d0267450611d0d852ddb5849e7f3' },
    { width: 3, height: 5, channels: 4, scale: 2,
        sha256: '953265f07c76018bab9c0333c56cce05c3edeb7e25e8b98361c8cace1c644809' },
    { width: 3, height: 5, channels: 4, scale: 4,
        sha256: '8dcd88a2a5d45caa958fe106eb0fde70b700f0d0b5f5bff4aeb2b1dde11a0eb2' },
    { width: 9, height: 7, channels: 3, scale: 2,
        sha256: '1ea3a9806cdfe977c5a3a310d2200164b15489a82f8e8dd6dac5282d3150c01a' },
    { width: 9, height: 7, channels: 3, scale: 4,
        sha256: 'c5d244b625d6ead4c3c394d13e48d74c2c791af5b92c7c1fd00c902581946652' },
    { width: 9, height: 7, channels: 4, scale: 2,
        sha256: '933bbd77ea9f17e5597d2206a643d22c81e4b9901d27daf8fe1e6d08014e1904' },
    { width: 9, height: 7, channels: 4, scale: 4,
        sha256: '038a965258a6ab130d2f594cf9751125641e8bdbf1db4ec11f7b12b9b0779261' },
    { width: 17, height: 13, channels: 3, scale: 2,
        sha256: '8b13148895914e644646563e8ce4d5a0165b4d17efb4290d05caa68348697293' },
    { width: 17, height: 13, channels: 3, scale: 4,
        sha256: 'ad6553a6f75ccdf930eaef1b7fcbd87a9d3fbda3890fff38121a629ef12b183c' },
    { width: 17, height: 13, channels: 4, scale: 2,
        sha256: '8796a2ddf361881260beb7d40cdfe8f77bd71ad213a4bd7d059b7f7354834c4c' },
    { width: 17, height: 13, channels: 4, scale: 4,
        sha256: 'ba57326824274e971164d09faac7148d015c919b91e42fbce8ac4495602391f0' },
];
function synthetic(width, height, channels) {
    const pixels = new Uint8Array(width * height * channels);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * channels;
            pixels[i] = (x * 13 + y * 29 + 41) % 256;
            pixels[i + 1] = (x * 41 + y * 11 + 17) % 256;
            pixels[i + 2] = (x * 37 + y * 23 + 59) % 256;
            if (channels === 4)
                pixels[i + 3] = (x * 7 + y * 31 + 83) % 256;
        }
    }
    if (channels === 4)
        pixels.set([255, 4, 250, 0], 0);
    return { width, height, channels, pixels };
}
async function checksum(bytes) {
    const copied = new Uint8Array(bytes);
    const hash = await crypto.subtle.digest('SHA-256', copied);
    return [...new Uint8Array(hash)].map((part) => part.toString(16).padStart(2, '0')).join('');
}
export async function testNeutralParityR10H() {
    let checks = 0;
    for (const entry of VECTORS) {
        const photo = synthetic(entry.width, entry.height, entry.channels);
        const before = new Uint8Array(photo.pixels);
        const independent = referenceNeutralResize(photo, entry.scale);
        const tiled = resizeNeutralTiled(photo, entry.scale, 16).image;
        const digest = await checksum(tiled.pixels);
        if (digest !== entry.sha256)
            throw new Error('Cross-language neutral digest mismatch');
        if (tiled.width !== independent.width || tiled.height !== independent.height ||
            tiled.pixels.some((part, index) => part !== independent.pixels[index])) {
            throw new Error('Neutral tiled result differs from scalar baseline');
        }
        if (photo.pixels.some((part, index) => part !== before[index])) {
            throw new Error('Neutral resize modified original pixels');
        }
        checks += 3;
    }
    return checks;
}
//# sourceMappingURL=test-neutral-parity-r10h.js.map
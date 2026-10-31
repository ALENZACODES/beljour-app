/** Local enamel-like brightening with warmth; never edits mouth gaps or gums.
 * Mirrors api/plumb_api/engines/teeth/whiten.py. Author: John Khan.
 */
import { blank, finitePhotograph, median, readLab, validate, writeLab } from "../beauty/effect-core.js";
export const LABEL = "Teeth colour simulation, not dental treatment or a whitening prediction.";
export function whiten(image, opening, strength = 100) {
    validate(image, opening, strength);
    finitePhotograph(image);
    const result = blank(image, "mouth closed or not observed");
    if (strength === 0)
        return result;
    const lab = new Array(image.width * image.height);
    const interior = [];
    let candidates = 0;
    for (let i = 0; i < lab.length; i++) {
        const value = readLab(image, i);
        lab[i] = value;
        if (opening[i] >= 0.5) {
            candidates++;
            interior.push(value[0]);
        }
    }
    if (candidates < 8)
        return result;
    const cutoff = Math.max(52, median(interior) + 5);
    for (let i = 0; i < lab.length; i++) {
        const [l, a, b] = lab[i];
        if (opening[i] < 0.5 || l < cutoff || Math.hypot(a, b) >= 25)
            continue;
        const amount = strength / 100;
        const shifted = [l + amount * Math.min(8, Math.max(0, 95 - l)), a,
            Math.max(4, b + amount * (6 - b))];
        writeLab(result.image, i, shifted);
        result.alpha[i] = amount;
        result.changed++;
    }
    result.reason = result.changed ? "measured local edit" : "no enamel-like pixels inside opening";
    return result;
}

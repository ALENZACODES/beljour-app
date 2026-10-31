export function checkedTurnWeights(weights, width, height) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 ||
        weights.length !== width * height) {
        return { module: "warp_turn", refused: true, code: "invalid_geometry", message: "weight dimensions are invalid" };
    }
    for (let i = 0; i < weights.length; i++) {
        if (!Number.isFinite(weights[i]) || weights[i] < 0 || weights[i] > 1) {
            return { module: "warp_turn", refused: true, code: "invalid_weights", message: "weights must be finite and in [0, 1]" };
        }
    }
    return { module: "warp_turn", refused: false, weights: new Float32Array(weights) };
}

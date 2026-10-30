export function evidenceForLayer(item, index) {
    const running = Boolean(item.enabled && item.strength > 0 && item.opacity > 0);
    const scope = item.provenance === "youcam" ? "provider" : "on-device";
    const status = !running ? "Hidden" : scope === "provider" ? "YouCam result"
        : item.kind === "filters" ? "Local look" : item.simulation ? "Local simulation" : "Local correction";
    return { id: item.id, name: item.name, scope, display: status, running,
        simulation: item.simulation, position: index + 1, strength: item.strength, opacity: item.opacity };
}
export function documentEvidence(source, stack) {
    const layers = stack.map(evidenceForLayer);
    const localCount = layers.filter((row) => row.scope === "on-device").length;
    const providerCount = layers.filter((row) => row.scope === "provider").length;
    const hiddenCount = layers.filter((row) => !row.running).length;
    const simulationCount = layers.filter((row) => row.running && row.simulation).length;
    const activeCount = layers.filter((row) => row.running).length;
    const warnings = [];
    if (providerCount)
        warnings.push("Provider results can only arrive through a separate consented YouCam task.");
    if (source.kind === "uploaded" && source.crown)
        warnings.push("Crown shape was placed manually; the fibre coverage reading is an estimate.");
    if (source.kind === "uploaded" && source.body)
        warnings.push("Body control points and the person area are approximate. Photo edit, not medical advice.");
    if (source.kind === "uploaded" && !source.face && stack.some((item) => item.kind === "beard")) {
        warnings.push("Beard renders require a verified 478-point face fixture, which is not available for this source.");
    }
    if (simulationCount)
        warnings.push("These appearance edits are photo simulations, not physical outcomes.");
    const badges = [source.kind === "sample" ? "Drawn example" : "On-device photo",
        // The same total every counter shows (layers.ts countLine); provider and hidden layers are named below.
        `${stack.length} layer${stack.length === 1 ? "" : "s"}`];
    if (providerCount)
        badges.push(`${providerCount} provider result${providerCount === 1 ? "" : "s"}`);
    if (hiddenCount)
        badges.push(`${hiddenCount} hidden`);
    if (simulationCount)
        badges.push("Simulation");
    return { source: source.kind === "sample" ? "drawn sample" : "user photo", localCount, providerCount,
        hiddenCount, activeCount, simulationCount,
        flow: providerCount ? "provider work requires a separate consented task" : "stays on this device",
        warnings, badges, layers };
}
//# sourceMappingURL=evidence.js.map
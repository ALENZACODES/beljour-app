const MAX_PIXELS = 16_777_216;
function checkedPhoto(source) {
    if (!Number.isInteger(source.width) || !Number.isInteger(source.height) ||
        source.width < 2 || source.height < 2 ||
        source.width * source.height > MAX_PIXELS ||
        source.data.length !== source.width * source.height * source.channels ||
        (source.channels !== 3 && source.channels !== 4) ||
        !(source.data instanceof Uint8Array || source.data instanceof Uint8ClampedArray)) {
        throw new RangeError("audit needs a bounded uint8 RGB(A) source");
    }
}
function checkedMask(mask, count) {
    if (!(mask instanceof Float32Array || mask instanceof Uint8Array) || mask.length !== count) {
        throw new RangeError("full-size numeric person mask required");
    }
    for (const value of mask) {
        if (!Number.isFinite(value) || value < 0 || value > 1) {
            throw new RangeError("mask values must be finite fractions");
        }
    }
}
export function auditPersonEdit(before, after, selected, bystanders = [], requireChange = false) {
    if (typeof requireChange !== "boolean")
        throw new TypeError("requireChange must be boolean");
    checkedPhoto(before);
    checkedPhoto(after);
    if (before.width !== after.width || before.height !== after.height ||
        before.channels !== after.channels)
        throw new RangeError("mismatched before/after images");
    const count = before.width * before.height;
    checkedMask(selected, count);
    for (const mask of bystanders)
        checkedMask(mask, count);
    let selectedSeen = 0;
    let selectedPixels = 0;
    let protectedPixels = 0;
    let insideChanges = 0;
    let outsideChanges = 0;
    let bystanderChanges = 0;
    let alphaChanges = 0;
    for (let index = 0; index < count; index++) {
        const permitted = selected[index] > 0;
        const protectedPerson = bystanders.some((mask) => mask[index] > 0);
        if (permitted)
            selectedSeen++;
        if (protectedPerson)
            protectedPixels++;
        const editable = permitted && !protectedPerson;
        if (editable)
            selectedPixels++;
        const offset = index * before.channels;
        const rgbChanged = before.data[offset] !== after.data[offset] ||
            before.data[offset + 1] !== after.data[offset + 1] ||
            before.data[offset + 2] !== after.data[offset + 2];
        if (before.channels === 4 && before.data[offset + 3] !== after.data[offset + 3])
            alphaChanges++;
        if (rgbChanged && editable)
            insideChanges++;
        if (rgbChanged && !editable)
            outsideChanges++;
        if (rgbChanged && protectedPerson)
            bystanderChanges++;
    }
    if (!selectedSeen)
        throw new RangeError("nonempty selected-person mask is required");
    let status = "isolated";
    if (outsideChanges || alphaChanges)
        status = "isolation_failed";
    else if (!selectedPixels)
        status = "selection_fully_protected";
    else if (requireChange && !insideChanges)
        status = "no_measured_effect";
    return {
        status,
        passed: status === "isolated",
        pixels: count,
        selected_pixels: selectedPixels,
        protected_pixels: protectedPixels,
        changed_in_selection: insideChanges,
        changed_outside_selection: outsideChanges,
        changed_bystanders: bystanderChanges,
        changed_alpha: alphaChanges,
    };
}

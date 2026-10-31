/** Capture the pointer if the browser allows it; true when captured. */
export function capturePointer(element, pointerId) {
    try {
        element.setPointerCapture?.(pointerId);
        return typeof element.setPointerCapture === "function";
    }
    catch {
        return false;
    }
}

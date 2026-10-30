/** Additive navigation hook for the parallel workstream. Author: John Khan. */
export function installEyesBrowsLink(container) {
    if (!container || container.querySelector("[data-eyes-brows-link]"))
        return;
    const link = document.createElement("a");
    link.href = "eyes-brows.html";
    link.textContent = "Eyes, brows & art";
    link.dataset.eyesBrowsLink = "true";
    link.className = "eb-entry-link";
    link.setAttribute("aria-label", "Open local eyes, brows and original art simulations");
    container.append(link);
}
//# sourceMappingURL=install.js.map
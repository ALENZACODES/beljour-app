export function projectSource(ctx, source, geometry, matte) {
    const { width, height, rect } = geometry;
    ctx.save();
    try {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, width, height);
        if (matte) {
            ctx.fillStyle = "#fff";
            ctx.fillRect(0, 0, width, height);
        }
        ctx.translate(width / 2, height / 2);
        ctx.scale(width / geometry.projectedWidth, height / geometry.projectedHeight);
        ctx.rotate(geometry.radians);
        ctx.translate(-rect.x - rect.width / 2, -rect.y - rect.height / 2);
        ctx.beginPath();
        ctx.rect(rect.x, rect.y, rect.width, rect.height);
        ctx.clip();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(source.image, 0, 0, source.width, source.height);
    }
    finally {
        ctx.restore();
    }
}

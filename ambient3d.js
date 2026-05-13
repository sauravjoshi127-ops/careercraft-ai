function initAmbient() {
    const glows = document.querySelectorAll('.glow-circle');
    if (glows.length === 0) return;

    let mouseX = 0;
    let mouseY = 0;
    let targetX = 0;
    let targetY = 0;

    document.addEventListener('mousemove', (e) => {
        mouseX = (e.clientX / window.innerWidth) * 2 - 1;
        mouseY = (e.clientY / window.innerHeight) * 2 - 1;
    });

    function animate() {
        targetX += (mouseX - targetX) * 0.05;
        targetY += (mouseY - targetY) * 0.05;

        glows.forEach((glow) => {
            const depth = (glow.classList.contains('glow-1') ? 60 : -40); 
            const x = targetX * depth;
            const y = targetY * depth;
            const scale = 1 + Math.abs(targetX * 0.05);
            glow.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
        });
        requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAmbient);
} else {
    initAmbient();
}

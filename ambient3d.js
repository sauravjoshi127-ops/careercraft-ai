document.addEventListener('DOMContentLoaded', () => {
    const glows = document.querySelectorAll('.glow-circle');
    
    if (glows.length === 0) return;

    let mouseX = 0;
    let mouseY = 0;
    let targetX = 0;
    let targetY = 0;

    document.addEventListener('mousemove', (e) => {
        // Normalize mouse coordinates from -1 to 1
        mouseX = (e.clientX / window.innerWidth) * 2 - 1;
        mouseY = (e.clientY / window.innerHeight) * 2 - 1;
    });

    function animate() {
        // Smoothly interpolate towards target (easing)
        targetX += (mouseX - targetX) * 0.05;
        targetY += (mouseY - targetY) * 0.05;

        glows.forEach((glow, index) => {
            // Different depth factor for each glow to create 3D parallax
            // glow-1 moves more than glow-2
            const depth = (glow.classList.contains('glow-1') ? 60 : -40); 
            
            // Apply 3D translation
            const x = targetX * depth;
            const y = targetY * depth;
            
            glow.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${1 + Math.abs(targetX*0.05)})`;
        });

        requestAnimationFrame(animate);
    }

    // Start animation loop
    requestAnimationFrame(animate);
});

/* wow-effects.js - Premium Interaction & Entry Animations */

function initWow() {
    const cards = document.querySelectorAll('.glass-card, .template-preview, .pricing-card, .feature-card, .ats-edu-panel');
    
    // Smooth spotlight movement
    document.addEventListener('mousemove', (e) => {
        requestAnimationFrame(() => {
            cards.forEach(card => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                
                card.style.setProperty('--mouse-x', `${x}px`);
                card.style.setProperty('--mouse-y', `${y}px`);
            });
        });
    });

    // Staggered Entry Animations
    const animatables = document.querySelectorAll('.hero h1, .hero p, .hero div, .glass-card, .feature-card, .pricing-card');
    
    animatables.forEach((el, index) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(40px) scale(0.98)';
        el.style.filter = 'blur(10px)';
        el.style.transition = 'all 1.2s cubic-bezier(0.16, 1, 0.3, 1)';
        
        const delay = index * 100; 
        
        setTimeout(() => {
            el.style.opacity = '1';
            el.style.transform = 'translateY(0) scale(1)';
            el.style.filter = 'blur(0)';
        }, 100 + delay);
    });

    // Button Hover Sound Effects (Optional - Visual feedback is enough for now)
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWow);
} else {
    initWow();
}

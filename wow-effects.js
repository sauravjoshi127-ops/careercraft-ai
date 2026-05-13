document.addEventListener('DOMContentLoaded', () => {
    // 1. Spotlight Hover Effect for Premium Cards
    const cards = document.querySelectorAll('.glass-card, .template-preview, .pricing-card, .feature-card, .ats-edu-panel');
    
    document.addEventListener('mousemove', (e) => {
        cards.forEach(card => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            card.style.setProperty('--mouse-x', `${x}px`);
            card.style.setProperty('--mouse-y', `${y}px`);
        });
    });

    // 2. Cinematic Staggered Cascading Reveal
    const animatables = document.querySelectorAll('.glass-card, .pricing-card, .feature-card, .ats-edu-panel, .header-section h1');
    
    // Only animate if they aren't already visible to avoid glitching
    animatables.forEach((el, index) => {
        // Prepare element for animation
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1), transform 0.7s cubic-bezier(0.16, 1, 0.3, 1)';
        
        // Trigger animation with staggered delay
        // Cap the delay to avoid making the user wait too long on pages with many elements
        const delay = Math.min(index * 75, 800); 
        
        setTimeout(() => {
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        }, 50 + delay);
    });
});

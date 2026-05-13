function initWow() {
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

    const animatables = document.querySelectorAll('.glass-card, .pricing-card, .feature-card, .ats-edu-panel, .header-section h1');
    
    animatables.forEach((el, index) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1), transform 0.7s cubic-bezier(0.16, 1, 0.3, 1)';
        
        const delay = Math.min(index * 75, 800); 
        
        setTimeout(() => {
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        }, 50 + delay);
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWow);
} else {
    initWow();
}

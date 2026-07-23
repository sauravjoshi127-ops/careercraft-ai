document.addEventListener('DOMContentLoaded', () => {
    // Icons from Lucide
    const eyeIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>`;
    const eyeOffIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye-off"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.579 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/></svg>`;

    const passwordInputs = document.querySelectorAll('input[type="password"]');

    passwordInputs.forEach(input => {
        // Prevent double initialization
        if (input.parentElement.classList.contains('password-wrapper')) return;

        // Wrap input
        const wrapper = document.createElement('div');
        wrapper.className = 'password-wrapper';
        input.parentNode.insertBefore(wrapper, input);
        wrapper.appendChild(input);

        // Create toggle button
        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'password-toggle-btn';
        toggleBtn.setAttribute('aria-label', 'Show password');
        toggleBtn.innerHTML = eyeIcon;
        wrapper.appendChild(toggleBtn);

        // Update visibility
        const updateToggle = () => {
            if (input.value.length > 0 || document.activeElement === input || document.activeElement === toggleBtn) {
                wrapper.classList.add('show-toggle');
            } else {
                wrapper.classList.remove('show-toggle');
            }
        };

        // Event listeners
        input.addEventListener('input', updateToggle);
        input.addEventListener('focus', updateToggle);
        input.addEventListener('blur', () => {
            // Slight delay to allow toggleBtn focus to register
            setTimeout(updateToggle, 10);
        });
        
        toggleBtn.addEventListener('focus', updateToggle);
        toggleBtn.addEventListener('blur', () => {
            setTimeout(updateToggle, 10);
        });

        toggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
            input.setAttribute('type', type);
            
            toggleBtn.innerHTML = type === 'password' ? eyeIcon : eyeOffIcon;
            toggleBtn.setAttribute('aria-label', type === 'password' ? 'Show password' : 'Hide password');
            
            // Preserve focus and selection
            const start = input.selectionStart;
            const end = input.selectionEnd;
            input.focus();
            input.setSelectionRange(start, end);
        });
        
        // Initial check
        updateToggle();
    });
});

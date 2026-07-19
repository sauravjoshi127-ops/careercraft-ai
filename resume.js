/**
 * resume.js
 * Resume builder controller logic extracted from resume.html.
 */
(function () {
    // ── Supabase Setup ──
    let client = null;

    // ── State ──
    let currentUserId = null;
    let editingResumeId = null;
    let deleteTargetId = null;
    let skills = [];
    let expCount = 0;
    let eduCount = 0;
    let projCount = 0;
    let shareViewMap = {};
    let currentAISuggestion = '';
    let currentAISection = '';
    let currentHighlightedSection = null;

    let resumeState = {
        full_name: '',
        email: '',
        phone: '',
        location: '',
        professional_summary: '',
        experience: [],
        education: [],
        projects: [],
        skills: [],
        certifications: '',
        template_name: 'modern',
        font_family: 'Inter',
        spacing: 'normal',
        accent_color: '#6366f1'
    };

    function syncStateFromUI() {
        resumeState.full_name = document.getElementById('fullName')?.value.trim() || '';
        resumeState.email = document.getElementById('email')?.value.trim() || '';
        resumeState.phone = document.getElementById('phone')?.value.trim() || '';
        resumeState.location = document.getElementById('location')?.value.trim() || '';
        resumeState.professional_summary = document.getElementById('summary')?.value.trim() || '';
        resumeState.certifications = document.getElementById('certifications')?.value.trim() || '';
        resumeState.template_name = document.getElementById('templateName')?.value || 'modern';
        resumeState.font_family = document.getElementById('custFont')?.value || 'Inter';
        resumeState.spacing = document.getElementById('custSpacing')?.value || 'normal';
        const activeSwatch = document.querySelector('.color-swatch.active');
        if (activeSwatch) {
            resumeState.accent_color = activeSwatch.dataset.color;
        }
        
        // Experience
        resumeState.experience = [];
        document.querySelectorAll('#experienceContainer .entry-card').forEach(card => {
            const id = card.id.replace('exp-', '');
            resumeState.experience.push({
                title: document.getElementById(`expTitle-${id}`)?.value.trim() || '',
                company: document.getElementById(`expCompany-${id}`)?.value.trim() || '',
                start: document.getElementById(`expStart-${id}`)?.value.trim() || '',
                end: document.getElementById(`expEnd-${id}`)?.value.trim() || '',
                description: document.getElementById(`expDesc-${id}`)?.value.trim() || ''
            });
        });

        // Education
        resumeState.education = [];
        document.querySelectorAll('#educationContainer .entry-card').forEach(card => {
            const id = card.id.replace('edu-', '');
            resumeState.education.push({
                degree: document.getElementById(`eduDegree-${id}`)?.value.trim() || '',
                school: document.getElementById(`eduSchool-${id}`)?.value.trim() || '',
                year: document.getElementById(`eduYear-${id}`)?.value.trim() || '',
                grade: document.getElementById(`eduGrade-${id}`)?.value.trim() || ''
            });
        });

        // Projects
        resumeState.projects = [];
        document.querySelectorAll('#projectsContainer .entry-card').forEach(card => {
            const id = card.id.replace('proj-', '');
            resumeState.projects.push({
                name: document.getElementById(`projName-${id}`)?.value.trim() || '',
                role: document.getElementById(`projRole-${id}`)?.value.trim() || '',
                dates: document.getElementById(`projDates-${id}`)?.value.trim() || '',
                technologies: document.getElementById(`projTech-${id}`)?.value.trim() || '',
                link: document.getElementById(`projLink-${id}`)?.value.trim() || '',
                description: document.getElementById(`projDesc-${id}`)?.value.trim() || ''
            });
        });

        resumeState.skills = [...skills];
    }

    function syncUIFromState(data) {
        resumeState = {
            full_name: data.full_name || '',
            email: data.email || '',
            phone: data.phone || '',
            location: data.location || '',
            professional_summary: data.professional_summary || '',
            experience: data.experience || [],
            education: data.education || [],
            projects: data.projects || [],
            skills: data.skills || [],
            certifications: data.certifications || '',
            template_name: data.template_name || 'modern',
            font_family: data.font_family || 'Inter',
            spacing: data.spacing || 'normal',
            accent_color: data.accent_color || '#6366f1'
        };

        document.getElementById('fullName').value = resumeState.full_name;
        document.getElementById('email').value = resumeState.email;
        document.getElementById('phone').value = resumeState.phone;
        document.getElementById('location').value = resumeState.location;
        document.getElementById('summary').value = resumeState.professional_summary;
        document.getElementById('certifications').value = resumeState.certifications;
        document.getElementById('templateName').value = resumeState.template_name;

        document.querySelectorAll('.template-card-option').forEach(card => {
            const isMatch = card.getAttribute('data-template') === resumeState.template_name;
            card.classList.toggle('active', isMatch);
        });

        document.getElementById('custFont').value = resumeState.font_family;
        document.getElementById('custSpacing').value = resumeState.spacing;

        document.querySelectorAll('.color-swatch').forEach(s => {
            s.classList.toggle('active', s.dataset.color === resumeState.accent_color);
        });

        const expContainer = document.getElementById('experienceContainer');
        expContainer.innerHTML = '';
        expCount = 0;
        if (resumeState.experience.length > 0) {
            resumeState.experience.forEach(exp => addExperience(exp));
        } else {
            addExperience();
        }

        const eduContainer = document.getElementById('educationContainer');
        eduContainer.innerHTML = '';
        eduCount = 0;
        if (resumeState.education.length > 0) {
            resumeState.education.forEach(edu => addEducation(edu));
        } else {
            addEducation();
        }

        const projContainer = document.getElementById('projectsContainer');
        projContainer.innerHTML = '';
        projCount = 0;
        if (resumeState.projects && resumeState.projects.length > 0) {
            resumeState.projects.forEach(proj => addProject(proj));
        } else {
            addProject();
        }

        skills = [...resumeState.skills];
        renderSkills();

        updatePreview();
    }

    // ── Live Preview ──
    function switchTemplateCard(name, cardEl) {
        resumeState.template_name = name;
        document.getElementById('templateName').value = name;
        document.querySelectorAll('.template-card-option').forEach(c => c.classList.remove('active'));
        if (cardEl) {
            cardEl.classList.add('active');
        }
        updatePreview();
    }
    function setAccentColor(el) {
        resumeState.accent_color = el.dataset.color;
        document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
        el.classList.add('active');
        updatePreview();
    }
    function applyCustomization() { updatePreview(); }
    function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    
    let debounceTimer = null;
    function updatePreview() {
        if (debounceTimer) clearTimeout(debounceTimer);
        // 50ms debounce for lightning fast typing responsiveness without blocking main thread
        debounceTimer = setTimeout(() => {
            requestAnimationFrame(() => {
                syncStateFromUI();
                renderPreviewIframe();
            });
        }, 50);
    }

    function renderPreviewIframe() {
        if (window.isInlineEditing) return;
        const iframe = document.getElementById('previewIframe');
        if (!iframe) return;
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        
        if (!resumeState.full_name && !resumeState.email) {
            doc.open();
            doc.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body {
                            margin: 0;
                            padding: 0;
                            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            justify-content: center;
                            min-height: 480px;
                            color: #94a3b8;
                            background: #ffffff;
                            text-align: center;
                        }
                        svg { width: 48px; height: 48px; stroke: #cbd5e1; margin-bottom: 12px; }
                        p { font-size: 14px; line-height: 1.5; margin: 0; }
                    </style>
                </head>
                <body>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    <p>Start filling in your details<br>and see your resume update live.</p>
                </body>
                </html>
            `);
            doc.close();
            return;
        }

        const html = window.ResumeRenderer.render(resumeState, resumeState.template_name);
        
        // Fast-path: Update innerHTML directly to reuse parsed CSS stylesheets and fonts,
        // avoiding flash-of-unstyled-content (FOUC) and frame rendering stutter.
        if (doc.body && doc.head && doc.head.children.length > 0) {
            const parser = new DOMParser();
            const newDoc = parser.parseFromString(html, 'text/html');
            
            // Lightweight DOM Diffing to prevent scroll jumps, selection loss, and layout thrashing
            function updateDOM(oldNode, newNode) {
                if (!oldNode || !newNode) return;
                if (oldNode.isEqualNode(newNode)) return;

                if (oldNode.nodeName !== newNode.nodeName) {
                    oldNode.replaceWith(newNode.cloneNode(true));
                    return;
                }

                if (oldNode.nodeType === Node.TEXT_NODE) {
                    if (oldNode.nodeValue !== newNode.nodeValue) {
                        oldNode.nodeValue = newNode.nodeValue;
                    }
                    return;
                }

                const oldAttrs = oldNode.attributes;
                const newAttrs = newNode.attributes;
                if (oldAttrs && newAttrs) {
                    for (let i = oldAttrs.length - 1; i >= 0; i--) {
                        const attr = oldAttrs[i].name;
                        if (!newNode.hasAttribute(attr) && attr !== 'data-sync-attached') oldNode.removeAttribute(attr);
                    }
                    for (let i = 0; i < newAttrs.length; i++) {
                        const attr = newAttrs[i].name;
                        const val = newAttrs[i].value;
                        if (oldNode.getAttribute(attr) !== val && attr !== 'data-sync-attached') oldNode.setAttribute(attr, val);
                    }
                }

                const oldChildren = Array.from(oldNode.childNodes);
                const newChildren = Array.from(newNode.childNodes);
                const max = Math.max(oldChildren.length, newChildren.length);
                for (let i = 0; i < max; i++) {
                    if (!oldChildren[i]) {
                        oldNode.appendChild(newChildren[i].cloneNode(true));
                    } else if (!newChildren[i]) {
                        oldNode.removeChild(oldChildren[i]);
                    } else {
                        updateDOM(oldChildren[i], newChildren[i]);
                    }
                }
            }

            updateDOM(doc.body, newDoc.body);
            doc.body.style.zoom = currentZoom;
            
            const oldStyle = doc.head.querySelector('style:not(#sync-styles)');
            const newStyle = newDoc.head.querySelector('style');
            if (oldStyle && newStyle) {
                if (oldStyle.textContent !== newStyle.textContent) {
                    oldStyle.textContent = newStyle.textContent;
                }
            } else if (newStyle) {
                doc.head.appendChild(newStyle.cloneNode(true));
            }
        } else {
            doc.open();
            doc.write(html);
            doc.close();
        }
        setupIframeClickSync(iframe, doc);
        if (currentHighlightedSection) {
            highlightSectionInPreview(currentHighlightedSection);
        }
    }

    function setupIframeClickSync(iframe, doc) {
        if (!doc.body || doc.body.dataset.syncAttached === 'true') return;
        doc.body.dataset.syncAttached = 'true';

        // Visual pointer feedback and hover styling for interactive preview
        const style = doc.createElement('style');
        style.id = 'sync-styles';
        style.textContent = `
            /* All editable elements get hover styling and pointer */
            [data-editable] { cursor: text !important; position: relative; transition: all 0.2s ease; border-radius: 3px; }
            [data-editable]:hover { background: rgba(99, 102, 241, 0.05); box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15); }
            
            /* Tooltip on hover */
            [data-editable]::after {
                content: '✏ Double-click to edit';
                position: absolute;
                bottom: calc(100% + 4px);
                left: 50%;
                transform: translateX(-50%) translateY(4px);
                background: #1e293b;
                color: #fff;
                font-size: 11px;
                font-weight: 500;
                padding: 4px 8px;
                border-radius: 4px;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.15s ease, transform 0.15s ease;
                white-space: nowrap;
                z-index: 10;
                box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
                font-family: system-ui, -apple-system, sans-serif;
            }
            [data-editable]:hover::after {
                opacity: 1;
                transform: translateX(-50%) translateY(0);
            }
            [data-editable].is-editing::after {
                display: none !important;
            }
            [data-editable].is-editing {
                background: #ffffff !important;
                box-shadow: 0 0 0 2px #6366f1 !important;
                outline: none !important;
            }

            .section { transition: all 0.25s ease; border-radius: 8px; padding: 8px; margin-left: -8px; margin-right: -8px; }
            .section:hover { background: rgba(0,0,0,0.015); box-shadow: 0 2px 8px rgba(0,0,0,0.03); }
            header { transition: all 0.25s ease; border-radius: 8px; padding: 8px; margin-left: -8px; margin-right: -8px; }
            .highlight-active { background-color: rgba(99, 102, 241, 0.06) !important; outline: 2px solid rgba(99, 102, 241, 0.4) !important; border-radius: 6px; }
            
            .draggable-entry { cursor: grab !important; }
            .draggable-entry:active { cursor: grabbing !important; }
            .draggable-entry.dragging { opacity: 0.4; }
            .highlight-entry { transition: all 0.2s ease; border-radius: 4px; }
            .highlight-entry:hover { outline: 1px dashed rgba(99, 102, 241, 0.4); background: rgba(99, 102, 241, 0.02); }
            
            #floating-toolbar { display:none; position:absolute; z-index:9999; }
            #floating-toolbar.visible { display:flex; flex-direction:column; }
            .tb-btn { background:transparent; border:none; color:white; padding:4px 8px; cursor:pointer; font-size:12px; border-radius:4px; }
            .tb-btn:hover { background:rgba(255,255,255,0.2); }
            .tb-menu-item { background:transparent; border:none; color:white; padding:6px 10px; cursor:pointer; font-size:11px; text-align:left; border-radius:4px; }
            .tb-menu-item:hover { background:rgba(255,255,255,0.2); }
            
            .add-section-btn { display:block; margin: 10px auto; padding: 4px 12px; background: rgba(99,102,241,0.1); color: #6366f1; border: 1px dashed #6366f1; border-radius: 12px; font-size: 11px; font-weight: 600; cursor: pointer; opacity: 0; transition: opacity 0.2s; }
            .section:hover .add-section-btn { opacity: 1; }
            .add-section-btn:hover { background: rgba(99,102,241,0.2); }
            
            .ai-diff-panel { margin-top: 8px; padding: 12px; border: 1px solid #e2e8f0; border-radius: 6px; background: #f8fafc; font-family: -apple-system, sans-serif; }
            .ai-diff-old { text-decoration: line-through; color: #ef4444; font-size: 11px; margin-bottom: 6px; }
            .ai-diff-new { color: #10b981; font-size: 12px; margin-bottom: 12px; font-weight: 500; }
            .ai-diff-actions { display: flex; gap: 8px; }
            .ai-btn { padding: 4px 12px; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer; border: none; }
            .ai-btn-accept { background: #6366f1; color: white; }
            .ai-btn-reject { background: #e2e8f0; color: #475569; }
        `;
        doc.head.appendChild(style);

        // --- INJECT FLOATING TOOLBAR ---
        const toolbar = doc.createElement('div');
        toolbar.id = 'floating-toolbar';
        toolbar.innerHTML = `
            <div style="display:flex;gap:4px;background:#1e293b;padding:4px;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.15);">
                <button class="tb-btn" data-action="edit" title="Edit">✏</button>
                <button class="tb-btn" data-action="ai" title="AI Actions">✨</button>
                <div class="tb-divider" style="width:1px;background:rgba(255,255,255,0.1);margin:2px;"></div>
                <button class="tb-btn tb-entry-only" data-action="up" title="Move Up">↑</button>
                <button class="tb-btn tb-entry-only" data-action="down" title="Move Down">↓</button>
                <button class="tb-btn tb-entry-only" data-action="delete" title="Delete">🗑</button>
            </div>
            <div id="ai-menu" style="display:none;position:absolute;top:100%;left:0;margin-top:4px;background:#1e293b;border-radius:6px;padding:4px;flex-direction:column;min-width:160px;box-shadow:0 4px 12px rgba(0,0,0,0.15);">
                <button class="tb-menu-item" data-prompt="improve">✨ Improve Writing</button>
                <button class="tb-menu-item" data-prompt="optimize">🎯 ATS Optimize</button>
                <button class="tb-menu-item" data-prompt="rewrite">✍ Rewrite Professionally</button>
                <button class="tb-menu-item" data-prompt="shorten">✂ Shorten</button>
                <button class="tb-menu-item" data-prompt="expand">📝 Expand</button>
                <button class="tb-menu-item" data-prompt="grammar">✔ Fix Grammar</button>
                <button class="tb-menu-item" data-prompt="impact">🚀 Make More Impactful</button>
            </div>
        `;
        doc.body.appendChild(toolbar);

        let activeToolbarTarget = null;
        let activeToolbarEntry = null;
        
        doc.body.addEventListener('mousemove', (e) => {
            if (window.isInlineEditing) return;
            const editable = e.target.closest('[data-editable]');
            const entry = e.target.closest('.draggable-entry');
            const target = editable || entry;
            
            if (target && !toolbar.contains(e.target)) {
                activeToolbarTarget = editable;
                activeToolbarEntry = entry;
                
                const rect = (entry || editable).getBoundingClientRect();
                toolbar.classList.add('visible');
                
                // Position above the element if there's space, else below
                let topPos = rect.top + doc.defaultView.scrollY - 36;
                if (topPos < 0) topPos = rect.bottom + doc.defaultView.scrollY + 8;
                
                toolbar.style.top = topPos + 'px';
                toolbar.style.left = Math.max(8, rect.left + doc.defaultView.scrollX) + 'px';
                
                toolbar.querySelectorAll('.tb-entry-only').forEach(btn => {
                    btn.style.display = entry ? 'block' : 'none';
                });
                toolbar.querySelector('.tb-divider').style.display = entry ? 'block' : 'none';
                doc.getElementById('ai-menu').style.display = 'none'; // reset menu
            }
        });
        
        doc.body.addEventListener('mouseleave', (e) => {
            if (!toolbar.contains(e.relatedTarget)) {
                toolbar.classList.remove('visible');
                doc.getElementById('ai-menu').style.display = 'none';
            }
        }, true);
        
        toolbar.addEventListener('mouseleave', () => {
            toolbar.classList.remove('visible');
            doc.getElementById('ai-menu').style.display = 'none';
        });

        // Toolbar Actions
        toolbar.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            
            const action = btn.getAttribute('data-action');
            if (action === 'edit') {
                if (activeToolbarTarget) {
                    const dblclickEvent = new MouseEvent('dblclick', { bubbles: true, cancelable: true });
                    activeToolbarTarget.dispatchEvent(dblclickEvent);
                }
                toolbar.classList.remove('visible');
            } else if (action === 'ai') {
                const menu = doc.getElementById('ai-menu');
                menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
            } else if (action === 'delete' && activeToolbarEntry) {
                const type = activeToolbarEntry.getAttribute('data-dnd-type');
                const idx = parseInt(activeToolbarEntry.getAttribute('data-dnd-index'), 10);
                if (type === 'experience') resumeState.experience.splice(idx, 1);
                if (type === 'education') resumeState.education.splice(idx, 1);
                if (type === 'projects') resumeState.projects.splice(idx, 1);
                if (type === 'skills') skills.splice(idx, 1);
                syncUIFromState(resumeState); // sync form
                updatePreview();
                toolbar.classList.remove('visible');
            } else if ((action === 'up' || action === 'down') && activeToolbarEntry) {
                const type = activeToolbarEntry.getAttribute('data-dnd-type');
                const idx = parseInt(activeToolbarEntry.getAttribute('data-dnd-index'), 10);
                const arr = type === 'experience' ? resumeState.experience : type === 'education' ? resumeState.education : type === 'projects' ? resumeState.projects : type === 'skills' ? skills : null;
                if (!arr) return;
                
                const newIdx = action === 'up' ? idx - 1 : idx + 1;
                if (newIdx >= 0 && newIdx < arr.length) {
                    const temp = arr[idx];
                    arr[idx] = arr[newIdx];
                    arr[newIdx] = temp;
                    syncUIFromState(resumeState);
                    updatePreview();
                }
            } else if (btn.classList.contains('tb-menu-item')) {
                // AI Prompt selected
                const promptType = btn.getAttribute('data-prompt');
                if (!activeToolbarTarget) return;
                
                const originalText = activeToolbarTarget.innerText || activeToolbarTarget.textContent;
                toolbar.classList.remove('visible');
                doc.getElementById('ai-menu').style.display = 'none';
                
                // Show loading
                const loadingHtml = `<div style="font-size:11px;color:#6366f1;font-weight:600;display:flex;align-items:center;gap:4px;">✨ Generating...</div>`;
                const tempDiv = doc.createElement('div');
                tempDiv.innerHTML = loadingHtml;
                activeToolbarTarget.parentNode.insertBefore(tempDiv, activeToolbarTarget.nextSibling);
                
                // Simulate AI generation (Fallback for mock)
                setTimeout(() => {
                    tempDiv.remove();
                    const newText = `AI generated content for "${promptType}" on: ${originalText.substring(0,20)}...`;
                    
                    const panel = doc.createElement('div');
                    panel.className = 'ai-diff-panel';
                    panel.innerHTML = `
                        <div class="ai-diff-old">${originalText}</div>
                        <div class="ai-diff-new">${newText}</div>
                        <div class="ai-diff-actions">
                            <button class="ai-btn ai-btn-accept">Accept</button>
                            <button class="ai-btn ai-btn-reject">Reject</button>
                        </div>
                    `;
                    activeToolbarTarget.style.display = 'none';
                    activeToolbarTarget.parentNode.insertBefore(panel, activeToolbarTarget.nextSibling);
                    
                    panel.querySelector('.ai-btn-accept').addEventListener('click', () => {
                        activeToolbarTarget.style.display = '';
                        activeToolbarTarget.innerText = newText;
                        
                        // force sync
                        const dblEv = new MouseEvent('dblclick', { bubbles: true });
                        activeToolbarTarget.dispatchEvent(dblEv);
                        setTimeout(() => {
                            if(doc.activeElement) doc.activeElement.blur();
                        }, 50);
                        
                        panel.remove();
                    });
                    
                    panel.querySelector('.ai-btn-reject').addEventListener('click', () => {
                        activeToolbarTarget.style.display = '';
                        panel.remove();
                    });
                }, 800);
            }
        });

        // --- DRAG AND DROP ENGINE ---
        let dragSource = null;
        
        doc.body.addEventListener('dragstart', (e) => {
            const entry = e.target.closest('.draggable-entry');
            if (!entry) return;
            dragSource = entry;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', ''); // Firefox compat
            setTimeout(() => entry.classList.add('dragging'), 0);
        });
        
        doc.body.addEventListener('dragover', (e) => {
            e.preventDefault();
            const entry = e.target.closest('.draggable-entry');
            if (!entry || entry === dragSource) return;
            if (entry.getAttribute('data-dnd-type') !== dragSource.getAttribute('data-dnd-type')) return;
            
            const rect = entry.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            if (e.clientY < midY) {
                entry.parentNode.insertBefore(dragSource, entry);
            } else {
                entry.parentNode.insertBefore(dragSource, entry.nextSibling);
            }
        });
        
        doc.body.addEventListener('dragend', (e) => {
            if (!dragSource) return;
            dragSource.classList.remove('dragging');
            
            // Recompute state array based on new DOM order
            const type = dragSource.getAttribute('data-dnd-type');
            const arr = type === 'experience' ? resumeState.experience : type === 'education' ? resumeState.education : type === 'projects' ? resumeState.projects : type === 'skills' ? skills : null;
            if (!arr) return;
            
            const container = dragSource.parentNode;
            const newOrder = Array.from(container.querySelectorAll('.draggable-entry[data-dnd-type="' + type + '"]'))
                                .map(el => parseInt(el.getAttribute('data-dnd-index'), 10));
            
            const newArr = newOrder.map(idx => arr[idx]);
            
            if (type === 'experience') resumeState.experience = newArr;
            if (type === 'education') resumeState.education = newArr;
            if (type === 'projects') resumeState.projects = newArr;
            if (type === 'skills') {
                skills.length = 0;
                skills.push(...newArr);
            }
            
            dragSource = null;
            syncUIFromState(resumeState);
            updatePreview();
        });
        
        // --- ADD SECTION SHORTCUTS ---
        setTimeout(() => {
            const injectAddBtn = (sectionName, actionName) => {
                const h2s = Array.from(doc.querySelectorAll('h2'));
                const h2 = h2s.find(el => el.textContent.toLowerCase().includes(sectionName));
                if (h2) {
                    const section = h2.closest('.section') || h2.closest('section');
                    if (section && !section.querySelector('.add-section-btn')) {
                        const btn = doc.createElement('button');
                        btn.className = 'add-section-btn';
                        btn.textContent = '+ Add ' + (sectionName === 'experience' ? 'Experience' : sectionName === 'projects' ? 'Project' : 'Education');
                        btn.onclick = () => {
                            if(actionName === 'addExperience') window.parent.addExperience();
                            if(actionName === 'addEducation') window.parent.addEducation();
                            if(actionName === 'addProject') window.parent.addProject();
                            // Scroll form container to bottom
                            const formPanel = window.parent.document.querySelector('.form-panel');
                            if (formPanel) {
                                setTimeout(() => formPanel.scrollTo({ top: formPanel.scrollHeight, behavior: 'smooth' }), 50);
                            }
                        };
                        section.appendChild(btn);
                    }
                }
            };
            injectAddBtn('experience', 'addExperience');
            injectAddBtn('education', 'addEducation');
            injectAddBtn('projects', 'addProject');
        }, 100);


        // --- INLINE EDITING LOGIC (All Core Sections) ---
        doc.body.addEventListener('dblclick', (e) => {
            const target = e.target.closest('[data-editable]');
            if (!target) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            if (window.isInlineEditing) return;
            window.isInlineEditing = true;
            
            target.classList.add('is-editing');
            const originalHtml = target.innerHTML;
            const originalText = target.innerText || target.textContent;
            
            const fId = target.getAttribute('data-editable');
            let formInput = null;
            let isSkill = false;
            let skillIdx = -1;
            
            if (fId.startsWith('skill-')) {
                isSkill = true;
                skillIdx = parseInt(fId.split('-')[1], 10);
            } else {
                if (fId === 'fullName') formInput = document.getElementById('fullName');
                else if (['email', 'phone', 'location'].includes(fId)) formInput = document.getElementById(fId);
                else if (fId === 'summary') formInput = document.getElementById('summary');
                else if (fId === 'certifications') formInput = document.getElementById('certifications');
                else if (fId.startsWith('exp-')) {
                    const parts = fId.split('-');
                    const idx = parseInt(parts[2], 10);
                    const cards = document.querySelectorAll('#experienceContainer .entry-card');
                    if (cards[idx]) formInput = document.getElementById('exp' + parts[1].charAt(0).toUpperCase() + parts[1].slice(1) + '-' + cards[idx].id.replace('exp-', ''));
                }
                else if (fId.startsWith('edu-')) {
                    const parts = fId.split('-');
                    const idx = parseInt(parts[2], 10);
                    const cards = document.querySelectorAll('#educationContainer .entry-card');
                    if (cards[idx]) formInput = document.getElementById('edu' + parts[1].charAt(0).toUpperCase() + parts[1].slice(1) + '-' + cards[idx].id.replace('edu-', ''));
                }
                else if (fId.startsWith('proj-')) {
                    const parts = fId.split('-');
                    const idx = parseInt(parts[2], 10);
                    const cards = document.querySelectorAll('#projectsContainer .entry-card');
                    if (cards[idx]) formInput = document.getElementById('proj' + parts[1].charAt(0).toUpperCase() + parts[1].slice(1) + '-' + cards[idx].id.replace('proj-', ''));
                }
            }
            
            target.contentEditable = "true";
            target.focus();
            
            // Place cursor near click
            const sel = doc.defaultView.getSelection();
            let range = null;
            try {
                if (doc.caretPositionFromPoint) {
                    const pos = doc.caretPositionFromPoint(e.clientX, e.clientY);
                    if (pos) {
                        range = doc.createRange();
                        range.setStart(pos.offsetNode, pos.offset);
                        range.collapse(true);
                    }
                } else if (doc.caretRangeFromPoint) {
                    range = doc.caretRangeFromPoint(e.clientX, e.clientY);
                }
            } catch(err) {}
            
            if (range) {
                sel.removeAllRanges();
                sel.addRange(range);
            } else {
                const r = doc.createRange();
                r.selectNodeContents(target);
                r.collapse(false);
                sel.removeAllRanges();
                sel.addRange(r);
            }
            
            function htmlToMarkdown(node) {
                let text = '';
                node.childNodes.forEach(child => {
                    if (child.nodeType === 3) text += child.textContent;
                    else if (child.nodeType === 1) {
                        if (child.tagName === 'BR') text += '\\n';
                        else if (child.tagName === 'LI') text += '\\n- ' + htmlToMarkdown(child);
                        else if (child.tagName === 'UL') text += htmlToMarkdown(child);
                        else if (child.tagName === 'DIV' || child.tagName === 'P') text += '\\n' + htmlToMarkdown(child);
                        else text += htmlToMarkdown(child);
                    }
                });
                return text.replace(/^\\n+/, ''); // trim leading newlines due to first div
            }

            const handleInput = () => {
                if (isSkill) {
                    skills[skillIdx] = (target.innerText || target.textContent).trim();
                } else if (formInput) {
                    // For multi-line textareas (description, summary), parse HTML to retain bullet points!
                    if (formInput.tagName === 'TEXTAREA' && (fId.includes('description') || fId === 'summary')) {
                        formInput.value = htmlToMarkdown(target).trim();
                    } else {
                        formInput.value = (target.innerText || target.textContent).trim();
                    }
                    formInput.dispatchEvent(new Event('input', { bubbles: true }));
                }
            };
            
            const finishEditing = (save) => {
                target.contentEditable = "false";
                target.classList.remove('is-editing');
                
                target.removeEventListener('input', handleInput);
                target.removeEventListener('blur', handleBlur);
                target.removeEventListener('keydown', handleKeydown);
                
                if (!save) {
                    target.innerHTML = originalHtml;
                    if (isSkill) {
                        skills[skillIdx] = originalText.trim();
                    } else if (formInput) {
                        formInput.value = originalText;
                        formInput.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                } else {
                    if (isSkill && !(target.innerText || target.textContent).trim()) {
                        skills.splice(skillIdx, 1);
                    }
                }
                
                if (isSkill) {
                    renderSkills();
                }
                
                window.isInlineEditing = false;
                syncStateFromUI();
                updatePreview();
            };
            
            const handleBlur = () => finishEditing(true);
            const handleKeydown = (ke) => {
                if (ke.key === 'Escape') {
                    ke.preventDefault();
                    finishEditing(false);
                } else if (ke.key === 'Enter' && !ke.shiftKey && !fId.includes('description') && fId !== 'summary') {
                    // Only blur on enter if it's not a multiline textarea (allow multiline enter)
                    ke.preventDefault();
                    target.blur();
                }
            };
            
            target.addEventListener('input', handleInput);
            target.addEventListener('blur', handleBlur);
            target.addEventListener('keydown', handleKeydown);
        });

        // --- CLICK TO EDIT LOGIC (Single Click Focus) ---
        doc.body.addEventListener('click', (e) => {
            if (window.isInlineEditing) return; // Don't steal focus if inline editing
            
            const target = e.target;
            let sectionId = null;
            let focusInputId = null;

            // Direct mapping via data-editable for perfect precision
            const editable = target.closest('[data-editable]');
            if (editable) {
                const fId = editable.getAttribute('data-editable');
                if (fId === 'fullName') { sectionId = 'personal'; focusInputId = 'fullName'; }
                else if (['email', 'phone', 'location'].includes(fId)) { sectionId = 'personal'; focusInputId = fId; }
                else if (fId === 'summary') { sectionId = 'summary'; focusInputId = 'summary'; }
                else if (fId === 'certifications') { sectionId = 'certifications'; focusInputId = 'certifications'; }
                else if (fId.startsWith('exp-')) {
                    sectionId = 'experience';
                    const parts = fId.split('-');
                    const idx = parseInt(parts[2], 10);
                    const cards = document.querySelectorAll('#experienceContainer .entry-card');
                    if (cards[idx]) focusInputId = 'exp' + parts[1].charAt(0).toUpperCase() + parts[1].slice(1) + '-' + cards[idx].id.replace('exp-', '');
                }
                else if (fId.startsWith('edu-')) {
                    sectionId = 'education';
                    const parts = fId.split('-');
                    const idx = parseInt(parts[2], 10);
                    const cards = document.querySelectorAll('#educationContainer .entry-card');
                    if (cards[idx]) focusInputId = 'edu' + parts[1].charAt(0).toUpperCase() + parts[1].slice(1) + '-' + cards[idx].id.replace('edu-', '');
                }
                else if (fId.startsWith('proj-')) {
                    sectionId = 'projects';
                    const parts = fId.split('-');
                    const idx = parseInt(parts[2], 10);
                    const cards = document.querySelectorAll('#projectsContainer .entry-card');
                    if (cards[idx]) focusInputId = 'proj' + parts[1].charAt(0).toUpperCase() + parts[1].slice(1) + '-' + cards[idx].id.replace('proj-', '');
                }
                else if (fId.startsWith('skill-')) {
                    sectionId = 'skills';
                    focusInputId = 'skillInput';
                }
            }
            // Fallback for non-editable areas
            if (!sectionId) {
                if (target.closest('h1')) {
                    sectionId = 'personal';
                    focusInputId = 'fullName';
                } else if (target.closest('.contact') || target.closest('.sidebar div:nth-child(2)')) {
                    sectionId = 'personal';
                    focusInputId = 'email';
                } else {
                    const h2Elements = Array.from(doc.querySelectorAll('h2'));
                    if (h2Elements.length > 0) {
                        const clickedY = e.clientY;
                        let closestH2 = null;
                        let minDistance = Infinity;

                        h2Elements.forEach(h2 => {
                            const rect = h2.getBoundingClientRect();
                            const distance = Math.abs(clickedY - rect.top);
                            if (distance < minDistance) {
                                minDistance = distance;
                                closestH2 = h2;
                            }
                        });

                        const sectionText = closestH2 ? closestH2.textContent.toLowerCase() : '';
                        if (sectionText.includes('summary') || sectionText.includes('about')) {
                            sectionId = 'summary';
                            focusInputId = 'summary';
                        } else if (sectionText.includes('experience') || sectionText.includes('work')) {
                            sectionId = 'experience';
                        } else if (sectionText.includes('education')) {
                            sectionId = 'education';
                        } else if (sectionText.includes('skills')) {
                            sectionId = 'skills';
                            focusInputId = 'skillInput';
                        } else if (sectionText.includes('certification')) {
                            sectionId = 'certifications';
                            focusInputId = 'certifications';
                        }
                    }
                }
            }

            if (sectionId) {
                currentHighlightedSection = sectionId;
                highlightSectionInPreview(sectionId);
                
                const header = document.getElementById(`head-${sectionId}`);
                const content = document.getElementById(`sect-${sectionId}`);
                if (content && content.classList.contains('collapsed')) {
                    document.querySelectorAll('.form-section-content').forEach(sect => {
                        if (!sect.classList.contains('non-collapsible-content')) sect.classList.add('collapsed');
                    });
                    document.querySelectorAll('.form-section-heading').forEach(head => {
                        if (!head.classList.contains('non-collapsible')) head.classList.add('collapsed');
                    });
                    content.classList.remove('collapsed');
                    if (header) header.classList.remove('collapsed');
                }
                if (header) {
                    header.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
                if (!focusInputId && content) {
                    const firstInput = content.querySelector('input, textarea, select');
                    if (firstInput) focusInputId = firstInput.id;
                }
                if (focusInputId) {
                    const inputEl = document.getElementById(focusInputId);
                    if (inputEl) {
                        requestAnimationFrame(() => {
                            inputEl.focus();
                        });
                    }
                }
            }
        });
    }

    function highlightSectionInPreview(sectionId) {
        const iframe = document.getElementById('previewIframe');
        if (!iframe) return;
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        
        // Clear existing highlights
        doc.querySelectorAll('.highlight-active').forEach(el => el.classList.remove('highlight-active'));
        
        if (!sectionId) return;
        
        if (sectionId === 'personal') {
            const header = doc.querySelector('header');
            if (header) header.classList.add('highlight-active');
        } else {
            const h2Elements = Array.from(doc.querySelectorAll('h2'));
            const targetH2 = h2Elements.find(h2 => {
                const text = h2.textContent.toLowerCase();
                if (sectionId === 'summary' && (text.includes('summary') || text.includes('about'))) return true;
                if (sectionId === 'experience' && (text.includes('experience') || text.includes('work'))) return true;
                if (sectionId === 'education' && text.includes('education')) return true;
                if (sectionId === 'skills' && text.includes('skills')) return true;
                if (sectionId === 'certifications' && text.includes('certification')) return true;
                return false;
            });
            
            if (targetH2) {
                const section = targetH2.closest('.section') || targetH2.closest('section');
                if (section) section.classList.add('highlight-active');
            }
        }
    }

    // --- FORM FOCUS SYNC LOGIC ---
    document.addEventListener('DOMContentLoaded', () => {
        const resumeForm = document.getElementById('resumeForm');
        if (resumeForm) {
            resumeForm.addEventListener('focusin', (e) => {
                const target = e.target;
                let sectionId = null;
                
                const formSection = target.closest('.form-section-content');
                if (formSection) {
                    sectionId = formSection.id.replace('sect-', '');
                } else if (target.closest('.form-section-heading')) {
                    sectionId = target.closest('.form-section-heading').id.replace('head-', '');
                }
                
                if (sectionId && sectionId !== currentHighlightedSection) {
                    currentHighlightedSection = sectionId;
                    highlightSectionInPreview(sectionId);
                }
            });
            
            // Also sync when clicking on headers that are already expanded (no focusin triggered)
            resumeForm.addEventListener('click', (e) => {
                const heading = e.target.closest('.form-section-heading');
                if (heading) {
                    const sectionId = heading.id.replace('head-', '');
                    if (sectionId && sectionId !== currentHighlightedSection) {
                        currentHighlightedSection = sectionId;
                        highlightSectionInPreview(sectionId);
                    }
                }
            });
        }
    });

    function selectTemplate(name) { 
        const card = document.querySelector(`.template-card-option[data-template="${name}"]`);
        if (card) switchTemplateCard(name, card);
    }
    function showTemplateScreen() {}

    // ── Auth Check ──
    async function initPage() {
        await window.appSdk.ready;
        if (!window.AuthManager) return;
        const session = await window.AuthManager.requireAuth();
        if (!session) return;
        client = window.appSdk.client;
        currentUserId = session.user.id;

        addExperience();
        addEducation();
        addProject();
        await loadResumes();
        updatePreview();
    }

    // ── Load Saved Resumes ──
    async function loadResumes() {
        const listEl = document.getElementById('resumeList');
        if (!listEl) return;
        
        listEl.innerHTML = `
            <div class="empty-state">
                <div class="loader-spinner" style="border-top-color: var(--cyan); width: 24px; height: 24px; margin: 0 auto 1rem;"></div>
                <p>Loading your resumes...</p>
            </div>`;

        let isTimeout = false;
        let isLoaded = false;

        const timeoutId = setTimeout(() => {
            if (!isLoaded) {
                isTimeout = true;
                listEl.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">⚠️</div>
                        <p>We couldn't load your resumes.</p>
                        <div style="display: flex; gap: 0.5rem; justify-content: center; margin-top: 1rem;">
                            <button class="btn btn-secondary" onclick="window.loadResumes()">Retry</button>
                            <button class="btn btn-secondary" onclick="window.location.reload()">Refresh</button>
                            <a href="#resumeForm" class="btn btn-primary" onclick="document.getElementById('full_name').focus()">Create New Resume</a>
                        </div>
                    </div>`;
            }
        }, 10000);

        try {
            const { data, error } = await client
                .from('resumes')
                .select('*')
                .eq('user_id', currentUserId)
                .order('created_at', { ascending: false });

            if (isTimeout) return;

            if (error) {
                throw new Error(error.message);
            }

            if (!data || data.length === 0) {
                listEl.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon"></div>
                        <p>No saved resumes yet. Fill in the form below and hit <strong>Save Resume</strong>!</p>
                    </div>`;
                return;
            }

            // Fetch share + view data (gracefully skip if tables don't exist yet)
            shareViewMap = {};
            try {
                const resumeIds = data.map(r => r.id);
                const { data: shares } = await client
                    .from('resume_shares')
                    .select('id, resume_id, share_token')
                    .in('resume_id', resumeIds)
                    .eq('is_active', true);

                if (shares && shares.length > 0) {
                    const shareIds = shares.map(s => s.id);
                    const { data: views } = await client
                        .from('resume_views')
                        .select('share_id, view_count')
                        .in('share_id', shareIds);

                    const viewSumByShareId = {};
                    if (views) {
                        views.forEach(v => {
                            viewSumByShareId[v.share_id] = (viewSumByShareId[v.share_id] || 0) + (v.view_count || 1);
                        });
                    }

                    shares.forEach(s => {
                        shareViewMap[s.resume_id] = {
                            shareToken: s.share_token,
                            viewCount: viewSumByShareId[s.id] || 0,
                        };
                    });
                }
            } catch (e) {
                console.warn('Could not load share data:', e);
            }

            const cards = data.map(r => buildResumeCard(r)).join('');
            listEl.innerHTML = `<div class="resume-cards">${cards}</div>`;
        } catch (error) {
            console.error('[CareerCraft] Resume load error:', error);
            if (!isTimeout) {
                listEl.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">⚠️</div>
                        <p>We couldn't load your resumes.</p>
                        <div style="display: flex; gap: 0.5rem; justify-content: center; margin-top: 1rem;">
                            <button class="btn btn-secondary" onclick="window.loadResumes()">Retry</button>
                            <button class="btn btn-secondary" onclick="window.location.reload()">Refresh</button>
                            <a href="#resumeForm" class="btn btn-primary" onclick="document.getElementById('full_name').focus()">Create New Resume</a>
                        </div>
                    </div>`;
            }
        } finally {
            isLoaded = true;
            clearTimeout(timeoutId);
        }
    }

    function buildResumeCard(r) {
        const date = new Date(r.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        const updatedDate = r.updated_at ? new Date(r.updated_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : null;

        const templateName = r.template_name || 'modern';
        
        let subtitle = '';
        if (r.professional_summary) {
            subtitle = r.professional_summary.substring(0, 60) + (r.professional_summary.length > 60 ? '...' : '');
        }

        const lastUpdatedStr = updatedDate && updatedDate !== date ? `Updated ${updatedDate}` : `Created ${date}`;

        return `
            <div class="resume-card" id="card-${r.id}">
                <div class="card-badges">
                    <span class="template-badge">${escapeHtml(templateName)}</span>
                </div>
                <div class="resume-card-title">${escapeHtml(r.full_name || 'Untitled Resume')}</div>
                ${subtitle ? `<div class="resume-card-meta">${escapeHtml(subtitle)}</div>` : ''}
                <div class="resume-card-meta" style="margin-bottom: 0; font-size: 0.75rem; opacity: 0.7;">
                    ${lastUpdatedStr}
                </div>
                <div style="flex-grow: 1;"></div>
                <div class="card-actions-row">
                    <button class="btn btn-primary btn-sm" title="Edit Resume" aria-label="Edit Resume" onclick="editResume('${r.id}')">
                        <svg class="icon-svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                        Edit
                    </button>
                    <div style="display: flex; gap: 0.25rem;">
                        <button class="btn btn-secondary btn-sm" title="Download PDF" aria-label="Download PDF" onclick="downloadPDF('${r.id}')">
                            <svg class="icon-svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                            PDF
                        </button>
                        <button class="btn btn-secondary btn-sm" title="Share Resume" aria-label="Share Resume" onclick="shareResume('${r.id}')">
                            <svg class="icon-svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
                            Share
                        </button>
                        <div class="dropdown-container">
                            <button class="btn btn-secondary btn-sm dropdown-trigger" title="More Actions" aria-label="More Actions" onclick="window.toggleDropdown(this, event)">
                                <svg class="icon-svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
                                More
                            </button>
                            <div class="dropdown-menu">
                                <button class="dropdown-item" title="Rename" aria-label="Rename Resume" onclick="window.renameResume('${r.id}')">
                                    <svg class="icon-svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                    Rename
                                </button>
                                <button class="dropdown-item" title="Duplicate" aria-label="Duplicate Resume" onclick="window.duplicateResume('${r.id}')">
                                    <svg class="icon-svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                    Duplicate
                                </button>
                                <button class="dropdown-item" title="Download" aria-label="Download Resume" onclick="downloadPDF('${r.id}')">
                                    <svg class="icon-svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                    Download
                                </button>
                                <button class="dropdown-item text-danger" title="Delete" aria-label="Delete Resume" onclick="openDeleteModal('${r.id}')">
                                    <svg class="icon-svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
    }

    // ── Dynamic Experience ──
    function addExperience(data) {
        expCount++;
        const idx = expCount;
        const container = document.getElementById('experienceContainer');
        if (!container) return;
        const div = document.createElement('div');
        div.className = 'entry-card';
        div.id = `exp-${idx}`;
        div.innerHTML = `
            <button type="button" class="remove-btn" onclick="removeEntry('exp-${idx}')">Remove</button>
            <div class="form-row">
                <div class="form-group">
                    <label>Job Title</label>
                    <input type="text" id="expTitle-${idx}" placeholder="e.g. Software Engineer" value="${escapeHtml(data?.title || '')}">
                </div>
                <div class="form-group">
                    <label>Company</label>
                    <input type="text" id="expCompany-${idx}" placeholder="e.g. Google" value="${escapeHtml(data?.company || '')}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Start Date</label>
                    <input type="text" id="expStart-${idx}" placeholder="Jan 2022" value="${escapeHtml(data?.start || '')}">
                </div>
                <div class="form-group">
                    <label>End Date</label>
                    <input type="text" id="expEnd-${idx}" placeholder="Dec 2023" value="${escapeHtml(data?.end || '')}">
                </div>
            </div>
            <div class="form-group">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
                    <label style="margin-bottom:0;">Description</label>
                    <button type="button" class="btn-ai" onclick="getAISuggestions('experience', ${idx})" style="padding: 0.15rem 0.55rem; font-size: 0.65rem; margin: 0;">AI Polish</button>
                </div>
                <textarea id="expDesc-${idx}" placeholder="Describe your key responsibilities and achievements...">${escapeHtml(data?.description || '')}</textarea>
            </div>`;
        container.appendChild(div);

        // Bind input events to trigger live preview update
        div.querySelectorAll('input, textarea').forEach(el => {
            el.addEventListener('input', updatePreview);
        });
    }

    // ── Dynamic Education ──
    function addEducation(data) {
        eduCount++;
        const idx = eduCount;
        const container = document.getElementById('educationContainer');
        if (!container) return;
        const div = document.createElement('div');
        div.className = 'entry-card';
        div.id = `edu-${idx}`;
        div.innerHTML = `
            <button type="button" class="remove-btn" onclick="removeEntry('edu-${idx}')">Remove</button>
            <div class="form-row">
                <div class="form-group">
                    <label>Degree / Qualification</label>
                    <input type="text" id="eduDegree-${idx}" placeholder="e.g. B.Tech Computer Science" value="${escapeHtml(data?.degree || '')}">
                </div>
                <div class="form-group">
                    <label>School / University</label>
                    <input type="text" id="eduSchool-${idx}" placeholder="e.g. MIT" value="${escapeHtml(data?.school || '')}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Year</label>
                    <input type="text" id="eduYear-${idx}" placeholder="e.g. 2018 - 2022" value="${escapeHtml(data?.year || '')}">
                </div>
                <div class="form-group">
                    <label>Grade / GPA (optional)</label>
                    <input type="text" id="eduGrade-${idx}" placeholder="e.g. 8.5 CGPA" value="${escapeHtml(data?.grade || '')}">
                </div>
            </div>`;
        container.appendChild(div);

        div.querySelectorAll('input').forEach(el => {
            el.addEventListener('input', updatePreview);
        });
    }

    // ── Dynamic Projects ──
    function addProject(data) {
        projCount++;
        const idx = projCount;
        const container = document.getElementById('projectsContainer');
        if (!container) return;
        const div = document.createElement('div');
        div.className = 'entry-card';
        div.id = `proj-${idx}`;
        div.innerHTML = `
            <button type="button" class="remove-btn" onclick="removeEntry('proj-${idx}')">Remove</button>
            <div class="form-row">
                <div class="form-group">
                    <label>Project Name</label>
                    <input type="text" id="projName-${idx}" placeholder="e.g. CareerCraft AI" value="${escapeHtml(data?.name || '')}">
                </div>
                <div class="form-group">
                    <label>Role / Position</label>
                    <input type="text" id="projRole-${idx}" placeholder="e.g. Lead Developer" value="${escapeHtml(data?.role || '')}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Technologies Used</label>
                    <input type="text" id="projTech-${idx}" placeholder="e.g. React, Node.js" value="${escapeHtml(data?.technologies || '')}">
                </div>
                <div class="form-group">
                    <label>Dates</label>
                    <input type="text" id="projDates-${idx}" placeholder="e.g. Jan 2023 - Present" value="${escapeHtml(data?.dates || '')}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Link / URL</label>
                    <input type="text" id="projLink-${idx}" placeholder="e.g. https://github.com/..." value="${escapeHtml(data?.link || '')}">
                </div>
            </div>
            <div class="form-group">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
                    <label style="margin-bottom:0;">Description</label>
                </div>
                <textarea id="projDesc-${idx}" placeholder="Describe the project...">${escapeHtml(data?.description || '')}</textarea>
            </div>`;
        container.appendChild(div);

        div.querySelectorAll('input, textarea').forEach(el => {
            el.addEventListener('input', updatePreview);
        });
    }

    function removeEntry(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
        updatePreview();
    }

    // ── Skills ──
    function setupSkillsListener() {
        const input = document.getElementById('skillInput');
        if (!input) return;
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addSkill(this.value.trim().replace(/,$/, ''));
                this.value = '';
            } else if (e.key === 'Backspace' && this.value === '' && skills.length > 0) {
                removeSkill(skills[skills.length - 1]);
            }
        });
    }

    function addSkill(value) {
        if (!value || skills.includes(value)) return;
        skills.push(value);
        renderSkills();
    }

    function removeSkill(skill) {
        skills = skills.filter(s => s !== skill);
        renderSkills();
    }

    function renderSkills() {
        const container = document.getElementById('skillsContainer');
        const input = document.getElementById('skillInput');
        if (!container || !input) return;

        // Use a DocumentFragment to batch all DOM insertions in a single reflow
        const fragment = document.createDocumentFragment();
        skills.forEach(s => {
            const tag = document.createElement('span');
            tag.className = 'skill-tag';
            const text = document.createTextNode(s);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.title = 'Remove';
            btn.textContent = '\u00d7';
            btn.dataset.skill = s;
            btn.addEventListener('click', function () { removeSkill(this.dataset.skill); });
            tag.appendChild(text);
            tag.appendChild(btn);
            fragment.appendChild(tag);
        });
        fragment.appendChild(input);

        // Single DOM write: clear + insert, preventing multiple reflows
        container.innerHTML = '';
        container.appendChild(fragment);

        // Skills change triggers preview update (no extra call needed — the
        // form's delegated 'input' listener handles it; here we call directly
        // because skill removal bypasses the form input event)
        updatePreview();
    }

    function collectFormData() {
        syncStateFromUI();
        return {
            full_name: resumeState.full_name,
            email: resumeState.email,
            phone: resumeState.phone,
            location: resumeState.location,
            professional_summary: resumeState.professional_summary,
            experience: resumeState.experience,
            education: resumeState.education,
            projects: resumeState.projects,
            skills: resumeState.skills,
            certifications: resumeState.certifications,
            template_name: resumeState.template_name,
            font_family: resumeState.font_family,
            spacing: resumeState.spacing,
            accent_color: resumeState.accent_color
        };
    }

    // ── Validation ──
    function validateForm(data) {
        const errors = [];
        document.getElementById('fullName')?.classList.remove('invalid');
        document.getElementById('email')?.classList.remove('invalid');

        if (!data.full_name) {
            errors.push('Full Name is required.');
            document.getElementById('fullName')?.classList.add('invalid');
        }
        if (!data.email) {
            errors.push('Email is required.');
            document.getElementById('email')?.classList.add('invalid');
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
            errors.push('Please enter a valid email address.');
            document.getElementById('email')?.classList.add('invalid');
        }
        return errors;
    }

    // ── Save Resume ──
    async function handleSave(event) {
        event.preventDefault();
        hideAlerts();

        const data = collectFormData();
        const errors = validateForm(data);

        if (errors.length > 0) {
            showAlert('error', errors.join(' '));
            return;
        }

        const saveBtn = document.getElementById('saveBtn');
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="loading-spinner"></span> Saving...';

        try {
            if (editingResumeId) {
                const { error } = await client
                    .from('resumes')
                    .update(data)
                    .eq('id', editingResumeId)
                    .eq('user_id', currentUserId);

                if (error) throw error;
                showAlert('success', 'Resume updated successfully!');
                cancelEdit();
            } else {
                const { error } = await client
                    .from('resumes')
                    .insert([{ ...data, user_id: currentUserId }]);

                if (error) throw error;
                showAlert('success', 'Resume saved successfully!');
                resetForm();
            }

            await loadResumes();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (err) {
            console.error('Save error:', err);
            showAlert('error', 'Failed to save resume: ' + err.message);
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = editingResumeId ? 'Update Resume' : 'Save Resume';
        }
    }

    // ── Edit Resume ──
    async function editResume(id) {
        hideAlerts();
        const { data, error } = await client
            .from('resumes')
            .select('*')
            .eq('id', id)
            .eq('user_id', currentUserId)
            .single();

        if (error || !data) {
            showAlert('error', 'Could not load resume for editing.');
            return;
        }

        editingResumeId = id;
        document.getElementById('formTitle').textContent = 'Edit Resume';
        document.getElementById('cancelEditBtn').style.display = 'inline-flex';
        document.getElementById('saveBtn').innerHTML = 'Update Resume';

        syncUIFromState(data);
        document.getElementById('resumeForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function cancelEdit() {
        editingResumeId = null;
        document.getElementById('formTitle').textContent = 'Build New Resume';
        document.getElementById('cancelEditBtn').style.display = 'none';
        document.getElementById('saveBtn').innerHTML = 'Save Resume';
        resetForm();
    }

    // ── Delete Resume ──
    function openDeleteModal(id) {
        deleteTargetId = id;
        document.getElementById('deleteModal').classList.add('active');
    }

    function closeDeleteModal() {
        deleteTargetId = null;
        document.getElementById('deleteModal').classList.remove('active');
    }

    async function confirmDelete() {
        if (!deleteTargetId) return;

        const btn = document.getElementById('confirmDeleteBtn');
        btn.disabled = true;
        btn.textContent = 'Deleting...';

        const { error } = await client
            .from('resumes')
            .delete()
            .eq('id', deleteTargetId)
            .eq('user_id', currentUserId);

        closeDeleteModal();
        btn.disabled = false;
        btn.textContent = 'Delete';

        if (error) {
            showAlert('error', 'Failed to delete resume: ' + error.message);
        } else {
            showAlert('success', 'Resume deleted successfully.');
            await loadResumes();
        }
    }

    // ── Helpers ──
    function resetForm() {
        editingResumeId = null;
        document.getElementById('resumeForm').reset();
        document.getElementById('experienceContainer').innerHTML = '';
        document.getElementById('educationContainer').innerHTML = '';
        document.getElementById('projectsContainer').innerHTML = '';
        expCount = 0;
        eduCount = 0;
        projCount = 0;
        skills = [];
        
        resumeState = {
            full_name: '',
            email: '',
            phone: '',
            location: '',
            professional_summary: '',
            experience: [],
            education: [],
            projects: [],
            skills: [],
            certifications: '',
            template_name: 'modern',
            font_family: 'Inter',
            spacing: 'normal',
            accent_color: '#6366f1'
        };
        
        document.getElementById('custFont').value = 'Inter';
        document.getElementById('custSpacing').value = 'normal';
        document.querySelectorAll('.color-swatch').forEach(s => {
            s.classList.toggle('active', s.dataset.color === '#6366f1');
        });
        document.querySelectorAll('.template-tab').forEach(t => {
            t.classList.toggle('active', t.getAttribute('onclick').includes("'modern'"));
        });

        addExperience();
        addEducation();
        addProject();
        renderSkills();
        
        document.getElementById('fullName')?.classList.remove('invalid');
        document.getElementById('email')?.classList.remove('invalid');
        
        updatePreview();
    }

    function showAlert(type, message) {
        hideAlerts();
        const el = document.getElementById(type === 'error' ? 'alertError' : 'alertSuccess');
        if (!el) return;
        el.textContent = message;
        el.style.display = 'block';
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        setTimeout(() => { el.style.display = 'none'; }, 6000);
    }

    function hideAlerts() {
        const err = document.getElementById('alertError');
        const succ = document.getElementById('alertSuccess');
        if (err) err.style.display = 'none';
        if (succ) succ.style.display = 'none';
    }

    function escapeHtml(str) {
        if (typeof str !== 'string') return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // ── PDF Export ──
    async function downloadPDF(resumeId) {
        try {
            const { data, error } = await client
                .from('resumes')
                .select('*')
                .eq('id', resumeId)
                .single();

            if (error || !data) {
                showAlert('error', 'Could not fetch resume data for PDF.');
                return;
            }

            const template = data.template_name || 'modern';
            const html = window.ResumeRenderer.render(data, template);

            const printWindow = window.open('', '_blank');
            if (!printWindow) {
                showAlert('error', 'Popup blocked. Please allow popups to export PDF.');
                return;
            }

            printWindow.document.open();
            printWindow.document.write(html);
            printWindow.document.close();

            const printScript = printWindow.document.createElement('script');
            printScript.innerHTML = `
                window.addEventListener('load', () => {
                    setTimeout(() => {
                        window.focus();
                        window.print();
                        setTimeout(() => window.close(), 1000);
                    }, 500);
                });
            `;
            printWindow.document.body.appendChild(printScript);

            showAlert('success', 'PDF Generator opened. Select "Save as PDF" to save a vector, ATS-friendly copy!');
        } catch (err) {
            console.error('PDF Error:', err);
            showAlert('error', 'Failed to generate PDF: ' + err.message);
        }
    }

    // ── Resume Sharing ──
    async function shareResume(resumeId) {
        try {
            const existing = shareViewMap[resumeId];
            let shareToken;

            if (existing) {
                shareToken = existing.shareToken;
            } else {
                shareToken = typeof crypto.randomUUID === 'function'
                    ? crypto.randomUUID()
                    : Array.from(crypto.getRandomValues(new Uint8Array(16)))
                          .map(b => b.toString(16).padStart(2, '0'))
                          .join('');
                const { error } = await client
                    .from('resume_shares')
                    .insert([{ resume_id: resumeId, share_token: shareToken, is_active: true }]);
                if (error) throw error;
                shareViewMap[resumeId] = { shareToken, viewCount: 0 };
                await loadResumes();
            }

            const shareUrl = `${window.location.origin}/resume-share.html?token=${encodeURIComponent(shareToken)}`;
            document.getElementById('shareLinkInput').value = shareUrl;
            document.getElementById('shareModal').classList.add('active');
        } catch (err) {
            console.error('Share error:', err);
            showAlert('error', 'Failed to create share link: ' + err.message);
        }
    }

    function copyShareLink() {
        const input = document.getElementById('shareLinkInput');
        if (navigator.clipboard) {
            navigator.clipboard.writeText(input.value)
                .then(() => showAlert('success', 'Share link copied to clipboard!'))
                .catch(() => fallbackCopy(input));
        } else {
            fallbackCopy(input);
        }
    }

    function fallbackCopy(input) {
        try {
            input.select();
            const ok = document.execCommand('copy');
            if (ok) {
                showAlert('success', 'Share link copied!');
            } else {
                showAlert('error', 'Could not copy automatically. Please copy manually.');
            }
        } catch (e) {
            showAlert('error', 'Automatic copy not supported. Please copy manually.');
        }
    }

    function closeShareModal() {
        document.getElementById('shareModal').classList.remove('active');
    }

    let currentAIItemIndex = null;
    let selectedWordLimit = 75;
    let customLimitActive = false;
    let selectedTone = 'Professional';
    let selectedIndustry = '';
    let selectedLanguage = 'English';
    let selectedOutputStyle = '4–6 detailed ATS bullet points';

    // AI Document Editor states
    let lastClearedSummary = '';
    let lastRegeneratedSummary = '';
    let isEditorEditingMode = false;
    let lastGeneratedTime = null;
    let tempTextBeforeEdit = '';

    function updateEditorMetrics() {
        const textView = document.getElementById('aiSuggestionsBox');
        const textEdit = document.getElementById('aiTextEdit');
        const wordsMetric = document.getElementById('aiMetricWords');
        const charsMetric = document.getElementById('aiMetricChars');
        const readTimeMetric = document.getElementById('aiMetricReadTime');
        const lastGenMetric = document.getElementById('aiMetricLastGen');
        const indicator = document.getElementById('aiWordLimitIndicator');
        const counter = document.getElementById('aiLiveCounter');

        const currentText = isEditorEditingMode ? (textEdit ? textEdit.value : '') : (textView ? (textView.innerText || textView.textContent || '') : '');
        const trimmed = currentText.trim();
        const wordCount = trimmed === '' ? 0 : trimmed.split(/\s+/).length;
        const charCount = currentText.length;
        const readMin = Math.max(1, Math.round(wordCount / 200));

        // Update status metrics
        if (wordsMetric) wordsMetric.textContent = `${wordCount} words`;
        if (charsMetric) charsMetric.textContent = `${charCount} chars`;
        if (readTimeMetric) readTimeMetric.textContent = `${readMin} min read`;
        if (lastGenMetric) {
            if (lastGeneratedTime) {
                const timeStr = lastGeneratedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                lastGenMetric.textContent = `Last generated: ${timeStr}`;
            } else {
                lastGenMetric.textContent = `Last generated: Never`;
            }
        }

        // Update live counter limit indicator
        let limitLabel = selectedWordLimit + ' words';
        if (customLimitActive) limitLabel = selectedWordLimit + ' (Custom)';
        if (counter) counter.textContent = `${wordCount} / ${limitLabel}`;

        // Validate and style indicator based on limits
        if (indicator) {
            indicator.classList.remove('warning', 'danger');
            if (wordCount > selectedWordLimit) {
                indicator.classList.add('danger');
            } else if (wordCount > selectedWordLimit * 0.85) {
                indicator.classList.add('warning');
            }
        }
    }

    function enterEditorEditMode() {
        const textView = document.getElementById('aiSuggestionsBox');
        const textEdit = document.getElementById('aiTextEdit');
        const inlineToolbar = document.getElementById('aiToolbarInline');
        const editToolbar = document.getElementById('aiToolbarEdit');
        
        if (!textView || !textEdit) return;

        textEdit.value = textView.innerText || textView.textContent || '';
        tempTextBeforeEdit = textEdit.value;
        
        textView.classList.add('is-hidden');
        textEdit.classList.remove('is-hidden');
        
        if (inlineToolbar) inlineToolbar.classList.add('is-hidden');
        if (editToolbar) editToolbar.classList.remove('is-hidden');

        isEditorEditingMode = true;
        updateEditorMetrics();

        textEdit.focus();
        textEdit.selectionStart = textEdit.selectionEnd = textEdit.value.length;
    }

    function saveEditorEdit() {
        const textEdit = document.getElementById('aiTextEdit');
        const textView = document.getElementById('aiSuggestionsBox');
        if (!textEdit || !textView) return;

        const newText = textEdit.value;
        const wordCount = newText.trim() === '' ? 0 : newText.trim().split(/\s+/).length;

        if (wordCount > selectedWordLimit) {
            const warningModal = document.getElementById('wordLimitWarningModal');
            if (warningModal) {
                warningModal.classList.add('active');
            }
            return;
        }

        commitEditorSave(newText);
    }

    function commitEditorSave(text) {
        const textEdit = document.getElementById('aiTextEdit');
        const textView = document.getElementById('aiSuggestionsBox');
        const inlineToolbar = document.getElementById('aiToolbarInline');
        const editToolbar = document.getElementById('aiToolbarEdit');

        if (textView) textView.textContent = text;
        currentAISuggestion = text;

        if (textEdit) textEdit.classList.add('is-hidden');
        if (textView) textView.classList.remove('is-hidden');
        if (inlineToolbar) inlineToolbar.classList.remove('is-hidden');
        if (editToolbar) editToolbar.classList.add('is-hidden');

        isEditorEditingMode = false;
        updateEditorMetrics();

        const acceptBtn = document.getElementById('aiAcceptBtn');
        if (acceptBtn) {
            if (text.trim() !== '') {
                acceptBtn.style.display = 'inline-flex';
            } else {
                acceptBtn.style.display = 'none';
            }
        }

        window.LayoutManager.showToast('Changes saved.', 'success');
    }

    function cancelEditorEdit() {
        const textEdit = document.getElementById('aiTextEdit');
        const textView = document.getElementById('aiSuggestionsBox');
        const inlineToolbar = document.getElementById('aiToolbarInline');
        const editToolbar = document.getElementById('aiToolbarEdit');

        if (textEdit) textEdit.value = tempTextBeforeEdit;

        if (textEdit) textEdit.classList.add('is-hidden');
        if (textView) textView.classList.remove('is-hidden');
        if (inlineToolbar) inlineToolbar.classList.remove('is-hidden');
        if (editToolbar) editToolbar.classList.add('is-hidden');

        isEditorEditingMode = false;
        updateEditorMetrics();
    }

    function copyEditorText() {
        const textView = document.getElementById('aiSuggestionsBox');
        const text = textView ? (textView.innerText || textView.textContent || '') : '';
        if (!text) return;

        navigator.clipboard.writeText(text).then(() => {
            window.LayoutManager.showToast('Copied to clipboard.', 'success');
        }).catch(() => {
            const el = document.createElement('textarea');
            el.value = text;
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);
            window.LayoutManager.showToast('Copied to clipboard.', 'success');
        });
    }

    function promptClearSummary() {
        const modal = document.getElementById('clearSummaryModal');
        if (modal) modal.classList.add('active');
    }

    function confirmClearSummary() {
        const textView = document.getElementById('aiSuggestionsBox');
        const textEdit = document.getElementById('aiTextEdit');
        if (textView) {
            lastClearedSummary = textView.innerText || textView.textContent || '';
            textView.textContent = '';
        }
        if (textEdit) textEdit.value = '';
        currentAISuggestion = '';

        const acceptBtn = document.getElementById('aiAcceptBtn');
        if (acceptBtn) acceptBtn.style.display = 'none';

        updateEditorMetrics();

        const modal = document.getElementById('clearSummaryModal');
        if (modal) modal.classList.remove('active');

        window.LayoutManager.showToast('Summary cleared. <a href="#" id="aiUndoClearAction" style="color:var(--cyan); margin-left:8px; font-weight:600; text-decoration:underline;">Undo</a>', 'success');
        
        setTimeout(() => {
            const undoAnchor = document.getElementById('aiUndoClearAction');
            if (undoAnchor) {
                undoAnchor.addEventListener('click', (e) => {
                    e.preventDefault();
                    undoClearSummary();
                });
            }
        }, 100);
    }

    function undoClearSummary() {
        if (!lastClearedSummary) return;
        const textView = document.getElementById('aiSuggestionsBox');
        const textEdit = document.getElementById('aiTextEdit');
        if (textView) textView.textContent = lastClearedSummary;
        if (textEdit) textEdit.value = lastClearedSummary;
        currentAISuggestion = lastClearedSummary;

        const acceptBtn = document.getElementById('aiAcceptBtn');
        if (acceptBtn && lastClearedSummary.trim() !== '') {
            acceptBtn.style.display = 'inline-flex';
        }

        updateEditorMetrics();
        lastClearedSummary = '';
        window.LayoutManager.showToast('Summary restored.', 'success');
    }

    function undoRegenerateSummary() {
        if (!lastRegeneratedSummary) return;
        const textView = document.getElementById('aiSuggestionsBox');
        const textEdit = document.getElementById('aiTextEdit');
        if (textView) textView.textContent = lastRegeneratedSummary;
        if (textEdit) textEdit.value = lastRegeneratedSummary;
        currentAISuggestion = lastRegeneratedSummary;

        const acceptBtn = document.getElementById('aiAcceptBtn');
        if (acceptBtn && lastRegeneratedSummary.trim() !== '') {
            acceptBtn.style.display = 'inline-flex';
        }

        updateEditorMetrics();
        lastRegeneratedSummary = '';
        window.LayoutManager.showToast('Previous summary restored.', 'success');
    }

    function setupAIDocumentEditor() {
        // Accordion Trigger
        const accordionTrigger = document.getElementById('aiAccordionTrigger');
        const accordionContent = document.getElementById('aiAccordionContent');
        if (accordionTrigger && accordionContent) {
            accordionTrigger.addEventListener('click', () => {
                const isActive = accordionContent.classList.contains('is-active');
                if (isActive) {
                    accordionContent.classList.remove('is-active');
                    accordionTrigger.classList.remove('is-active');
                    accordionTrigger.setAttribute('aria-expanded', 'false');
                } else {
                    accordionContent.classList.add('is-active');
                    accordionTrigger.classList.add('is-active');
                    accordionTrigger.setAttribute('aria-expanded', 'true');
                }
            });
        }

        // View Mode click to edit inline (Notion style)
        document.getElementById('aiSuggestionsBox')?.addEventListener('click', () => {
            if (!isEditorEditingMode && currentAISuggestion.trim() !== '') {
                enterEditorEditMode();
            }
        });

        // Action Bindings
        document.getElementById('aiBtnGenerateWorkflow')?.addEventListener('click', async () => {
            const btn = document.getElementById('aiBtnGenerateWorkflow');
            const loader = document.getElementById('aiEditorLoaderConfig');
            if (btn) btn.disabled = true;
            if (loader) loader.classList.remove('is-hidden');
            await executeAIGeneration();
            if (btn) btn.disabled = false;
            if (loader) loader.classList.add('is-hidden');
        });

        document.getElementById('aiBtnBackToConfig')?.addEventListener('click', () => {
            document.getElementById('aiWorkflowReview')?.classList.add('is-hidden');
            document.getElementById('aiWorkflowConfig')?.classList.remove('is-hidden');
        });

        document.getElementById('aiBtnInsert')?.addEventListener('click', () => {
            if (currentAISection === 'summary') {
                handleInsertSummary();
            } else {
                acceptAISuggestion('append');
            }
        });
        document.getElementById('aiBtnReplace')?.addEventListener('click', () => {
            acceptAISuggestion('replace');
        });
        document.getElementById('aiBtnCompare')?.addEventListener('click', () => {
            openCompareModal();
        });
        document.getElementById('btnCompareReplace')?.addEventListener('click', () => {
            document.getElementById('aiCompareModal')?.classList.remove('active');
            acceptAISuggestion('replace');
        });
        document.getElementById('aiBtnEdit')?.addEventListener('click', enterEditorEditMode);
        document.getElementById('aiBtnCopy')?.addEventListener('click', copyEditorText);
        document.getElementById('aiBtnClear')?.addEventListener('click', promptClearSummary);
        document.getElementById('aiBtnRegen')?.addEventListener('click', triggerAIGeneration);

        document.getElementById('aiBtnSave')?.addEventListener('click', saveEditorEdit);
        document.getElementById('aiBtnCancel')?.addEventListener('click', cancelEditorEdit);

        // Confirmation Modal Buttons
        document.getElementById('btnCancelClear')?.addEventListener('click', () => {
            document.getElementById('clearSummaryModal')?.classList.remove('active');
        });
        document.getElementById('btnConfirmClear')?.addEventListener('click', confirmClearSummary);

        document.getElementById('btnCancelWordWarning')?.addEventListener('click', () => {
            document.getElementById('wordLimitWarningModal')?.classList.remove('active');
        });
        document.getElementById('btnConfirmWordWarning')?.addEventListener('click', () => {
            document.getElementById('wordLimitWarningModal')?.classList.remove('active');
            const textEdit = document.getElementById('aiTextEdit');
            if (textEdit) commitEditorSave(textEdit.value);
        });

        document.getElementById('btnCancelInsertConfirm')?.addEventListener('click', () => {
            document.getElementById('insertSummaryConfirmModal')?.classList.remove('active');
        });
        document.getElementById('btnConfirmInsert')?.addEventListener('click', () => {
            document.getElementById('insertSummaryConfirmModal')?.classList.remove('active');
            const textView = document.getElementById('aiSuggestionsBox');
            const textEdit = document.getElementById('aiTextEdit');
            const textToInsert = isEditorEditingMode ? (textEdit?.value || '') : (textView?.innerText || textView?.textContent || '');
            performInsertSummary(textToInsert);
        });

        // Input monitoring on textarea
        document.getElementById('aiTextEdit')?.addEventListener('input', updateEditorMetrics);

        // Key shortcuts in textarea
        document.getElementById('aiTextEdit')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                saveEditorEdit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEditorEdit();
            }
        });

        // Global shortcuts when drawer is active but not in edit fields
        document.addEventListener('keydown', (e) => {
            const drawer = document.getElementById('aiDrawer');
            if (!drawer || !drawer.classList.contains('ai-copilot-active')) return;

            const tag = document.activeElement ? document.activeElement.tagName : '';
            if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement.contentEditable === 'true') {
                return;
            }

            if (e.key === 'e' || e.key === 'E') {
                e.preventDefault();
                enterEditorEditMode();
            } else if (e.key === 'c' || e.key === 'C') {
                e.preventDefault();
                copyEditorText();
            } else if (e.key === 'r' || e.key === 'R') {
                e.preventDefault();
                triggerAIGeneration();
            } else if (e.key === 'i' || e.key === 'I') {
                e.preventDefault();
                if (currentAISection === 'summary') {
                    handleInsertSummary();
                } else {
                    acceptAISuggestion();
                }
            }
        });

        // Close mobile overflow menu on click outside
        document.addEventListener('click', (e) => {
            const menu = document.getElementById('aiMobileMenu');
            const trigger = document.getElementById('aiMobileTrigger');
            if (menu && !menu.classList.contains('is-hidden')) {
                if (!menu.contains(e.target) && !trigger.contains(e.target)) {
                    menu.classList.add('is-hidden');
                }
            }
        });
    }

    function setupAISettingsListeners() {
        const selector = document.getElementById('aiWordLimitSelector');
        const customInput = document.getElementById('customWordLimit');
        const toneSelect = document.getElementById('aiTone');
        const industryInput = document.getElementById('aiIndustry');
        const languageSelect = document.getElementById('aiLanguage');
        const outputStyleSelect = document.getElementById('aiOutputStyle');

        if (selector) {
            selector.querySelectorAll('.pill-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    selector.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    
                    const words = btn.getAttribute('data-words');
                    if (words === 'custom') {
                        customLimitActive = true;
                        if (customInput) {
                            customInput.style.display = 'inline-block';
                            selectedWordLimit = parseInt(customInput.value) || 75;
                        }
                    } else {
                        customLimitActive = false;
                        if (customInput) customInput.style.display = 'none';
                        selectedWordLimit = parseInt(words) || 75;
                    }
                    updateAISuggestionsCounter();
                });
            });
        }

        if (customInput) {
            customInput.addEventListener('input', () => {
                if (customLimitActive) {
                    selectedWordLimit = parseInt(customInput.value) || 75;
                    updateAISuggestionsCounter();
                }
            });
        }

        if (toneSelect) {
            toneSelect.addEventListener('change', () => {
                selectedTone = toneSelect.value;
            });
        }

        if (industryInput) {
            industryInput.addEventListener('input', () => {
                selectedIndustry = industryInput.value.trim();
            });
        }

        if (languageSelect) {
            languageSelect.addEventListener('change', () => {
                selectedLanguage = languageSelect.value;
            });
        }

        if (outputStyleSelect) {
            outputStyleSelect.addEventListener('change', () => {
                selectedOutputStyle = outputStyleSelect.value;
            });
        }

        setupAIDocumentEditor();
    }

    function updateAISuggestionsCounter() {
        const box = document.getElementById('aiSuggestionsBox');
        const counter = document.getElementById('aiLiveCounter');
        if (!counter) return;

        const text = box ? (box.innerText || box.textContent || '') : '';
        const wordsUsed = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
        
        let limitLabel = selectedWordLimit + ' words';
        if (customLimitActive) {
            limitLabel = selectedWordLimit + ' (Custom)';
        }
        
        counter.textContent = `${wordsUsed} / ${limitLabel}`;
        updateEditorMetrics();
    }

    function triggerAIGeneration() {
        const regenBtn = document.getElementById('aiBtnRegen');
        const loader = document.getElementById('aiEditorLoader');

        if (regenBtn) {
            regenBtn.disabled = true;
            regenBtn.innerHTML = '⏳ Regen';
        }
        if (loader) loader.classList.remove('is-hidden');

        getAISuggestions(currentAISection, currentAIItemIndex).finally(() => {
            if (regenBtn) {
                regenBtn.disabled = false;
                regenBtn.innerHTML = `
                    <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 12px; height: 12px;"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path></svg>
                    <span>Regen</span>
                `;
            }
            if (loader) loader.classList.add('is-hidden');
            lastGeneratedTime = new Date();
            updateEditorMetrics();
        });
    }



    async function getAISuggestions(section, itemIndex = null) {
        currentAISection = section;
        currentAIItemIndex = itemIndex;
        currentAISuggestion = '';
        lastRegeneratedSummary = '';

        // Reset UI state for Config mode
        const workflowConfig = document.getElementById('aiWorkflowConfig');
        const workflowReview = document.getElementById('aiWorkflowReview');
        const styleContainer = document.getElementById('aiOutputStyleContainer');
        const loaderConfig = document.getElementById('aiEditorLoaderConfig');
        const btnGenerate = document.getElementById('aiBtnGenerateWorkflow');
        const sqContainer = document.getElementById('aiSmartQuestionsContainer');

        if (workflowConfig) workflowConfig.classList.remove('is-hidden');
        if (workflowReview) workflowReview.classList.add('is-hidden');
        if (loaderConfig) loaderConfig.classList.add('is-hidden');
        if (btnGenerate) btnGenerate.disabled = false;

        if (styleContainer) {
            styleContainer.style.display = (section === 'experience') ? 'block' : 'none';
        }

        const resumeData = collectFormData();
        let content = '';
        if (section === 'summary') {
            content = resumeData.professional_summary;
        } else if (section === 'experience') {
            if (itemIndex !== null) {
                content = document.getElementById(`expDesc-${itemIndex}`)?.value.trim() || '';
            } else {
                content = (resumeData.experience || []).map(e =>
                    `${e.title || ''} at ${e.company || ''} (${e.start || ''}${e.end ? ' – ' + e.end : ''}):\n${e.description || ''}`
                ).join('\n\n');
            }
        } else if (section === 'skills') {
            content = (resumeData.skills || []).join(', ');
        }

        if (section === 'experience' && content.trim().length < 50) {
            setupSmartQuestionsForm(section, itemIndex, resumeData);
            if (sqContainer) sqContainer.classList.remove('is-hidden');
        } else {
            if (sqContainer) sqContainer.classList.add('is-hidden');
        }

        document.getElementById('aiDrawer')?.classList.add('ai-copilot-active');
    }

    async function executeAIGeneration() {
        const section = currentAISection;
        const itemIndex = currentAIItemIndex;
        const box = document.getElementById('aiSuggestionsBox');
        
        const resumeData = collectFormData();
        let content = '';
        if (section === 'summary') {
            content = resumeData.professional_summary;
        } else if (section === 'experience') {
            if (itemIndex !== null) {
                content = document.getElementById(`expDesc-${itemIndex}`)?.value.trim() || '';
            } else {
                content = (resumeData.experience || []).map(e =>
                    `${e.title || ''} at ${e.company || ''} (${e.start || ''}${e.end ? ' – ' + e.end : ''}):\n${e.description || ''}`
                ).join('\n\n');
            }
        } else if (section === 'skills') {
            content = (resumeData.skills || []).join(', ');
        }

        const sqContainer = document.getElementById('aiSmartQuestionsContainer');
        if (sqContainer && !sqContainer.classList.contains('is-hidden')) {
            let answers = [];
            const inputs = document.getElementById('aiSmartQuestionsForm')?.querySelectorAll('input, textarea');
            if (inputs) {
                inputs.forEach(input => {
                    const val = input.value.trim();
                    if (val) {
                        const label = input.previousElementSibling?.textContent || '';
                        answers.push(`${label} ${val}`);
                    }
                });
            }
            if (answers.length > 0) {
                content = content + '\n\nUser Context:\n' + answers.join('\n');
            }
        }

        try {
            const session = await window.appSdk.auth.getSession();
            const headers = { 'Content-Type': 'application/json' };
            if (session?.access_token) {
                headers['Authorization'] = `Bearer ${session.access_token}`;
            }

            const options = {
                wordLimit: selectedWordLimit,
                tone: selectedTone,
                targetIndustry: selectedIndustry,
                selectedLanguage: selectedLanguage,
                outputStyle: selectedOutputStyle
            };

            const response = await fetch('/api/ai-suggestions', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ section, content, resumeData, options }),
            });

            if (!response.ok) {
                const result = await response.json().catch(() => ({}));
                throw new Error(result.error || `Server error: ${response.status}`);
            }

            const result = await response.json();
            
            currentAISuggestion = result.suggestions || '';
            box.textContent = currentAISuggestion || '(No suggestion returned)';
            updateAISuggestionsCounter();

            // Switch UI to Review Mode
            document.getElementById('aiWorkflowConfig')?.classList.add('is-hidden');
            document.getElementById('aiWorkflowReview')?.classList.remove('is-hidden');

            const insertBtn = document.getElementById('aiBtnInsert');
            const replaceBtn = document.getElementById('aiBtnReplace');
            const compareBtn = document.getElementById('aiBtnCompare');
            
            if (insertBtn) {
                if (section === 'summary') {
                    insertBtn.textContent = 'Replace';
                    insertBtn.style.display = 'flex';
                    if (replaceBtn) replaceBtn.classList.add('is-hidden');
                    if (compareBtn) compareBtn.classList.add('is-hidden');
                } else if (section === 'skills') {
                    insertBtn.textContent = 'Append';
                    insertBtn.style.display = 'flex';
                    if (replaceBtn) replaceBtn.classList.add('is-hidden');
                    if (compareBtn) compareBtn.classList.add('is-hidden');
                } else if (section === 'experience') {
                    insertBtn.textContent = 'Append';
                    insertBtn.style.display = 'flex';
                    if (replaceBtn) replaceBtn.classList.remove('is-hidden');
                    if (compareBtn) compareBtn.classList.remove('is-hidden');
                } else {
                    insertBtn.style.display = 'none';
                    if (replaceBtn) replaceBtn.classList.add('is-hidden');
                    if (compareBtn) compareBtn.classList.add('is-hidden');
                }
            }

        } catch (err) {
            console.error('[CareerCraft] Content generation error:', err);
            // Restore config mode on error so they can try again
            document.getElementById('aiWorkflowConfig')?.classList.remove('is-hidden');
            document.getElementById('aiWorkflowReview')?.classList.add('is-hidden');
            window.LayoutManager.showToast('Failed to generate suggestions. Please try again.', 'error');
        }
    }

    function acceptAISuggestion(action = 'replace') {
        if (!currentAISuggestion) return;
        if (currentAISection === 'summary') {
            const summaryEl = document.getElementById('summary');
            if (summaryEl) summaryEl.value = currentAISuggestion;
            window.LayoutManager.showToast('Summary updated with AI suggestion.', 'success');
        } else if (currentAISection === 'skills') {
            const newSkills = currentAISuggestion.split(',').map(s => s.trim()).filter(s => s);
            newSkills.forEach(s => addSkill(s));
            window.LayoutManager.showToast(`Added ${newSkills.length} suggested skill(s).`, 'success');
        } else if (currentAISection === 'experience' && currentAIItemIndex !== null) {
            const textEl = document.getElementById(`expDesc-${currentAIItemIndex}`);
            if (textEl) {
                if (action === 'append') {
                    const currentVal = textEl.value.trim();
                    textEl.value = currentVal ? (currentVal + '\n\n' + currentAISuggestion) : currentAISuggestion;
                } else {
                    textEl.value = currentAISuggestion;
                }
                window.LayoutManager.showToast(`Experience description ${action === 'append' ? 'appended' : 'replaced'} with AI suggestion.`, 'success');
            }
        }
        updatePreview();
        closeAIDrawer();
    }

    function openCompareModal() {
        if (currentAISection !== 'experience' || currentAIItemIndex === null) return;
        const textEl = document.getElementById(`expDesc-${currentAIItemIndex}`);
        const originalText = textEl ? textEl.value : '';
        
        document.getElementById('aiCompareOriginal').textContent = originalText;
        document.getElementById('aiCompareNew').textContent = currentAISuggestion;
        document.getElementById('aiCompareModal')?.classList.add('active');
    }

    function closeAIDrawer() {
        if (isEditorEditingMode) {
            cancelEditorEdit();
        }
        document.getElementById('aiDrawer')?.classList.remove('ai-copilot-active');
        document.getElementById('aiSmartQuestionsContainer')?.classList.add('is-hidden');
        document.getElementById('aiSuggestionsBox')?.classList.remove('is-hidden');
        currentAISuggestion = '';
        currentAISection = '';
        currentAIItemIndex = null;
    }

    // --- Smart Questions Implementation ---
    function setupSmartQuestionsForm(section, itemIndex, resumeData) {
        const form = document.getElementById('aiSmartQuestionsForm');
        if (!form) return;

        const exp = (resumeData.experience && itemIndex !== null) ? resumeData.experience[itemIndex] : null;
        const title = (exp?.title || '').toLowerCase();
        const industry = (document.getElementById('aiIndustry')?.value || '').toLowerCase();
        
        let questions = [
            { id: 'sq_resp', label: 'Primary responsibilities?', type: 'textarea' },
            { id: 'sq_achiev', label: 'Major achievements or metrics?', type: 'textarea' }
        ];

        if (title.includes('software') || title.includes('developer') || title.includes('engineer') || industry.includes('tech')) {
            questions.push({ id: 'sq_tech', label: 'Technologies & Frameworks used?', type: 'text' });
            questions.push({ id: 'sq_arch', label: 'Architecture / System Design impact?', type: 'text' });
        } else if (title.includes('law') || title.includes('legal') || industry.includes('law')) {
            questions.push({ id: 'sq_cases', label: 'Case types / Legal research done?', type: 'text' });
            questions.push({ id: 'sq_draft', label: 'Drafting & Client Interaction?', type: 'text' });
        } else if (title.includes('marketing') || industry.includes('marketing')) {
            questions.push({ id: 'sq_campaign', label: 'Campaigns & ROI?', type: 'text' });
            questions.push({ id: 'sq_seo', label: 'SEO & Analytics tools?', type: 'text' });
        }

        form.innerHTML = '';
        questions.forEach(q => {
            const wrapper = document.createElement('div');
            wrapper.innerHTML = `
                <label style="display: block; font-size: 0.72rem; font-weight: 700; color: var(--text-2); margin-bottom: 0.35rem;">${q.label}</label>
                ${q.type === 'textarea' 
                    ? `<textarea id="${q.id}" rows="2" style="width: 100%; padding: 0.4rem; font-size: 0.8rem; border: 1px solid var(--border-md); border-radius: var(--r-sm); background: var(--bg-input); color: var(--text-1); outline: none; resize: vertical;" placeholder="Optional"></textarea>`
                    : `<input type="text" id="${q.id}" style="width: 100%; padding: 0.4rem; font-size: 0.8rem; border: 1px solid var(--border-md); border-radius: var(--r-sm); background: var(--bg-input); color: var(--text-1); outline: none;" placeholder="Optional">`
                }
            `;
            form.appendChild(wrapper);
        });
    }
    // --------------------------------------

    function handleInsertSummary() {
        const textView = document.getElementById('aiSuggestionsBox');
        const textEdit = document.getElementById('aiTextEdit');
        const textToInsert = isEditorEditingMode ? (textEdit?.value || '') : (textView?.innerText || textView?.textContent || '');

        if (!textToInsert.trim()) {
            window.LayoutManager.showToast('No text to insert.', 'error');
            return;
        }

        const summaryEl = document.getElementById('summary');
        const existingText = summaryEl ? (summaryEl.value || '').trim() : '';

        if (existingText !== '') {
            const modal = document.getElementById('insertSummaryConfirmModal');
            if (modal) modal.classList.add('active');
        } else {
            performInsertSummary(textToInsert);
        }
    }

    function performInsertSummary(text) {
        const summaryEl = document.getElementById('summary');
        if (summaryEl) {
            summaryEl.value = text;
            updatePreview();
            closeAIDrawer();

            summaryEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => {
                summaryEl.focus();
            }, 300);

            window.LayoutManager.showToast('Summary inserted successfully.', 'success');
        }
    }

    // Attach to global window space for HTML onclick bindings
    window.editResume = editResume;
    window.downloadPDF = downloadPDF;
    window.shareResume = shareResume;
    window.openDeleteModal = openDeleteModal;
    window.closeDeleteModal = closeDeleteModal;
    window.confirmDelete = confirmDelete;
    window.removeEntry = removeEntry;
    window.getAISuggestions = getAISuggestions;
    window.acceptAISuggestion = acceptAISuggestion;
    window.closeAIDrawer = closeAIDrawer;
    window.closeAIModal = closeAIDrawer;
    window.handleInsertSummary = handleInsertSummary;
    window.closeShareModal = closeShareModal;
    window.copyShareLink = copyShareLink;
    window.switchTemplateCard = switchTemplateCard;
    window.setAccentColor = setAccentColor;
    
    window.toggleDropdown = function(btn, event) {
        event.stopPropagation();
        const container = btn.closest('.dropdown-container');
        const isActive = container.classList.contains('active');
        
        // Close all other dropdowns
        document.querySelectorAll('.dropdown-container.active').forEach(el => el.classList.remove('active'));
        
        if (!isActive) {
            container.classList.add('active');
        }
    };

    window.renameResume = function(id) {
        window.LayoutManager.showToast('Rename functionality coming soon!', 'success');
    };

    window.duplicateResume = function(id) {
        window.LayoutManager.showToast('Duplicate functionality coming soon!', 'success');
    };
    
    // Close dropdowns on outside click
    document.addEventListener('click', () => {
        document.querySelectorAll('.dropdown-container.active').forEach(el => el.classList.remove('active'));
    });
    window.addExperience = () => addExperience();
    window.addEducation = () => addEducation();
    window.addProject = () => addProject();
    window.cancelEdit = cancelEdit;
    window.applyCustomization = applyCustomization;
    window.triggerAIGeneration = triggerAIGeneration;
    window.loadResumes = loadResumes;

    let currentZoom = 1;
    window.zoomPreview = function(delta) {
        currentZoom = Math.max(0.5, Math.min(2.0, currentZoom + delta));
        const display = document.getElementById('zoomLevelDisplay');
        if (display) display.innerText = Math.round(currentZoom * 100) + '%';
        
        const iframe = document.getElementById('previewIframe');
        if (iframe && iframe.contentDocument && iframe.contentDocument.body) {
            iframe.contentDocument.body.style.zoom = currentZoom;
        }
    };

    // Bind save handler on DOM
    document.addEventListener('DOMContentLoaded', () => {
        const form = document.getElementById('resumeForm');
        if (form) {
            form.addEventListener('submit', handleSave);
            form.addEventListener('input', updatePreview);
        }
        setupSkillsListener();
        setupAISettingsListeners();

        // Progressive Accordion Form Section Toggles
        document.querySelectorAll('.form-section-heading').forEach(header => {
            const toggleAccordion = (e) => {
                if (header.classList.contains('non-collapsible')) return;

                // Ignore clicks that target button controls inside headers (like AI suggest)
                if (e.target.closest('button')) return;

                const content = header.nextElementSibling;
                if (!content || !content.classList.contains('form-section-content')) return;

                const isCollapsed = content.classList.contains('collapsed');

                // Collapse all sibling section blocks
                document.querySelectorAll('.form-section-content').forEach(sect => {
                    if (!sect.classList.contains('non-collapsible-content')) sect.classList.add('collapsed');
                });
                document.querySelectorAll('.form-section-heading').forEach(head => {
                    if (!head.classList.contains('non-collapsible')) {
                        head.classList.add('collapsed');
                        head.setAttribute('aria-expanded', 'false');
                    }
                });

                // Expand clicked section block
                if (isCollapsed) {
                    content.classList.remove('collapsed');
                    header.classList.remove('collapsed');
                    header.setAttribute('aria-expanded', 'true');
                    // Automatically focus the first input inside the open section
                    const firstInput = content.querySelector('input, textarea, select');
                    if (firstInput) {
                        setTimeout(() => firstInput.focus(), 150);
                    }
                }
            };

            header.addEventListener('click', toggleAccordion);
            header.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleAccordion(e);
                }
            });
        });

        // Close delete modal on overlay click
        document.getElementById('deleteModal')?.addEventListener('click', function (e) {
            if (e.target === this) closeDeleteModal();
        });

        // Close share modal on overlay click
        document.getElementById('shareModal')?.addEventListener('click', function (e) {
            if (e.target === this) closeShareModal();
        });

        // Close AI drawer on click outside
        document.addEventListener('click', (e) => {
            const drawer = document.getElementById('aiDrawer');
            if (drawer && drawer.classList.contains('ai-copilot-active')) {
                // Use composedPath to avoid closing when a clicked element is temporarily removed/detached from DOM
                const path = e.composedPath();
                if (!path.includes(drawer) && !e.target.closest('.btn-ai')) {
                    closeAIDrawer();
                }
            }
        });
    });

    window.addEventListener('load', initPage);
})();

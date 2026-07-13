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
    let shareViewMap = {};
    let currentAISuggestion = '';
    let currentAISection = '';

    let resumeState = {
        full_name: '',
        email: '',
        phone: '',
        location: '',
        professional_summary: '',
        experience: [],
        education: [],
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

        document.querySelectorAll('.template-tab').forEach(tab => {
            const isMatch = tab.getAttribute('onclick').includes(`'${resumeState.template_name}'`);
            tab.classList.toggle('active', isMatch);
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

        skills = [...resumeState.skills];
        renderSkills();

        updatePreview();
    }

    // ── Live Preview ──
    function switchTemplate(name, btn) {
        resumeState.template_name = name;
        document.getElementById('templateName').value = name;
        document.querySelectorAll('.template-tab').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
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
        debounceTimer = setTimeout(() => {
            syncStateFromUI();
            renderPreviewIframe();
        }, 200);
    }

    function renderPreviewIframe() {
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
            doc.documentElement.innerHTML = html;
        } else {
            doc.open();
            doc.write(html);
            doc.close();
        }
    }
    function selectTemplate(name) { const t=document.querySelector('.template-tab[onclick*="'+name+'"]'); if(t) switchTemplate(name,t); }
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
        await loadResumes();
        updatePreview();
    }

    // ── Load Saved Resumes ──
    async function loadResumes() {
        const listEl = document.getElementById('resumeList');
        if (!listEl) return;
        listEl.innerHTML = '<div class="empty-state"><div class="empty-icon"></div><p>Loading resumes...</p></div>';

        const { data, error } = await client
            .from('resumes')
            .select('*')
            .eq('user_id', currentUserId)
            .order('created_at', { ascending: false });

        if (error) {
            listEl.innerHTML = '<div class="empty-state"><div class="empty-icon"></div><p>Could not load resumes. Please refresh the page.</p></div>';
            return;
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
    }

    function buildResumeCard(r) {
        const exp = r.experience || [];
        const edu = r.education || [];
        const skList = r.skills || [];
        const date = new Date(r.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        const updatedDate = r.updated_at ? new Date(r.updated_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : null;

        const skillTags = skList.slice(0, 4).map(s => `<span class="resume-card-tag">${escapeHtml(s)}</span>`).join('');
        const extraSkills = skList.length > 4 ? `<span class="resume-card-tag">+${skList.length - 4} more</span>` : '';

        const templateName = r.template_name || 'modern';
        const shareInfo = shareViewMap[r.id];
        const viewBadge = shareInfo ? `<span class="view-badge">Views: ${shareInfo.viewCount}</span>` : '';

        return `
            <div class="resume-card" id="card-${r.id}">
                <div class="card-badges">
                    <span class="template-badge">${escapeHtml(templateName)} Template</span>${viewBadge}
                </div>
                <div class="resume-card-title">${escapeHtml(r.full_name || 'Untitled Resume')}</div>
                <div class="resume-card-meta">
                    ${escapeHtml(r.email || '')}
                    ${r.location ? ' - ' + escapeHtml(r.location) : ''}
                    <br>
                    ${exp.length} experience${exp.length !== 1 ? 's' : ''} - ${edu.length} education ${edu.length === 1 ? 'entry' : 'entries'}
                    <br>
                    Saved ${date}${updatedDate && updatedDate !== date ? ' - Updated ' + updatedDate : ''}
                </div>
                <div class="resume-card-tags">
                    ${skillTags}${extraSkills}
                </div>
                <div class="card-actions-row">
                    <button class="btn btn-secondary" onclick="editResume('${r.id}')">Edit</button>
                    <button class="btn btn-secondary" onclick="downloadPDF('${r.id}')">PDF</button>
                    <button class="btn btn-secondary" onclick="shareResume('${r.id}')">Share</button>
                    <button class="btn btn-danger" onclick="openDeleteModal('${r.id}')">Delete</button>
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
        container.innerHTML = '';
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
            container.appendChild(tag);
        });
        container.appendChild(input);
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
        expCount = 0;
        eduCount = 0;
        skills = [];
        
        resumeState = {
            full_name: '',
            email: '',
            phone: '',
            location: '',
            professional_summary: '',
            experience: [],
            education: [],
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
        document.getElementById('aiBtnInsert')?.addEventListener('click', () => {
            if (currentAISection === 'summary') {
                handleInsertSummary();
            } else {
                acceptAISuggestion();
            }
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

        if (selector) {
            selector.querySelectorAll('.pill-btn').forEach(btn => {
                btn.addEventListener('click', () => {
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

        const box = document.getElementById('aiSuggestionsBox');
        const configPanel = document.getElementById('aiConfigPanel');
        const counterRow = document.getElementById('aiLiveCounterRow');
        const insertBtn = document.getElementById('aiBtnInsert');
        
        if (insertBtn) {
            if (section === 'summary') {
                insertBtn.textContent = 'Insert Summary';
                insertBtn.style.display = 'block';
            } else if (section === 'skills') {
                insertBtn.textContent = 'Add Skills';
                insertBtn.style.display = 'block';
            } else if (section === 'experience') {
                insertBtn.textContent = 'Insert Description';
                insertBtn.style.display = 'block';
            } else {
                insertBtn.style.display = 'none';
            }
        }

        if (section === 'summary') {
            if (box.textContent && box.textContent !== 'Getting AI suggestions...' && box.textContent !== 'Getting suggestions...') {
                lastRegeneratedSummary = box.textContent;
            } else {
                box.textContent = 'Getting AI suggestions...';
            }
        } else {
            box.textContent = 'Getting AI suggestions...';
        }

        currentAISuggestion = '';
        document.getElementById('aiDrawer')?.classList.add('ai-copilot-active');

        // Reset live counter
        const counter = document.getElementById('aiLiveCounter');
        if (counter) {
            let limitLabel = selectedWordLimit + ' words';
            if (customLimitActive) limitLabel = selectedWordLimit + ' (Custom)';
            counter.textContent = `0 / ${limitLabel}`;
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
                selectedLanguage: selectedLanguage
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
            
            if (section === 'summary' && lastRegeneratedSummary) {
                window.LayoutManager.showToast('Summary regenerated. <a href="#" id="aiUndoRegenAction" style="color:var(--cyan); margin-left:8px; font-weight:600; text-decoration:underline;">Undo</a>', 'success');
                setTimeout(() => {
                    const undoAnchor = document.getElementById('aiUndoRegenAction');
                    if (undoAnchor) {
                        undoAnchor.addEventListener('click', (e) => {
                            e.preventDefault();
                            undoRegenerateSummary();
                        });
                    }
                }, 100);
            }

            currentAISuggestion = result.suggestions || '';
            box.textContent = currentAISuggestion || '(No suggestion returned)';

            updateAISuggestionsCounter();
        } catch (err) {
            console.error('AI Suggestions Error:', err);
            if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError') || err.message.includes('fetch')) {
                box.textContent = 'AI suggestions require a connected backend. To enable this feature, deploy to a server with the /api/ai-suggestions endpoint configured.';
            } else {
                box.textContent = 'Error: ' + err.message;
            }
        }
    }

    function acceptAISuggestion() {
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
                textEl.value = currentAISuggestion;
                window.LayoutManager.showToast('Experience description polished with AI suggestion.', 'success');
            }
        }
        updatePreview();
        closeAIDrawer();
    }

    function closeAIDrawer() {
        if (isEditorEditingMode) {
            cancelEditorEdit();
        }
        document.getElementById('aiDrawer')?.classList.remove('ai-copilot-active');
        currentAISuggestion = '';
        currentAISection = '';
        currentAIItemIndex = null;
    }

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
    window.switchTemplate = switchTemplate;
    window.setAccentColor = setAccentColor;
    window.addExperience = () => addExperience();
    window.addEducation = () => addEducation();
    window.cancelEdit = cancelEdit;
    window.applyCustomization = applyCustomization;
    window.triggerAIGeneration = triggerAIGeneration;

    // Bind save handler on DOM
    document.addEventListener('DOMContentLoaded', () => {
        const form = document.getElementById('resumeForm');
        if (form) {
            form.addEventListener('submit', handleSave);
        }
        setupSkillsListener();
        setupAISettingsListeners();

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
                if (!drawer.contains(e.target) && !e.target.closest('.btn-ai')) {
                    closeAIDrawer();
                }
            }
        });
    });

    window.addEventListener('load', initPage);
})();

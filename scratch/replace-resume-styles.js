const fs = require('fs');
const content = fs.readFileSync('resume.html', 'utf8');

const styleStart = content.indexOf('<style>');
const styleEnd = content.indexOf('</style>') + '</style>'.length;

const newStyle = `<style>
/* ── Resume Builder page styles ── */
.resume-workspace { display:grid; grid-template-columns:1fr 1fr; gap:1.5rem; align-items:start; }
@media(max-width:960px){ .resume-workspace { grid-template-columns:1fr; } }
.form-panel { background:var(--bg-card); border:1px solid var(--border); border-radius:var(--r-xl); padding:2rem; box-shadow:var(--shadow-card); }
.preview-panel { position:sticky; top:5rem; background:var(--bg-card); border:1px solid var(--border); border-radius:var(--r-xl); box-shadow:var(--shadow-card); overflow:hidden; }
.preview-panel-header { padding:0.875rem 1.25rem; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; gap:0.75rem; }
.preview-panel-title { font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-3); }
.template-tabs { display:flex; gap:0.2rem; background:var(--bg-input); padding:3px; border-radius:var(--r-sm); }
.template-tab { padding:0.3rem 0.65rem; font-size:0.75rem; font-weight:600; color:var(--text-2); border:none; background:transparent; border-radius:4px; cursor:pointer; transition:background 0.15s, color 0.15s; font-family:inherit; }
.template-tab.active { background:var(--bg-card); color:var(--text-1); box-shadow:0 1px 4px rgba(0,0,0,0.4); }
.preview-body { padding:1.5rem; min-height:480px; font-size:0.82rem; line-height:1.65; color:var(--text-1); overflow-y:auto; max-height:calc(100vh - 14rem); }
.preview-placeholder { display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:380px; color:var(--text-3); text-align:center; gap:0.75rem; }
.preview-placeholder p { font-size:0.85rem; }
.customizer { padding:0.875rem 1.25rem; border-top:1px solid var(--border); display:flex; gap:1rem; flex-wrap:wrap; align-items:center; background:rgba(255,255,255,0.015); }
.customizer-group { display:flex; flex-direction:column; gap:0.3rem; }
.customizer-label { font-size:0.63rem; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-3); }
.customizer-select { background:var(--bg-input); border:1px solid var(--border-md); border-radius:var(--r-sm); color:var(--text-1); font-size:0.78rem; padding:0.3rem 0.6rem; outline:none; min-height:28px; cursor:pointer; font-family:inherit; }
.color-swatches { display:flex; gap:0.35rem; align-items:center; }
.color-swatch { width:18px; height:18px; border-radius:50%; cursor:pointer; border:2px solid transparent; transition:border-color 0.15s, transform 0.15s; }
.color-swatch:hover { transform:scale(1.2); }
.color-swatch.active { border-color:white; }
.page-section { margin-bottom:2.5rem; position:relative; z-index:1; }
.section-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem; }
.section-title { font-size:1.1rem; font-weight:700; color:var(--text-1); }
.form-row { display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1rem; }
@media(max-width:640px){ .form-row { grid-template-columns:1fr; } }
.form-group { margin-bottom:1.125rem; }
.form-group label { display:block; font-weight:700; margin-bottom:0.4rem; font-size:0.72rem; color:var(--text-3); text-transform:uppercase; letter-spacing:0.05em; }
.form-group input, .form-group textarea, .form-group select { width:100%; padding:0.75rem 1rem; background:var(--bg-input); border:1px solid var(--border-md); border-radius:var(--r-md); color:var(--text-1); font-family:inherit; font-size:0.9rem; outline:none; transition:border-color 0.15s, box-shadow 0.15s; min-height:44px; }
.form-group input:focus, .form-group textarea:focus, .form-group select:focus { border-color:var(--border-focus); box-shadow:0 0 0 3px rgba(0,210,255,0.1); }
.form-group textarea { resize:vertical; min-height:100px; line-height:1.65; }
.form-group select { appearance:none; -webkit-appearance:none; background-image:url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L6 7L11 1' stroke='%239898a8' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 1rem center; padding-right:2.5rem; }
.form-group select option { background:#1a1a24; color:#f0f0f5; }
.form-section-heading { font-size:0.88rem; font-weight:700; color:var(--text-1); margin:2rem 0 1rem; padding-bottom:0.65rem; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:0.5rem; }
.entry-card { background:var(--bg-input); border:1px solid var(--border); border-radius:var(--r-md); padding:1.5rem; margin-bottom:1rem; position:relative; transition:border-color 0.2s; }
.entry-card:hover { border-color:var(--border-hover); }
.entry-card .remove-btn { position:absolute; top:1rem; right:1rem; background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.2); color:#fca5a5; border-radius:var(--r-sm); padding:0.3rem 0.65rem; font-size:0.72rem; font-weight:700; cursor:pointer; transition:background 0.15s; }
.entry-card .remove-btn:hover { background:rgba(239,68,68,0.2); }
.btn-add-entry { width:100%; padding:0.875rem; background:transparent; border:1px dashed var(--border-md); color:var(--text-3); border-radius:var(--r-md); font-weight:600; font-size:0.85rem; cursor:pointer; transition:all 0.15s; display:flex; align-items:center; justify-content:center; gap:0.4rem; font-family:inherit; }
.btn-add-entry:hover { color:var(--text-1); border-color:var(--border-hover); background:rgba(255,255,255,0.03); }
.skills-container { display:flex; flex-wrap:wrap; gap:0.5rem; min-height:48px; padding:0.5rem; background:var(--bg-input); border:1px solid var(--border-md); border-radius:var(--r-md); cursor:text; transition:border-color 0.15s; }
.skills-container:focus-within { border-color:var(--border-focus); box-shadow:0 0 0 3px rgba(0,210,255,0.1); }
.skill-tag { display:inline-flex; align-items:center; gap:0.4rem; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.1); color:var(--text-1); padding:0.3rem 0.7rem; border-radius:999px; font-size:0.82rem; font-weight:500; }
.skill-tag button { background:none; border:none; color:var(--text-3); cursor:pointer; font-size:1rem; line-height:1; padding:0; transition:color 0.15s; }
.skill-tag button:hover { color:#fca5a5; }
.skill-input { border:none; background:transparent; color:var(--text-1); font-size:0.88rem; outline:none; min-width:120px; flex:1; padding:0.3rem; font-family:inherit; }
.alert { padding:0.875rem 1.125rem; border-radius:var(--r-md); margin-bottom:1.5rem; font-weight:500; display:none; font-size:0.88rem; }
.alert-error   { background:rgba(239,68,68,0.1);  border:1px solid rgba(239,68,68,0.3);  color:#fca5a5; }
.alert-success { background:rgba(34,197,94,0.1);  border:1px solid rgba(34,197,94,0.3);  color:#86efac; }
.resume-cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:1.25rem; }
.resume-card { background:var(--bg-input); border:1px solid var(--border); border-radius:var(--r-lg); padding:1.5rem; display:flex; flex-direction:column; transition:border-color 0.2s, transform 0.2s; }
.resume-card:hover { border-color:var(--border-hover); transform:translateY(-2px); }
.resume-card-title { font-size:1rem; font-weight:700; margin-bottom:0.25rem; color:var(--text-1); }
.resume-card-meta { font-size:0.8rem; color:var(--text-2); margin-bottom:1rem; line-height:1.6; }
.resume-card-tags { display:flex; flex-wrap:wrap; gap:0.4rem; margin-bottom:1.25rem; flex:1; }
.resume-card-tag { background:rgba(255,255,255,0.05); border:1px solid var(--border); color:var(--text-2); padding:0.2rem 0.65rem; border-radius:999px; font-size:0.72rem; }
.card-actions-row { display:flex; gap:0.5rem; flex-wrap:wrap; margin-top:auto; }
.card-badges { display:flex; gap:0.4rem; margin-bottom:0.75rem; }
.template-badge { background:rgba(0,210,255,0.08); border:1px solid rgba(0,210,255,0.2); color:var(--cyan); padding:0.15rem 0.55rem; border-radius:999px; font-size:0.7rem; font-weight:700; text-transform:capitalize; }
.view-badge { background:rgba(255,255,255,0.05); border:1px solid var(--border); color:var(--text-2); padding:0.15rem 0.55rem; border-radius:999px; font-size:0.7rem; }
.empty-state { text-align:center; padding:3rem 2rem; color:var(--text-2); background:rgba(255,255,255,0.02); border:1px dashed var(--border); border-radius:var(--r-lg); }
.empty-state .empty-icon { font-size:2.5rem; margin-bottom:1rem; opacity:0.5; }
.save-bar { padding-top:1.5rem; border-top:1px solid var(--border); margin-top:1.5rem; display:flex; gap:0.75rem; align-items:center; }
.modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.8); backdrop-filter:blur(12px); z-index:8000; display:none; align-items:center; justify-content:center; padding:1.5rem; opacity:0; transition:opacity 0.3s; }
.modal-overlay.active { display:flex; opacity:1; }
.modal { background:#161620; border:1px solid var(--border-md); border-radius:var(--r-xl); padding:2rem; max-width:460px; width:100%; box-shadow:var(--shadow-lg); transform:scale(0.95) translateY(16px); transition:transform 0.4s var(--ease); }
.modal-overlay.active .modal { transform:scale(1) translateY(0); }
.modal h3 { font-size:1.2rem; font-weight:700; margin-bottom:0.875rem; }
.modal p { color:var(--text-2); margin-bottom:1.5rem; line-height:1.7; font-size:0.9rem; }
.modal-actions { display:flex; gap:0.75rem; justify-content:flex-end; }
.share-link-box { display:flex; gap:0.5rem; margin-bottom:1rem; }
.share-link-box input { flex:1; padding:0.75rem 1rem; background:var(--bg-input); border:1px solid var(--border-md); border-radius:var(--r-md); color:var(--text-2); font-size:0.82rem; font-family:monospace; outline:none; }
.ai-suggestions-box { background:var(--bg-input); border:1px solid var(--border); border-radius:var(--r-md); padding:1.25rem; min-height:120px; white-space:pre-wrap; font-size:0.9rem; line-height:1.7; color:var(--text-1); margin-bottom:1.5rem; }
.modal-large { max-width:680px; }
.btn-ai { padding:0.3rem 0.7rem; font-size:0.72rem; font-weight:700; border:1px solid rgba(0,210,255,0.25); background:rgba(0,210,255,0.08); color:var(--cyan); border-radius:999px; cursor:pointer; transition:background 0.15s; margin-left:auto; font-family:inherit; }
.btn-ai:hover { background:rgba(0,210,255,0.15); }
#livePreviewContent { font-family:'Inter',sans-serif; }
.preview-contact { font-size:0.75rem; color:var(--text-2); margin-bottom:0.875rem; }
.tpl-classic .preview-contact { text-align:center; }
.tpl-classic h1 { text-align:center; text-transform:uppercase; letter-spacing:0.06em; font-size:1.2rem; }
.tpl-creative h1 { color:var(--cyan); font-size:1.4rem; }
.preview-divider { height:1px; background:var(--border-md); margin:0.75rem 0; }
.tpl-classic .preview-divider { height:2px; background:rgba(255,255,255,0.2); }
.tpl-creative .preview-divider { background:var(--cyan); }
.preview-section-title { font-size:0.63rem; font-weight:800; text-transform:uppercase; letter-spacing:0.1em; color:var(--text-3); margin:0.875rem 0 0.4rem; }
.tpl-creative .preview-section-title { color:var(--cyan); }
.preview-text { font-size:0.8rem; color:var(--text-2); line-height:1.6; margin-bottom:0.4rem; }
.preview-exp-title { font-size:0.85rem; font-weight:700; color:var(--text-1); }
.preview-exp-meta { font-size:0.75rem; color:var(--text-3); margin-bottom:0.25rem; }
.preview-skills { display:flex; flex-wrap:wrap; gap:0.3rem; margin-top:0.25rem; }
.preview-skill { background:rgba(255,255,255,0.07); border:1px solid var(--border); border-radius:999px; padding:0.15rem 0.5rem; font-size:0.7rem; color:var(--text-2); }
</style>`;

const newContent = content.substring(0, styleStart) + newStyle + content.substring(styleEnd);
fs.writeFileSync('resume.html', newContent, 'utf8');
console.log('Done. New file size:', newContent.length);

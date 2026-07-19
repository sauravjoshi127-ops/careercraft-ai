const fs = require('fs');
const path = require('path');

const dashPath = path.join(__dirname, '..', 'dashboard.html');
let content = fs.readFileSync(dashPath, 'utf8');

// Helper to replace exactly and normalize newlines
function replaceCSS(oldStr, newStr) {
    const normalize = str => str.replace(/\r\n/g, '\n');
    let nContent = normalize(content);
    let nOld = normalize(oldStr);
    if(nContent.includes(nOld)) {
        content = nContent.replace(nOld, newStr);
    } else {
        console.error("Failed to find chunk:\n" + oldStr.substring(0, 50) + "...");
    }
}

// 1. .command-header, .metrics-row, .metric-label
replaceCSS(`        .command-header {
            margin-top: 3.5rem;
            margin-bottom: 2.5rem;
        }
        .metrics-row {
            display: flex;
            flex-wrap: wrap;
            gap: 3rem;
            border-top: 1px solid var(--border);
            padding-top: 1.5rem;
            margin-top: 1.5rem;
        }
        .metric-item {
            display: flex;
            flex-direction: column;
            gap: 0.25rem;
        }
        .metric-label {
            font-size: 0.72rem;
            font-weight: 700;
            letter-spacing: 0.05em;
            text-transform: uppercase;
            color: var(--text-3);
        }`, `        .command-header {
            margin-top: 3.5rem;
            margin-bottom: 2rem;
        }
        .metrics-row {
            display: flex;
            flex-wrap: wrap;
            gap: 3rem;
            border-top: 1px solid var(--border-md);
            padding-top: 1.5rem;
            margin-top: 1.5rem;
        }
        .metric-item {
            display: flex;
            flex-direction: column;
            gap: 0.25rem;
        }
        .metric-label {
            font-size: 0.75rem;
            font-weight: 500;
            letter-spacing: 0.03em;
            text-transform: uppercase;
            color: var(--text-3);
        }`);

// 2. .smart-grid & .smart-card
replaceCSS(`        /* Smart Card Grid Styles */
        .smart-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
            gap: 1.5rem;
            margin-bottom: 4rem;
        }

        .smart-card {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: var(--r-xl);
            padding: 2rem;
            position: relative;
            display: flex;
            flex-direction: column;
            min-height: 280px;
            transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.2s ease;
            will-change: transform, box-shadow;
            outline: none;
        }

        .smart-card::before {
            content: "";
            position: absolute;
            top: 0; left: 0; right: 0; height: 1px;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent);
            pointer-events: none;
            border-radius: var(--r-xl) var(--r-xl) 0 0;
        }

        .smart-card:hover {
            border-color: rgba(99, 102, 241, 0.3);
            transform: translateY(-3px);
            box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(99, 102, 241, 0.12);
        }`, `        /* Smart Card Grid Styles */
        .smart-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
            gap: 1rem;
            margin-bottom: 4rem;
        }

        .smart-card {
            background: var(--bg-card);
            border: 1px solid rgba(255, 255, 255, 0.06);
            border-radius: var(--r-xl);
            padding: 1.5rem;
            position: relative;
            display: flex;
            flex-direction: column;
            min-height: 280px;
            transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            will-change: box-shadow;
            outline: none;
        }

        .smart-card:hover {
            border-color: rgba(255, 255, 255, 0.15);
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
        }`);

// 3. .smart-card-title
replaceCSS(`        .smart-card-title {
            font-size: 1.1rem;
            font-weight: 700;
            color: var(--text-1);
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin-bottom: 1.5rem;
        }`, `        .smart-card-title {
            font-size: 1rem;
            font-weight: 600;
            color: var(--text-1);
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin-bottom: 1.25rem;
        }`);

// 4. .panel-card
replaceCSS(`        .panel-card {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: var(--r-lg);
            padding: 2rem;
            box-shadow: var(--shadow-card);
            position: relative;
        }

        .panel-card::before {
            content: "";
            position: absolute;
            top: 0; left: 0; right: 0; height: 1px;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent);
            pointer-events: none;
            border-radius: var(--r-lg) var(--r-lg) 0 0;
        }

        .panel-title {
            font-size: 1.1rem;
            font-weight: 700;
            color: var(--text-1);
            margin-bottom: 1.5rem;
            border-bottom: 1px solid var(--border);
            padding-bottom: 0.75rem;
        }`, `        .panel-card {
            background: var(--bg-card);
            border: 1px solid rgba(255, 255, 255, 0.06);
            border-radius: var(--r-lg);
            padding: 1.5rem;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            position: relative;
        }

        .panel-title {
            font-size: 1rem;
            font-weight: 600;
            color: var(--text-1);
            margin-bottom: 1.25rem;
            border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            padding-bottom: 0.75rem;
        }`);

// 5. Activity items
replaceCSS(`        .activity-title {
            font-size: 0.88rem;
            font-weight: 600;
            color: var(--text-1);
        }`, `        .activity-title {
            font-size: 0.85rem;
            font-weight: 500;
            color: var(--text-1);
        }`);

replaceCSS(`        .activity-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.75rem 1rem;
            background: rgba(255, 255, 255, 0.01);
            border: 1px solid var(--border);
            border-radius: var(--r-sm);
            transition: background 0.2s ease, border-color 0.2s ease;
            will-change: background, border-color;
            outline: none;
        }

        .activity-item:hover {
            background: rgba(255, 255, 255, 0.04);
            border-color: rgba(255, 255, 255, 0.2);
        }`, `        .activity-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.75rem 1rem;
            background: transparent;
            border: 1px solid rgba(255, 255, 255, 0.06);
            border-radius: var(--r-sm);
            transition: background 0.2s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            will-change: background, border-color;
            outline: none;
        }

        .activity-item:hover {
            background: rgba(255, 255, 255, 0.03);
            border-color: rgba(255, 255, 255, 0.15);
        }`);

// 6. Quick items
replaceCSS(`        .quick-item {
            display: flex;
            flex-direction: column;
            gap: 0.25rem;
            padding: 0.75rem 1rem;
            background: rgba(255, 255, 255, 0.01);
            border-left: 3px solid var(--cyan);
            border-top: 1px solid var(--border);
            border-right: 1px solid var(--border);
            border-bottom: 1px solid var(--border);
            border-radius: var(--r-sm);
            transition: background 0.2s ease, transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            text-decoration: none;
            will-change: transform, background;
            outline: none;
        }

        .quick-item:hover {
            background: rgba(255, 255, 255, 0.04);
            transform: translateX(4px);
        }`, `        .quick-item {
            display: flex;
            flex-direction: column;
            gap: 0.25rem;
            padding: 0.75rem 1rem;
            background: transparent;
            border: 1px solid rgba(255, 255, 255, 0.06);
            border-radius: var(--r-sm);
            transition: background 0.2s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            text-decoration: none;
            outline: none;
        }

        .quick-item:hover {
            background: rgba(255, 255, 255, 0.03);
            border-color: rgba(255, 255, 255, 0.15);
        }`);

replaceCSS(`        .quick-action-text {
            font-size: 0.85rem;
            font-weight: 600;
            color: var(--text-1);
        }`, `        .quick-action-text {
            font-size: 0.85rem;
            font-weight: 500;
            color: var(--text-1);
        }`);

fs.writeFileSync(dashPath, content);
console.log("Successfully applied dashboard polish!");

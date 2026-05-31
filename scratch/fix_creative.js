const fs = require('fs');
const path = 'c:/Users/saura/.gemini/antigravity/scratch/careercraft-ai/resume.html';
let content = fs.readFileSync(path, 'utf8');

// Fix 1: Remove the <script> tags from inside the Creative template literal
// These tags break the browser HTML parser by closing the <script> block early
const badCreativeEnd = `            </div>\r\n        </div>\r\n    <script src="ambient3d.js"></script>\r\n<script src="wow-effects.js"></script>\r\n</body></html>\`;\r\n}`;
const goodCreativeEnd = `            </div>\r\n        </div>\r\n    </div>\r\n</body></html>\`;\r\n}`;

if (content.includes(badCreativeEnd)) {
    content = content.replace(badCreativeEnd, goodCreativeEnd);
    console.log('Fixed Creative template script tag leak');
} else {
    // Try without \r
    const badAlt = `            </div>\n        </div>\n    <script src="ambient3d.js"></script>\n<script src="wow-effects.js"></script>\n</body></html>\`;\n}`;
    const goodAlt = `            </div>\n        </div>\n    </div>\n</body></html>\`;\n}`;
    if (content.includes(badAlt)) {
        content = content.replace(badAlt, goodAlt);
        console.log('Fixed Creative template script tag leak (LF variant)');
    } else {
        // Find by line number approach
        const lines = content.split('\n');
        let found = false;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('ambient3d.js') && lines[i-1] && lines[i-2] && lines[i-2].includes('</div>')) {
                // Check if this is inside a template literal (next meaningful line should be </body></html>`)
                if (lines[i+1] && lines[i+1].includes('wow-effects.js')) {
                    lines.splice(i, 2); // remove the two script lines
                    console.log('Fixed by line removal at line ' + i);
                    found = true;
                    break;
                }
            }
        }
        if (found) {
            content = lines.join('\n');
        } else {
            console.log('ERROR: Could not find the bad pattern to fix');
            // Show surrounding content for debugging
            const idx = content.indexOf('ambient3d.js');
            while (idx !== -1) {
                const start = Math.max(0, idx - 100);
                const end = Math.min(content.length, idx + 150);
                console.log('Found ambient3d.js at position ' + idx + ':');
                console.log(JSON.stringify(content.substring(start, end)));
                break;
            }
        }
    }
}

fs.writeFileSync(path, content);

// Verify the fix
const verify = fs.readFileSync(path, 'utf8');
const remaining = (verify.match(/ambient3d\.js/g) || []).length;
console.log('Remaining ambient3d.js references: ' + remaining);
console.log('Done');

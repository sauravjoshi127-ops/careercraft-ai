const fs = require('fs');
const path = require('path');

const dir = __dirname;
const htmlFiles = [
  'login.html', 'interview.html', 'index.html', 'dashboard.html',
  'cover-letter.html', 'cold-email.html', 'resume.html', 'settings.html', 'signup.html'
];

htmlFiles.forEach(file => {
  const filePath = path.join(dir, file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(/class="cc-nav"/g, 'class="ch-nav"');
    fs.writeFileSync(filePath, content);
  }
});

const layoutManager = path.join(dir, 'layout-manager.js');
if (fs.existsSync(layoutManager)) {
  let content = fs.readFileSync(layoutManager, 'utf8');
  content = content.replace(/\.cc-nav/g, '.ch-nav');
  content = content.replace(/id="cc-main-content"/g, 'id="ch-main-content"'); // just in case
  fs.writeFileSync(layoutManager, content);
}

console.log('Finished updating html and layout-manager.js');

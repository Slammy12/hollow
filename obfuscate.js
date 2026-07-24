const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('Installing javascript-obfuscator if needed...');
try {
  require.resolve('javascript-obfuscator');
} catch (e) {
  execSync('npm install --save-dev javascript-obfuscator', { stdio: 'inherit' });
}

const JavaScriptObfuscator = require('javascript-obfuscator');

const htmlPath = path.join(__dirname, 'index.html');
let htmlContent = fs.readFileSync(htmlPath, 'utf8');

// Match content inside <script> tags
const scriptRegex = /<script>([\s\S]*?)<\/script>/gi;

let obfuscatedHtml = htmlContent.replace(scriptRegex, (match, jsCode) => {
  if (!jsCode.trim()) return match;
  
  console.log('Obfuscating JavaScript...');
  const obfuscatedResult = JavaScriptObfuscator.obfuscate(jsCode, {
    compact: true,
    controlFlowFlattening: true,
    deadCodeInjection: true,
    debugProtection: false,
    disableConsoleOutput: false,
    identifierNamesGenerator: 'hexadecimal',
    log: false,
    renameGlobals: false,
    rotateStringArray: true,
    selfDefending: true,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.75
  });

  return `<script>\n${obfuscatedResult.getObfuscatedCode()}\n</script>`;
});

// Output to index.html (or dist/index.html)
fs.writeFileSync(htmlPath, obfuscatedHtml, 'utf8');
console.log('✅ index.html JavaScript successfully obfuscated!');

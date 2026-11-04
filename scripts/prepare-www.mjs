import fs from 'node:fs';
import path from 'node:path';

const files = ['index.html', 'sw.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'];
fs.mkdirSync('www', { recursive: true });
for (const file of files) {
  if (fs.existsSync(file)) {
    fs.copyFileSync(file, path.join('www', file));
  }
}
console.log('Copied web assets into www/');

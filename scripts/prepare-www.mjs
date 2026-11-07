import fs from 'node:fs';
import path from 'node:path';

const required = [
  'index.html',
  'sw.js',
  'manifest.webmanifest'
];

const optional = [
  'icon.svg',
  'icon-192.png',
  'icon-512.png'
];

for (const file of required) {
  if (!fs.existsSync(file)) {
    throw new Error(`필수 웹 파일 없음: ${file}`);
  }
}

const html = fs.readFileSync('index.html', 'utf8');

const linkedScripts = [
  ...html.matchAll(
    /<script\b[^>]*\bsrc=["']([^"']+)["']/g
  )
]
  .map((match) => match[1])
  .filter(
    (source) =>
      !/^([a-z]+:)?\/\//i.test(source)
  );

const files = new Set([
  ...required,
  ...optional
]);

for (const source of linkedScripts) {
  const clean = source
    .split(/[?#]/)[0]
    .replace(/^\.\//, '');

  if (
    path.isAbsolute(clean) ||
    clean.split('/').includes('..')
  ) {
    throw new Error(`안전하지 않은 경로: ${source}`);
  }

  if (!fs.existsSync(clean)) {
    throw new Error(`스크립트 파일 없음: ${clean}`);
  }

  files.add(clean);
}

fs.mkdirSync('www', {
  recursive: true
});

let copied = 0;

for (const file of files) {
  if (!fs.existsSync(file)) {
    console.warn(
      `선택 파일 없음 — 기존 아이콘을 유지하세요: ${file}`
    );

    continue;
  }

  const target = path.join('www', file);

  fs.mkdirSync(path.dirname(target), {
    recursive: true
  });

  fs.copyFileSync(file, target);
  copied += 1;
}

console.log(`웹 자산 복사 완료: ${copied}개`);

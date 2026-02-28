// Post-build fixups for Next.js standalone output.
// 1. Copy next-server app-route files (existing fix)
// 2. Copy sql.js dist into the hashed node_modules path Turbopack creates
// 3. Remove sharp native binaries (optional for Next.js, breaks universal builds)

const fs = require('fs');
const path = require('path');

// --- Fix 1: next-server app-route files ---
const nsSrc = path.join('node_modules/next/dist/compiled/next-server');
const nsDst = path.join('.next/standalone/node_modules/next/dist/compiled/next-server');
try {
  fs.readdirSync(nsSrc)
    .filter(f => f.includes('app-route'))
    .forEach(f => {
      try { fs.copyFileSync(path.join(nsSrc, f), path.join(nsDst, f)); } catch {}
    });
} catch {}

// --- Fix 2: sql.js dist folder ---
const hashedModules = path.join('.next/standalone/.next/node_modules');
if (fs.existsSync(hashedModules)) {
  const sqlDirs = fs.readdirSync(hashedModules).filter(d => d.startsWith('sql.js'));
  const srcDist = path.join('node_modules/sql.js/dist');
  for (const dir of sqlDirs) {
    const dstDist = path.join(hashedModules, dir, 'dist');
    if (!fs.existsSync(dstDist)) fs.mkdirSync(dstDist, { recursive: true });
    for (const file of fs.readdirSync(srcDist)) {
      fs.copyFileSync(path.join(srcDist, file), path.join(dstDist, file));
    }
    console.log(`Copied sql.js dist -> ${dstDist}`);
  }
}

// Also copy into the regular standalone node_modules in case it's resolved from there
const regularSqlJs = path.join('.next/standalone/node_modules/sql.js');
if (fs.existsSync(regularSqlJs)) {
  const srcDist = path.join('node_modules/sql.js/dist');
  const dstDist = path.join(regularSqlJs, 'dist');
  if (!fs.existsSync(dstDist)) fs.mkdirSync(dstDist, { recursive: true });
  for (const file of fs.readdirSync(srcDist)) {
    fs.copyFileSync(path.join(srcDist, file), path.join(dstDist, file));
  }
  console.log(`Copied sql.js dist -> ${dstDist}`);
}

// --- Fix 3: Remove sharp native binaries (breaks universal merge) ---
const standaloneNM = path.join('.next/standalone/node_modules/@img');
if (fs.existsSync(standaloneNM)) {
  fs.rmSync(standaloneNM, { recursive: true, force: true });
  console.log('Removed @img/sharp native binaries from standalone');
}

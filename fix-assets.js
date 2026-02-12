const fs = require('fs');
const path = require('path');

// 1. Define where the hidden files are (Source)
const sourceDir = path.join(__dirname, 'node_modules', '@3d-dice', 'dice-box', 'dist', 'assets');

// 2. Define where they need to go (Destination)
const destDir = path.join(__dirname, 'public', 'assets', 'dice-box');

// 3. Helper function to copy files recursively
function copyRecursiveSync(src, dest) {
    if (fs.existsSync(src)) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }
        fs.readdirSync(src).forEach((childItemName) => {
            const srcPath = path.join(src, childItemName);
            const destPath = path.join(dest, childItemName);
            const stats = fs.statSync(srcPath);
            if (stats.isDirectory()) {
                copyRecursiveSync(srcPath, destPath);
            } else {
                fs.copyFileSync(srcPath, destPath);
                console.log(`✅ Copied: ${childItemName}`);
            }
        });
    } else {
        console.error(`❌ Could not find source: ${src}`);
        console.error("Run 'npm install' first!");
    }
}

console.log("🛠️  Fixing Dice Assets...");
copyRecursiveSync(sourceDir, destDir);
console.log("🎉 Done! Files are in public/assets/dice-box/");
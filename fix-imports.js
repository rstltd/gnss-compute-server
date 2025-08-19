#!/usr/bin/env node

/**
 * 修復編譯後 JavaScript 文件的 ES 模組導入路徑
 * 為相對導入添加 .js 擴展名，但保持外部模組不變
 */

import fs from 'fs';
import path from 'path';

function fixImportsInFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    
    // 修復相對導入路徑 (./xxx 或 ../xxx)，但不影響外部模組
    content = content.replace(/from ['"`](\.[^'"`]*?)['"`]/g, (match, importPath) => {
        if (!importPath.endsWith('.js')) {
            modified = true;
            return `from '${importPath}.js'`;
        }
        return match;
    });
    
    if (modified) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`✅ Fixed imports in: ${filePath}`);
    }
}

function fixImportsInDirectory(dirPath) {
    const items = fs.readdirSync(dirPath);
    
    for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stats = fs.statSync(itemPath);
        
        if (stats.isDirectory()) {
            fixImportsInDirectory(itemPath);
        } else if (item.endsWith('.js')) {
            fixImportsInFile(itemPath);
        }
    }
}

// 修復 dist 目錄中的所有 JS 文件
console.log('🔧 Fixing ES module imports in compiled JavaScript files...');
fixImportsInDirectory('./dist');
console.log('✅ Import fixing completed!');
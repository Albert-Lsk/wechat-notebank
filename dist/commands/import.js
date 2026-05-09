"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.importCommand = importCommand;
const fetch_1 = require("./fetch");
const importer_1 = require("../lib/importer");
async function importCommand(filePath) {
    console.log(`📚 正在导入 Excel: ${filePath}`);
    const summary = await (0, importer_1.importWorkbook)(filePath, async (row) => {
        console.log(`\n📥 [第 ${row.rowNumber} 行] 正在获取文章: ${row.url}`);
        const result = await (0, fetch_1.archiveArticle)(row.url, row.outputPath);
        console.log(`✅ [第 ${row.rowNumber} 行] 已保存: ${result.filePath}`);
    });
    console.log('\n导入完成');
    console.log(`✅ 成功: ${summary.success}`);
    console.log(`❌ 失败: ${summary.failure}`);
    console.log(`⏭️  跳过: ${summary.skipped}`);
    if (summary.failures.length > 0) {
        console.log('\n失败详情:');
        for (const failure of summary.failures) {
            console.log(`❌ [第 ${failure.rowNumber} 行] 序号: ${failure.sequence}, 链接: ${failure.url}, 输出: ${failure.outputPath}, 原因: ${failure.message}`);
        }
    }
    if (summary.failure > 0) {
        throw new Error(`导入完成，但有 ${summary.failure} 行失败`);
    }
}

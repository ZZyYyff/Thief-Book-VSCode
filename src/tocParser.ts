// TXT 小说目录解析：从原始文本（带换行）中提取章节标题及在全文中的字符偏移

export interface TocEntry {
    title: string;
    offset: number;
}

// 中文章节：第[数字][章卷集部回节篇]，支持中文数字/阿拉伯数字/零填充
const ZH_CHAPTER_RE = /^\s*第[零〇一二三四五六七八九十百千万两0-9]+[章卷集部回节篇]/;
// 中文特殊章节：楔子/序章/尾声/番外 等（可带标题）
const ZH_SPECIAL_RE = /^\s*(?:序章|序言|序|楔子|引子|尾声|大结局|番外(?:篇|外传)?|后记|前言|简介|题记)(?:\s|[:：、]|$)/;
// 英文章节：Chapter/Part + 数字
const EN_CHAPTER_RE = /^\s*(?:chapter|part)\s+[0-9]+/i;
// 英文特殊章节：Prologue/Epilogue/Appendix 等
const EN_SPECIAL_RE = /^\s*(?:prologue|epilogue|appendix)\b/i;

/**
 * 将字符偏移换算为页号（页码从 1 开始）
 */
export function offsetToPage(offset: number, pageSize: number): number {
    return Math.floor(offset / pageSize) + 1;
}

/**
 * 解析 TXT 文本中的章节目录
 * @param rawText 原始文本（保留换行结构，与页面显示用的压缩文本同源）
 * @param isEnglish 是否英文书
 * @returns 章节列表（标题 + 行首字符偏移）
 */
export function parseTxtToc(rawText: string, isEnglish: boolean): TocEntry[] {
    const entries: TocEntry[] = [];
    let offset = 0;

    for (const rawLine of rawText.split(/\r?\n/)) {
        const line = rawLine.trim();
        const matched = isEnglish
            ? EN_CHAPTER_RE.test(line) || EN_SPECIAL_RE.test(line)
            : ZH_CHAPTER_RE.test(line) || ZH_SPECIAL_RE.test(line);

        if (matched && line) {
            entries.push({ title: line, offset });
        }
        offset += rawLine.length + 1; // +1 为换行符
    }

    return entries;
}

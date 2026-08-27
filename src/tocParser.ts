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
 * 将源码文本空间的目录偏移映射到"替换链处理后的显示文本"空间。
 * 显示文本的生成规则（与 readTxtFile/readEpubFile 一致）：
 *   \n → lineBreak；\r → " "；　　→ " "（每对全角空格缩 1 位）；其余 1:1
 * @param source 源码文本（TXT 为 rawText，EPUB 为拼接文本）
 * @param entries 升序排列的目录（原样返回新数组，标题不变）
 */
export function mapOffsetsToProcessed(source: string, lineBreak: string, entries: TocEntry[]): TocEntry[] {
    if (!entries.length) {
        return [];
    }

    const mapped: TocEntry[] = [];
    let processed = 0;
    let j = 0;

    for (let i = 0; i <= source.length && j < entries.length; i++) {
        if (i === entries[j].offset) {
            mapped.push({ title: entries[j].title, offset: processed });
            j++;
        }
        if (i < source.length) {
            const ch = source[i];
            if (ch === '\n') {
                processed += lineBreak.length;
            } else if (ch === '　' && source[i + 1] === '　') {
                processed += 1;
                i++; // 跳过全角空格对中的第二个字符
            } else {
                processed += 1;
            }
        }
    }

    return mapped;
}

/**
 * 根据当前阅读位置（页首字符偏移）找到应定位的目录项下标
 * 规则：取最后一个 offset 不超过 startChar 的章节；无匹配时返回 0
 */
export function findActiveTocIndex(entries: TocEntry[], startChar: number): number {
    let index = 0;
    for (let i = 0; i < entries.length; i++) {
        if (entries[i].offset <= startChar) {
            index = i;
        }
    }
    return index;
}

/**
 * 当前阅读页对应的章节标题；无目录或页号异常时返回空串
 */
export function getCurrentChapterTitle(entries: TocEntry[], currPage: number, pageSize: number): string {
    if (!entries.length) {
        return "";
    }
    const startChar = (currPage - 1) * pageSize;
    return entries[findActiveTocIndex(entries, startChar)].title;
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

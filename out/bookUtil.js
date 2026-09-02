"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Book = exports.tbLog = void 0;
const vscode_1 = require("vscode");
const fs = require("fs");
const path = require("path");
const epubUtil_1 = require("./epubUtil");
const tocParser_1 = require("./tocParser");
const debounce_1 = require("./debounce");
const progress_1 = require("./progress");
let outputChannel = null;
/**
 * 输出到"Thief Book"日志频道（输出面板 Ctrl+Shift+U → 下拉选 Thief Book）
 */
function tbLog(msg) {
    if (!outputChannel) {
        outputChannel = vscode_1.window.createOutputChannel('Thief Book');
    }
    outputChannel.appendLine(msg);
}
exports.tbLog = tbLog;
class Book {
    constructor(extensionContext) {
        this.curr_page_number = 1;
        this.page_size = 50;
        this.page = 0;
        this.start = 0;
        this.end = this.page_size;
        this.filePath = "";
        this.cachedText = ""; // 缓存解析后的文本
        this.cachedLineBreak = ""; // 生成 cachedText 时用的分隔符（变化时需重建）
        this.rawText = ""; // TXT 原始文本（保留换行，供目录解析）
        this.epubParser = null; // 缓存的 EPUB 解析器（供目录读取）
        this.tocCache = null; // 缓存的目录（映射到显示文本空间）
        this.fileType = null; // 文件类型
        this.progressLoaded = false; // 起始页号只从存储加载一次（之后以内存/翻页结果为准）
        // 防抖 3s 写进度（globalState）：
        // 全局配置写（settings.json 序列化 + 广播）单次实测 900ms+，即使合并仍会在写期间阻塞主进程；
        // Memento 写快且零广播，进度存这里，settings.json 不再被扩展写入
        this.debouncedProgressWrite = debounce_1.createDebounced((page) => {
            var wp = Date.now();
            this.extensionContext.globalState.update('bookPageNumber', page).then(() => tbLog(`[tb-perf] progress write done: ${Date.now() - wp}ms`), (e) => tbLog(`[tb-perf] progress write failed: ${e}`));
        }, 3000);
        this.extensionContext = extensionContext;
    }
    getSize(text) {
        let size = text.length;
        this.page = Math.ceil(size / this.page_size);
    }
    getFileName() {
        var file_name = this.filePath.split("/").pop();
        console.log(file_name);
    }
    getPage(type) {
        // 翻页用内存页号（进度实时在内存）；仅跳页("curr")读配置——用户手动改设置后执行跳转
        var curr_page;
        if (type === "curr") {
            curr_page = (vscode_1.workspace.getConfiguration().get('thiefBook.currPageNumber') || 1);
        }
        else {
            curr_page = this.curr_page_number;
        }
        var page = 0;
        if (type === "previous") {
            if (curr_page <= 1) {
                page = 1;
            }
            else {
                page = curr_page - 1;
            }
        }
        else if (type === "next") {
            if (curr_page >= this.page) {
                page = this.page;
            }
            else {
                page = curr_page + 1;
            }
        }
        else if (type === "curr") {
            page = curr_page;
        }
        this.curr_page_number = page;
    }
    updatePage() {
        // var page = 0;
        // if (type === "previous") {
        //     if (this.curr_page_number! <= 1) {
        //         page = 1;
        //     } else {
        //         page = this.curr_page_number! - 1;
        //     }
        // } else if (type === "next") {
        //     if (this.curr_page_number! >= this.page) {
        //         page = this.page;
        //     } else {
        //         page = this.curr_page_number! + 1;
        //     }
        // }
        this.debouncedProgressWrite(this.curr_page_number);
    }
    getStartEnd() {
        this.start = this.curr_page_number * this.page_size;
        this.end = this.curr_page_number * this.page_size - this.page_size;
    }
    /**
     * 检测文件类型
     */
    detectFileType(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.epub') {
            return 'epub';
        }
        return 'txt';
    }
    /**
     * 读取 TXT 文件
     */
    readTxtFile() {
        if (this.filePath === "" || typeof (this.filePath) === "undefined") {
            vscode_1.window.showWarningMessage("请填写TXT格式的小说文件路径 & Please fill in the path of the TXT format novel file");
            return "";
        }
        var line_break = vscode_1.workspace.getConfiguration().get('thiefBook.lineBreak');
        // 缓存处理结果：全量读盘 + 4 次全文本替换是每次翻页延迟的主因，只在首次/分隔符变化时执行
        if (this.cachedText && this.cachedLineBreak === line_break) {
            return this.cachedText;
        }
        var data = fs.readFileSync(this.filePath, 'utf-8');
        this.rawText = data.toString();
        this.cachedText = this.rawText
            .replace(/\n/g, line_break)
            .replace(/\r/g, " ")
            .replace(/　　/g, " ")
            .replace(/ /g, " ");
        this.cachedLineBreak = line_break;
        return this.cachedText;
    }
    /**
     * 读取 EPUB 文件
     */
    readEpubFile() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.filePath === "" || typeof (this.filePath) === "undefined") {
                vscode_1.window.showWarningMessage("请填写EPUB格式的小说文件路径 & Please fill in the path of the EPUB format novel file");
                return "";
            }
            try {
                // 如果已缓存，直接返回
                if (this.cachedText) {
                    return this.cachedText;
                }
                const parser = new epubUtil_1.EpubParser(this.filePath);
                yield parser.init();
                this.epubParser = parser;
                const text = parser.getText();
                // 处理换行符
                var line_break = vscode_1.workspace.getConfiguration().get('thiefBook.lineBreak');
                this.cachedText = text
                    .replace(/\n/g, line_break)
                    .replace(/\r/g, " ")
                    .replace(/　　/g, " ")
                    .replace(/ /g, " ");
                return this.cachedText;
            }
            catch (error) {
                vscode_1.window.showErrorMessage(`EPUB 文件解析失败: ${error}`);
                return "";
            }
        });
    }
    /**
     * 统一文件读取接口
     */
    readFile() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.filePath) {
                return "";
            }
            this.fileType = this.detectFileType(this.filePath);
            if (this.fileType === 'epub') {
                return yield this.readEpubFile();
            }
            else {
                return this.readTxtFile();
            }
        });
    }
    init() {
        const newFilePath = vscode_1.workspace.getConfiguration().get('thiefBook.filePath', '');
        const newFileType = newFilePath ? this.detectFileType(newFilePath) : null;
        // 文件类型改变时清除缓存
        if (this.filePath !== newFilePath || this.fileType !== newFileType) {
            this.cachedText = "";
            this.cachedLineBreak = "";
            this.rawText = "";
            this.epubParser = null;
            this.tocCache = null;
        }
        this.filePath = newFilePath;
        this.fileType = newFileType;
        // 本次会话第一次初始化时加载起始页号：进度记录(globalState)优先，其次配置，最后 1
        if (!this.progressLoaded) {
            this.curr_page_number = progress_1.resolveStartPage(this.extensionContext.globalState.get('bookPageNumber'), vscode_1.workspace.getConfiguration().get('thiefBook.currPageNumber', 1));
            this.progressLoaded = true;
        }
        var is_english = vscode_1.workspace.getConfiguration().get('thiefBook.isEnglish');
        if (is_english === true) {
            this.page_size = vscode_1.workspace.getConfiguration().get('thiefBook.pageSize') * 2;
        }
        else {
            this.page_size = vscode_1.workspace.getConfiguration().get('thiefBook.pageSize');
        }
    }
    getPreviousPage() {
        return __awaiter(this, void 0, void 0, function* () {
            this.init();
            let text = yield this.readFile();
            if (!text) {
                return "";
            }
            this.getSize(text);
            this.getPage("previous");
            this.getStartEnd();
            var page_info = this.curr_page_number.toString() + "/" + this.page.toString();
            this.updatePage();
            return text.substring(this.start, this.end) + "    " + page_info;
        });
    }
    getNextPage() {
        return __awaiter(this, void 0, void 0, function* () {
            const t0 = Date.now();
            this.init();
            tbLog(`[tb-perf] init: ${Date.now() - t0}ms`);
            let text = yield this.readFile();
            tbLog(`[tb-perf] readFile: ${Date.now() - t0}ms`);
            if (!text) {
                return "";
            }
            this.getSize(text);
            this.getPage("next");
            this.getStartEnd();
            var page_info = this.curr_page_number.toString() + "/" + this.page.toString();
            this.updatePage();
            return text.substring(this.start, this.end) + "    " + page_info;
        });
    }
    getJumpingPage() {
        return __awaiter(this, void 0, void 0, function* () {
            this.init();
            let text = yield this.readFile();
            if (!text) {
                return "";
            }
            this.getSize(text);
            this.getPage("curr");
            this.getStartEnd();
            var page_info = this.curr_page_number.toString() + "/" + this.page.toString();
            this.updatePage();
            return text.substring(this.start, this.end) + "    " + page_info;
        });
    }
    /**
     * 获取目录（章节标题 + 偏移），TXT 与 EPUB 统一返回结构；结果缓存，翻页时复用
     */
    getToc() {
        return __awaiter(this, void 0, void 0, function* () {
            this.init();
            if (!this.filePath) {
                return [];
            }
            if (this.tocCache) {
                return this.tocCache;
            }
            let text = yield this.readFile();
            if (!text) {
                return [];
            }
            // 把偏移映射到显示文本空间（处理链：\n→lineBreak、\r→" "、　　→" "），
            // 否则全角空格缩位会让跳转位置随章节递增地偏后
            var line_break = vscode_1.workspace.getConfiguration().get('thiefBook.lineBreak');
            if (this.fileType === 'epub') {
                if (!this.epubParser) {
                    return [];
                }
                this.tocCache = tocParser_1.mapOffsetsToProcessed(this.epubParser.getText(), line_break, this.epubParser.getToc());
            }
            else {
                var is_english = vscode_1.workspace.getConfiguration().get('thiefBook.isEnglish');
                this.tocCache = tocParser_1.mapOffsetsToProcessed(this.rawText, line_break, tocParser_1.parseTxtToc(this.rawText, is_english));
            }
            return this.tocCache;
        });
    }
    /**
     * 当前阅读页对应的章节标题；未配置路径或无章节时返回空串
     */
    getCurrentChapter() {
        return __awaiter(this, void 0, void 0, function* () {
            this.init();
            if (!this.filePath) {
                return "";
            }
            const toc = yield this.getToc();
            if (!toc.length) {
                return "";
            }
            return tocParser_1.getCurrentChapterTitle(toc, this.curr_page_number, this.page_size);
        });
    }
    /**
     * 跳转到目录项所在页并返回该页内容
     * @param offset 章节标题在全文中的字符偏移
     */
    jumpToOffset(offset) {
        return __awaiter(this, void 0, void 0, function* () {
            this.init();
            let text = yield this.readFile();
            if (!text) {
                return "";
            }
            this.getSize(text);
            var page = tocParser_1.offsetToPage(offset, this.page_size);
            this.curr_page_number = page > this.page ? this.page : page;
            this.getStartEnd();
            var page_info = this.curr_page_number.toString() + "/" + this.page.toString();
            this.updatePage();
            return text.substring(this.start, this.end) + "    " + page_info;
        });
    }
}
exports.Book = Book;
//# sourceMappingURL=bookUtil.js.map
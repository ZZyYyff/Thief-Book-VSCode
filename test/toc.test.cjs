// 目录功能测试：TXT 章节解析（tocParser）+ EPUB 目录提取（EpubParser.getToc）
// 运行：tsc -p ./ && node test/toc.test.cjs
const assert = require('assert');
const JSZip = require('jszip');

const results = [];
function test(name, fn) {
    return Promise.resolve().then(fn).then(
        () => results.push({ name, pass: true }),
        (e) => results.push({ name, pass: false, err: e.message })
    );
}

async function run() {
    const { parseTxtToc, offsetToPage, findActiveTocIndex, mapOffsetsToProcessed, getCurrentChapterTitle } = require('../out/tocParser.js');
    const { EpubParser } = require('../out/epubUtil.js');

    // ---------- TXT 目录解析 ----------
    await test('中文：提取章节标题与偏移', () => {
        const text = '第一章 穿越\n天空一声巨响。\n第二章 拜师\n师父说我是万中无一的练武奇才。\n';
        const toc = parseTxtToc(text, false);
        assert.deepStrictEqual(toc, [
            { title: '第一章 穿越', offset: 0 },
            { title: '第二章 拜师', offset: 15 },
        ]);
    });

    await test('中文：支持全角数字与零填充（第一百二十章 / 第003章）', () => {
        const text = '第一百二十章 出关\n正文。\n第003章 归来\n正文。\n';
        const toc = parseTxtToc(text, false);
        assert.strictEqual(toc.length, 2);
        assert.strictEqual(toc[0].title, '第一百二十章 出关');
        assert.strictEqual(toc[1].title, '第003章 归来');
    });

    await test('中文：支持特殊章节（序章/楔子/尾声/番外）', () => {
        const text = '楔子\n主角登场。\n第一章 正篇\n剧情。\n番外 后日谈\n彩蛋。\n';
        const toc = parseTxtToc(text, false);
        assert.deepStrictEqual(toc.map(t => t.title), ['楔子', '第一章 正篇', '番外 后日谈']);
    });

    await test('正文行中的"第X章"不应被识别', () => {
        const text = '他说：这本书第三章最好看，但我们要低调。\n';
        const toc = parseTxtToc(text, false);
        assert.deepStrictEqual(toc, []);
    });

    await test('英文书：Chapter/Prologue 匹配，中文模式不匹配', () => {
        const text = 'Chapter 1 The Beginning\nIt was a dark night.\nChapter 2 Escape\nHe ran.\n';
        const tocEn = parseTxtToc(text, true);
        assert.deepStrictEqual(tocEn, [
            { title: 'Chapter 1 The Beginning', offset: 0 },
            { title: 'Chapter 2 Escape', offset: 45 },
        ]);
        const tocZh = parseTxtToc(text, false);
        assert.deepStrictEqual(tocZh, []);
    });

    await test('空文本或无章节返回空数组', () => {
        assert.deepStrictEqual(parseTxtToc('', false), []);
        assert.deepStrictEqual(parseTxtToc('没有章节标记的正文。\n再来一行。\n', false), []);
    });

    // ---------- EPUB 目录提取 ----------
    async function makeEpub() {
        const zip = new JSZip();
        zip.file('META-INF/container.xml',
            '<?xml version="1.0"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
            '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>' +
            '</rootfiles></container>');
        zip.file('OEBPS/content.opf',
            '<?xml version="1.0"?>\n<package version="2.0" xmlns="http://www.idpf.org/2007/opf">' +
            '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>测试书</dc:title></metadata>' +
            '<manifest>' +
            '<item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>' +
            '<item id="c2" href="c2.xhtml" media-type="application/xhtml+xml"/>' +
            '</manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>');
        zip.file('OEBPS/c1.xhtml',
            '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>第一章 初到异界</title></head>' +
            '<body><h1>第一章 初到异界</h1><p>穿越第一天，天气不错。</p></body></html>');
        zip.file('OEBPS/c2.xhtml',
            '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>第二章 拜师</title></head>' +
            '<body><p>师父收下了我。</p></body></html>');
        const buf = await zip.generateAsync({ type: 'nodebuffer' });
        const tmp = require('path').join(require('os').tmpdir(), `toc-test-${Date.now()}.epub`);
        require('fs').writeFileSync(tmp, buf);
        return tmp;
    }

    await test('EPUB：getToc 返回各章标题与全文偏移', async () => {
        const file = await makeEpub();
        const parser = new EpubParser(file);
        await parser.init();
        const toc = parser.getToc();
        assert.strictEqual(toc.length, 2);
        assert.strictEqual(toc[0].title, '第一章 初到异界');
        assert.strictEqual(toc[0].offset, 0);
        const fullText = parser.getText();
        assert.strictEqual(toc[1].offset, fullText.indexOf('第二章 拜师'));
        assert.strictEqual(toc[1].title, '第二章 拜师');
    });

    await test('offsetToPage：偏移换算页号边界', () => {
        assert.strictEqual(offsetToPage(0, 50), 1);
        assert.strictEqual(offsetToPage(49, 50), 1);
        assert.strictEqual(offsetToPage(50, 50), 2);
        assert.strictEqual(offsetToPage(249, 50), 5);
        assert.strictEqual(offsetToPage(250, 50), 6);
    });

    await test('findActiveTocIndex：定位当前阅读所在章节', () => {
        const toc = [
            { title: '第一章', offset: 0 },
            { title: '第二章', offset: 50 },
            { title: '第三章', offset: 100 },
        ];
        // pageSize=50：第1页起始 0 → 第一章
        assert.strictEqual(findActiveTocIndex(toc, 0), 0);
        // 第2页起始 50 → 第二章（等于章节 offset 归该章）
        assert.strictEqual(findActiveTocIndex(toc, 50), 1);
        // 章间 75 → 仍是第二章
        assert.strictEqual(findActiveTocIndex(toc, 75), 1);
        // 最后一章之后 150 → 最后一项
        assert.strictEqual(findActiveTocIndex(toc, 150), 2);
        // 空目录安全返回 0
        assert.strictEqual(findActiveTocIndex([], 0), 0);
    });

    await test('mapOffsetsToProcessed：全角空格缩位后偏移映射', () => {
        const source = '　　第一章\n正文。\n　　第二章\n内容。';
        // 替换链：\n→" "、\r→" "、　　→" "
        // 章1 行首 offset 0 → 0（不变）
        // 章2 行首 raw offset 10 → processed offset 9（两处全角对共缩 2 位，但第2对在章2之后）
        const mapped = mapOffsetsToProcessed(source, ' ', [
            { title: '第一章', offset: 0 },
            { title: '第二章', offset: 10 },
        ]);
        assert.deepStrictEqual(mapped, [
            { title: '第一章', offset: 0 },
            { title: '第二章', offset: 9 },
        ]);
    });

    await test('mapOffsetsToProcessed：多字符换行分隔符', () => {
        const source = '第一章\n第二章';
        const mapped = mapOffsetsToProcessed(source, '  ', [
            { title: '第一章', offset: 0 },
            { title: '第二章', offset: 4 },
        ]);
        // 第一章(3) + \n→'  '(2) = 5
        assert.deepStrictEqual(mapped, [
            { title: '第一章', offset: 0 },
            { title: '第二章', offset: 5 },
        ]);
    });

    await test('mapOffsetsToProcessed：空目录返回空', () => {
        assert.deepStrictEqual(mapOffsetsToProcessed('任意文本', ' ', []), []);
    });

    await test('getCurrentChapterTitle：当前页对应章节标题', () => {
        const toc = [
            { title: '第一章', offset: 0 },
            { title: '第二章', offset: 50 },
            { title: '第三章', offset: 100 },
        ];
        assert.strictEqual(getCurrentChapterTitle(toc, 1, 50), '第一章');
        assert.strictEqual(getCurrentChapterTitle(toc, 2, 50), '第二章');
        assert.strictEqual(getCurrentChapterTitle(toc, 3, 50), '第三章'); // 页首恰在章首
        assert.strictEqual(getCurrentChapterTitle(toc, 99, 50), '第三章'); // 超出最后一章 → 最后一项
        assert.strictEqual(getCurrentChapterTitle([], 1, 50), ''); // 空目录
    });

    // ---------- 汇总 ----------
    let failed = 0;
    for (const r of results) {
        console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.err ? '  -- ' + r.err : ''}`);
        if (!r.pass) failed++;
    }
    console.log(`\n${results.length - failed}/${results.length} passed`);
    process.exit(failed ? 1 : 0);
}

run();

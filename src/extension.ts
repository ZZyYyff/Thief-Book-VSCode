// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { commands, ExtensionContext, QuickPickItem, StatusBarAlignment, window, workspace } from 'vscode';
import * as book from './bookUtil';
import { tbLog } from './bookUtil';
import { findActiveTocIndex } from './tocParser';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "thief-book" is now active!');
	tbLog('[tb-perf] 扩展激活，计时探针就绪');

	// 共享 Book 实例（目录/解析结果跨命令缓存）
	const books = new book.Book(context);

	// 常驻状态栏：显示当前阅读章节，点击打开目录
	const chapterStatusBar = window.createStatusBarItem(StatusBarAlignment.Right, 100);
	chapterStatusBar.text = "📖";
	chapterStatusBar.tooltip = "当前章节，点击查看目录 & Current chapter, click to show toc";
	chapterStatusBar.command = "extension.showToc";
	chapterStatusBar.show();
	context.subscriptions.push(chapterStatusBar);

	async function refreshChapterStatus() {
		try {
			const chapter = await books.getCurrentChapter();
			chapterStatusBar.text = chapter ? `📖 ${chapter}` : "📖";
		} catch (error) {
			chapterStatusBar.text = "📖";
		}
	}

	// 老板键
	let displayCode = commands.registerCommand('extension.displayCode', () => {

		let lauage_arr_list = [
			'Java - System.out.println("Hello World");',
			'C++ - cout << "Hello, world!" << endl;',
			'C - printf("Hello, World!");',
			'Python - print("Hello, World!");',
			'PHP - echo "Hello World!";',
			'Ruby - puts "Hello World!";',
			'Perl - print "Hello, World!";',
			'Lua - print("Hello World!")',
			'Scala - println("Hello, world!")',
			'Golang - fmt.Println("Hello, World!")'
		];

		var index = Math.floor((Math.random() * lauage_arr_list.length));
		window.setStatusBarMessage(lauage_arr_list[index]);
	});

	// 下一页
	let getNextPage = commands.registerCommand('extension.getNextPage', async () => {
		const t0 = Date.now();
		try {
			const content = await books.getNextPage();
			tbLog(`[tb-perf] getNextPage 命令总耗时: ${Date.now() - t0}ms`);
			window.setStatusBarMessage(content);
			refreshChapterStatus().then(() =>
				tbLog(`[tb-perf] refreshChapterStatus 完成: ${Date.now() - t0}ms`));
		} catch (error) {
			window.showErrorMessage(`读取失败: ${error}`);
		}
	});

	// 上一页
	let getPreviousPage = commands.registerCommand('extension.getPreviousPage', async () => {
		const t0 = Date.now();
		try {
			const content = await books.getPreviousPage();
			tbLog(`[tb-perf] getPreviousPage 命令总耗时: ${Date.now() - t0}ms`);
			window.setStatusBarMessage(content);
			refreshChapterStatus().then(() =>
				tbLog(`[tb-perf] refreshChapterStatus 完成: ${Date.now() - t0}ms`));
		} catch (error) {
			window.showErrorMessage(`读取失败: ${error}`);
		}
	});

	// 跳转某个页面
	let getJumpingPage = commands.registerCommand('extension.getJumpingPage', async () => {
		try {
			const content = await books.getJumpingPage();
			window.setStatusBarMessage(content);
			refreshChapterStatus();
		} catch (error) {
			window.showErrorMessage(`读取失败: ${error}`);
		}
	});

	// 查看目录
	let showToc = commands.registerCommand('extension.showToc', async () => {
		try {
			const toc = await books.getToc();
			if (!toc.length) {
				window.showWarningMessage("未识别到章节目录 & No chapters found");
				return;
			}

			const items: (QuickPickItem & { offset: number })[] = toc.map(entry => ({
				label: entry.title,
				description: `第${Math.floor(entry.offset / books.page_size!) + 1}页`,
				offset: entry.offset
			}));

			// 定位到当前阅读所在章节
			const currPage = books.curr_page_number;
			const startChar = (currPage - 1) * books.page_size!;
			const activeIndex = findActiveTocIndex(toc, startChar);

			const quickPick = window.createQuickPick<QuickPickItem & { offset: number }>();
			quickPick.placeholder = "选择章节 & Select chapter";
			quickPick.items = items;
			quickPick.activeItems = [items[activeIndex]];

			quickPick.onDidChangeSelection(async (selected) => {
				if (selected.length) {
					quickPick.hide();
					const content = await books.jumpToOffset(selected[0].offset);
					window.setStatusBarMessage(content);
					refreshChapterStatus();
				}
			});
			quickPick.onDidHide(() => quickPick.dispose());
			quickPick.show();
		} catch (error) {
			window.showErrorMessage(`读取失败: ${error}`);
		}
	});

	context.subscriptions.push(displayCode);
	context.subscriptions.push(getNextPage);
	context.subscriptions.push(getPreviousPage);
	context.subscriptions.push(getJumpingPage);
	context.subscriptions.push(showToc);
}

// this method is called when your extension is deactivated
export function deactivate() { }

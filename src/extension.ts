// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { commands, ExtensionContext, QuickPickItem, window, workspace } from 'vscode';
import * as book from './bookUtil';
import { findActiveTocIndex } from './tocParser';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "thief-book" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json

	// 老板键
	let displayCode = commands.registerCommand('extension.displayCode', () => {

		let lauage_arr_list = [
			'Java - System.out.println("Hello World");',
			'C++ - cout << "Hello, world!" << endl;',
			'C - printf("Hello, World!");',
			'Python - print("Hello, World!")',
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
		try {
		let books = new book.Book(context);
			const content = await books.getNextPage();
			window.setStatusBarMessage(content);
		} catch (error) {
			window.showErrorMessage(`读取失败: ${error}`);
		}
	});

	// 上一页
	let getPreviousPage = commands.registerCommand('extension.getPreviousPage', async () => {
		try {
		let books = new book.Book(context);
			const content = await books.getPreviousPage();
			window.setStatusBarMessage(content);
		} catch (error) {
			window.showErrorMessage(`读取失败: ${error}`);
		}
	});

	// 跳转某个页面
	let getJumpingPage = commands.registerCommand('extension.getJumpingPage', async () => {
		try {
		let books = new book.Book(context);
			const content = await books.getJumpingPage();
			window.setStatusBarMessage(content);
		} catch (error) {
			window.showErrorMessage(`读取失败: ${error}`);
		}
	});

	// 查看目录
	let showToc = commands.registerCommand('extension.showToc', async () => {
		try {
			let books = new book.Book(context);
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
			const currPage = <number>workspace.getConfiguration().get('thiefBook.currPageNumber', 1);
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

import * as fs from "fs";
import * as path from "path";

/**
 * 解析本次启动的起始页号：
 * 优先读取进度记录（globalState），其次旧版写下的配置值，最后默认 1
 */
export function resolveStartPage(statePage: number | null | undefined, configPage: number | null | undefined): number {
    if (statePage && statePage > 0) {
        return statePage;
    }
    if (configPage && configPage > 0) {
        return configPage;
    }
    return 1;
}

export interface ProgressStore {
    /** 同步读取上次保存的页号；无文件/损坏返回 null */
    load(): number | null;
    /** 异步写盘（防抖后调用）；失败不抛错，下次翻页重写 */
    save(page: number): Promise<void>;
}

/**
 * 基于扩展自己小文件的进度存取。
 * 不写 VS Code 全局存储（state.vscdb）——那个 SQLite 的周期 checkpoint 会阻塞主进程
 * （实测 Memento 写触发 1.3s 停顿，期间按键/命令全部排队）；普通文件 I/O 不走该路径。
 */
export function createProgressStore(filePath: string): ProgressStore {
    return {
        load(): number | null {
            try {
                const raw = fs.readFileSync(filePath, 'utf-8');
                const v = JSON.parse(raw);
                return typeof v === 'number' && v > 0 && Number.isInteger(v) ? v : null;
            } catch {
                return null;
            }
        },
        async save(page: number): Promise<void> {
            try {
                await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
                await fs.promises.writeFile(filePath, JSON.stringify(page), 'utf-8');
            } catch (e) {
                // 进度保存失败不致命：下次翻页防抖后重写
                console.error('[thief-book] progress save failed:', e);
            }
        }
    };
}

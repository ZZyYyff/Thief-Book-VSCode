/**
 * 解析本次启动的起始页号：
 * 优先读取进度记录（globalState），其次旧版写下的配置值，最后默认 1
 */
export function resolveStartPage(statePage: number | undefined, configPage: number | undefined): number {
    if (statePage && statePage > 0) {
        return statePage;
    }
    if (configPage && configPage > 0) {
        return configPage;
    }
    return 1;
}

/**
 * 防抖调度器：连续快速调用只执行最后一次（等 delay 毫秒安静后才触发）
 */
export function createDebounced<T>(fn: (value: T) => void, delay: number): (value: T) => void {
    let timer: NodeJS.Timeout | null = null;
    let pendingValue: T | null = null;

    return (value: T) => {
        pendingValue = value;
        if (timer) {
            clearTimeout(timer);
        }
        timer = setTimeout(() => {
            timer = null;
            const v = pendingValue;
            pendingValue = null;
            if (v !== null) {
                fn(v);
            }
        }, delay);
    };
}

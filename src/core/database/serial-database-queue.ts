/**
 * 将同一个数据库连接上的所有公开操作排成单一队列。
 *
 * Web 端没有独占异步事务，这一层确保业务代码无法在事务执行期间
 * 通过公共端口插入另一条查询；失败任务不会阻断后续任务。
 */
export class SerialDatabaseQueue {
    private tail: Promise<unknown> = Promise.resolve();
    private closing: Promise<void> | null = null;

    run<T>(task: () => Promise<T>): Promise<T> {
        if (this.closing) {
            return Promise.reject(
                new Error("[Database] Connection is closing or closed."),
            );
        }
        const result = this.tail.then(task, task);
        this.tail = result.then(
            () => undefined,
            () => undefined,
        );
        return result;
    }

    /** 停止接收新任务；已接收任务（包括失败任务）排空后只关闭一次。 */
    close(finalize: () => Promise<void>): Promise<void> {
        if (!this.closing) {
            this.closing = this.tail.then(finalize);
        }
        return this.closing;
    }
}

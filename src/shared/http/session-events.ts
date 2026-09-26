/**
 * 服务端以 401 拒绝了某个登录令牌。事件携带该请求实际使用的令牌，
 * 由订阅方与本机当前令牌比较：只有两者相同才代表本机登录已失效。
 */
const listeners = new Set<(token: string) => void>();

export function publishSessionRejected(token: string) {
    for (const listener of listeners) {
        try {
            listener(token);
        } catch {
            console.warn("[Session] 登录失效监听器失败，请求结果保持不变");
        }
    }
}

export function onSessionRejected(listener: (token: string) => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

let exiting = false;

/**
 * 会话失效退出期间为 true：编辑页的离开保护据此放行跳转欢迎页，而不是弹出“放弃修改？”。
 * 由 AuthProvider 在退出前开启，重新登录后关闭。
 */
export function isSessionExiting() {
    return exiting;
}

export function setSessionExiting(value: boolean) {
    exiting = value;
}

/** 从请求头中取出 Bearer 令牌；认证接口（登录/注册）的 401 表示凭据错误，不是会话失效。 */
export function rejectedSessionToken(
    url: string | undefined,
    authorization: unknown,
): string | null {
    if (!url || url.startsWith("/auth/")) return null;
    if (typeof authorization !== "string") return null;
    const match = /^Bearer (\S+)$/i.exec(authorization);
    return match ? match[1] : null;
}

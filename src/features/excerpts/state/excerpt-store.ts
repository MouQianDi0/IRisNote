import { create } from "zustand";
import type { ApplicationDatabase } from "@/core/database/database.types";
import { banner } from "@/core/notifications";
import { onSessionEnded } from "@/shared/http/session-events";
import { ExcerptLocalRepository } from "../data/excerpt-local.repository";
import type { ExcerptEntity } from "../excerpts.types";

export const excerptRepository = new ExcerptLocalRepository();

type ExcerptStore = {
    ready: boolean;
    ownerKey: string | null;
    generation: number;
    entities: readonly ExcerptEntity[];
};

export const useExcerptStore = create<ExcerptStore>(() => ({
    ready: false,
    ownerKey: null,
    generation: 0,
    entities: [],
}));

excerptRepository.subscribe(() => {
    const ownerKey = excerptRepository.ownerKey;
    useExcerptStore.setState({
        ready: excerptRepository.ready,
        ownerKey,
        generation: excerptRepository.generation,
        entities: ownerKey ? excerptRepository.list(ownerKey) : [],
    });
});

let activation: {
    ownerKey: string;
    database: ApplicationDatabase;
    pending: Promise<void>;
} | null = null;

/** 退出登录后待执行的释放；期间重新激活（再次登录）会作废它。 */
let pendingRelease: object | null = null;

// 退出登录后，等已排队的写入结束再释放上一个账号的摘录快照，避免中断刚提交的保存。
onSessionEnded(() => {
    const ticket = {};
    pendingRelease = ticket;
    void excerptRepository.idle().then(() => {
        if (pendingRelease !== ticket) return;
        pendingRelease = null;
        deactivateExcerptOwner();
    });
});

export function activateExcerptOwner(
    ownerKey: string,
    database: ApplicationDatabase,
): Promise<void> {
    pendingRelease = null;
    if (activation?.ownerKey === ownerKey && activation.database === database)
        return activation.pending;
    const loading = excerptRepository.activate(ownerKey, database);
    const generation = excerptRepository.generation;
    const pending = loading
        .catch((cause: unknown) => {
            if (
                excerptRepository.ownerKey !== ownerKey ||
                excerptRepository.generation !== generation
            )
                return;
            banner.show({
                title: "摘录加载失败",
                message: cause instanceof Error ? cause.message : "请重试",
                type: "important",
                action: {
                    label: "重试",
                    onPress: () => {
                        if (
                            excerptRepository.ownerKey === ownerKey &&
                            excerptRepository.generation === generation
                        )
                            return activateExcerptOwner(ownerKey, database);
                    },
                },
            });
        })
        .finally(() => {
            if (activation?.pending === pending) activation = null;
        });
    activation = { ownerKey, database, pending };
    return pending;
}

export function deactivateExcerptOwner() {
    activation = null;
    excerptRepository.deactivate();
}

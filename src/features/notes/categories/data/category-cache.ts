import {
    hasLocalCategories,
    listLocalCategories,
    mergeRemoteCategories,
    importCachedCategories,
} from "./category-local.repository";
import type { ApplicationDatabase } from "@/core/database";
import type { AxiosRequestConfig } from "axios";
import {
    getCloudStorageSnapshot,
    captureLocalStorageAccess,
    captureCloudStorageAccess,
    isCloudStoragePermissionError,
} from "@/core/cloud-storage/cloud-storage-policy";
import { getCategories } from "../api/categories.api";
import type { Category } from "../categories.types";

/**
 * 分类列表的本地副本：只保存服务端返回的原始列表，未上传的改动由调用方照常用上传队列叠加。
 * 本机分类独立于云授权；授权后刷新远端副本，保留本地待同步改动。
 */
const cacheKey = (ownerUserId: number) => `category-cache:user:${ownerUserId}`;

function isCategory(value: unknown): value is Category {
    if (!value || typeof value !== "object") return false;
    const item = value as Record<string, unknown>;
    return (
        Number.isSafeInteger(item.id) &&
        typeof item.name === "string" &&
        typeof item.icon === "string" &&
        typeof item.is_pinned === "boolean" &&
        typeof item.is_starred === "boolean"
    );
}

/** 没有缓存或缓存无法解析时返回 null。 */
export async function readCachedCategories(
    database: ApplicationDatabase,
    ownerUserId: number,
): Promise<Category[] | null> {
    const row = await database.getFirst<{ value: string }>(
        "SELECT value FROM system_preferences WHERE key = ?",
        [cacheKey(ownerUserId)],
    );
    if (!row) return null;
    try {
        const value: unknown = JSON.parse(row.value);
        return Array.isArray(value) && value.every(isCategory) ? value : null;
    } catch {
        return null;
    }
}

export async function writeCachedCategories(
    database: ApplicationDatabase,
    ownerUserId: number,
    categories: readonly Category[],
) {
    await database.run(
        `INSERT INTO system_preferences (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [
            cacheKey(ownerUserId),
            JSON.stringify(categories),
            new Date().toISOString(),
        ],
    );
}

/**
 * 先请求服务端，成功后更新本地副本；请求失败时退回本地副本（stale 为 true）。
 * 云存储权限错误和“没有本地副本”时照常抛出，由调用方按原逻辑处理。
 */
export async function loadCategories(
    database: ApplicationDatabase,
    ownerUserId: number,
    restore?: { config: AxiosRequestConfig; check: () => void },
): Promise<{ categories: Category[]; stale: boolean }> {
    const local = await hasLocalCategories(database);
    const cloud = getCloudStorageSnapshot();
    if (local && !cloud.enabled && !restore) {
        const check = captureLocalStorageAccess(ownerUserId);
        const categories = await listLocalCategories(database, ownerUserId);
        check();
        return { categories, stale: true };
    }
    const check =
        restore?.check ??
        (local ? captureCloudStorageAccess(ownerUserId) : () => {});
    check();
    if (local) await importCachedCategories(database, ownerUserId);
    const versions = local
        ? new Map(
              (
                  await database.getAll<{
                      server_id: number;
                      version: number;
                  }>(
                      "SELECT server_id,version FROM local_categories WHERE owner_user_id=? AND server_id IS NOT NULL",
                      [ownerUserId],
                  )
              ).map((row) => [row.server_id, row.version]),
          )
        : undefined;
    try {
        const categories = await getCategories(restore?.config);
        check();
        if (restore && !categories.every(isCategory))
            throw new Error("分类数据无效，本机内容已保留");
        if (local)
            await database.transaction(async (tx) => {
                check();
                await mergeRemoteCategories(
                    tx,
                    ownerUserId,
                    categories,
                    versions,
                );
                check();
            });
        check();
        try {
            await writeCachedCategories(database, ownerUserId, categories);
        } catch {
            // 副本写入失败只影响下次离线兜底，不影响本次展示。
        }
        check();
        return {
            categories: local
                ? await listLocalCategories(database, ownerUserId)
                : categories,
            stale: false,
        };
    } catch (error) {
        if (restore) throw error;
        if (isCloudStoragePermissionError(error)) throw error;
        if (local) {
            captureLocalStorageAccess(ownerUserId)();
            return {
                categories: await listLocalCategories(database, ownerUserId),
                stale: true,
            };
        }
        const cached = await readCachedCategories(
            database,
            ownerUserId,
        ).catch(() => null);
        if (!cached) throw error;
        return { categories: cached, stale: true };
    }
}

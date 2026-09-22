import { useApplicationDatabase } from "@/core/database";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { SystemPreferencesRepository } from "@/features/settings/data/system-preferences.repository";
import {
    createContext,
    useCallback,
    useContext,
    useLayoutEffect,
    useMemo,
    useSyncExternalStore,
    type PropsWithChildren,
} from "react";
import {
    getCloudStorageSnapshot,
    subscribeCloudStorage,
    type CloudStorageSnapshot,
} from "./cloud-storage-policy";
import { createCloudStorageConsentController } from "./cloud-storage-consent-controller";

type CloudStorageContextValue = CloudStorageSnapshot & {
    saving: boolean;
    error: string | null;
    setConsent: (enabled: boolean) => Promise<void>;
};
const CloudStorageContext = createContext<CloudStorageContextValue | null>(
    null,
);

export function useCloudStorage() {
    const value = useContext(CloudStorageContext);
    if (!value) throw new Error("CloudStorageProvider is required");
    return value;
}

export function CloudStorageProvider({ children }: PropsWithChildren) {
    const database = useApplicationDatabase();
    const { user, token, loading } = useAuth();
    const owner = loading || !token ? null : (user?.id ?? null);
    const repository = useMemo(
        () => new SystemPreferencesRepository(database),
        [database],
    );
    const state = useSyncExternalStore(
        subscribeCloudStorage,
        getCloudStorageSnapshot,
        getCloudStorageSnapshot,
    );
    const controller = useMemo(
        () =>
            createCloudStorageConsentController({
                readConsent: (userId) => repository.cloudStorageConsent(userId),
                writeConsent: (userId, enabled) =>
                    repository.setCloudStorageConsent(userId, enabled),
            }),
        [repository],
    );
    const operation = useSyncExternalStore(
        controller.subscribe,
        controller.getState,
        controller.getState,
    );

    useLayoutEffect(() => {
        controller.activate(owner, loading);
        return controller.deactivate;
    }, [owner, token, loading, controller]);

    const setConsent = useCallback(
        (enabled: boolean) => controller.setConsent(owner, enabled),
        [controller, owner],
    );

    const value: CloudStorageContextValue = {
        ...state,
        // Never render the previous account's consent while layout effects are pending.
        enabled: !loading && state.ownerUserId === owner && state.enabled,
        ready: !loading && state.ownerUserId === owner && state.ready,
        ownerUserId: owner,
        consented: !loading && state.ownerUserId === owner && state.consented,
        saving: state.ownerUserId === owner && operation.saving,
        error: state.ownerUserId === owner ? operation.error : null,
        setConsent,
    };
    return (
        <CloudStorageContext.Provider value={value}>
            {children}
        </CloudStorageContext.Provider>
    );
}

import type { PropsWithChildren } from "react";
import { useEffect, useState } from "react";
import { applicationDatabaseResource } from "./application-database-resource";
import { ApplicationDatabaseContext } from "./database.context";
import type { ApplicationDatabase } from "./database.types";

type DatabaseLease = ReturnType<typeof applicationDatabaseResource.acquire>;
type ProviderState = {
    lease: DatabaseLease;
    database: ApplicationDatabase | null;
    error: Error | null;
};

export function ApplicationDatabaseProvider({ children }: PropsWithChildren) {
    const [state, setState] = useState<ProviderState | null>(null);

    useEffect(() => {
        const lease = applicationDatabaseResource.acquire();
        void lease.ready.then(
            (resource) => {
                if (lease.active) {
                    setState({ lease, database: resource.database, error: null });
                }
            },
            (error: unknown) => {
                if (lease.active) {
                    setState({
                        lease,
                        database: null,
                        error: error instanceof Error
                            ? error
                            : new Error("Unknown database initialization error."),
                    });
                }
            },
        );
        return () => {
            void lease.release().catch(() => {
                console.error("[Database] Close failed; connection will not be reused.");
            });
        };
    }, []);

    // Fast Refresh / effect 重启不能向子树继续发布旧租约的已关闭端口。
    if (!state?.lease.active) return null;
    if (state.error) throw state.error;
    if (!state.database) return null;

    return (
        <ApplicationDatabaseContext.Provider value={state.database}>
            {children}
        </ApplicationDatabaseContext.Provider>
    );
}

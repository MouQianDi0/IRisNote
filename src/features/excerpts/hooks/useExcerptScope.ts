import { useLayoutEffect } from "react";
import { useApplicationDatabase } from "@/core/database";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { EXCERPT_GUEST_OWNER_KEY } from "../data/excerpt-local.repository";
import {
    activateExcerptOwner,
    deactivateExcerptOwner,
    useExcerptStore,
} from "../state/excerpt-store";

export function useExcerptScope() {
    const database = useApplicationDatabase();
    const { user, isLoggedIn, loading } = useAuth();
    const ownerKey =
        isLoggedIn && user ? `user:${user.id}` : EXCERPT_GUEST_OWNER_KEY;
    const snapshot = useExcerptStore();
    useLayoutEffect(() => {
        if (loading) deactivateExcerptOwner();
        else void activateExcerptOwner(ownerKey, database);
    }, [loading, ownerKey, database]);
    return {
        ...snapshot,
        ownerKey,
        ready: !loading && snapshot.ready && snapshot.ownerKey === ownerKey,
    };
}

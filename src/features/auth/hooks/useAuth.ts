import { useContext } from "react";
import { AuthContext } from "../auth.context";
import type { AuthState } from "../auth.types";

export function useAuth(): AuthState {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within an <AuthProvider>");
    }
    return context;
}

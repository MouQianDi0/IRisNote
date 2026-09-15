import type { AuthState } from "./auth.types";
import { createContext } from "react";

export const AuthContext = createContext<AuthState | null>(null);

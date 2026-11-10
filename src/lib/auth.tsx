import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { AdminRole } from "@/types/database";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  role: AdminRole | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false); // Security first: default closed
  const [role, setRole] = useState<AdminRole | null>(null);

  const verifyAdminStatus = async (userSession: Session | null) => {
    if (!userSession) {
      setIsAdmin(false);
      setRole(null);
      return;
    }

    try {
      // Check RPC is_admin (SECURITY DEFINER in DB)
      const { data: rpcAdmin, error } = await supabase.rpc("is_admin");
      if (!error && rpcAdmin) {
        setIsAdmin(true);
        // Fetch explicit assigned role if available
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userSession.user.id)
          .limit(1);
        if (roles && roles.length > 0 && roles[0].role) {
          setRole(roles[0].role as AdminRole);
        } else {
          setRole("super_admin");
        }
      } else {
        setIsAdmin(false);
        setRole(null);
      }
    } catch (err) {
      // Fail closed: never grant admin on error
      console.warn("Admin verification check failed closed:", err);
      setIsAdmin(false);
      setRole(null);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      verifyAdminStatus(data.session).finally(() => setLoading(false));
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      verifyAdminStatus(newSession).finally(() => setLoading(false));
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return { error: error.message };
    }
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setIsAdmin(false);
    setRole(null);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        isAdmin,
        role,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

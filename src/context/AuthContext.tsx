import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase/client";
import { fetchMyOrganizations, type OrgRow } from "../lib/supabase/inventoryApi";

const ORG_STORAGE_KEY = "inventory.selectedOrgId";

export type RefreshOrgsResult = { count: number; error?: string };

export type AuthContextValue = {
  cloudEnabled: boolean;
  session: Session | null;
  user: User | null;
  authLoading: boolean;
  orgLoading: boolean;
  orgLoadError: string | null;
  organizations: OrgRow[];
  organization: OrgRow | null;
  setOrganizationId: (id: string | null) => void;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string) => Promise<{ error?: string }>;
  createOrganization: (name: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refreshOrganizations: () => Promise<RefreshOrgsResult>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const cloudEnabled = useMemo(() => isSupabaseConfigured(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(cloudEnabled);
  const [orgLoading, setOrgLoading] = useState(false);
  const [orgLoadError, setOrgLoadError] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<OrgRow[]>([]);
  const [organization, setOrganization] = useState<OrgRow | null>(null);

  const applyOrgs = useCallback((orgs: OrgRow[]) => {
    setOrganizations(orgs);
    const saved = localStorage.getItem(ORG_STORAGE_KEY);
    const pick = orgs.find((o) => o.id === saved) ?? orgs[0] ?? null;
    setOrganization(pick ?? null);
    if (pick) localStorage.setItem(ORG_STORAGE_KEY, pick.id);
    else localStorage.removeItem(ORG_STORAGE_KEY);
  }, []);

  const refreshOrganizations = useCallback(async (): Promise<RefreshOrgsResult> => {
    if (!cloudEnabled || !session?.user) {
      setOrganizations([]);
      setOrganization(null);
      setOrgLoadError(null);
      return { count: 0 };
    }
    setOrgLoading(true);
    setOrgLoadError(null);
    try {
      const orgs = await fetchMyOrganizations();
      applyOrgs(orgs);
      return { count: orgs.length };
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : "Could not load workshops. Run supabase/migrations/002_fix_org_members_rls.sql in Supabase.";
      setOrgLoadError(msg);
      setOrganizations([]);
      setOrganization(null);
      return { count: 0, error: msg };
    } finally {
      setOrgLoading(false);
    }
  }, [cloudEnabled, session?.user, applyOrgs]);

  useEffect(() => {
    if (!cloudEnabled) {
      setAuthLoading(false);
      return;
    }
    const supabase = getSupabase();
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (mounted) {
        setSession(s);
        setAuthLoading(false);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [cloudEnabled]);

  useEffect(() => {
    if (!cloudEnabled) return;
    void refreshOrganizations();
  }, [cloudEnabled, session?.user?.id, refreshOrganizations]);

  const setOrganizationId = useCallback(
    (id: string | null) => {
      if (!id) {
        setOrganization(null);
        localStorage.removeItem(ORG_STORAGE_KEY);
        return;
      }
      const o = organizations.find((x) => x.id === id) ?? null;
      setOrganization(o);
      if (o) localStorage.setItem(ORG_STORAGE_KEY, o.id);
    },
    [organizations]
  );

  const signIn = useCallback(async (email: string, password: string) => {
    const supabase = getSupabase();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const supabase = getSupabase();
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error?.message };
  }, []);

  const createOrganization = useCallback(
    async (name: string) => {
      const supabase = getSupabase();
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();
      if (!currentSession?.user) {
        return {
          error:
            "You are not signed in. Confirm your email if required, then sign in again before creating a workshop.",
        };
      }

      const { error } = await supabase.rpc("create_organization_with_owner", { org_name: name });
      if (error) return { error: error.message };

      const result = await refreshOrganizations();
      if (result.error) {
        return {
          error: `Workshop may have been created, but it could not be loaded: ${result.error}`,
        };
      }
      if (result.count === 0) {
        return {
          error:
            "Workshop was not found for your account. In Supabase SQL Editor, run 002_fix_org_members_rls.sql, then try again or refresh workshops.",
        };
      }
      return {};
    },
    [refreshOrganizations]
  );

  const signOut = useCallback(async () => {
    if (!cloudEnabled) return;
    const supabase = getSupabase();
    await supabase.auth.signOut();
    setOrganization(null);
    setOrganizations([]);
    setOrgLoadError(null);
    localStorage.removeItem(ORG_STORAGE_KEY);
  }, [cloudEnabled]);

  const value: AuthContextValue = {
    cloudEnabled,
    session,
    user: session?.user ?? null,
    authLoading,
    orgLoading,
    orgLoadError,
    organizations,
    organization,
    setOrganizationId,
    signIn,
    signUp,
    createOrganization,
    signOut,
    refreshOrganizations,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/**
 * Global app context — session, user profile, credit data, and messages.
 */
import { createContext, useContext, useReducer, useCallback, useState, type ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { clearSelectionState } from "../lib/selection";
import { clearServiceCache } from "../api/supabase-service";

// ── Types ─────────────────────────────────────────────────────────────────────

export type Role = "user" | "admin";

export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  createdAt: string;
  isRead: boolean;
}

export interface UserProfile {
  id: string;
  role: Role;
  initials: string;
  fullName: string;
  phone: string;
  email: string | null;
  nationalId: string;
  dateOfBirth: string;
  district: string;
  occupation: string;
  memberSince: string;
  verified: boolean;
  avatarUrl: string | null;
}

export interface CreditProfile {
  score: number;
  maxScore: number;
  tier: "Poor" | "Fair" | "Good" | "Very Good" | "Excellent";
  percentile: number;
  improvementSinceStart: number;
}

export interface LoanProfile {
  availableCredit: number;
  creditIncreaseFromLastMonth: number;
  totalLoansCount: number;
  activeLoan: {
    id: string;
    amount: number;
    repaidPercent: number;
    status: string;
    disbursedDate: string;
  } | null;
  nextPayment: {
    amount: number;
    dueDate: string;
    daysLeft: number;
  } | null;
}

export interface Session {
  isAuthenticated: boolean;
  token: string | null;
  expiresAt: number | null;
}

export interface AppState {
  session: Session;
  role: Role | null;
  user: UserProfile | null;
  credit: CreditProfile | null;
  loan: LoanProfile | null;
  savingsBalance: number;
  unreadNotifications: number;
  messages: Message[];
}

// ── Actions ───────────────────────────────────────────────────────────────────

type Action =
  | { type: "LOGIN"; payload: { token: string; user: UserProfile; credit: CreditProfile | null; loan: LoanProfile | null; savingsBalance: number; role: Role; messages?: Message[]; unreadNotifications?: number } }
  | { type: "LOGOUT" }
  | { type: "UPDATE_PROFILE"; payload: Partial<UserProfile> }
  | { type: "UPDATE_CREDIT"; payload: Partial<CreditProfile> }
  | { type: "UPDATE_LOAN"; payload: Partial<LoanProfile> }
  | { type: "SET_SAVINGS"; payload: number }
  | { type: "SET_UNREAD"; payload: number }
  | { type: "MARK_NOTIFICATIONS_READ" }
  | { type: "SEND_MESSAGE"; payload: Message }
  | { type: "MARK_MESSAGE_READ"; payload: string }
  | { type: "MARK_ALL_READ_FOR_USER"; payload: string };

// ── Initial state (unauthenticated) ──────────────────────────────────────────

const INITIAL_STATE: AppState = {
  session: { isAuthenticated: false, token: null, expiresAt: null },
  role: null,
  user: null,
  credit: null,
  loan: null,
  savingsBalance: 0,
  unreadNotifications: 0,
  messages: [],
};

// ── Reducer ───────────────────────────────────────────────────────────────────

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "LOGIN":
      return {
        ...state,
        session: {
          isAuthenticated: true,
          token: action.payload.token,
          expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        },
        role: action.payload.role,
        user: action.payload.user,
        credit: action.payload.credit,
        loan: action.payload.loan,
        savingsBalance: action.payload.savingsBalance,
        messages: action.payload.messages ?? state.messages,
        unreadNotifications: action.payload.unreadNotifications ?? state.unreadNotifications,
      };

    case "LOGOUT":
      return { ...INITIAL_STATE };

    case "UPDATE_PROFILE":
      return state.user
        ? { ...state, user: { ...state.user, ...action.payload } }
        : state;

    case "UPDATE_CREDIT":
      return state.credit
        ? { ...state, credit: { ...state.credit, ...action.payload } }
        : state;

    case "UPDATE_LOAN":
      return state.loan
        ? { ...state, loan: { ...state.loan, ...action.payload } }
        : state;

    case "SET_SAVINGS":
      return { ...state, savingsBalance: action.payload };

    case "SET_UNREAD":
      return { ...state, unreadNotifications: action.payload };

    case "MARK_NOTIFICATIONS_READ":
      return { ...state, unreadNotifications: 0 };

    case "SEND_MESSAGE":
      return { ...state, messages: [...state.messages, action.payload] };

    case "MARK_MESSAGE_READ":
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.payload ? { ...m, isRead: true } : m
        ),
      };

    case "MARK_ALL_READ_FOR_USER":
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.receiverId === action.payload ? { ...m, isRead: true } : m
        ),
      };

    default:
      return state;
  }
}

// ── Context ───────────────────────────────────────────────────────────────────

interface AppContextValue {
  state: AppState;
  login: (token: string, user: UserProfile, credit: CreditProfile | null, loan: LoanProfile | null, savingsBalance: number, role: Role, messages?: Message[], unreadNotifications?: number) => void;
  logout: () => void;
  updateProfile: (patch: Partial<UserProfile>) => void;
  updateCredit: (patch: Partial<CreditProfile>) => void;
  updateLoan: (patch: Partial<LoanProfile>) => void;
  setUnread: (count: number) => void;
  setSavingsBalance: (balance: number) => void;
  markNotificationsRead: () => void;
  sendMessage: (msg: Message) => void;
  markMessageRead: (id: string) => void;
  markAllReadForUser: (userId: string) => void;
  /** Phone (E.164) captured at sign-up, awaiting SMS OTP confirmation. */
  pendingPhone: string;
  setPendingPhone: (phone: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: ReactNode }) {
  // Sessions always start unauthenticated; LOGIN is dispatched by the auth flow.
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const [pendingPhone, setPendingPhone] = useState("");

  const login = useCallback(
    (token: string, user: UserProfile, credit: CreditProfile | null, loan: LoanProfile | null, savingsBalance: number, role: Role, messages?: Message[], unreadNotifications?: number) =>
      dispatch({ type: "LOGIN", payload: { token, user, credit, loan, savingsBalance, role, messages, unreadNotifications } }),
    []
  );

  const logout = useCallback(() => {
    // End the Supabase session too (clears the persisted token) — otherwise the
    // user stays authenticated to Supabase after "logging out".
    if (supabase) supabase.auth.signOut().catch(() => {});
    // Clear module-level caches so stale data never leaks into the next session.
    clearSelectionState();
    clearServiceCache();
    dispatch({ type: "LOGOUT" });
  }, []);

  const updateProfile = useCallback(
    (patch: Partial<UserProfile>) => dispatch({ type: "UPDATE_PROFILE", payload: patch }),
    []
  );

  const updateCredit = useCallback(
    (patch: Partial<CreditProfile>) => dispatch({ type: "UPDATE_CREDIT", payload: patch }),
    []
  );

  const updateLoan = useCallback(
    (patch: Partial<LoanProfile>) => dispatch({ type: "UPDATE_LOAN", payload: patch }),
    []
  );

  const setUnread = useCallback(
    (count: number) => dispatch({ type: "SET_UNREAD", payload: count }),
    []
  );

  const setSavingsBalance = useCallback(
    (balance: number) => dispatch({ type: "SET_SAVINGS", payload: balance }),
    []
  );

  const markNotificationsRead = useCallback(
    () => dispatch({ type: "MARK_NOTIFICATIONS_READ" }),
    []
  );

  const sendMessage = useCallback(
    (msg: Message) => dispatch({ type: "SEND_MESSAGE", payload: msg }),
    []
  );

  const markMessageRead = useCallback(
    (id: string) => dispatch({ type: "MARK_MESSAGE_READ", payload: id }),
    []
  );

  const markAllReadForUser = useCallback(
    (userId: string) => dispatch({ type: "MARK_ALL_READ_FOR_USER", payload: userId }),
    []
  );

  return (
    <AppContext.Provider
      value={{ state, login, logout, updateProfile, updateCredit, updateLoan, setUnread, setSavingsBalance, markNotificationsRead, sendMessage, markMessageRead, markAllReadForUser, pendingPhone, setPendingPhone }}
    >
      {children}
    </AppContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used inside <AppProvider>");
  return ctx;
}

/** Convenience selectors */
export const useUser = () => useAppContext().state.user;
export const useSession = () => useAppContext().state.session;
export const useCredit = () => useAppContext().state.credit;
export const useLoan = () => useAppContext().state.loan;
export const useRole = () => useAppContext().state.role;
export const useMessages = () => useAppContext().state.messages;

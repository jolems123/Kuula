/** Global app context — Node/Express + PostgreSQL is the only runtime backend. */
import { createContext, useContext, useReducer, useCallback, useState, type ReactNode } from "react";
import { clearSelectionState } from "../lib/selection";
import { clearServiceCache } from "../api/types-compat";
import { clearSessionTokens } from "../lib/session-vault";

export type Role = "user" | "customer" | "admin" | "manager" | "officer";

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
  improvementSinceStart?: number;
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

type Action =
  | { type: "LOGIN"; payload: { token: string; expiresAt?: number; user: UserProfile; credit: CreditProfile | null; loan: LoanProfile | null; savingsBalance?: number; role: Role; messages?: Message[]; unreadNotifications?: number } }
  | { type: "UPDATE_TOKEN"; payload: { token: string; expiresAt: number } }
  | { type: "LOGOUT" }
  | { type: "UPDATE_PROFILE"; payload: Partial<UserProfile> }
  | { type: "UPDATE_CREDIT"; payload: Partial<CreditProfile> }
  | { type: "UPDATE_LOAN"; payload: Partial<LoanProfile> }
  | { type: "SET_UNREAD"; payload: number }
  | { type: "MARK_NOTIFICATIONS_READ" }
  | { type: "SEND_MESSAGE"; payload: Message }
  | { type: "MARK_MESSAGE_READ"; payload: string }
  | { type: "MARK_ALL_READ_FOR_USER"; payload: string };

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

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "LOGIN":
      return {
        ...state,
        session: {
          isAuthenticated: true,
          token: action.payload.token,
          expiresAt: action.payload.expiresAt ?? Date.now() + 15 * 60 * 1000,
        },
        role: action.payload.role,
        user: action.payload.user,
        credit: action.payload.credit,
        loan: action.payload.loan,
        savingsBalance: action.payload.savingsBalance ?? 0,
        messages: action.payload.messages ?? [],
        unreadNotifications: action.payload.unreadNotifications ?? 0,
      };
    case "UPDATE_TOKEN": return { ...state, session: { ...state.session, token: action.payload.token, expiresAt: action.payload.expiresAt } };
    case "LOGOUT": return { ...INITIAL_STATE };
    case "UPDATE_PROFILE": return state.user ? { ...state, user: { ...state.user, ...action.payload } } : state;
    case "UPDATE_CREDIT": return state.credit ? { ...state, credit: { ...state.credit, ...action.payload } } : state;
    case "UPDATE_LOAN": return state.loan ? { ...state, loan: { ...state.loan, ...action.payload } } : state;
    case "SET_UNREAD": return { ...state, unreadNotifications: action.payload };
    case "MARK_NOTIFICATIONS_READ": return { ...state, unreadNotifications: 0 };
    case "SEND_MESSAGE": return { ...state, messages: [...state.messages, action.payload] };
    case "MARK_MESSAGE_READ": return { ...state, messages: state.messages.map((m) => m.id === action.payload ? { ...m, isRead: true } : m) };
    case "MARK_ALL_READ_FOR_USER": return { ...state, messages: state.messages.map((m) => m.receiverId === action.payload ? { ...m, isRead: true } : m) };
    default: return state;
  }
}

interface AppContextValue {
  state: AppState;
  login: {
    (token: string, user: UserProfile, credit: CreditProfile | null, loan: LoanProfile | null, role: Role, messages?: Message[], unreadNotifications?: number, expiresAt?: number): void;
    (token: string, user: UserProfile, credit: CreditProfile | null, loan: LoanProfile | null, savingsBalance: number, role: Role, messages?: Message[], unreadNotifications?: number, expiresAt?: number): void;
  };
  updateToken: (token: string, expiresAt: number) => void;
  logout: () => void;
  updateProfile: (patch: Partial<UserProfile>) => void;
  updateCredit: (patch: Partial<CreditProfile>) => void;
  updateLoan: (patch: Partial<LoanProfile>) => void;
  setUnread: (count: number) => void;
  markNotificationsRead: () => void;
  sendMessage: (msg: Message) => void;
  markMessageRead: (id: string) => void;
  markAllReadForUser: (userId: string) => void;
  pendingPhone: string;
  setPendingPhone: (phone: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const [pendingPhone, setPendingPhone] = useState("");

  const login = useCallback((
    token: string,
    user: UserProfile,
    credit: CreditProfile | null,
    loan: LoanProfile | null,
    roleOrSavings: Role | number,
    messagesOrRole?: Message[] | Role,
    unreadOrMessages?: number | Message[],
    expiresOrUnread?: number,
    legacyExpiresAt?: number,
  ) => {
    const legacy = typeof roleOrSavings === "number";
    const role = (legacy ? messagesOrRole : roleOrSavings) as Role;
    const savingsBalance = legacy ? roleOrSavings : 0;
    const messages = (legacy ? unreadOrMessages : messagesOrRole) as Message[] | undefined;
    const unreadNotifications = legacy ? expiresOrUnread : (unreadOrMessages as number | undefined);
    const expiresAt = legacy ? legacyExpiresAt : expiresOrUnread;
    dispatch({ type: "LOGIN", payload: { token, expiresAt, user, credit, loan, savingsBalance, role, messages, unreadNotifications } });
  }, []) as AppContextValue["login"];
  const updateToken = useCallback((token: string, expiresAt: number) => dispatch({ type: "UPDATE_TOKEN", payload: { token, expiresAt } }), []);
  const logout = useCallback(() => {
    clearSessionTokens();
    clearSelectionState();
    clearServiceCache();
    dispatch({ type: "LOGOUT" });
  }, []);
  const updateProfile = useCallback((patch: Partial<UserProfile>) => dispatch({ type: "UPDATE_PROFILE", payload: patch }), []);
  const updateCredit = useCallback((patch: Partial<CreditProfile>) => dispatch({ type: "UPDATE_CREDIT", payload: patch }), []);
  const updateLoan = useCallback((patch: Partial<LoanProfile>) => dispatch({ type: "UPDATE_LOAN", payload: patch }), []);
  const setUnread = useCallback((count: number) => dispatch({ type: "SET_UNREAD", payload: count }), []);
  const markNotificationsRead = useCallback(() => dispatch({ type: "MARK_NOTIFICATIONS_READ" }), []);
  const sendMessage = useCallback((msg: Message) => dispatch({ type: "SEND_MESSAGE", payload: msg }), []);
  const markMessageRead = useCallback((id: string) => dispatch({ type: "MARK_MESSAGE_READ", payload: id }), []);
  const markAllReadForUser = useCallback((userId: string) => dispatch({ type: "MARK_ALL_READ_FOR_USER", payload: userId }), []);

  return (
    <AppContext.Provider value={{ state, login, updateToken, logout, updateProfile, updateCredit, updateLoan, setUnread, markNotificationsRead, sendMessage, markMessageRead, markAllReadForUser, pendingPhone, setPendingPhone }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used inside <AppProvider>");
  return ctx;
}
export const useUser = () => useAppContext().state.user;
export const useSession = () => useAppContext().state.session;
export const useCredit = () => useAppContext().state.credit;
export const useLoan = () => useAppContext().state.loan;
export const useRole = () => useAppContext().state.role;
export const useMessages = () => useAppContext().state.messages;
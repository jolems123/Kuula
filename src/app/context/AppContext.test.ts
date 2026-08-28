/**
 * Tests for the AppContext reducer — pure function, no React rendering needed.
 */
import { describe, it, expect } from "vitest";
import type { UserProfile, CreditProfile, LoanProfile, Message, Role } from "../context/AppContext";

// ── Re-create the reducer locally to test it in isolation ────────────────────
// (The reducer is not exported from AppContext, so we mirror it here.)

interface Session {
  isAuthenticated: boolean;
  token: string | null;
  expiresAt: number | null;
}

interface AppState {
  session: Session;
  role: Role | null;
  user: UserProfile | null;
  credit: CreditProfile | null;
  loan: LoanProfile | null;
  unreadNotifications: number;
  messages: Message[];
}

type Action =
  | { type: "LOGIN"; payload: { token: string; user: UserProfile; credit: CreditProfile | null; loan: LoanProfile | null; role: Role; messages?: Message[]; unreadNotifications?: number } }
  | { type: "LOGOUT" }
  | { type: "UPDATE_PROFILE"; payload: Partial<UserProfile> }
  | { type: "UPDATE_CREDIT"; payload: Partial<CreditProfile> }
  | { type: "UPDATE_LOAN"; payload: Partial<LoanProfile> }
  | { type: "SET_UNREAD"; payload: number }
  | { type: "SEND_MESSAGE"; payload: Message }
  | { type: "MARK_MESSAGE_READ"; payload: string }
  | { type: "MARK_ALL_READ_FOR_USER"; payload: string };

const INITIAL_STATE: AppState = {
  session: { isAuthenticated: false, token: null, expiresAt: null },
  role: null,
  user: null,
  credit: null,
  loan: null,
  unreadNotifications: 0,
  messages: [],
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "LOGIN":
      return {
        ...state,
        session: { isAuthenticated: true, token: action.payload.token, expiresAt: Date.now() + 86400000 },
        role: action.payload.role,
        user: action.payload.user,
        credit: action.payload.credit,
        loan: action.payload.loan,
        messages: action.payload.messages ?? state.messages,
        unreadNotifications: action.payload.unreadNotifications ?? state.unreadNotifications,
      };
    case "LOGOUT":
      return { ...INITIAL_STATE };
    case "UPDATE_PROFILE":
      return state.user ? { ...state, user: { ...state.user, ...action.payload } } : state;
    case "UPDATE_CREDIT":
      return state.credit ? { ...state, credit: { ...state.credit, ...action.payload } } : state;
    case "UPDATE_LOAN":
      return state.loan ? { ...state, loan: { ...state.loan, ...action.payload } } : state;
    case "SET_UNREAD":
      return { ...state, unreadNotifications: action.payload };
    case "SEND_MESSAGE":
      return { ...state, messages: [...state.messages, action.payload] };
    case "MARK_MESSAGE_READ":
      return { ...state, messages: state.messages.map((m) => m.id === action.payload ? { ...m, isRead: true } : m) };
    case "MARK_ALL_READ_FOR_USER":
      return { ...state, messages: state.messages.map((m) => m.receiverId === action.payload ? { ...m, isRead: true } : m) };
    default:
      return state;
  }
}

// ── Test fixtures ────────────────────────────────────────────────────────────

const mockUser: UserProfile = {
  id: "u1", role: "user", initials: "JD", fullName: "John Doe",
  phone: "+256700000001", email: "john@test.com", nationalId: "CF1234",
  dateOfBirth: "", district: "Kampala", occupation: "Teacher",
  memberSince: "2026-01-15", verified: true, avatarUrl: null,
};

const mockCredit: CreditProfile = {
  score: 650, maxScore: 850, tier: "Fair", percentile: 45, improvementSinceStart: 10,
};

const mockLoan: LoanProfile = {
  availableCredit: 500000, creditIncreaseFromLastMonth: 0,
  totalLoansCount: 2, activeLoan: null, nextPayment: null,
};

const mockMsg: Message = {
  id: "m1", senderId: "admin1", receiverId: "u1",
  content: "Your loan is approved!", createdAt: "2026-07-10T10:00:00Z", isRead: false,
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("AppContext reducer", () => {
  it("LOGIN sets all session fields", () => {
    const next = reducer(INITIAL_STATE, {
      type: "LOGIN",
      payload: { token: "tok", user: mockUser, credit: mockCredit, loan: mockLoan, role: "user" },
    });
    expect(next.session.isAuthenticated).toBe(true);
    expect(next.session.token).toBe("tok");
    expect(next.role).toBe("user");
    expect(next.user?.fullName).toBe("John Doe");
    expect(next.credit?.score).toBe(650);
    expect(next.loan?.availableCredit).toBe(500000);
  });

  it("LOGIN preserves existing messages if none provided", () => {
    const withMsg = { ...INITIAL_STATE, messages: [mockMsg] };
    const next = reducer(withMsg, {
      type: "LOGIN",
      payload: { token: "tok", user: mockUser, credit: null, loan: null, role: "user" },
    });
    expect(next.messages).toHaveLength(1);
  });

  it("LOGOUT clears everything including messages", () => {
    const loggedIn = reducer(INITIAL_STATE, {
      type: "LOGIN",
      payload: { token: "tok", user: mockUser, credit: mockCredit, loan: mockLoan, role: "user", messages: [mockMsg] },
    });
    const loggedOut = reducer(loggedIn, { type: "LOGOUT" });
    expect(loggedOut.session.isAuthenticated).toBe(false);
    expect(loggedOut.role).toBeNull();
    expect(loggedOut.user).toBeNull();
    expect(loggedOut.credit).toBeNull();
    expect(loggedOut.loan).toBeNull();
    // Messages must be cleared on logout to prevent PII leaking between sessions
    expect(loggedOut.messages).toHaveLength(0);
  });

  it("UPDATE_PROFILE merges partial fields", () => {
    const loggedIn = reducer(INITIAL_STATE, {
      type: "LOGIN",
      payload: { token: "tok", user: mockUser, credit: null, loan: null, role: "user" },
    });
    const updated = reducer(loggedIn, {
      type: "UPDATE_PROFILE",
      payload: { district: "Jinja", occupation: "Engineer" },
    });
    expect(updated.user?.district).toBe("Jinja");
    expect(updated.user?.occupation).toBe("Engineer");
    expect(updated.user?.fullName).toBe("John Doe"); // unchanged
  });

  it("UPDATE_CREDIT merges partial fields", () => {
    const loggedIn = reducer(INITIAL_STATE, {
      type: "LOGIN",
      payload: { token: "tok", user: mockUser, credit: mockCredit, loan: null, role: "user" },
    });
    const updated = reducer(loggedIn, { type: "UPDATE_CREDIT", payload: { score: 720, tier: "Good" } });
    expect(updated.credit?.score).toBe(720);
    expect(updated.credit?.tier).toBe("Good");
    expect(updated.credit?.percentile).toBe(45); // unchanged
  });

  it("SEND_MESSAGE appends to messages", () => {
    const next = reducer(INITIAL_STATE, { type: "SEND_MESSAGE", payload: mockMsg });
    expect(next.messages).toHaveLength(1);
    expect(next.messages[0].content).toBe("Your loan is approved!");

    const next2 = reducer(next, { type: "SEND_MESSAGE", payload: { ...mockMsg, id: "m2", content: "Reply" } });
    expect(next2.messages).toHaveLength(2);
  });

  it("MARK_MESSAGE_READ marks only the target message", () => {
    const state = reducer(INITIAL_STATE, { type: "SEND_MESSAGE", payload: mockMsg });
    const state2 = reducer(state, { type: "SEND_MESSAGE", payload: { ...mockMsg, id: "m2", isRead: false } });
    const marked = reducer(state2, { type: "MARK_MESSAGE_READ", payload: "m1" });
    expect(marked.messages[0].isRead).toBe(true);
    expect(marked.messages[1].isRead).toBe(false);
  });

  it("MARK_ALL_READ_FOR_USER marks only messages for that user", () => {
    const msgToOther = { ...mockMsg, id: "m2", receiverId: "other-user", isRead: false };
    const state = reducer(INITIAL_STATE, { type: "SEND_MESSAGE", payload: mockMsg });
    const state2 = reducer(state, { type: "SEND_MESSAGE", payload: msgToOther });
    const marked = reducer(state2, { type: "MARK_ALL_READ_FOR_USER", payload: "u1" });
    expect(marked.messages[0].isRead).toBe(true);  // receiverId === "u1"
    expect(marked.messages[1].isRead).toBe(false); // receiverId === "other-user"
  });

  it("SET_UNREAD updates the unread count", () => {
    const next = reducer(INITIAL_STATE, { type: "SET_UNREAD", payload: 5 });
    expect(next.unreadNotifications).toBe(5);
  });

  it("UPDATE_PROFILE and UPDATE_CREDIT are no-ops when null", () => {
    const noProfile = reducer(INITIAL_STATE, { type: "UPDATE_PROFILE", payload: { fullName: "X" } });
    expect(noProfile.user).toBeNull();

    const noCredit = reducer(INITIAL_STATE, { type: "UPDATE_CREDIT", payload: { score: 999 } });
    expect(noCredit.credit).toBeNull();
  });
});

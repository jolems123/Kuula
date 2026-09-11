export type SavingsGoal = {
  id: string;
  user_id: string;
  name: string;
  emoji: string;
  target: number;
  saved: number;
  color: string;
  created_at: string;
  updated_at: string;
};

export type AppNotification = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: "success" | "warning" | "info" | "alert";
  is_read: boolean;
  created_at: string;
};

// Admin shapes live in ./admin-types.ts

export function clearServiceCache(): void {
  // Node backend mode: no Supabase client cache to clear.
}

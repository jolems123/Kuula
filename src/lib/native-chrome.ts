/**
 * Native chrome hook — configures Capacitor plugins so the same React tree
 * feels native when packaged for iOS/Android, while remaining a pure no-op
 * when served on the web.
 *
 * Responsibilities:
 *   - Style the iOS/Android status bar to match the brand
 *   - Hide the native splash screen once React has mounted
 *   - Wire the Android hardware back button to in-app navigation history
 *     (so Back exits the app only when there's nothing to pop)
 *
 * Everything is guarded by `Capacitor.isNativePlatform()` so the web bundle
 * never touches native APIs.
 */
import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { App as CapApp } from "@capacitor/app";

export function useNativeChrome(): void {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    // ── Status bar ─────────────────────────────────────────────────────────
    // The customer app's first painted pixel is the blue brand header, so a
    // light status bar (white icons) reads correctly. The admin console is
    // dark-on-light, so we default to dark icons — the admin screens also use
    // a dark navy sidebar, but the top chrome (browser/system area) above the
    // sidebar is light, so dark icons remain legible.
    const applyStatusBar = async () => {
      try {
        await StatusBar.setStyle({ style: Style.Light });
        // Android: paint the status bar background to match the brand blue so
        // there's no grey gap above the header. iOS ignores this (uses the
        // safe area inset + transparent style).
        if (Capacitor.getPlatform() === "android") {
          await StatusBar.setBackgroundColor({ color: "#06472B" });
        }
      } catch {
        /* StatusBar plugin unavailable — silently ignore */
      }
    };
    void applyStatusBar();

    // ── Splash screen ──────────────────────────────────────────────────────
    // Hide the launch splash as soon as React is interactive. A 200ms grace
    // keeps the handoff smooth on slower devices.
    const hideSplash = async () => {
      try {
        await new Promise((r) => setTimeout(r, 200));
        await SplashScreen.hide();
      } catch {
        /* SplashScreen plugin unavailable — silently ignore */
      }
    };
    void hideSplash();

    // ── Hardware back button (Android) ─────────────────────────────────────
    // Pop the in-app history stack on Back; only when there's nothing left to
    // pop do we let the default behaviour fire (which exits the app).
    let backListener: { remove: () => void } | undefined;
    const wireBack = async () => {
      try {
        backListener = await CapApp.addListener("backButton", () => {
          if (window.history.length > 1) {
            window.history.back();
          } else {
            // Nothing to pop — defer to the system, which will exit/minimise.
            CapApp.exitApp();
          }
        });
      } catch {
        /* App plugin unavailable — silently ignore */
      }
    };
    void wireBack();

    return () => {
      backListener?.remove?.();
    };
  }, []);
}

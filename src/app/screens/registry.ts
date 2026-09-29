/**
 * Screen registry — maps every screen id to a lazily-loaded component and an
 * access level used by the router guards. The sign-in style screens are bundled
 * eagerly instead: they share one photo backdrop and must swap without a loader.
 */
import type { ComponentType } from "react";
import { lazy } from "react";
import { LandingScreen } from "../components/screens/LandingScreen";
import { LoginScreen } from "../components/screens/LoginScreen";
import { SignUpScreen } from "../components/screens/SignUpScreen";
import { PhoneVerifyScreen } from "../components/screens/PhoneVerifyScreen";
import { AdminLoginScreen } from "../components/screens/AdminLoginScreen";
import { AdminOTPScreen } from "../components/screens/AdminOTPScreen";
import { AdminActivateScreen } from "../components/screens/AdminActivateScreen";

export type ScreenAccess = "public" | "customer" | "admin";

export interface ScreenProps {
  onNavigate: (screenId: string) => void;
}

type ScreenEntry =
  | { access: ScreenAccess; load: () => Promise<{ default: ComponentType<ScreenProps> }> }
  | { access: ScreenAccess; component: ComponentType<ScreenProps> };

const SCREENS: Record<string, ScreenEntry> = {
  "language": { access: "public", load: () => import("../components/screens/LanguageScreen").then((m) => ({ default: m.LanguageScreen })) },
  "welcome": { access: "public", component: LandingScreen },
  "login": { access: "public", component: LoginScreen },
  "create-account": { access: "public", component: SignUpScreen },
  "kyc": { access: "public", load: () => import("../components/screens/KycScreen").then((m) => ({ default: m.KycScreen })) },
  "phone-verify": { access: "public", component: PhoneVerifyScreen },
  "biometric-setup": { access: "public", load: () => import("../components/screens/BiometricSetupScreen").then((m) => ({ default: m.BiometricSetupScreen })) },
  "home": { access: "customer", load: () => import("../components/screens/HomeScreen").then((m) => ({ default: m.HomeScreen })) },
  "dashboard": { access: "customer", load: () => import("../components/screens/DashboardScreen").then((m) => ({ default: m.DashboardScreen })) },
  "loan-calculator": { access: "customer", load: () => import("../components/screens/DashboardScreen").then((m) => ({ default: m.DashboardScreen })) },
  "quick-actions": { access: "customer", load: () => import("../components/screens/QuickActionsScreen").then((m) => ({ default: m.QuickActionsScreen })) },
  "loan-apply": { access: "customer", load: () => import("../components/screens/LoanApplyScreen").then((m) => ({ default: m.LoanApplyScreen })) },
  "loan-purpose": { access: "customer", load: () => import("../components/screens/LoanPurposeScreen").then((m) => ({ default: m.LoanPurposeScreen })) },
  "loan-disbursement": { access: "customer", load: () => import("../components/screens/LoanDisbursementScreen").then((m) => ({ default: m.LoanDisbursementScreen })) },
  "loan-review": { access: "customer", load: () => import("../components/screens/LoanReviewScreen").then((m) => ({ default: m.LoanReviewScreen })) },
  "loan-approval": { access: "customer", load: () => import("../components/screens/LoanApprovalScreen").then((m) => ({ default: m.LoanApprovalScreen })) },
  "loan-detail": { access: "customer", load: () => import("../components/screens/LoanDetailScreen").then((m) => ({ default: m.LoanDetailScreen })) },
  "loan-history": { access: "customer", load: () => import("../components/screens/LoanHistoryScreen").then((m) => ({ default: m.LoanHistoryScreen })) },
  "loan-schedule": { access: "customer", load: () => import("../components/screens/LoanScheduleScreen").then((m) => ({ default: m.LoanScheduleScreen })) },
  "make-payment": { access: "customer", load: () => import("../components/screens/MakePaymentScreen").then((m) => ({ default: m.MakePaymentScreen })) },
  "payment-confirm": { access: "customer", load: () => import("../components/screens/ConfirmScreen").then((m) => ({ default: m.ConfirmScreen })) },
  "loan-agreement": { access: "customer", load: () => import("../components/screens/LoanAgreementScreen").then((m) => ({ default: m.LoanAgreementScreen })) },
  "wallet": { access: "customer", load: () => import("../components/screens/WalletOverviewScreen").then((m) => ({ default: m.WalletOverviewScreen })) },
  "add-payment-method": { access: "customer", load: () => import("../components/screens/AddPaymentMethodScreen").then((m) => ({ default: m.AddPaymentMethodScreen })) },
  "payment-methods-list": { access: "customer", load: () => import("../components/screens/PaymentMethodsListScreen").then((m) => ({ default: m.PaymentMethodsListScreen })) },
  "transaction-history": { access: "customer", load: () => import("../components/screens/TransactionHistoryScreen").then((m) => ({ default: m.TransactionHistoryScreen })) },
  "transaction-detail": { access: "customer", load: () => import("../components/screens/TransactionDetailScreen").then((m) => ({ default: m.TransactionDetailScreen })) },
  "credit-dashboard": { access: "customer", load: () => import("../components/screens/CreditDashboardScreen").then((m) => ({ default: m.CreditDashboardScreen })) },
  "credit-breakdown": { access: "customer", load: () => import("../components/screens/CreditBreakdownScreen").then((m) => ({ default: m.CreditBreakdownScreen })) },
  "improve-credit": { access: "customer", load: () => import("../components/screens/ImproveCreditScreen").then((m) => ({ default: m.ImproveCreditScreen })) },
  "notifications": { access: "customer", load: () => import("../components/screens/NotificationsListScreen").then((m) => ({ default: m.NotificationsListScreen })) },
  "settings": { access: "customer", load: () => import("../components/screens/SettingsScreen").then((m) => ({ default: m.SettingsScreen })) },
  "profile": { access: "customer", load: () => import("../components/screens/ProfileScreen").then((m) => ({ default: m.ProfileScreen })) },
  "personal-info": { access: "customer", load: () => import("../components/screens/PersonalInfoScreen").then((m) => ({ default: m.PersonalInfoScreen })) },
  "notification-settings": { access: "customer", load: () => import("../components/screens/NotificationSettingsScreen").then((m) => ({ default: m.NotificationSettingsScreen })) },
  "privacy-security": { access: "customer", load: () => import("../components/screens/PrivacySecurityScreen").then((m) => ({ default: m.PrivacySecurityScreen })) },
  "help-support": { access: "customer", load: () => import("../components/screens/HelpSupportScreen").then((m) => ({ default: m.HelpSupportScreen })) },
  "contact-support": { access: "customer", load: () => import("../components/screens/ContactSupportScreen").then((m) => ({ default: m.ContactSupportScreen })) },
  "about-app": { access: "customer", load: () => import("../components/screens/AboutAppScreen").then((m) => ({ default: m.AboutAppScreen })) },
  "logout-confirm": { access: "customer", load: () => import("../components/screens/LogoutConfirmScreen").then((m) => ({ default: m.LogoutConfirmScreen })) },
  "delete-account": { access: "customer", load: () => import("../components/screens/DeleteAccountScreen").then((m) => ({ default: m.DeleteAccountScreen })) },
  "customer-officer-assigned": { access: "customer", load: () => import("../components/screens/ExtraApprovalOfficerScreens").then((m) => ({ default: m.CustomerOfficerAssignedScreen })) },
  "loan-timeline": { access: "customer", load: () => import("../components/screens/ExtraApprovalOfficerScreens").then((m) => ({ default: m.CustomerLoanTimelineScreen })) },
  "user-support-chat": { access: "customer", load: () => import("../components/screens/UserSupportChatScreen").then((m) => ({ default: m.UserSupportChatScreen })) },
  "customer-privacy-policy": { access: "public", load: () => import("../components/screens/ExtraCriticalScreens").then((m) => ({ default: m.CustomerPrivacyPolicyScreen })) },
  "customer-terms": { access: "public", load: () => import("../components/screens/ExtraCriticalScreens").then((m) => ({ default: m.CustomerTermsScreen })) },
  "admin-login": { access: "public", component: AdminLoginScreen },
  "admin-activate": { access: "public", component: AdminActivateScreen },
  "admin-otp": { access: "public", component: AdminOTPScreen },
  "admin-dashboard": { access: "admin", load: () => import("../components/screens/AdminDashboardScreen").then((m) => ({ default: m.AdminDashboardScreen })) },
  "admin-loan-apps": { access: "admin", load: () => import("../components/screens/AdminLoanScreens").then((m) => ({ default: m.AdminLoanAppsListScreen })) },
  "admin-active-loans": { access: "admin", load: () => import("../components/screens/AdminLoanScreens").then((m) => ({ default: m.AdminActiveLoansListScreen })) },
  "admin-overdue-loans": { access: "admin", load: () => import("../components/screens/AdminLoanScreens").then((m) => ({ default: m.AdminOverdueLoansListScreen })) },
  "admin-loan-history": { access: "admin", load: () => import("../components/screens/AdminLoanScreens").then((m) => ({ default: m.AdminLoanHistoryAllScreen })) },
  "admin-customer-list": { access: "admin", load: () => import("../components/screens/AdminCustomerScreens").then((m) => ({ default: m.AdminCustomerListScreen })) },
  "admin-customer-kyc": { access: "admin", load: () => import("../components/screens/AdminKycQueueScreen").then((m) => ({ default: m.AdminKycQueueScreen })) },
  "admin-reports": { access: "admin", load: () => import("../components/screens/AdminReportsSettingsSupportScreens").then((m) => ({ default: m.AdminReportsDashboardScreen })) },
  "admin-reconciliation": { access: "admin", load: () => import("../components/screens/AdminReconciliationScreen").then((m) => ({ default: m.AdminReconciliationScreen })) },
  "admin-staff": { access: "admin", load: () => import("../components/screens/AdminReportsSettingsSupportScreens").then((m) => ({ default: m.AdminStaffManagementScreen })) },
  "admin-support-inbox": { access: "admin", load: () => import("../components/screens/AdminSupportInboxScreen").then((m) => ({ default: m.AdminSupportInboxScreen })) },
  "admin-approval-workflow": { access: "admin", load: () => import("../components/screens/ExtraApprovalOfficerScreens").then((m) => ({ default: m.AdminApprovalWorkflowScreen })) },
  "admin-approval-levels": { access: "admin", load: () => import("../components/screens/ExtraApprovalOfficerScreens").then((m) => ({ default: m.AdminApprovalLevelsScreen })) },
  "admin-officer-assignment": { access: "admin", load: () => import("../components/screens/ExtraApprovalOfficerScreens").then((m) => ({ default: m.AdminOfficerAssignmentScreen })) },
  "admin-officer-dashboard": { access: "admin", load: () => import("../components/screens/ExtraApprovalOfficerScreens").then((m) => ({ default: m.AdminOfficerDashboardScreen })) },
  "admin-approval-history": { access: "admin", load: () => import("../components/screens/ExtraApprovalOfficerScreens").then((m) => ({ default: m.AdminApprovalHistoryScreen })) },
  "admin-officer-contact": { access: "admin", load: () => import("../components/screens/ExtraApprovalOfficerScreens").then((m) => ({ default: m.AdminOfficerContactScreen })) },
};

export interface RegisteredScreen {
  id: string;
  access: ScreenAccess;
  Component: ComponentType<ScreenProps>;
}

export const REGISTERED_SCREENS: RegisteredScreen[] = Object.entries(SCREENS).map(
  ([id, entry]) => ({ id, access: entry.access, Component: "component" in entry ? entry.component : lazy(entry.load) })
);

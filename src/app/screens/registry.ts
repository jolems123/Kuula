/**
 * Screen registry — maps every screen id to a lazily-loaded component and an
 * access level used by the router guards.
 *
 * Generated from the original prototype switch in App.tsx; keep ids stable —
 * screens navigate to each other via these ids.
 */
import type { ComponentType, LazyExoticComponent } from "react";
import { lazy } from "react";

export type ScreenAccess = "public" | "customer" | "admin";

export interface ScreenProps {
  onNavigate: (screenId: string) => void;
}

interface ScreenEntry {
  access: ScreenAccess;
  load: () => Promise<{ default: ComponentType<ScreenProps> }>;
}

const SCREENS: Record<string, ScreenEntry> = {
  "language": { access: "public", load: () => import("../components/screens/LanguageScreen").then((m) => ({ default: m.LanguageScreen })) },
  "onboarding": { access: "public", load: () => import("../components/screens/OnboardingScreen").then((m) => ({ default: m.OnboardingScreen })) },
  "welcome": { access: "public", load: () => import("../components/screens/WelcomeScreen").then((m) => ({ default: m.WelcomeScreen })) },
  "create-account": { access: "public", load: () => import("../components/screens/CreateAccountScreen").then((m) => ({ default: m.CreateAccountScreen })) },
  "kyc": { access: "public", load: () => import("../components/screens/KycScreen").then((m) => ({ default: m.KycScreen })) },
  "phone-verify": { access: "public", load: () => import("../components/screens/PhoneVerifyScreen").then((m) => ({ default: m.PhoneVerifyScreen })) },
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
  "goals": { access: "customer", load: () => import("../components/screens/GoalsScreen").then((m) => ({ default: m.GoalsScreen })) },
  "create-goal": { access: "customer", load: () => import("../components/screens/CreateGoalScreen").then((m) => ({ default: m.CreateGoalScreen })) },
  "goal-detail": { access: "customer", load: () => import("../components/screens/GoalDetailScreen").then((m) => ({ default: m.GoalDetailScreen })) },
  "add-money": { access: "customer", load: () => import("../components/screens/AddMoneyScreen").then((m) => ({ default: m.AddMoneyScreen })) },
  "withdraw-savings": { access: "customer", load: () => import("../components/screens/WithdrawSavingsScreen").then((m) => ({ default: m.WithdrawSavingsScreen })) },
  "autosave-settings": { access: "customer", load: () => import("../components/screens/AutoSaveSettingsScreen").then((m) => ({ default: m.AutoSaveSettingsScreen })) },
  "wallet": { access: "customer", load: () => import("../components/screens/WalletOverviewScreen").then((m) => ({ default: m.WalletOverviewScreen })) },
  "add-payment-method": { access: "customer", load: () => import("../components/screens/AddPaymentMethodScreen").then((m) => ({ default: m.AddPaymentMethodScreen })) },
  "payment-methods-list": { access: "customer", load: () => import("../components/screens/PaymentMethodsListScreen").then((m) => ({ default: m.PaymentMethodsListScreen })) },
  "transaction-history": { access: "customer", load: () => import("../components/screens/TransactionHistoryScreen").then((m) => ({ default: m.TransactionHistoryScreen })) },
  "transaction-detail": { access: "customer", load: () => import("../components/screens/TransactionDetailScreen").then((m) => ({ default: m.TransactionDetailScreen })) },
  "credit-dashboard": { access: "customer", load: () => import("../components/screens/CreditDashboardScreen").then((m) => ({ default: m.CreditDashboardScreen })) },
  "credit-breakdown": { access: "customer", load: () => import("../components/screens/CreditBreakdownScreen").then((m) => ({ default: m.CreditBreakdownScreen })) },
  "improve-credit": { access: "customer", load: () => import("../components/screens/ImproveCreditScreen").then((m) => ({ default: m.ImproveCreditScreen })) },
  "notifications": { access: "customer", load: () => import("../components/screens/NotificationsListScreen").then((m) => ({ default: m.NotificationsListScreen })) },
  "notification-detail": { access: "customer", load: () => import("../components/screens/NotificationDetailScreen").then((m) => ({ default: m.NotificationDetailScreen })) },
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
  "customer-support-chat": { access: "customer", load: () => import("../components/screens/ExtraCustomerSupportScreens").then((m) => ({ default: m.CustomerSupportChatScreen })) },
  "customer-chat-history": { access: "customer", load: () => import("../components/screens/ExtraCustomerSupportScreens").then((m) => ({ default: m.CustomerChatHistoryScreen })) },
  "customer-create-ticket": { access: "customer", load: () => import("../components/screens/ExtraCustomerSupportScreens").then((m) => ({ default: m.CustomerCreateTicketScreen })) },
  "customer-ticket-status": { access: "customer", load: () => import("../components/screens/ExtraCustomerSupportScreens").then((m) => ({ default: m.CustomerTicketStatusScreen })) },
  "customer-ticket-details": { access: "customer", load: () => import("../components/screens/ExtraCustomerSupportScreens").then((m) => ({ default: m.CustomerTicketDetailsScreen })) },
  "customer-whatsapp-support": { access: "customer", load: () => import("../components/screens/ExtraCustomerSupportScreens").then((m) => ({ default: m.CustomerWhatsAppSupportScreen })) },
  "customer-phone-support": { access: "customer", load: () => import("../components/screens/ExtraCustomerSupportScreens").then((m) => ({ default: m.CustomerPhoneSupportScreen })) },
  "customer-email-support": { access: "customer", load: () => import("../components/screens/ExtraCustomerSupportScreens").then((m) => ({ default: m.CustomerEmailSupportScreen })) },
  "customer-faq": { access: "customer", load: () => import("../components/screens/ExtraCustomerSupportScreens").then((m) => ({ default: m.CustomerFAQScreen })) },
  "customer-faq-detail": { access: "customer", load: () => import("../components/screens/ExtraCustomerSupportScreens").then((m) => ({ default: m.CustomerFAQDetailScreen })) },
  "customer-loan-guides": { access: "customer", load: () => import("../components/screens/ExtraCustomerSupportScreens").then((m) => ({ default: m.CustomerLoanGuidesScreen })) },
  "customer-how-to-pay": { access: "customer", load: () => import("../components/screens/ExtraCustomerSupportScreens").then((m) => ({ default: m.CustomerHowToPayScreen })) },
  "customer-available-promotions": { access: "customer", load: () => import("../components/screens/ExtraNotifPromoScreens").then((m) => ({ default: m.CustomerAvailablePromotionsScreen })) },
  "customer-claim-promotion": { access: "customer", load: () => import("../components/screens/ExtraNotifPromoScreens").then((m) => ({ default: m.CustomerClaimPromotionScreen })) },
  "customer-notif-history": { access: "customer", load: () => import("../components/screens/ExtraNotifPromoScreens").then((m) => ({ default: m.CustomerNotifHistoryScreen })) },
  "customer-autopay-setup": { access: "customer", load: () => import("../components/screens/ExtraAutoPayCollectionsScreens").then((m) => ({ default: m.CustomerAutoPaySetupScreen })) },
  "customer-autopay-settings": { access: "customer", load: () => import("../components/screens/ExtraAutoPayCollectionsScreens").then((m) => ({ default: m.CustomerAutoPaySettingsScreen })) },
  "customer-autopay-history": { access: "customer", load: () => import("../components/screens/ExtraAutoPayCollectionsScreens").then((m) => ({ default: m.CustomerAutoPayHistoryScreen })) },
  "customer-autopay-failure": { access: "customer", load: () => import("../components/screens/ExtraAutoPayCollectionsScreens").then((m) => ({ default: m.CustomerAutoPayFailureScreen })) },
  "customer-autopay-link": { access: "customer", load: () => import("../components/screens/ExtraAutoPayCollectionsScreens").then((m) => ({ default: m.CustomerAutoPayLinkScreen })) },
  "customer-autopay-notification": { access: "customer", load: () => import("../components/screens/ExtraAutoPayCollectionsScreens").then((m) => ({ default: m.CustomerAutoPayNotificationScreen })) },
  "customer-repayment-offer": { access: "customer", load: () => import("../components/screens/ExtraAutoPayCollectionsScreens").then((m) => ({ default: m.CustomerRepaymentOfferScreen })) },
  "customer-accept-plan": { access: "customer", load: () => import("../components/screens/ExtraAutoPayCollectionsScreens").then((m) => ({ default: m.CustomerAcceptPlanScreen })) },
  "customer-disbursement-status": { access: "customer", load: () => import("../components/screens/ExtraCriticalScreens").then((m) => ({ default: m.CustomerDisbursementStatusScreen })) },
  "customer-loan-rejection": { access: "customer", load: () => import("../components/screens/ExtraCriticalScreens").then((m) => ({ default: m.CustomerLoanRejectionScreen })) },
  "customer-credit-limit-increase": { access: "customer", load: () => import("../components/screens/ExtraCriticalScreens").then((m) => ({ default: m.CustomerCreditLimitIncreaseScreen })) },
  "customer-loan-refinance": { access: "customer", load: () => import("../components/screens/ExtraCriticalScreens").then((m) => ({ default: m.CustomerLoanRefinanceScreen })) },
  "customer-reverify-identity": { access: "customer", load: () => import("../components/screens/ExtraCriticalScreens").then((m) => ({ default: m.CustomerReverifyIdentityScreen })) },
  "customer-privacy-policy": { access: "public", load: () => import("../components/screens/ExtraCriticalScreens").then((m) => ({ default: m.CustomerPrivacyPolicyScreen })) },
  "customer-terms": { access: "public", load: () => import("../components/screens/ExtraCriticalScreens").then((m) => ({ default: m.CustomerTermsScreen })) },
  // ── Admin portal ────────────────────────────────────────────────────────────
  // Every admin screen below is backed by /api/admin/* and shows database data
  // only. Prototype screens with sample content were removed, not hidden.
  "admin-login": { access: "public", load: () => import("../components/screens/AdminLoginScreen").then((m) => ({ default: m.AdminLoginScreen })) },
  "admin-dashboard": { access: "admin", load: () => import("../components/admin/AdminDashboardScreen").then((m) => ({ default: m.AdminDashboardScreen })) },
  "admin-loan-apps": { access: "admin", load: () => import("../components/admin/AdminLoanScreens").then((m) => ({ default: m.AdminLoanAppsListScreen })) },
  "admin-active-loans": { access: "admin", load: () => import("../components/admin/AdminLoanScreens").then((m) => ({ default: m.AdminActiveLoansListScreen })) },
  "admin-overdue-loans": { access: "admin", load: () => import("../components/admin/AdminLoanScreens").then((m) => ({ default: m.AdminOverdueLoansListScreen })) },
  "admin-loan-history": { access: "admin", load: () => import("../components/admin/AdminLoanScreens").then((m) => ({ default: m.AdminLoanHistoryAllScreen })) },
  "admin-loan-detail": { access: "admin", load: () => import("../components/admin/AdminLoanScreens").then((m) => ({ default: m.AdminLoanDetailScreen })) },
  "admin-customer-list": { access: "admin", load: () => import("../components/admin/AdminCustomerScreens").then((m) => ({ default: m.AdminCustomerListScreen })) },
  "admin-customer-detail": { access: "admin", load: () => import("../components/admin/AdminCustomerScreens").then((m) => ({ default: m.AdminCustomerDetailScreen })) },
  "admin-customer-kyc": { access: "admin", load: () => import("../components/admin/AdminCustomerScreens").then((m) => ({ default: m.AdminCustomerKYCScreen })) },
  "admin-kyc-detail": { access: "admin", load: () => import("../components/admin/AdminCustomerScreens").then((m) => ({ default: m.AdminKycDetailScreen })) },
  "admin-all-savings": { access: "admin", load: () => import("../components/admin/AdminLedgerScreens").then((m) => ({ default: m.AdminAllSavingsScreen })) },
  "admin-savings-transactions": { access: "admin", load: () => import("../components/admin/AdminLedgerScreens").then((m) => ({ default: m.AdminSavingsTransactionsScreen })) },
  "admin-all-transactions": { access: "admin", load: () => import("../components/admin/AdminLedgerScreens").then((m) => ({ default: m.AdminAllTransactionsScreen })) },
  "admin-transaction-detail": { access: "admin", load: () => import("../components/admin/AdminLedgerScreens").then((m) => ({ default: m.AdminTransactionDetailScreen })) },
  "admin-reports": { access: "admin", load: () => import("../components/admin/AdminReportsScreen").then((m) => ({ default: m.AdminReportsDashboardScreen })) },
  "admin-support-inbox": { access: "admin", load: () => import("../components/admin/AdminSupportScreens").then((m) => ({ default: m.AdminSupportInboxScreen })) },
  "admin-tickets": { access: "admin", load: () => import("../components/admin/AdminSupportScreens").then((m) => ({ default: m.AdminTicketsListScreen })) },
  "admin-ticket-detail": { access: "admin", load: () => import("../components/admin/AdminSupportScreens").then((m) => ({ default: m.AdminTicketDetailScreen })) },
  "admin-staff": { access: "admin", load: () => import("../components/admin/AdminSystemScreens").then((m) => ({ default: m.AdminStaffManagementScreen })) },
  "admin-audit-log": { access: "admin", load: () => import("../components/admin/AdminSystemScreens").then((m) => ({ default: m.AdminAuditLogScreen })) },
  "admin-settings": { access: "admin", load: () => import("../components/admin/AdminSystemScreens").then((m) => ({ default: m.AdminSettingsScreen })) },
};

export interface RegisteredScreen {
  id: string;
  access: ScreenAccess;
  Component: LazyExoticComponent<ComponentType<ScreenProps>>;
}

export const REGISTERED_SCREENS: RegisteredScreen[] = Object.entries(SCREENS).map(
  ([id, { access, load }]) => ({ id, access, Component: lazy(load) })
);
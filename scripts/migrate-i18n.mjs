#!/usr/bin/env node
/**
 * i18n migration script — replaces hardcoded English strings in all .tsx
 * screen files with useTranslation() t() calls.
 *
 * Strategy:
 * 1. Add `import { useTranslation } from "react-i18next";` where missing
 * 2. Add `const { t } = useTranslation();` hook call inside the component
 * 3. Replace known hardcoded strings with t("namespace.key") calls
 *
 * This handles the bulk of the work. Manual review is still needed for
 * dynamic strings, template literals, and edge cases.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCREENS_DIR = path.join(__dirname, "../src/app/components/screens");
const COMPONENTS_DIR = path.join(__dirname, "../src/app/components");

// Mapping of hardcoded English strings → t() call keys
// Organized by namespace (matching en.json structure)
const STRING_MAP = {
  // ── Navigation ──
  "Home": 't("nav.home")',
  "Loans": 't("nav.loans")',
  "Wallet": 't("nav.wallet")',
  "Goals": 't("nav.goals")',
  "Settings": 't("nav.settings")',

  // ── Common ──
  "Back": 't("common.back")',
  "Loading…": 't("common.loading")',
  "Try Again": 't("common.retry")',
  "Cancel": 't("common.cancel")',
  "Confirm": 't("common.confirm")',
  "Save": 't("common.save")',
  "Delete": 't("common.delete")',
  "Edit": 't("common.edit")',
  "Done": 't("common.done")',
  "Close": 't("common.close")',
  "Next": 't("common.next")',
  "Submit": 't("common.submit")',
  "Continue": 't("common.continue")',
  "Search": 't("common.search")',
  "View All": 't("common.viewAll")',
  "Processing...": 't("common.processing")',
  "Signing in…": 't("common.signingIn")',
  "Log In": 't("common.logIn")',
  "Log Out": 't("common.logOut")',
  "Sign In": 't("common.signIn")',
  "Sign Out": 't("common.signOut")',

  // ── Welcome ──
  "Fast, secure loans via mobile money": 't("welcome.subtitle")',
  "Continue with National ID": 't("welcome.continueNationalId")',
  "Sign In with Phone Number": 't("welcome.signInPhone")',
  "Continue with Google": 't("welcome.continueGoogle")',
  "By continuing, you agree to our Terms & Privacy Policy": 't("welcome.termsNotice")',
  "Phone Number": 't("welcome.phoneNumber")',
  "Enter your PIN": 't("welcome.enterPin")',
  "Enter a PIN of at least 4 digits.": 't("welcome.pinError")',

  // ── Home ──
  "Available Credit": 't("home.availableCredit")',
  "Next Payment": 't("home.nextPayment")',
  "Due Date": 't("home.dueDate")',
  "+ Apply for Loan": 't("home.applyLoan")',
  "Savings": 't("home.savings")',
  "Credit Score": 't("home.creditScore")',
  "Recent Activity": 't("home.recentActivity")',
  "No recent transactions": 't("home.noRecentTxns")',
  "Active Loan": 't("home.activeLoan")',
  "Repaid": 't("home.repaid")',
  "Dashboard →": 't("home.dashboard")',

  // ── Dashboard ──
  "Financial Dashboard": 't("dashboard.title")',
  "Overview": 't("dashboard.tabOverview")',
  "Loan Calculator": 't("dashboard.tabLoanCalc")',
  "No Active Loan": 't("dashboard.noActiveLoan")',
  "Apply for a loan to get started.": 't("dashboard.noActiveLoanSub")',
  "Due": 't("dashboard.due")',
  "Apply for Loan": 't("dashboard.applyLoan")',
  "Make Payment": 't("dashboard.makePayment")',
  "View Savings": 't("dashboard.viewSavings")',
  "Credit Report": 't("dashboard.creditReport")',
  "Request More": 't("dashboard.requestMore")',
  "Request More Funds": 't("dashboard.requestMoreTitle")',
  "Get extra funds disbursed to your mobile money. Your repayment history keeps you eligible — no new KYC needed.": 't("dashboard.requestMoreDesc")',
  "Amount (UGX)": 't("dashboard.amount")',
  "Funds on the way!": 't("dashboard.fundsOnWay")',
  "will arrive on your MoMo.": 't("dashboard.fundsWillArrive")',
  "Credit score not yet computed": 't("dashboard.creditNotComputed")',
  "Tips to Improve Score →": 't("dashboard.improveScore")',

  // ── Settings ──
  "Personal Information": 't("settings.personalInfo")',
  "Name, ID, date of birth": 't("settings.personalInfoSub")',
  "Payment Methods": 't("settings.paymentMethods")',
  "MTN MoMo, Airtel Money": 't("settings.paymentMethodsSub")',
  "Notification Settings": 't("settings.notifSettings")',
  "SMS, email, push alerts": 't("settings.notifSettingsSub")',
  "Privacy & Security": 't("settings.privacySecurity")',
  "PIN, biometric, 2FA": 't("settings.privacySecuritySub")',
  "Help & Support": 't("settings.helpSupport")',
  "Chat, call, FAQ": 't("settings.helpSupportSub")',
  "About App": 't("settings.aboutApp")',
  "Version 2.4.1 · UMRA licensed": 't("settings.aboutAppSub")',
  "Quick Preferences": 't("settings.quickPrefs")',
  "SMS Alerts": 't("settings.smsAlerts")',
  "Payment reminders via text": 't("settings.smsAlertsSub")',
  "Push Notifications": 't("settings.pushNotifs")',
  "Loan status updates": 't("settings.pushNotifsSub")',
  "Email Digest": 't("settings.emailDigest")',
  "Weekly account summary": 't("settings.emailDigestSub")',
  "Verified Account": 't("settings.verifiedAccount")',

  // ── Loan Apply ──
  "Apply for a Loan": 't("loanApply.title")',
  "Loan Amount": 't("loanApply.loanAmount")',
  "Loan Term": 't("loanApply.loanTerm")',
  "Purpose": 't("loanApply.purpose")',
  "Disbursement Method": 't("loanApply.disbursement")',
  "Loan Summary": 't("loanApply.summary")',
  "Principal": 't("loanApply.principal")',
  "Processing fee": 't("loanApply.processingFee")',
  "Weekly payment": 't("loanApply.weeklyPayment")',
  "Total repayable": 't("loanApply.totalRepayable")',
  "Apply Now": 't("loanApply.apply")',
  "Applying…": 't("loanApply.applying")',
  "Funds disbursed via MTN MoMo or Airtel Money within 5 minutes": 't("loanApply.fundsDisclaimer")',
  "Business": 't("loanApply.purposeBusiness")',
  "School Fees": 't("loanApply.purposeSchool")',
  "Medical": 't("loanApply.purposeMedical")',
  "Farming": 't("loanApply.purposeFarming")',
  "Home Repair": 't("loanApply.purposeHomeRepair")',
  "Other": 't("loanApply.purposeOther")',
  "MTN MoMo": 't("loanApply.mtnMomo")',
  "Airtel Money": 't("loanApply.airtelMoney")',
  "Bank Account": 't("loanApply.bankAccount")',
  "3 months": 't("loanApply.months3")',
  "4 months": 't("loanApply.months4")',
  "6 months": 't("loanApply.months6")',
  "12 months": 't("loanApply.months12")',
  "Repayment Summary": 't("loanApply.summary")',
  "Details": 't("loanApply.summary")',

  // ── Loan Detail ──
  "Loan Details": 't("loanDetail.title")',
  "Repayment Progress": 't("loanDetail.repaymentProgress")',
  "Remaining": 't("loanDetail.remaining")',
  "View Schedule": 't("loanDetail.schedule")',
  "Loan ID": 't("loanDetail.loanId")',
  "Disbursed": 't("loanDetail.disbursed")',
  "Status": 't("loanDetail.status")',

  // ── Loan History ──
  "Loan History": 't("loanHistory.title")',
  "Completed": 't("loanHistory.completed")',
  "No loan history yet": 't("loanHistory.noLoans")',
  "Apply for First Loan": 't("loanHistory.applyFirst")',
  "Amount": 't("loanHistory.amount")',
  "Date": 't("loanHistory.date")',

  // ── Loan Approval ──
  "Loan Approval": 't("loanApproval.title")',
  "Approved!": 't("loanApproval.approved")',
  "Congratulations! Your loan has been approved.": 't("loanApproval.congrats")',
  "Term": 't("loanApproval.term")',
  "Disbursed to": 't("loanApproval.disburseTo")',
  "Funds will be sent to your mobile money within 5 minutes.": 't("loanApproval.nextSteps")',
  "View Loan Details": 't("loanApproval.viewLoan")',
  "Go to Home": 't("loanApproval.goHome")',

  // ── Loan Review ──
  "Review Application": 't("loanReview.title")',
  "Please confirm your loan details": 't("loanReview.confirmDetails")',
  "Repayment Term": 't("loanReview.term")',
  "Submit Application": 't("loanReview.submit")',
  "Submitting…": 't("loanReview.submitting")',
  "By submitting, you agree to the loan terms and conditions.": 't("loanReview.termsNotice")',

  // ── Loan Disbursement ──
  "Loan Disbursement": 't("loanDisbursement.title")',
  "Processing your loan...": 't("loanDisbursement.processing")',
  "Funds will arrive within 5 minutes.": 't("loanDisbursement.arriveIn")',
  "Check your mobile money wallet.": 't("loanDisbursement.checkWallet")',

  // ── Loan Schedule ──
  "Repayment Schedule": 't("loanSchedule.title")',
  "Weekly": 't("loanSchedule.weekly")',
  "Paid": 't("loanSchedule.paid")',
  "Upcoming": 't("loanSchedule.upcoming")',
  "Overdue": 't("loanSchedule.overdue")',

  // ── Loan Purpose ──
  "What will you use this loan for?": 't("loanPurpose.subtitle")',
  "Working capital, inventory, supplies": 't("loanPurpose.businessSub")',
  "Tuition, books, uniforms": 't("loanPurpose.schoolFeesSub")',
  "Hospital bills, medication": 't("loanPurpose.medicalSub")',
  "Seeds, fertiliser, equipment": 't("loanPurpose.farmingSub")',
  "Roofing, plumbing, renovation": 't("loanPurpose.homeRepairSub")',
  "Personal or emergency needs": 't("loanPurpose.otherSub")',

  // ── Make Payment ──
  "Make a Payment": 't("makePayment.title")',
  "Outstanding Balance": 't("makePayment.outstanding")',
  "Minimum Payment": 't("makePayment.minPayment")',
  "Pay Full Amount": 't("makePayment.payFull")',
  "Pay Partial Amount": 't("makePayment.payPartial")',
  "Enter amount to pay": 't("makePayment.enterAmount")',
  "Pay Now": 't("makePayment.pay")',
  "Processing payment...": 't("makePayment.paying")',
  "Payment Successful!": 't("makePayment.paymentSuccess")',
  "has been deducted from your mobile money.": 't("makePayment.paymentSuccessSub")',

  // ── Wallet ──
  "My Wallet": 't("wallet.title")',
  "Wallet Balance": 't("wallet.balance")',
  "Add Money": 't("wallet.addMoney")',
  "Send Money": 't("wallet.sendMoney")',
  "Add Method": 't("wallet.addMethod")',
  "Recent Transactions": 't("wallet.recent")',
  "Loan disbursed": 't("wallet.loanDisbursed")',
  "Loan repayment": 't("wallet.loanRepayment")',
  "Savings deposit": 't("wallet.savingsDeposit")',
  "Method": 't("wallet.method")',

  // ── Goals ──
  "Savings Goals": 't("goals.title")',
  "Create New Goal": 't("goals.createGoal")',
  "No savings goals yet": 't("goals.noGoals")',
  "Start saving towards something important.": 't("goals.noGoalsSub")',
  "Total Saved": 't("goals.totalSaved")',
  "Target": 't("goals.target")',
  "Progress": 't("goals.progress")',
  "Auto-Save": 't("goals.autoSave")',
  "Add Funds": 't("goals.addFunds")',
  "Withdraw": 't("goals.withdraw")',

  // ── Goal Detail ──
  "Goal Details": 't("goalDetail.back")',
  "Withdraw Funds": 't("goalDetail.withdraw")',
  "Delete Goal": 't("goalDetail.deleteGoal")',
  "Are you sure you want to delete this goal?": 't("goalDetail.deleteConfirm")',
  "Enter amount": 't("goalDetail.enterAmount")',
  "Withdrawal successful!": 't("goalDetail.withdrawSuccess")',
  "Funds added successfully!": 't("goalDetail.addSuccess")',

  // ── KYC ──
  "Identity Verification": 't("kyc.title")',
  "We need to verify your identity to offer you loans": 't("kyc.subtitle")',
  "National ID Number": 't("kyc.nationalId")',
  "Enter your National ID number": 't("kyc.enterNationalId")',
  "Full Name": 't("kyc.fullName")',
  "Enter your full name": 't("kyc.enterFullName")',
  "Date of Birth": 't("kyc.dateOfBirth")',
  "District": 't("kyc.district")',
  "Select your district": 't("kyc.selectDistrict")',
  "Occupation": 't("kyc.occupation")',
  "Enter your occupation": 't("kyc.enterOccupation")',
  "Verified Successfully!": 't("kyc.verified")',
  "Your identity has been confirmed.": 't("kyc.verifiedSub")',

  // ── Create Account ──
  "Create Account": 't("createAccount.title")',
  "Join Kuula and access instant mobile money loans": 't("createAccount.subtitle")',
  "Email (optional)": 't("createAccount.email")',
  "Create a 4-6 digit PIN": 't("createAccount.enterPassword")',
  "Create PIN": 't("createAccount.password")',
  "Confirm PIN": 't("createAccount.confirmPassword")',
  "Re-enter your PIN": 't("createAccount.enterConfirmPassword")',
  "Already have an account?": 't("createAccount.haveAccount")',
  "PINs do not match": 't("createAccount.pinMismatch")',

  // ── Phone Verify ──
  "Verify Phone": 't("phoneVerify.title")',
  "Enter the 6-digit code": 't("phoneVerify.enterCode")',
  "Resend Code": 't("phoneVerify.resend")',
  "Phone Verified!": 't("phoneVerify.verified")',

  // ── Biometric ──
  "Set Up Biometric Login": 't("biometricSetup.title")',
  "Use your fingerprint or face to log in quickly": 't("biometricSetup.subtitle")',
  "Enable Biometric": 't("biometricSetup.enable")',
  "Skip for Now": 't("biometricSetup.skip")',
  "Biometric Login Enabled!": 't("biometricSetup.enabled")',
  "You can now log in with your fingerprint or face.": 't("biometricSetup.enabledSub")',
  "Biometric not available on this device": 't("biometricSetup.notSupported")',

  // ── Profile ──
  "My Profile": 't("profile.title")',
  "Edit Profile": 't("profile.editProfile")',

  // ── Personal Info ──
  "Save Changes": 't("personalInfo.save")',
  "Saving...": 't("personalInfo.saving")',
  "Profile updated!": 't("personalInfo.saved")',

  // ── Privacy & Security ──
  "Change PIN": 't("privacySecurity.changePin")',
  "Update your 4-6 digit login PIN": 't("privacySecurity.changePinSub")',
  "Biometric Login": 't("privacySecurity.biometric")',
  "Use fingerprint or face to log in": 't("privacySecurity.biometricSub")',
  "Two-Factor Auth": 't("privacySecurity.twoFactor")',
  "Extra security via SMS code": 't("privacySecurity.twoFactorSub")',
  "Data & Privacy": 't("privacySecurity.dataPrivacy")',
  "How we protect your data": 't("privacySecurity.dataPrivacySub")',
  "Delete Account": 't("privacySecurity.deleteAccount")',
  "Permanently remove your data": 't("privacySecurity.deleteAccountSub")',
  "Active Sessions": 't("privacySecurity.sessions")',
  "Manage where you're logged in": 't("privacySecurity.sessionsSub")',

  // ── Delete Account ──
  "This action cannot be undone.": 't("deleteAccount.warning")',
  "All your data, loan history, and savings will be permanently deleted.": 't("deleteAccount.description")',
  "Enter your PIN to confirm": 't("deleteAccount.confirmPin")',
  "Delete My Account": 't("deleteAccount.delete")',
  "Deleting...": 't("deleteAccount.deleting")',
  "Account deleted successfully.": 't("deleteAccount.success")',
  "Failed to delete account. Try again.": 't("deleteAccount.error")',

  // ── Credit ──
  "Credit Dashboard": 't("credit.dashboard")',
  "Credit Breakdown": 't("credit.breakdown")',
  "Payment History": 't("credit.paymentHistory")',
  "Credit Utilization": 't("credit.creditUtilization")',
  "Account Age": 't("credit.accountAge")',
  "Total Loans": 't("credit.totalLoans")',
  "On-Time Payments": 't("credit.onTimePayments")',
  "Improve Your Score": 't("credit.improve")',
  "Tips to improve your credit score": 't("credit.improveTips")',
  "Pay on Time": 't("credit.tip1Title")',
  "Always make your loan payments before the due date. Even one late payment can lower your score.": 't("credit.tip1Desc")',
  "Borrow Responsibly": 't("credit.tip2Title")',
  "Build History": 't("credit.tip3Title")',
  "Avoid Multiple Loans": 't("credit.tip4Title")',
  "Save Regularly": 't("credit.tip5Title")',
  "Score Range": 't("credit.scoreRange")',
  "Excellent": 't("credit.excellent")',
  "Very Good": 't("credit.veryGood")',
  "Good": 't("credit.good")',
  "Fair": 't("credit.fair")',
  "Poor": 't("credit.poor")',

  // ── Notifications ──
  "Notifications": 't("notifications.title")',
  "Mark all as read": 't("notifications.markAllRead")',
  "No notifications yet": 't("notifications.noNotifs")',

  // ── Support ──
  "Help & Support": 't("support.title")',
  "Live Chat": 't("support.chat")',
  "Chat with our support team": 't("support.chatSub")',
  "Call Us": 't("support.call")',
  "Email": 't("support.email")',
  "support@kuula.ug": 't("support.emailSub")',
  "FAQ": 't("support.faq")',
  "Frequently asked questions": 't("support.faqSub")',
  "Contact Support": 't("support.contactTitle")',
  "Type your message...": 't("support.message")',
  "Send": 't("support.send")',
  "Sending...": 't("support.sending")',
  "Message sent!": 't("support.sent")',
  "Support Agent": 't("support.agent")',
  "Type a message...": 't("support.typeMessage")',

  // ── About ──
  "About Kuula": 't("about.title")',
  "Version": 't("about.version")',
  "Licensed by UMRA": 't("about.licensed")',
  "Terms of Service": 't("about.terms")',
  "Privacy Policy": 't("about.privacy")',

  // ── Transactions ──
  "Transaction History": 't("transactions.title")',
  "No transactions yet": 't("transactions.noTxns")',
  "Description": 't("transactions.description")',
  "Type": 't("transactions.type")',
  "Transaction Details": 't("transactions.detail")',
  "Pending": 't("transactions.pending")',

  // ── Payment Methods ──
  "Add Payment Method": 't("paymentMethods.addMethod")',
  "Bank Transfer": 't("paymentMethods.bankTransfer")',
  "Default": 't("paymentMethods.default")',
  "Set as Default": 't("paymentMethods.setAsDefault")',
  "Remove": 't("paymentMethods.remove")',
  "Connected": 't("paymentMethods.connected")',

  // ── Logout ──
  "Are you sure you want to log out?": 't("logout.message")',
  "Yes, Log Out": 't("logout.yes")',

  // ── Confirm ──
  "Are you sure?": 't("confirm.areYouSure")',
  "This action cannot be undone.": 't("confirm.thisCannot")',
  "Yes, Proceed": 't("confirm.yes")',

  // ── Quick Actions ──
  "Quick Actions": 't("quickActions.title")',
  "Add to Savings": 't("quickActions.addSavings")',
  "Check Credit Score": 't("quickActions.checkCredit")',

  // ── Admin ──
  "Admin Login": 't("admin.login")',
  "Admin Dashboard": 't("admin.dashboard")',
  "Total Users": 't("admin.totalUsers")',
  "Active Loans": 't("admin.activeLoans")',
  "Total Disbursed": 't("admin.totalDisbursed")',
  "Collections Rate": 't("admin.collections")',
  "Customers": 't("admin.customers")',
  "Reports": 't("admin.reports")',
  "Support Inbox": 't("admin.support")',
  "Quick Stats": 't("admin.quickStats")',
  "Today": 't("admin.today")',
  "This Week": 't("admin.thisWeek")',
  "This Month": 't("admin.thisMonth")',

  // ── Loan Agreement ──
  "Loan Agreement": 't("loanAgreement.title")',
  "Please read the following terms carefully": 't("loanAgreement.readCarefully")',
  "I Accept the Terms": 't("loanAgreement.accept")',
  "Decline": 't("loanAgreement.decline")',

  // ── Errors ──
  "Request timed out. Check your connection.": 't("errors.timeout")',
  "Could not reach Kuula servers. Try again.": 't("errors.networkError")',

  // ── Trust badges ──
  "UMRA Licensed": "UMRA Licensed",  // Keep as-is (brand name)
  "256-bit Encrypted": "256-bit Encrypted",  // Keep as-is (technical term)
  "MTN & Airtel": "MTN & Airtel",  // Keep as-is (brand names)
};

// Sort keys by length (longest first) to avoid partial matches
const SORTED_KEYS = Object.keys(STRING_MAP).sort((a, b) => b.length - a.length);

function processFile(filePath) {
  let content = fs.readFileSync(filePath, "utf-8");
  const original = content;
  let modified = false;

  // Check if file already has useTranslation import
  const hasTranslationImport = content.includes('useTranslation') && content.includes('react-i18next');
  // Check if it's a TSX file with an exported function component
  const hasExportedComponent = /export\s+function\s+\w+/.test(content);

  if (hasExportedComponent && !hasTranslationImport) {
    // Add useTranslation import
    // Find the last import line
    const importLines = [];
    const lines = content.split("\n");
    let lastImportIdx = -1;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith("import ")) {
        lastImportIdx = i;
      }
    }

    if (lastImportIdx >= 0) {
      // Check if there's already a react-i18next import on the same line as other imports
      if (!content.includes("react-i18next")) {
        lines.splice(lastImportIdx + 1, 0, 'import { useTranslation } from "react-i18next";');
        content = lines.join("\n");
        modified = true;
      }
    }
  }

  // Add useTranslation hook call inside the component function
  if (hasExportedComponent && !content.includes("useTranslation()")) {
    // Find the first line after "export function ComponentName(" that isn't a comment, import, or empty
    const lines = content.split("\n");
    let inserted = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Look for the component function body opening
      if (/export\s+function\s+\w+/.test(line) && line.includes("{")) {
        // Find the closing brace of the function params
        const bodyStart = content.indexOf("{", content.indexOf(line) + line.length);
        if (bodyStart > -1) {
          // Insert after the opening brace line
          // Find the next non-empty line
          let j = i + 1;
          while (j < lines.length && lines[j].trim() === "") j++;

          // Check if there's already a useAppContext or similar hook
          if (j < lines.length) {
            // Insert before the first statement
            lines.splice(j, 0, '  const { t } = useTranslation();');
            content = lines.join("\n");
            inserted = true;
            modified = true;
          }
        }
        break;
      }
    }

    // If we didn't insert yet, try another pattern: function with multiline params
    if (!inserted) {
      for (let i = 0; i < lines.length; i++) {
        if (/export\s+function\s+\w+/.test(lines[i])) {
          // Look for the opening { of the function body
          let j = i + 1;
          while (j < lines.length && !lines[j].includes("{")) j++;
          if (j < lines.length) {
            lines.splice(j + 1, 0, '  const { t } = useTranslation();');
            content = lines.join("\n");
            modified = true;
          }
          break;
        }
      }
    }
  }

  // Replace hardcoded strings with t() calls
  // We need to be careful to only replace strings in JSX text content and string literals,
  // not in import statements, comments, or variable names.

  for (const key of SORTED_KEYS) {
    const replacement = STRING_MAP[key];
    if (replacement === key) continue; // Skip entries where we keep the original

    // Escape special regex characters
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Replace in JSX text content: >text< → >{t("key")}<
    // But be careful not to replace inside HTML attributes like alt="text"
    const jsxTextPattern = new RegExp(`>([^<]*?)${escaped}([^<]*?)<`, "g");
    content = content.replace(jsxTextPattern, (match, before, after) => {
      // Don't replace if it looks like it's inside an attribute
      if (match.includes("=") && match.includes('"')) return match;
      modified = true;
      return `>${before}{${replacement}}${after}<`;
    });

    // Replace in string literals: "text" or 'text' (standalone, not in JSX attributes)
    // Only replace when it's a complete string value (not a substring)
    // Pattern: = "exact string" or : "exact string" or , "exact string"
    const strPattern = new RegExp(`([=,:]\\s*["'\`])${escaped}(["'\`])`, "g");
    content = content.replace(strPattern, (match, prefix, suffix) => {
      // Don't replace inside className, style, or other HTML attributes
      const lineStart = content.lastIndexOf("\n", content.indexOf(match)) + 1;
      const lineEnd = content.indexOf("\n", content.indexOf(match));
      const line = content.substring(lineStart, lineEnd);
      if (line.includes("className") || line.includes("style") || line.includes("import ")) {
        return match;
      }
      modified = true;
      return `${prefix}{${replacement}}${suffix}`;
    });

    // Replace in placeholder attributes: placeholder="text" → placeholder={t("key")}
    const placeholderPattern = new RegExp(`(placeholder\\s*=\\s*["'])${escaped}(["'])`, "g");
    if (placeholderPattern.test(content)) {
      content = content.replace(new RegExp(`(placeholder\\s*=\\s*["'])${escaped}(["'])`, "g"), `$1{${replacement}}$2`);
      modified = true;
    }
  }

  if (modified && content !== original) {
    fs.writeFileSync(filePath, content, "utf-8");
    return true;
  }
  return modified;
}

// Process all screen files
const screenFiles = fs.readdirSync(SCREENS_DIR).filter(f => f.endsWith(".tsx"));
let modifiedCount = 0;

console.log(`Processing ${screenFiles.length} screen files...`);

for (const file of screenFiles) {
  const filePath = path.join(SCREENS_DIR, file);
  if (processFile(filePath)) {
    modifiedCount++;
    console.log(`  ✓ Modified: ${file}`);
  } else {
    console.log(`  - Skipped: ${file}`);
  }
}

// Process shared components
const componentFiles = ["BottomNav.tsx", "LoanCalculator.tsx", "CreditScoreGauge.tsx", "AnimatedStat.tsx"];
for (const file of componentFiles) {
  const filePath = path.join(COMPONENTS_DIR, file);
  if (fs.existsSync(filePath) && processFile(filePath)) {
    modifiedCount++;
    console.log(`  ✓ Modified: ${file}`);
  }
}

console.log(`\nDone! Modified ${modifiedCount} files.`);
#!/usr/bin/env node
/**
 * i18n string replacer — replaces hardcoded strings in screen files with t() calls.
 * Handles: JSX text content, JSX attribute values, and string literal assignments.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");
const SCREENS_DIR = path.join(ROOT, "src/app/components/screens");

function read(p) { return fs.readFileSync(p, "utf-8"); }
function write(p, c) { fs.writeFileSync(p, c, "utf-8"); }
function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// String → { key, value } map (dotted key → English value)
const MAP = {
  // Navigation
  "Back": { key: "common.back", value: "Back" },
  "Loading…": { key: "common.loading", value: "Loading…" },
  "Loading...": { key: "common.loading", value: "Loading…" },
  "Something went wrong": { key: "common.error", value: "Something went wrong" },
  "Try Again": { key: "common.retry", value: "Try Again" },
  "Cancel": { key: "common.cancel", value: "Cancel" },
  "Confirm": { key: "common.confirm", value: "Confirm" },
  "Save": { key: "common.save", value: "Save" },
  "Delete": { key: "common.delete", value: "Delete" },
  "Done": { key: "common.done", value: "Done" },
  "Close": { key: "common.close", value: "Close" },
  "Next": { key: "common.next", value: "Next" },
  "Submit": { key: "common.submit", value: "Submit" },
  "Continue": { key: "common.continue", value: "Continue" },
  "Processing...": { key: "common.processing", value: "Processing..." },
  "Sign Out": { key: "common.signOut", value: "Sign Out" },
  "Log In": { key: "common.logIn", value: "Log In" },
  "Error": { key: "errors.error", value: "Error" },
  "Success": { key: "common.success", value: "Success" },
  "Amount": { key: "common.amount", value: "Amount" },
  
  // ConfirmScreen
  "Payment Successful!": { key: "confirm.paymentSuccessful", value: "Payment Successful!" },
  "Your payment was processed successfully": { key: "confirm.paymentProcessed", value: "Your payment was processed successfully" },
  "Amount Paid": { key: "confirm.amountPaid", value: "Amount Paid" },
  "Transaction ID": { key: "confirm.transactionId", value: "Transaction ID" },
  "Back to Home": { key: "confirm.backToHome", value: "Back to Home" },
  "View Receipt": { key: "confirm.viewReceipt", value: "View Receipt" },
  "Date": { key: "confirm.date", value: "Date" },
  "Time": { key: "confirm.time", value: "Time" },
  "Method": { key: "confirm.method", value: "Method" },
  "Updated Balance": { key: "confirm.updatedBalance", value: "Updated Balance" },

  // AddMoneyScreen
  "Add Money to Savings": { key: "addMoney.title", value: "Add Money to Savings" },
  "Current Savings Balance": { key: "addMoney.currentBalance", value: "Current Savings Balance" },
  "Earns 5% annual interest": { key: "addMoney.earnsInterest", value: "Earns 5% annual interest" },
  "Save Towards": { key: "addMoney.saveTowards", value: "Save Towards" },
  "Pay From": { key: "addMoney.payFrom", value: "Pay From" },

  // PaymentMethodsListScreen
  "Payment Methods": { key: "paymentMethods.title", value: "Payment Methods" },
  "Add New": { key: "paymentMethods.addNew", value: "Add New" },
  "Manage your linked payment accounts used for loan disbursement and repayment.": { key: "paymentMethods.subtitle", value: "Manage your linked payment accounts used for loan disbursement and repayment." },
  "Default": { key: "paymentMethods.default", value: "Default" },
  "Set as Default": { key: "paymentMethods.setDefault", value: "Set as Default" },
  "Add New Payment Method": { key: "paymentMethods.addPaymentMethod", value: "Add New Payment Method" },
  "MTN MoMo": { key: "paymentMethods.mtnMoMo", value: "MTN MoMo" },
  "Airtel Money": { key: "paymentMethods.airtelMoney", value: "Airtel Money" },
  "Stanbic Bank": { key: "paymentMethods.stanbicBank", value: "Stanbic Bank" },

  // LoanPurposeScreen
  "Loan Purpose": { key: "loanPurpose.title", value: "Loan Purpose" },
  "Step 2 of 4": { key: "loanPurpose.step", value: "Step 2 of 4" },
  "What do you need the loan for? This helps us offer better terms.": { key: "loanPurpose.question", value: "What do you need the loan for? This helps us offer better terms." },
  "Business": { key: "loanPurpose.business", value: "Business" },
  "Emergency": { key: "loanPurpose.emergency", value: "Emergency" },
  "Medical": { key: "loanPurpose.medical", value: "Medical" },
  "School Fees": { key: "loanPurpose.schoolFees", value: "School Fees" },
  "Home Repair": { key: "loanPurpose.homeRepair", value: "Home Repair" },
  "Farming": { key: "loanPurpose.farming", value: "Farming" },
  "Shopping": { key: "loanPurpose.shopping", value: "Shopping" },
  "Other": { key: "loanPurpose.other", value: "Other" },

  // LoanApprovalScreen
  "Application Under Review": { key: "loanApproval.underReview", value: "Application Under Review" },
  "Your application is being verified. This usually takes 2–5 minutes.": { key: "loanApproval.underReviewSub", value: "Your application is being verified. This usually takes 2–5 minutes." },
  "Pending Review": { key: "loanApproval.pending", value: "Pending Review" },
  "Loan Approved! 🎉": { key: "loanApproval.approvedTitle", value: "Loan Approved! 🎉" },
  "Application Not Approved": { key: "loanApproval.notApprovedTitle", value: "Application Not Approved" },
  "We're unable to approve this application at this time. You can reapply after 30 days.": { key: "loanApproval.notApprovedSub", value: "We're unable to approve this application at this time. You can reapply after 30 days." },
  "Amount Disbursed": { key: "loanApproval.amountDisbursed", value: "Amount Disbursed" },
  "Application ID": { key: "loanApproval.applicationId", value: "Application ID" },
  "Applied On": { key: "loanApproval.appliedOn", value: "Applied On" },
  "Decision Time": { key: "loanApproval.decisionTime", value: "Decision Time" },
  "In progress...": { key: "loanApproval.inProgress", value: "In progress..." },
  "Due Date": { key: "loanApproval.dueDate", value: "Due Date" },
  "Total Repayment": { key: "loanApproval.totalRepayment", value: "Total Repayment" },
  "Why was my application declined?": { key: "loanApproval.whyDeclined", value: "Why was my application declined?" },
  "Common reasons include: insufficient credit history, unverified ID, or exceeding your current credit limit. Improve your credit score and reapply in 30 days.": { key: "loanApproval.declinedReasons", value: "Common reasons include: insufficient credit history, unverified ID, or exceeding your current credit limit. Improve your credit score and reapply in 30 days." },
  "View Loan": { key: "loanApproval.viewLoan", value: "View Loan" },
  "Try Again": { key: "loanApproval.tryAgain", value: "Try Again" },

  // LoanDisbursementScreen
  "Disbursement Method": { key: "loanDisbursement.title", value: "Disbursement Method" },
  "Step 3 of 4 — Where to send funds": { key: "loanDisbursement.step", value: "Step 3 of 4 — Where to send funds" },
  "Select where you want to receive your loan disbursement.": { key: "loanDisbursement.subtitle", value: "Select where you want to receive your loan disbursement." },
  "+ Add new payment method": { key: "loanDisbursement.addNew", value: "+ Add new payment method" },
  "Continue to Review": { key: "loanDisbursement.continueReview", value: "Continue to Review" },
  "Recommended": { key: "loanDisbursement.recommended", value: "Recommended" },

  // LoanScheduleScreen
  "Repayment Schedule": { key: "loanSchedule.title", value: "Repayment Schedule" },
  "Total Loan": { key: "loanSchedule.totalLoan", value: "Total Loan" },
  "Paid So Far": { key: "loanSchedule.paidSoFar", value: "Paid So Far" },
  "Remaining": { key: "loanSchedule.remaining", value: "Remaining" },
  "Scheduled": { key: "loanSchedule.scheduled", value: "Scheduled" },

  // TransactionHistoryScreen
  "Transaction History": { key: "transactions.title", value: "Transaction History" },
  "Search transactions...": { key: "transactions.search", value: "Search transactions..." },
  "No transactions found": { key: "transactions.noTxns", value: "No transactions found" },
  "Loan Disbursed": { key: "transactions.loanDisbursed", value: "Loan Disbursed" },
  "Loan Repayment": { key: "transactions.loanRepayment", value: "Loan Repayment" },
  "Savings Deposit": { key: "transactions.savingsDeposit", value: "Savings Deposit" },

  // TransactionDetailScreen
  "Transaction Details": { key: "transactions.detailTitle", value: "Transaction Details" },
  "● Successful": { key: "transactions.successful", value: "● Successful" },
  "Transaction Information": { key: "transactions.info", value: "Transaction Information" },
  "Type": { key: "transactions.type", value: "Type" },
  "Loan Disbursement": { key: "transactions.loanDisbursementType", value: "Loan Disbursement" },
  "Loan Reference": { key: "transactions.loanRef", value: "Loan Reference" },
  "From": { key: "transactions.from", value: "From" },
  "Kuula Microfinance Ltd": { key: "transactions.kuulaLtd", value: "Kuula Microfinance Ltd" },
  "To": { key: "transactions.to", value: "To" },
  "Status": { key: "transactions.status", value: "Status" },
  "Completed": { key: "transactions.completed", value: "Completed" },
  "Download Receipt (PDF)": { key: "transactions.downloadReceipt", value: "Download Receipt (PDF)" },

  // Credit
  "Credit Score": { key: "credit.dashboardTitle", value: "Credit Score" },
  "Score History": { key: "credit.scoreHistory", value: "Score History" },
  "Score Ranges": { key: "credit.scoreRanges", value: "Score Ranges" },
  "Poor": { key: "credit.poor", value: "Poor" },
  "Fair": { key: "credit.fair", value: "Fair" },
  "Good": { key: "credit.good", value: "Good" },
  "Very Good": { key: "credit.veryGood", value: "Very Good" },
  "Excellent": { key: "credit.excellent", value: "Excellent" },
  "You are here": { key: "credit.youAreHere", value: "You are here" },
  "View Score Breakdown": { key: "credit.viewBreakdown", value: "View Score Breakdown" },
  "Improve My Score": { key: "credit.improveScore", value: "Improve My Score" },
  "Score Breakdown": { key: "credit.breakdownTitle", value: "Score Breakdown" },
  "Your Credit Score": { key: "credit.yourScore", value: "Your Credit Score" },
  "Computed from 5 data sources": { key: "credit.fiveSources", value: "Computed from 5 data sources" },
  "Top 15% of borrowers": { key: "credit.top15Borrowers", value: "Top 15% of borrowers" },
  "Weight: ": { key: "credit.weight", value: "Weight: " },
  "Payment History": { key: "credit.paymentHistory", value: "Payment History" },
  "Credit Utilization": { key: "credit.creditUtilization", value: "Credit Utilization" },
  "Length of History": { key: "credit.lengthHistory", value: "Length of History" },
  "Credit Mix": { key: "credit.creditMix", value: "Credit Mix" },
  "New Inquiries": { key: "credit.newInquiries", value: "New Inquiries" },
  "Improve Credit Score": { key: "credit.improveTitle", value: "Improve Credit Score" },
  "actions completed": { key: "credit.actionsCompleted", value: "actions completed" },

  // CreateGoalScreen
  "Create New Goal": { key: "goals.createTitle", value: "Create New Goal" },
  "Choose an Icon": { key: "goals.chooseIcon", value: "Choose an Icon" },
  "Goal Name": { key: "goals.goalName", value: "Goal Name" },
  "Target Amount (UGX)": { key: "goals.targetAmount", value: "Target Amount (UGX)" },
  "Target Date ": { key: "goals.targetDate", value: "Target Date " },
  "(optional)": { key: "goals.optional", value: "(optional)" },
  "Auto-Save to this Goal": { key: "goals.autoSaveGoal", value: "Auto-Save to this Goal" },
  "Automatically contribute regularly": { key: "goals.autoSaveDesc", value: "Automatically contribute regularly" },
  "Create Goal": { key: "goals.createGoal", value: "Create Goal" },

  // WithdrawSavingsScreen
  "Withdraw Savings": { key: "withdrawSavings.title", value: "Withdraw Savings" },
  "Available to Withdraw": { key: "withdrawSavings.available", value: "Available to Withdraw" },
  "Withdrawal Amount (UGX)": { key: "withdrawSavings.amount", value: "Withdrawal Amount (UGX)" },
  "Exceeds available balance": { key: "withdrawSavings.exceeds", value: "Exceeds available balance" },
  "Withdraw All": { key: "withdrawSavings.withdrawAll", value: "Withdraw All" },
  "Send To": { key: "withdrawSavings.sendTo", value: "Send To" },

  // AutoSaveSettingsScreen
  "Auto-Save Settings": { key: "autoSave.title", value: "Auto-Save Settings" },
  "Auto-Save": { key: "autoSave.autoSave", value: "Auto-Save" },
  "Save automatically on schedule": { key: "autoSave.autoSaveDesc", value: "Save automatically on schedule" },
  "Frequency": { key: "autoSave.frequency", value: "Frequency" },
  "Save On": { key: "autoSave.saveOn", value: "Save On" },
  "Deduct From": { key: "autoSave.deductFrom", value: "Deduct From" },
  "Auto-Save Summary": { key: "autoSave.summary", value: "Auto-Save Summary" },
  "Save Settings": { key: "autoSave.saveSettings", value: "Save Settings" },

  // QuickActionsScreen
  "Quick Actions": { key: "quickActions.title", value: "Quick Actions" },
  "What would you like to do today?": { key: "quickActions.subtitle", value: "What would you like to do today?" },
  "Apply for Loan": { key: "quickActions.applyLoan", value: "Apply for Loan" },
  "Make Payment": { key: "quickActions.makePayment", value: "Make Payment" },
  "Add to Savings": { key: "quickActions.addToSavings", value: "Add to Savings" },
  "Loan History": { key: "quickActions.loanHistory", value: "Loan History" },
  "Loan Calculator": { key: "quickActions.loanCalc", value: "Loan Calculator" },
  "My Agreement": { key: "quickActions.myAgreement", value: "My Agreement" },
  "Contact Support": { key: "quickActions.contactSupport", value: "Contact Support" },
  "Refer a Friend": { key: "quickActions.referFriend", value: "Refer a Friend" },
  "Recent Actions": { key: "quickActions.recentActions", value: "Recent Actions" },

  // NotificationSettingsScreen
  "Notification Settings": { key: "notifSettings.title", value: "Notification Settings" },
  "Loan Notifications": { key: "notifSettings.loanNotifs", value: "Loan Notifications" },
  "Savings Notifications": { key: "notifSettings.savingsNotifs", value: "Savings Notifications" },
  "Security Alerts": { key: "notifSettings.securityAlerts", value: "Security Alerts" },
  "Channels": { key: "notifSettings.channels", value: "Channels" },
  "SMS Notifications": { key: "notifSettings.sms", value: "SMS Notifications" },
  "Push Notifications": { key: "notifSettings.push", value: "Push Notifications" },
  "Email Notifications": { key: "notifSettings.email", value: "Email Notifications" },

  // PrivacySecurityScreen
  "Privacy & Security": { key: "privacySecurity.title", value: "Privacy & Security" },
  "Change PIN": { key: "privacySecurity.changePin", value: "Change PIN" },
  "4-digit app PIN": { key: "privacySecurity.changePinDesc", value: "4-digit app PIN" },
  "Enter new 4-digit PIN": { key: "privacySecurity.enterPin", value: "Enter new 4-digit PIN" },
  "Set New PIN": { key: "privacySecurity.setPin", value: "Set New PIN" },
  "Biometric Login": { key: "privacySecurity.biometric", value: "Biometric Login" },
  "Use fingerprint or Face ID": { key: "privacySecurity.biometricDesc", value: "Use fingerprint or Face ID" },
  "Two-Factor Authentication": { key: "privacySecurity.twoFactor", value: "Two-Factor Authentication" },
  "Extra OTP on each login": { key: "privacySecurity.twoFactorDesc", value: "Extra OTP on each login" },
  "Data & Privacy": { key: "privacySecurity.dataPrivacy", value: "Data & Privacy" },
  "View Privacy Policy": { key: "privacySecurity.viewPolicy", value: "View Privacy Policy" },
  "Terms of Service": { key: "privacySecurity.terms", value: "Terms of Service" },
  "Download My Data": { key: "privacySecurity.downloadData", value: "Download My Data" },
  "Delete Account": { key: "privacySecurity.deleteAccount", value: "Delete Account" },

  // AboutAppScreen
  "About Kuula": { key: "about.title", value: "About Kuula" },
  "UMRA Licensed · BOU Regulated": { key: "about.licensed", value: "UMRA Licensed · BOU Regulated" },
  "Transparent Lending": { key: "about.transparent", value: "Transparent Lending" },
  "Maximum APR (all-in)": { key: "about.maxApr", value: "Maximum APR (all-in)" },
  "Interest type": { key: "about.interestType", value: "Interest type" },
  "Simple — never compounded": { key: "about.simpleInterest", value: "Simple — never compounded" },
  "Minimum loan term": { key: "about.minTerm", value: "Minimum loan term" },
  "Savings interest": { key: "about.savingsInterest", value: "Savings interest" },
  "Record retention": { key: "about.recordRetention", value: "Record retention" },

  // LogoutConfirmScreen
  "Log Out?": { key: "logout.title", value: "Log Out?" },
  "Yes, Log Out": { key: "logout.confirm", value: "Yes, Log Out" },

  // LoanAgreementScreen
  "Loan Agreement": { key: "loanAgreement.title", value: "Loan Agreement" },
  "Requires your e-signature below": { key: "loanAgreement.requiresSig", value: "Requires your e-signature below" },
  "KUULA MICROFINANCE LIMITED": { key: "loanAgreement.company", value: "KUULA MICROFINANCE LIMITED" },
  "LOAN AGREEMENT": { key: "loanAgreement.heading", value: "LOAN AGREEMENT" },
  "Digitally Signed": { key: "loanAgreement.signed", value: "Digitally Signed" },
  "Agreement Signed": { key: "loanAgreement.signedBtn", value: "Agreement Signed" },
  "Sign Agreement": { key: "loanAgreement.signBtn", value: "Sign Agreement" },

  // Support
  "Contact Support": { key: "support.contactTitle", value: "Contact Support" },
  "Live Chat": { key: "support.liveChat", value: "Live Chat" },
  "Call": { key: "support.call", value: "Call" },
  "Email": { key: "support.email", value: "Email" },
  "Call Now": { key: "support.callNow", value: "Call Now" },
  "Send Message": { key: "support.sendMessage", value: "Send Message" },
  "Subject": { key: "support.subject", value: "Subject" },
  "Online": { key: "support.online", value: "Online" },
  "No messages yet. Send us a message!": { key: "support.noMessages", value: "No messages yet. Send us a message!" },

  // PersonalInfoScreen
  "Personal Information": { key: "personalInfo.title", value: "Personal Information" },
  "Full Name": { key: "personalInfo.fullName", value: "Full Name" },
  "Phone Number": { key: "personalInfo.phone", value: "Phone Number" },
  "Email Address": { key: "personalInfo.email", value: "Email Address" },
  "Date of Birth": { key: "personalInfo.dob", value: "Date of Birth" },
  "District": { key: "personalInfo.district", value: "District" },
  "Occupation": { key: "personalInfo.occupation", value: "Occupation" },
  "Physical Address": { key: "personalInfo.address", value: "Physical Address" },
  "Save Changes": { key: "personalInfo.saveChanges", value: "Save Changes" },
  "National ID (NIN)": { key: "personalInfo.nin", value: "National ID (NIN)" },

  // Admin
  "Kuula Admin": { key: "admin.adminTitle", value: "Kuula Admin" },
  "Staff access · Authorized personnel only": { key: "admin.staffOnly", value: "Staff access · Authorized personnel only" },
  "Sign In": { key: "admin.signIn", value: "Sign In" },
  "Enter your staff credentials to continue": { key: "admin.enterCreds", value: "Enter your staff credentials to continue" },
  "Email Address": { key: "admin.emailAddress", value: "Email Address" },
  "Password": { key: "admin.password", value: "Password" },
  "Forgot Password?": { key: "admin.forgotPassword", value: "Forgot Password?" },
  "Signing in...": { key: "admin.signingIn", value: "Signing in..." },
  "Dashboard Overview": { key: "admin.dashboardOverview", value: "Dashboard Overview" },
  "Good morning, Admin 👋": { key: "admin.goodMorning", value: "Good morning, Admin 👋" },
  "Here's what's happening with Kuula today.": { key: "admin.whatsHappening", value: "Here's what's happening with Kuula today." },
  "Generate Report": { key: "admin.generateReport", value: "Generate Report" },
  "Active Loans": { key: "admin.activeLoans", value: "Active Loans" },
  "Pending Approvals": { key: "admin.pendingApprovals", value: "Pending Approvals" },
  "Today's Revenue": { key: "admin.todaysRevenue", value: "Today's Revenue" },
  "Overdue Loans": { key: "admin.overdueLoans", value: "Overdue Loans" },
  "Loan Activity": { key: "admin.loanActivity", value: "Loan Activity" },
  "Quick Stats": { key: "admin.quickStats", value: "Quick Stats" },
  "Total Customers": { key: "admin.totalCustomers", value: "Total Customers" },
  "Total Disbursed (All Time)": { key: "admin.totalDisbursed", value: "Total Disbursed (All Time)" },
  "Avg Loan Amount": { key: "admin.avgLoanAmount", value: "Avg Loan Amount" },
  "Repayment Rate": { key: "admin.repaymentRate", value: "Repayment Rate" },
  "Recent Loan Applications": { key: "admin.recentApps", value: "Recent Loan Applications" },
  "View All": { key: "admin.viewAll", value: "View All" },
  "Customer Name": { key: "admin.customerName", value: "Customer Name" },
  "Amount": { key: "admin.amount", value: "Amount" },
  "Date Applied": { key: "admin.dateApplied", value: "Date Applied" },
  "Status": { key: "admin.status", value: "Status" },

  // LoanReviewScreen
  "Review Application": { key: "loanReview.title", value: "Review Application" },
  "Step 4 of 4 — Review & Submit": { key: "loanReview.step", value: "Step 4 of 4 — Review & Submit" },
  "Submit Application": { key: "loanReview.submit", value: "Submit Application" },
};

// Sort keys by length (longest first) to prevent partial matches
const SORTED_KEYS = Object.keys(MAP).sort((a, b) => b.length - a.length);

function replaceInCode(code) {
  let changes = 0;
  
  for (const search of SORTED_KEYS) {
    const { key } = MAP[search];
    const tCall = `{t("${key}")}`;
    const escapedSearch = esc(search);
    
    // Pattern 1: JSX text content — >Text Content<
    // Handles: >Text< , >Text\n , >Text</
    const textContentRegex = new RegExp(`(>)${escapedSearch}(<|</|\\s|\\n)`, "g");
    const newTextContent = `$1${tCall}$2`;
    
    // Pattern 2: JSX attribute value — attr="Text"
    const attrRegex = new RegExp(`(placeholder|title|value|label)=["']${escapedSearch}["']`, "g");
    const newAttr = `$1={t("${key}")}`;
    
    // Pattern 3: In JSX expression strings — {"Text"}
    const exprRegex = new RegExp(`(\{["\'])${escapedSearch}(["']\})`, "g");
    const newExpr = `$1${tCall}$2`;
    
    // Apply patterns (skip very short strings that could match too broadly)
    if (search.length < 3) continue;
    // Skip strings with special regex chars that cause issues
    if (/[\[\]{}]/.test(search)) continue;
    
    let before;
    let pass = 0;
    do {
      before = code;
      
      if (textContentRegex.test(code)) {
        code = code.replace(new RegExp(`(>)${escapedSearch}(<|</|\\s|\\n)`, "g"), newTextContent);
        changes++;
      }
      
      if (attrRegex.test(code)) {
        code = code.replace(new RegExp(`(placeholder|title|value|label)=["']${escapedSearch}["']`, "g"), newAttr);
        changes++;
      }
      
      if (exprRegex.test(code)) {
        code = code.replace(new RegExp(`(\{["\'])${escapedSearch}(["']\})`, "g"), newExpr);
        changes++;
      }
      
      pass++;
    } while (code !== before && pass < 3);
  }
  
  return { code, changes };
}

// Process all screen files
const files = fs.readdirSync(SCREENS_DIR)
  .filter(f => f.endsWith(".tsx"))
  .sort();

let totalChanges = 0;
let totalFiles = 0;

for (const file of files) {
  const fp = path.join(SCREENS_DIR, file);
  let code = read(fp);
  const { code: newCode, changes } = replaceInCode(code);
  
  if (changes > 0) {
    write(fp, newCode);
    console.log(`${file}: ${changes} replacements`);
    totalChanges += changes;
    totalFiles++;
  }
}

console.log(`\nTotal: ${totalChanges} replacements in ${totalFiles} files`);

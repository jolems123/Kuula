import prisma from "./prisma.js";
import { emailConfigured, sendTransactionalEmail } from "./email.js";
import { smsConfigured, sendNotificationSms } from "./sms.js";

/** Customer-safe, event-triggered messaging: never include internal credit comments.
 * Notification failure does not reverse the underlying loan transaction.
 */
export async function notifyLoanCustomer(userId: string, title: string, body: string, type = "loan_update"): Promise<void> {
  try {
    await prisma.notification.create({ data: { userId, title, body, type } });
  } catch (error) {
    console.error("loan.customer_notification_failed", error instanceof Error ? error.message : "unknown");
  }
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, phone: true } });
    if (!user) return;
    if (user.email && emailConfigured()) {
      const response = await sendTransactionalEmail({ to: user.email, subject: title, text: body });
      if (!response.accepted) console.warn("loan.notification_email_not_accepted");
    }
    if (user.phone && smsConfigured() && process.env.LOAN_SMS_NOTIFICATIONS_ENABLED === "true") {
      await sendNotificationSms(user.phone, title + ". " + body);
    }
  } catch (error) {
    console.warn("loan.customer_external_notification_failed", error instanceof Error ? error.message : "unknown");
  }
}

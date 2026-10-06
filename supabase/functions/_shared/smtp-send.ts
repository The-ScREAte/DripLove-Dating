import nodemailer from 'npm:nodemailer@6.9.14';
import { classifyEmailError, fromAddress, getErrorMessage, loadAccounts, smtpTransportOptions } from './email-utils.ts';

// Kept out of email-utils.ts so that file stays importable by the vitest suite.

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

/**
 * One-off emails (admin and advertiser notices): try the primary account,
 * then each backup in turn. Only a bad recipient address stops early - any
 * other failure is worth another account's attempt.
 */
export async function sendWithFailover(mail: OutgoingEmail): Promise<{ account: string }> {
  const accounts = loadAccounts();
  if (accounts.length === 0) {
    throw new Error('SMTP is not configured (missing SMTP_PRIMARY_* or SMTP_HOST/SMTP_USER/SMTP_PASS secrets in Supabase)');
  }
  const errors: string[] = [];
  for (const account of accounts) {
    try {
      await nodemailer.createTransport(smtpTransportOptions(account)).sendMail({
        from: fromAddress(account),
        to: mail.to,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        replyTo: mail.replyTo,
      });
      return { account: account.email };
    } catch (error) {
      const message = getErrorMessage(error);
      console.warn(`Send via ${account.email} failed: ${message}`);
      errors.push(`${account.email}: ${message}`);
      if (classifyEmailError(message) === 'recipient_invalid') break;
    }
  }
  throw new Error(`Every sending account failed - ${errors.join(' | ')}`);
}

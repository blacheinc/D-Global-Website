import 'server-only';

// Transactional mail stub — wire Resend/Postmark in a follow-up milestone.
export async function sendMail(_args: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  return;
}

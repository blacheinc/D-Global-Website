import 'server-only';
import { brand } from '@/lib/brand';
import { site } from '@/lib/site';

// Minimal email-safe HTML shell. Uses table layout + inline styles because
// Gmail/Outlook strip <style> tags inconsistently. Don't add web fonts —
// they're stripped by most clients and the request leaks the recipient's
// IP to font CDNs.

export function escape(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function emailLayout(args: { preheader: string; bodyHtml: string }): string {
  const { preheader, bodyHtml } = args;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <title>${escape(site.name)}</title>
  </head>
  <body style="margin:0;padding:0;background:${brand.bg};color:${brand.fg};font-family:Helvetica,Arial,sans-serif;">
    <span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;mso-hide:all;">${escape(preheader)}</span>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${brand.bg};">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:${brand.surface};border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 16px 32px;border-bottom:1px solid ${brand.border};">
                <div style="font-size:18px;font-weight:600;letter-spacing:-0.01em;color:${brand.fg};">${escape(site.name)}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;color:${brand.fg};line-height:1.55;font-size:15px;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px;border-top:1px solid ${brand.border};font-size:12px;color:${brand.muted};">
                ${escape(site.tagline)} · &copy; ${new Date().getFullYear()} ${escape(site.name)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

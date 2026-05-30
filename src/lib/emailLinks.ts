export function buildGmailComposeUrl(bcc: string[], subject: string, body: string): string {
  const bccParam = encodeURIComponent(bcc.join(','));
  const suParam = encodeURIComponent(subject);
  const bodyParam = encodeURIComponent(body);
  return `https://mail.google.com/mail/?view=cm&fs=1&to=&bcc=${bccParam}&su=${suParam}&body=${bodyParam}`;
}

export function buildMailtoUrl(bcc: string[], subject: string, body: string): string {
  const bccParam = encodeURIComponent(bcc.join(','));
  const subjectParam = encodeURIComponent(subject);
  const bodyParam = encodeURIComponent(body);
  return `mailto:?bcc=${bccParam}&subject=${subjectParam}&body=${bodyParam}`;
}

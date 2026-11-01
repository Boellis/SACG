// Members' email addresses and phone numbers never go to the model. Structured
// email/phone fields are simply never read into anything it sees; these
// patterns catch the same details inside free text people typed (RSVP notes,
// descriptions, display names).

const EMAIL_IN_TEXT = /[^\s@(<"']+@[^\s@)>"',;]+/g;
// With separators: 555-010-0142, (555) 010-0142, 555.010.0142, +1 555 010 0142, 010-0142.
const PHONE_IN_TEXT = /(?<!\d)(?:\+?1[ .-]?)?(?:\(\d{3}\)[ .-]?|\d{3}[ .-])?\d{3}[ .-]\d{4}(?!\d)/g;
// Without: ten bare digits, optionally with a leading 1 or +1 (E.164).
const BARE_PHONE = /(?<!\d)\+?1?\d{10}(?!\d)/g;

/** `text` with anything that looks like an email address or a phone number replaced. */
export function hideContactDetails(text: string): string {
  return text
    .replace(EMAIL_IN_TEXT, '[email hidden]')
    .replace(PHONE_IN_TEXT, '[phone hidden]')
    .replace(BARE_PHONE, '[phone hidden]');
}

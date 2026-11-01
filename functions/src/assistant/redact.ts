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

// The app's own messages to the model start with "[App update]" (an app note)
// or "[App context]" (the first line of each admin message). The same marker
// inside anything a person typed or pasted, or wrote on a public RSVP page, is
// rewritten so it can't pass for one; lookalike brackets and spacing included.
const APP_MARKER = /[\[［【]\s*app[\s_-]*(update|context)\s*[\]］】]/giu;

/** `text` with every app marker rewritten as `[pasted marker: App …]`. */
export function neutralizeAppMarkers(text: string): string {
  return text.replace(APP_MARKER, (_marker, kind: string) => `[pasted marker: App ${kind.toLowerCase()}]`);
}

// Hides phone numbers and email addresses in free text until both sides agree to share.

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /(?:\+|00)?\d[\d\s\-/().]{6,}\d/g;
const DATEISH = /^\d{4}-\d{2}-\d{2}$|^\d{1,2}\.\d{1,2}\.\d{2,4}$/;
export const HIDDEN = '[contact details hidden]';

export function maskContacts(text = '') {
  let masked = false;
  let out = String(text).replace(EMAIL, () => {
    masked = true;
    return HIDDEN;
  });
  out = out.replace(PHONE, (m) => {
    const digits = m.replace(/\D/g, '');
    if (digits.length < 8 || DATEISH.test(m.trim())) return m;
    masked = true;
    return HIDDEN;
  });
  return { text: out, masked };
}

const OFF_PLATFORM = /\b(whats ?app|telegram|signal|viber|pay (me )?in cash|western union|bitcoin)\b/i;
export const suggestsOffPlatform = (text = '') => OFF_PLATFORM.test(text);

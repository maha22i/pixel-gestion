/** Numéro international sans +, utilisable par wa.me. Un numéro local djiboutien (0… ou 8 chiffres) est préfixé par 253. */
export function whatsappDigits(phone: string | null | undefined) {
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = "253" + d.slice(1);
  if (d.length === 8) d = "253" + d;
  if (d.length < 8 || d.length > 15) return null;
  return d;
}

export function quoteInviteText(opts: { clientName: string; number: string; subject: string; company: string; url: string }) {
  return `Bonjour ${opts.clientName},\n\nVeuillez consulter et signer le devis ${opts.number} (${opts.subject}) de ${opts.company} :\n${opts.url}\n\nMerci.`;
}

export function whatsappLink(digits: string, text: string) {
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

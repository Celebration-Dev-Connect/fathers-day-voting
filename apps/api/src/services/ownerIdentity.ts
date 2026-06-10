export function ownerIdentityKey(email: string, phone: string) {
  return `contact:${email.trim().toLowerCase()}|${phone.replace(/\D/g, "")}`;
}

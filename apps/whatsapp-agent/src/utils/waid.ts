export function normalizeWaIdDigits(input: string): string {
  return input.replace(/\D/g, "");
}

export function canonicalizeBrazilWaId(input: string): string {
  const digits = normalizeWaIdDigits(input);
  if (!digits.startsWith("55")) {
    return digits;
  }

  if (digits.length >= 4) {
    const ddd = digits.slice(2, 4);
    if (!/^\d{2}$/.test(ddd)) {
      return digits;
    }
  }

  const local = digits.slice(4);
  if (digits.length === 14 && local.startsWith("9")) {
    return digits;
  }

  if (digits.length === 13) {
    return `${digits.slice(0, 4)}9${digits.slice(4)}`;
  }

  return digits;
}

export function formatBrazilianPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length > 11) return digits;
  if (digits.length <= 2) return digits ? `(${digits}` : "";
  const local = digits.slice(2);
  const split = local.length > 8 ? 5 : 4;
  return `(${digits.slice(0, 2)}) ${local.slice(0, split)}${local.length > split ? `-${local.slice(split)}` : ""}`;
}
export function validBrazilianPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  const ddds = "11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99".split(" ");
  return ddds.includes(digits.slice(0, 2)) && /^[1-9]\d(?:[2-5]\d{7}|9\d{8})$/.test(digits);
}

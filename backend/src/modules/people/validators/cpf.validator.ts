export function isValidCpf(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^([0-9])\1{10}$/.test(cpf)) return false;

  const digits = [...cpf].map(Number);
  const first = (digits.slice(0, 9).reduce((sum, digit, index) => sum + digit * (10 - index), 0) * 10) % 11;
  if ((first === 10 ? 0 : first) !== digits[9]) return false;

  const second = (digits.slice(0, 10).reduce((sum, digit, index) => sum + digit * (11 - index), 0) * 10) % 11;
  return (second === 10 ? 0 : second) === digits[10];
}

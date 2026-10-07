function calculateDigit(base: string, weights: number[]): number {
  const sum = [...base].reduce(
    (total, character, index) => total + (character.charCodeAt(0) - 48) * weights[index % weights.length]!,
    0,
  );
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function isValidCnpj(cnpj: string): boolean {
  if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpj)) return false;
  if (/^([A-Z0-9])\1{13}$/.test(cnpj)) return false;

  const firstWeights = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const secondWeights = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const firstDigit = calculateDigit(cnpj.slice(0, 12), firstWeights);
  if (firstDigit !== Number(cnpj[12])) return false;

  const secondDigit = calculateDigit(`${cnpj.slice(0, 12)}${firstDigit}`, secondWeights);
  return secondDigit === Number(cnpj[13]);
}

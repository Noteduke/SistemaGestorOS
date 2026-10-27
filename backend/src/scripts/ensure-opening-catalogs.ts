import type { Prisma } from "../generated/prisma/client.js";
// Approved list in docs/02-Regras-de-Negocio.md. Marca is also the manufacturer.
export const openingEquipmentTypes = ["Notebook", "Computador/Desktop", "Impressora", "Projetor", "Monitor", "Nobreak", "Roteador", "Access Point", "Switch", "Servidor", "Scanner", "Leitor de Código de Barras", "Coletor de Dados", "Tablet", "Celular/Smartphone", "Outro"];
export const openingEquipmentBrands = ["Dell", "HP", "Lenovo", "Samsung", "Acer", "Asus", "Positivo", "Apple", "Epson", "Brother", "Canon", "Lexmark", "Ricoh", "Xerox", "BenQ", "Intelbras", "APC", "SMS", "TS Shara", "Zebra", "Elgin", "D-Link", "TP-Link", "Ubiquiti", "Mikrotik", "Outro", "Não informada"];

/** Caller supplies an authorized transaction after confirming SELECT DATABASE().
 * Never rename existing entries, replace IDs or create a parallel manufacturer. */
export async function ensureOpeningCatalogs(tx: Prisma.TransactionClient, actorUserId: number) {
  const rows = await tx.$queryRaw<Array<{ db: string }>>`SELECT DATABASE() AS db`;
  if (rows.length !== 1 || !["gestor_os_opening_test", "gestor_os_homologation"].includes(rows[0].db)) throw Error("CATALOG_TARGET_REJECTED");
  const counts = { types: 0, brands: 0 };
  for (const [kind, values] of [["types", openingEquipmentTypes], ["brands", openingEquipmentBrands]] as const) {
    for (const value of values) {
      const name = value.toLocaleUpperCase("pt-BR");
      const existing = kind === "types" ? await tx.equipmentType.findUnique({ where: { name }, select: { id: true } }) : await tx.equipmentBrand.findUnique({ where: { name }, select: { id: true } });
      if (existing) continue;
      // Unique name plus skipDuplicates also prevents a concurrent seed collision.
      const result = kind === "types" ? await tx.equipmentType.createMany({ data: [{ name }], skipDuplicates: true }) : await tx.equipmentBrand.createMany({ data: [{ name }], skipDuplicates: true });
      if (result.count) {
        counts[kind]++;
        await tx.adminAuditLog.create({ data: { actorUserId, eventCode: "OPENING_CATALOG_INITIALIZED", detailsJson: { kind, name } } });
      }
    }
  }
  return counts;
}

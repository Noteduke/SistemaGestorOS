import type { Person } from "../../../generated/prisma/client.js";

export function toPersonResponse(person: Person) {
  return {
    publicId: person.publicId,
    personType: person.personType,
    name: person.name,
    document: person.document,
    tradeName: person.tradeName,
    stateRegistration: person.stateRegistration,
    municipalRegistration: person.municipalRegistration,
    observations: person.observations,
    isActive: person.isActive,
    createdAt: person.createdAt,
    updatedAt: person.updatedAt,
  };
}

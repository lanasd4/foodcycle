import type { Organization } from './organization.entity.js';

/** Public JSON shape of an organization (GeoJSON point → {lat, lng}). */
export function presentOrganization(o: Organization) {
  const [lng, lat] = o.location.coordinates;
  return {
    id: o.id,
    name: o.name,
    type: o.type,
    phone: o.phone,
    address: o.address,
    area: o.area,
    location: { lat, lng },
    registrationNumber: o.registrationNumber,
    status: o.status,
    statusReason: o.statusReason,
    trustScore: o.trustScore,
    claimApprovalMode: o.claimApprovalMode,
    verifiedAt: o.verifiedAt,
    createdAt: o.createdAt,
  };
}
export type OrganizationDto = ReturnType<typeof presentOrganization>;

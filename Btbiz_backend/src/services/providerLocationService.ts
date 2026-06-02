import { Doctor } from "../models/Doctor";
import { geocodeAddressWithFallbacks } from "./geocodeService";
import {
  listPatientSelectableProviders,
  type PatientSelectableProvider,
} from "./patientProviderService";

export async function resolveProviderCoordinates(
  providerId: string,
  existing: {
    clinicLatitude?: number;
    clinicLongitude?: number;
    clinicAddress?: string;
  },
  locationQuery?: string,
  businessName?: string
): Promise<{ clinicLatitude?: number; clinicLongitude?: number; clinicAddress?: string }> {
  const hasCoords =
    typeof existing.clinicLatitude === "number" &&
    typeof existing.clinicLongitude === "number";
  if (hasCoords) {
    return {
      clinicLatitude: existing.clinicLatitude,
      clinicLongitude: existing.clinicLongitude,
      clinicAddress: existing.clinicAddress,
    };
  }

  const query = (locationQuery || existing.clinicAddress || "").trim();
  if (!query) {
    return {
      clinicLatitude: existing.clinicLatitude,
      clinicLongitude: existing.clinicLongitude,
      clinicAddress: existing.clinicAddress,
    };
  }

  const coords = await geocodeAddressWithFallbacks(
    query,
    businessName || locationQuery || query
  );
  if (!coords) {
    return {
      clinicLatitude: existing.clinicLatitude,
      clinicLongitude: existing.clinicLongitude,
      clinicAddress: existing.clinicAddress,
    };
  }

  const clinicAddress = existing.clinicAddress?.trim() || query.replace(/, India$/i, "");
  await Doctor.findByIdAndUpdate(providerId, {
    clinicLatitude: coords.lat,
    clinicLongitude: coords.lng,
    clinicAddress,
  });

  return {
    clinicLatitude: coords.lat,
    clinicLongitude: coords.lng,
    clinicAddress,
  };
}

/** Resolve map pins sequentially (parallel calls get blocked by Nominatim). */
export async function resolveProvidersCoordinatesSequential(
  providers: PatientSelectableProvider[]
): Promise<PatientSelectableProvider[]> {
  const resolved: PatientSelectableProvider[] = [];
  for (const p of providers) {
    const coords = await resolveProviderCoordinates(
      p._id.toString(),
      {
        clinicLatitude: p.clinicLatitude,
        clinicLongitude: p.clinicLongitude,
        clinicAddress: p.clinicAddress,
      },
      p.locationQuery,
      p.name
    );
    resolved.push({
      ...p,
      clinicLatitude: coords.clinicLatitude,
      clinicLongitude: coords.clinicLongitude,
      clinicAddress: coords.clinicAddress ?? p.clinicAddress,
    });
  }
  return resolved;
}

/** Super admin / maintenance: geocode every active pharmacy or lab missing coordinates. */
export async function geocodeAllPartnersMissingCoords(
  kind: "pharmacy" | "lab"
): Promise<{ updated: number; failed: number }> {
  const providers = await listPatientSelectableProviders(kind);
  let updated = 0;
  let failed = 0;
  for (const p of providers) {
    const hadCoords =
      typeof p.clinicLatitude === "number" && typeof p.clinicLongitude === "number";
    if (hadCoords) continue;
    const after = await resolveProviderCoordinates(
      p._id.toString(),
      {
        clinicLatitude: p.clinicLatitude,
        clinicLongitude: p.clinicLongitude,
        clinicAddress: p.clinicAddress,
      },
      p.locationQuery,
      p.name
    );
    if (
      typeof after.clinicLatitude === "number" &&
      typeof after.clinicLongitude === "number"
    ) {
      updated += 1;
    } else {
      failed += 1;
    }
  }
  return { updated, failed };
}

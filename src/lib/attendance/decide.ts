export type GpsVerdict = "ok" | "fuzzy" | "out" | "missing";
export type PunchStatus = "valide" | "a_verifier" | "refuse" | "mission";

export type OfficeInput = {
  qrOk: boolean;
  gps: GpsVerdict;
  phoneOk: boolean;
  phoneForeign: boolean;
  ipOk: boolean;
  siteReady: boolean;
};

export type MissionInput = {
  gpsMissing: boolean;
  phoneOk: boolean;
  phoneForeign: boolean;
};

export type Decision = { status: PunchStatus; reasons: string[] };

export function gpsVerdict(distanceM: number | null, accuracyM: number | null, radiusM: number): GpsVerdict {
  if (distanceM == null || !Number.isFinite(distanceM)) return "missing";
  if (distanceM <= radiusM) return "ok";
  const acc = accuracyM != null && Number.isFinite(accuracyM) && accuracyM > 0 ? accuracyM : 0;
  if (distanceM - acc <= radiusM) return "fuzzy";
  return "out";
}

export function decideOffice(input: OfficeInput): Decision {
  const reasons: string[] = [];
  if (!input.siteReady) reasons.push("position_site");
  if (!input.qrOk) reasons.push("qr");
  if (input.phoneForeign) reasons.push("telephone_autre");
  else if (!input.phoneOk) reasons.push("telephone");
  if (input.gps === "missing") reasons.push("gps_absent");
  else if (input.gps === "out") reasons.push("gps_hors");
  else if (input.gps === "fuzzy") reasons.push("gps_flou");
  if (!input.ipOk) reasons.push("ip");

  const fuzzyOffNetwork = input.gps === "fuzzy" && !input.ipOk;
  const hard = reasons.some((r) =>
    r === "position_site" || r === "qr" || r === "telephone" || r === "telephone_autre" || r === "gps_absent" || r === "gps_hors"
  ) || fuzzyOffNetwork;
  if (hard) return { status: "refuse", reasons };
  if (reasons.length) return { status: "a_verifier", reasons };
  return { status: "valide", reasons: [] };
}

export function decideMission(input: MissionInput): Decision {
  const reasons: string[] = [];
  if (input.phoneForeign) reasons.push("telephone_autre");
  else if (!input.phoneOk) reasons.push("telephone");
  if (input.gpsMissing) reasons.push("gps_absent");
  if (reasons.length) return { status: "refuse", reasons };
  return { status: "mission", reasons: [] };
}

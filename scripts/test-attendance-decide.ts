import assert from "node:assert/strict";
import { decideMission, decideOffice, gpsVerdict } from "../src/lib/attendance/decide";
import { distanceMeters } from "../src/lib/attendance/geo";
import { normalizeIp } from "../src/lib/attendance/ip";
import { dayStep } from "../src/lib/attendance/dayStep";
import { buildDayRow, lateMinutes, monthRows } from "../src/lib/attendance/payroll";
import { daysOfMonth } from "../src/lib/attendance/time";

const office = { phoneOk: true, phoneForeign: false, siteReady: true };

const allOk = decideOffice({ ...office, qrOk: true, gps: "ok", ipOk: true });
assert.equal(allOk.status, "valide");

const photoFromHome = decideOffice({ ...office, qrOk: true, gps: "out", ipOk: false });
assert.equal(photoFromHome.status, "refuse");
assert.ok(photoFromHome.reasons.includes("gps_hors"));
assert.ok(photoFromHome.reasons.includes("ip"));

const officeOnMobile = decideOffice({ ...office, qrOk: true, gps: "ok", ipOk: false });
assert.equal(officeOnMobile.status, "a_verifier");
assert.deepEqual(officeOnMobile.reasons, ["ip"]);

const gpsOff = decideOffice({ ...office, qrOk: true, gps: "missing", ipOk: true });
assert.equal(gpsOff.status, "refuse");
assert.ok(gpsOff.reasons.includes("gps_absent"));

const otherPhone = decideOffice({ qrOk: true, gps: "ok", ipOk: true, phoneOk: false, phoneForeign: false, siteReady: true });
assert.equal(otherPhone.status, "refuse");
assert.ok(otherPhone.reasons.includes("telephone"));

const foreignPhone = decideOffice({ qrOk: true, gps: "ok", ipOk: true, phoneOk: false, phoneForeign: true, siteReady: true });
assert.equal(foreignPhone.status, "refuse");
assert.ok(foreignPhone.reasons.includes("telephone_autre"));

const badQr = decideOffice({ ...office, qrOk: false, gps: "ok", ipOk: true });
assert.equal(badQr.status, "refuse");
assert.ok(badQr.reasons.includes("qr"));

const fuzzyOnWifi = decideOffice({ ...office, qrOk: true, gps: "fuzzy", ipOk: true });
assert.equal(fuzzyOnWifi.status, "a_verifier");

const fuzzyAtHome = decideOffice({ ...office, qrOk: true, gps: "fuzzy", ipOk: false });
assert.equal(fuzzyAtHome.status, "refuse");

const missionOk = decideMission({ gpsMissing: false, phoneOk: true, phoneForeign: false });
assert.equal(missionOk.status, "mission");
assert.equal(decideMission({ gpsMissing: true, phoneOk: true, phoneForeign: false }).status, "refuse");
assert.equal(decideMission({ gpsMissing: false, phoneOk: false, phoneForeign: true }).status, "refuse");

assert.equal(gpsVerdict(40, 10, 100), "ok");
assert.equal(gpsVerdict(150, 80, 100), "fuzzy");
assert.equal(gpsVerdict(300, 50, 100), "out");
assert.equal(gpsVerdict(null, 10, 100), "missing");

const djibouti = distanceMeters(11.588, 43.145, 11.589, 43.146);
assert.ok(djibouti > 50 && djibouti < 400);

assert.equal(normalizeIp("::ffff:203.0.113.8"), "203.0.113.8");
assert.equal(lateMinutes("08:10", "08:00", 15), 0);
assert.equal(lateMinutes("08:20", "08:00", 15), 20);

const schedule = { workDays: [0, 1, 2, 3, 4], startTime: "08:00", endTime: "17:00", lateToleranceMin: 15 };
const worked = buildDayRow({
  day: "2026-10-29",
  today: "2026-10-30",
  schedule,
  punches: [
    { kind: "arrivee", at: "2026-10-29T05:00:00.000Z", channel: "bureau", status: "valide" },
    { kind: "depart", at: "2026-10-29T09:00:00.000Z", channel: "bureau", status: "valide" },
    { kind: "arrivee", at: "2026-10-29T11:00:00.000Z", channel: "bureau", status: "valide" },
    { kind: "depart", at: "2026-10-29T14:30:00.000Z", channel: "bureau", status: "valide" },
  ],
});
assert.equal(worked.status, "present");
assert.equal(worked.hoursMin, 450);
assert.equal(worked.lateMin, 0);
assert.equal(worked.arrival, "08:00");

const pending = buildDayRow({
  day: "2026-10-29",
  today: "2026-10-30",
  schedule,
  punches: [
    { kind: "arrivee", at: "2026-10-29T05:05:00.000Z", channel: "bureau", status: "a_verifier", reasons: "ip" },
  ],
});
assert.equal(pending.status, "attente");
assert.equal(pending.arrival, "08:05");
assert.equal(pending.hoursMin, 0);
assert.match(pending.detail, /Réseau/);

assert.equal(dayStep([]), "arrivee");
assert.equal(dayStep([{ kind: "arrivee", status: "refuse" }]), "arrivee");
assert.equal(dayStep([{ kind: "arrivee", status: "a_verifier" }]), "depart");
assert.equal(dayStep([{ kind: "arrivee", status: "valide" }, { kind: "depart", status: "refuse" }]), "depart");
assert.equal(dayStep([{ kind: "arrivee", status: "valide" }, { kind: "depart", status: "valide" }]), "fini");

const holiday = buildDayRow({ day: "2026-01-01", today: "2026-10-30", schedule, holidayName: "Nouvel An", punches: [] });
assert.equal(holiday.status, "ferie");

const leave = buildDayRow({
  day: "2026-10-28",
  today: "2026-10-30",
  schedule,
  absence: { startDate: "2026-10-28", endDate: "2026-10-28", kind: "conge", reason: "Congé annuel" },
  punches: [],
});
assert.equal(leave.status, "justifie");
assert.match(leave.detail, /Congé/);

const friday = buildDayRow({ day: "2026-10-30", today: "2026-10-30", schedule, punches: [] });
assert.equal(friday.status, "repos");

const absent = buildDayRow({ day: "2026-10-27", today: "2026-10-30", schedule, punches: [] });
assert.equal(absent.status, "absent");

const missionDay = buildDayRow({
  day: "2026-10-26",
  today: "2026-10-30",
  schedule,
  punches: [
    { kind: "arrivee", at: "2026-10-26T06:00:00.000Z", channel: "mission", status: "valide" },
    { kind: "depart", at: "2026-10-26T10:00:00.000Z", channel: "mission", status: "valide" },
  ],
});
assert.equal(missionDay.status, "mission");
assert.equal(missionDay.hoursMin, 240);

const month = monthRows({
  month: "2026-10",
  today: "2026-10-30",
  schedule,
  holidays: new Map(),
  absences: [],
  punchesByDay: new Map(),
});
assert.equal(daysOfMonth("2026-10").length, 31);
assert.ok(month.totals.absences >= 1);
assert.equal(month.rows.filter((row) => row.status === "repos").length > 0, true);

// Heures prévues et heures sup
assert.equal(worked.expectedMin, 540);
assert.equal(worked.overtimeMin, 0);
const longDay = buildDayRow({
  day: "2026-10-28",
  today: "2026-10-30",
  schedule,
  punches: [
    { kind: "arrivee", at: "2026-10-28T05:00:00.000Z", channel: "bureau", status: "valide" },
    { kind: "depart", at: "2026-10-28T16:00:00.000Z", channel: "bureau", status: "valide" },
  ],
});
assert.equal(longDay.hoursMin, 660);
assert.equal(longDay.overtimeMin, 120);
const restDay = buildDayRow({
  day: "2026-10-30",
  today: "2026-10-31",
  schedule,
  punches: [
    { kind: "arrivee", at: "2026-10-30T06:00:00.000Z", channel: "bureau", status: "valide" },
    { kind: "depart", at: "2026-10-30T09:00:00.000Z", channel: "bureau", status: "valide" },
  ],
});
assert.equal(restDay.expectedMin, 0);
assert.equal(restDay.overtimeMin, 180);
const openDay = buildDayRow({
  day: "2026-10-30",
  today: "2026-10-30",
  schedule,
  punches: [{ kind: "arrivee", at: "2026-10-30T05:00:00.000Z", channel: "bureau", status: "valide" }],
});
assert.equal(openDay.overtimeMin, 0);

console.log("Décision et paie : tous les cas passent.");

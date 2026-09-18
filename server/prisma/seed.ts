import { PrismaClient, RoleName, UserType } from '@prisma/client';
import { hashPassword } from '../src/lib/password.js';
import { encryptField } from '../src/services/encryption.service.js';
import { genComplaintCode, genCaseNumber, genVictimDisplayCode } from '../src/lib/codes.js';
import { runAssessment } from '../src/services/ai.service.js';
import { persistAssessment } from '../src/services/assessment.service.js';
import { DISTRICTS_BY_STATE, subDistrictsFor } from '../src/data/indiaGeography.js';

const prisma = new PrismaClient();

const ROLE_LABELS: Record<RoleName, string> = {
  VICTIM: 'Victim',
  SURVIVOR: 'Survivor',
  FAMILY_MEMBER: 'Family Member',
  HELPLINE_OPERATOR: 'Helpline Operator',
  COUNSELLOR: 'Counsellor',
  POLICE_OFFICER: 'Police Officer',
  DISTRICT_OFFICER: 'District Officer',
  LEGAL_OFFICER: 'Legal Officer',
  SOCIAL_JUSTICE_OFFICER: 'Social Justice Officer',
  ADMINISTRATOR: 'Administrator',
  STATE_ADMINISTRATOR: 'State Administrator',
  MINISTRY_OFFICIAL: 'Ministry Official',
};

const PERMISSIONS = [
  'victims:read', 'victims:write',
  'complaints:read', 'complaints:write', 'complaints:assign',
  'cases:read', 'cases:write', 'cases:assign', 'cases:close',
  'assessments:read', 'assessments:write',
  'documents:read', 'documents:write',
  'legal:read', 'legal:write',
  'counselling:read', 'counselling:write',
  'sos:read', 'sos:write', 'sos:dispatch',
  'notifications:read',
  'gis:read',
  'analytics:read',
  'admin:manage_users', 'admin:system_settings',
  'audit:read',
];

// Real pan-India state/district reference data (server/src/data/indiaGeography.ts) -
// GIS baseline and support centers are seeded for every real district so the
// map/filters cover the whole country; actual complaint/case records below
// are concentrated in a representative subset (STATE_DISTRICTS), matching
// how real reporting data is unevenly distributed rather than uniform.
const STATE_DISTRICTS: Record<string, string[]> = DISTRICTS_BY_STATE;

// The original, smaller set of districts that get actual seeded
// victims/complaints/cases (illustrative case volume, not the full
// pan-India reference list above).
const CASE_STATE_DISTRICTS: Record<string, string[]> = {
  Bihar: ['Bhojpur', 'Patna', 'Gaya'],
  'Uttar Pradesh': ['Kanpur Nagar', 'Lucknow', 'Varanasi'],
  Gujarat: ['Dahod', 'Ahmedabad'],
  Rajasthan: ['Alwar', 'Jaipur'],
  'Madhya Pradesh': ['Bhopal', 'Indore'],
  Telangana: ['Nizamabad', 'Hyderabad'],
  'Tamil Nadu': ['Madurai', 'Chennai'],
  'West Bengal': ['Purulia', 'Kolkata'],
  Jharkhand: ['Ranchi', 'Dhanbad'],
  Karnataka: ['Bengaluru Rural', 'Mysuru'],
  Odisha: ['Khordha', 'Cuttack'],
  Maharashtra: ['Nagpur', 'Pune'],
};

const SUPPORT_CENTER_TYPES = ['police_station', 'counselling_center', 'legal_aid_office', 'shelter_home'] as const;

// Real, varied narratives spanning the severity spectrum so the AI engines
// produce an organic distribution of SVI scores (rather than every seeded
// case landing on the same number) - each one is run through the actual
// /v1/assess pipeline below, not hand-assigned a score.
const NARRATIVES: { text: string; incidentType: string }[] = [
  {
    text: 'They threatened to kill us and burn our house if we do not leave the land. My children cannot sleep and I am terrified every night. No one in the village will help us anymore.',
    incidentType: 'Threat of violence',
  },
  {
    text: 'They beat my husband and said they will come back and kill him next time. I have not slept in days, I am so afraid.',
    incidentType: 'Physical assault',
  },
  {
    text: 'No one in the village will speak to us anymore since the complaint was filed. We are completely alone and I do not see any way out of this.',
    incidentType: 'Social boycott',
  },
  {
    text: 'They have excluded us from the shared well and denied us work. My family has nothing left and I feel hopeless about our situation.',
    incidentType: 'Social boycott & economic exclusion',
  },
  {
    text: 'Neighboring landowners shouted caste slurs and threw stones at our house during the dispute. We filed a police report the next morning.',
    incidentType: 'Caste-based intimidation',
  },
  {
    text: 'There was a disagreement about the shared water pump which was later settled amicably between both families.',
    incidentType: 'Minor civil dispute',
  },
  {
    text: 'My daughter was turned away from the school van and called names by other parents because of our caste. She is afraid to go to school now.',
    incidentType: 'Caste-based discrimination',
  },
  {
    text: 'They damaged our crops and fencing during the night. We suspect it is retaliation for reporting the earlier land encroachment.',
    incidentType: 'Property damage',
  },
  {
    text: 'The complaint regarding the boundary wall was resolved after a joint inspection by the revenue officer. Both parties are satisfied.',
    incidentType: 'Property dispute (resolved)',
  },
  {
    text: 'A group of men surrounded our house shouting threats and demanding we withdraw the police complaint or face consequences. I fear for my children\'s safety every single day.',
    incidentType: 'Witness intimidation',
  },
];

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length]!;
}

async function main() {
  console.log('Seeding roles + permissions...');
  const roles: Record<RoleName, { id: string }> = {} as never;
  for (const name of Object.values(RoleName)) {
    roles[name] = await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name, description: ROLE_LABELS[name] },
    });
  }
  for (const key of PERMISSIONS) {
    await prisma.permission.upsert({ where: { key }, update: {}, create: { key, label: key.replace(/[:_]/g, ' ') } });
  }
  const allPerms = await prisma.permission.findMany();
  await prisma.role.update({
    where: { name: RoleName.ADMINISTRATOR },
    data: { permissions: { set: allPerms.map((p) => ({ id: p.id })) } },
  });

  console.log('Seeding government users...');
  const password = await hashPassword('Password123!');
  const govUsers: { role: RoleName; email: string; fullName: string; department: string; employeeId: string; district?: string; state?: string }[] = [
    { role: RoleName.ADMINISTRATOR, email: 'admin@dsje.gov.in', fullName: 'A. Krishnan', department: 'Dept. of Social Justice & Empowerment', employeeId: 'EMP-1001' },
    { role: RoleName.MINISTRY_OFFICIAL, email: 'ministry@dsje.gov.in', fullName: 'R. Sharma', department: 'Ministry of Social Justice', employeeId: 'EMP-1002' },
    { role: RoleName.STATE_ADMINISTRATOR, email: 'state.bihar@bihar.nic.in', fullName: 'S. Kumar', department: 'Bihar State SC/ST Cell', employeeId: 'EMP-1003', state: 'Bihar' },
    { role: RoleName.DISTRICT_OFFICER, email: 'do.bhojpur@bihar.nic.in', fullName: 'Insp. Rathi', department: 'District Administration', employeeId: 'EMP-1004', district: 'Bhojpur', state: 'Bihar' },
    { role: RoleName.POLICE_OFFICER, email: 'police.bhojpur@bihar.police.gov.in', fullName: 'SI Meena', department: 'Bhojpur Sadar Police Station', employeeId: 'EMP-1005', district: 'Bhojpur', state: 'Bihar' },
    { role: RoleName.COUNSELLOR, email: 'counsellor.meera@dsje.gov.in', fullName: 'Meera Nair', department: 'District Women & Child Support Center', employeeId: 'EMP-1006', district: 'Bhojpur', state: 'Bihar' },
    { role: RoleName.LEGAL_OFFICER, email: 'legal.kavita@dsje.gov.in', fullName: 'Adv. Kavita Sharma', department: 'District Legal Services Authority', employeeId: 'EMP-1007', district: 'Bhojpur', state: 'Bihar' },
    { role: RoleName.SOCIAL_JUSTICE_OFFICER, email: 'sjo.bhojpur@bihar.nic.in', fullName: 'P. Verma', department: 'Social Justice Wing', employeeId: 'EMP-1008', district: 'Bhojpur', state: 'Bihar' },
    { role: RoleName.HELPLINE_OPERATOR, email: 'helpline.op1@dsje.gov.in', fullName: 'N. Iyer', department: 'National Helpline 14566', employeeId: 'EMP-1009' },
  ];

  const userIds: Record<string, string> = {};
  for (const u of govUsers) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        userType: UserType.GOVERNMENT,
        roleId: roles[u.role].id,
        email: u.email,
        employeeId: u.employeeId,
        department: u.department,
        passwordHash: password,
        fullName: u.fullName,
        designation: ROLE_LABELS[u.role],
        district: u.district,
        state: u.state,
      },
    });
    userIds[u.employeeId] = user.id;
  }

  console.log('Seeding support centers...');
  let centerIdx = 0;
  for (const [state, districts] of Object.entries(STATE_DISTRICTS)) {
    for (const district of districts) {
      const type = pick([...SUPPORT_CENTER_TYPES], centerIdx);
      await prisma.supportCenter.create({
        data: {
          type,
          name: `${district} ${type.replace(/_/g, ' ')}`,
          state,
          district,
          phone: `+91 612-2${String(100000 + centerIdx).slice(0, 6)}`,
        },
      });
      centerIdx += 1;
    }
  }

  console.log('Seeding GIS baseline...');
  for (const [state, districts] of Object.entries(STATE_DISTRICTS)) {
    for (const district of districts) {
      await prisma.gISData.create({ data: { state, district, activeCases: 0, riskLevel: 'MODERATE' } });
    }
  }

  console.log('Seeding victims, complaints, cases, and running real AI assessments (calls the AI service)...');
  const states = Object.keys(CASE_STATE_DISTRICTS);
  const counsellor = await prisma.user.findUniqueOrThrow({ where: { id: userIds['EMP-1006'] } });
  const legalOfficer = await prisma.user.findUniqueOrThrow({ where: { id: userIds['EMP-1007'] } });
  const districtOfficer = userIds['EMP-1004']!;

  const VICTIM_COUNT = 48;
  let assessedCount = 0;

  for (let i = 0; i < VICTIM_COUNT; i += 1) {
    const state = pick(states, i);
    const district = pick(CASE_STATE_DISTRICTS[state]!, i);
    const narrative = pick(NARRATIVES, i);
    const subDistricts = subDistrictsFor(state, district);
    const subDistrict = subDistricts.length ? pick(subDistricts, i) : undefined;

    const victim = await prisma.victim.create({
      data: {
        displayCode: genVictimDisplayCode(),
        fullNameEnc: encryptField(`Seed Victim ${i + 1}`),
        age: 20 + (i % 40),
        gender: i % 3 === 0 ? 'MALE' : 'FEMALE',
        community: i % 2 === 0 ? 'SC' : 'ST',
        state,
        district,
        subDistrict,
        languagePref: pick(['Hindi', 'English', 'Telugu', 'Tamil', 'Bengali'], i),
        contactEnc: encryptField(`98${String(10000000 + i * 137).slice(0, 8)}`),
      },
    });

    await prisma.consentRecord.create({ data: { victimId: victim.id, scope: 'data_sharing', granted: true } });
    await prisma.consentRecord.create({ data: { victimId: victim.id, scope: 'ai_assessment', granted: true } });

    const isClosed = i % 6 === 0;
    const complaint = await prisma.complaint.create({
      data: {
        code: genComplaintCode(),
        victimId: victim.id,
        incidentType: narrative.incidentType,
        narrative: narrative.text,
        channel: pick(['helpline', 'portal', 'field-visit'], i),
        state,
        district,
        status: isClosed ? 'CLOSED' : 'UNDER_INVESTIGATION',
        riskLevel: 'MODERATE', // real value set below once the AI assessment runs
      },
    });

    if (i % 5 === 0) continue; // a few complaints intentionally have no case yet (freshly submitted)

    const kase = await prisma.case.create({
      data: {
        caseNumber: genCaseNumber(),
        complaintId: complaint.id,
        victimId: victim.id,
        status: complaint.status,
        riskLevel: 'MODERATE',
        closedAt: isClosed ? new Date() : null,
      },
    });
    await prisma.caseTimeline.create({
      data: { caseId: kase.id, eventType: 'status_change', summary: 'Case registered and assigned for investigation.' },
    });
    await prisma.caseAssignment.create({ data: { caseId: kase.id, userId: districtOfficer, role: 'DISTRICT_OFFICER' } });

    // Real AI assessment: this is the same pipeline (Node -> FastAPI /v1/assess
    // -> persistAssessment) a live officer-submitted assessment goes through.
    try {
      const ai = await runAssessment({ narrative: narrative.text, priorEscalations: 0 });
      await persistAssessment(
        prisma,
        { victimId: victim.id, complaintId: complaint.id, caseId: kase.id, narrative: narrative.text, actorId: null },
        ai,
      );
      assessedCount += 1;
    } catch (err) {
      console.warn(`  AI assessment skipped for victim ${i + 1} (AI service unreachable?):`, (err as Error).message);
    }

    if (i % 3 === 0) {
      await prisma.counsellingSession.create({
        data: {
          victimId: victim.id,
          counsellorId: counsellor.id,
          scheduledAt: new Date(Date.now() + ((i % 5) - 2) * 24 * 3600 * 1000),
          mode: pick(['video', 'in_person', 'phone'], i),
          status: isClosed ? 'completed' : 'scheduled',
          wellbeingScore: isClosed ? 55 + (i % 30) : null,
        },
      });
    }

    if (i % 4 === 0) {
      const legalAid = await prisma.legalAidRecord.create({
        data: {
          victimId: victim.id,
          caseId: kase.id,
          lawyerName: legalOfficer.fullName,
          lawyerContact: '+91 98xxxxxx12',
          specialization: 'SC/ST Atrocities Act & Victim Compensation',
        },
      });
      const courtCase = await prisma.courtCase.create({
        data: {
          legalAidId: legalAid.id,
          caseNumber: `SC/ST-${new Date().getFullYear()}/${1000 + i}`,
          court: `Special Court, ${district}`,
          filedAt: new Date(Date.now() - 30 * 24 * 3600 * 1000),
        },
      });
      await prisma.hearing.createMany({
        data: [
          { courtCaseId: courtCase.id, label: 'FIR Filed', scheduledAt: new Date(Date.now() - 60 * 24 * 3600 * 1000), status: 'completed' },
          { courtCaseId: courtCase.id, label: 'First Hearing', scheduledAt: new Date(Date.now() - 20 * 24 * 3600 * 1000), status: 'completed' },
          { courtCaseId: courtCase.id, label: 'Evidence Recording', scheduledAt: new Date(Date.now() + 10 * 24 * 3600 * 1000), status: 'upcoming' },
        ],
      });
      await prisma.compensationRecord.create({
        data: { legalAidId: legalAid.id, stage: pick(['applied', 'under_review', 'approved'], i), amountApplied: 85000 },
      });
    }

    if (i % 9 === 0) {
      await prisma.sOSRequest.create({
        data: {
          victimId: victim.id,
          complaintId: complaint.id,
          state,
          district,
          status: pick(['OPEN', 'ACKNOWLEDGED', 'DISPATCHED', 'RESOLVED'], i),
          notes: 'Escalation flagged during AI assessment review.',
        },
      });
    }
  }

  console.log(`Seeded ${VICTIM_COUNT} victims (${assessedCount} with real AI assessments), cases, legal aid, counselling and SOS records.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

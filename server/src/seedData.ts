/**
 * Seed data (Lab 2 FR-08; Lab 3 FR-14, BR-29, specification.md §7 "Seed data").
 *
 * Kept separate from the seed runner so tests can assert the contents without
 * executing any database writes. Passwords here are plain text on purpose:
 * they are local development credentials, documented in the README under
 * "Local development accounts", and the seed hashes them before writing.
 */
import type { Role } from '@prisma/client';

export interface CategorySeed {
  name: string;
  description: string;
}

export interface RelatedSystemSeed {
  name: string;
}

export interface UserSeed {
  name: string;
  email: string;
  department: string | null;
  role: Role;
  isActive: boolean;
  /** Plain-text local password; hashed by the seed, never stored as-is. */
  password: string;
  mustChangePassword: boolean;
}

/** The four Ticket Categories required by the lab sheet. */
export const CATEGORIES: CategorySeed[] = [
  { name: 'Account and Access', description: 'Accounts, passwords, permissions, and access requests.' },
  { name: 'Hardware', description: 'Desktops, laptops, printers, and other physical equipment.' },
  { name: 'Software', description: 'Applications, licences, installation, and configuration.' },
  { name: 'Network', description: 'Connectivity, Wi-Fi, VPN, and network performance.' },
];

/** Services, applications, devices, or platforms a ticket can be raised against. */
export const RELATED_SYSTEMS: RelatedSystemSeed[] = [
  { name: 'Email' },
  { name: 'Campus Wi-Fi' },
  { name: 'VPN' },
  { name: 'LEB2 App' },
  { name: 'Grade Submission App' },
  { name: 'Printer' },
  { name: 'Corporate Laptop' },
];

/**
 * The initial password every migrated Lab 2 requester receives (BR-28). A
 * migrated user must change it at first login.
 */
export const INITIAL_REQUESTER_PASSWORD = 'Welcome123!';

/**
 * Requesters: the five Lab 2 rows, upserted by email so the migration's ids
 * survive. Jennifer and David have already changed their passwords so the E2E
 * suite can sign in as two requesters without a forced change (the Lab 2
 * ownership tests need a second account); Sarah and Michael keep the initial
 * password and the forced change (first-login E2E uses Sarah). Alex is
 * inactive so BR-01 / AC-06 can be tested.
 */
export const REQUESTERS: UserSeed[] = [
  { name: 'Jennifer Anderson', email: 'jennifer.anderson@kmutt.ac.th', department: 'Registrar', role: 'Requester', isActive: true, password: 'Requester1!', mustChangePassword: false },
  { name: 'Sarah Johnson', email: 'sarah.johnson@kmutt.ac.th', department: 'Finance', role: 'Requester', isActive: true, password: INITIAL_REQUESTER_PASSWORD, mustChangePassword: true },
  { name: 'David Lee', email: 'david.lee@kmutt.ac.th', department: 'Engineering', role: 'Requester', isActive: true, password: 'Requester2!', mustChangePassword: false },
  { name: 'Michael Brown', email: 'michael.brown@kmutt.ac.th', department: 'Library', role: 'Requester', isActive: true, password: INITIAL_REQUESTER_PASSWORD, mustChangePassword: true },
  { name: 'Alex Smith', email: 'alex.smith@kmutt.ac.th', department: 'Facilities', role: 'Requester', isActive: false, password: INITIAL_REQUESTER_PASSWORD, mustChangePassword: true },
];

/** IT Staff: three active, one inactive (Robert) for the assignee rules. */
export const IT_STAFF: UserSeed[] = [
  { name: 'Nattapong Srisuk', email: 'nattapong.srisuk@kmutt.ac.th', department: 'IT Services', role: 'ITStaff', isActive: true, password: 'Staff1!pass', mustChangePassword: false },
  { name: 'Priya Raman', email: 'priya.raman@kmutt.ac.th', department: 'IT Services', role: 'ITStaff', isActive: true, password: 'Staff1!pass', mustChangePassword: false },
  { name: 'Chen Wei', email: 'chen.wei@kmutt.ac.th', department: 'IT Services', role: 'ITStaff', isActive: true, password: 'Staff1!pass', mustChangePassword: false },
  { name: 'Robert Wilson', email: 'robert.wilson@kmutt.ac.th', department: 'IT Services', role: 'ITStaff', isActive: false, password: 'Staff1!pass', mustChangePassword: false },
];

/** The one Administrator. Reuses the Lab 1 admin email (specification.md §7). */
export const ADMINISTRATORS: UserSeed[] = [
  { name: 'System Administrator', email: 'admin@toktickit.xyz', department: null, role: 'Administrator', isActive: true, password: 'Admin1!pass', mustChangePassword: false },
];

export const USERS: UserSeed[] = [...REQUESTERS, ...IT_STAFF, ...ADMINISTRATORS];

export type SeedStatus =
  | 'New'
  | 'Open'
  | 'InProgress'
  | 'WaitingForRequester'
  | 'Reopened'
  | 'Resolved'
  | 'Closed'
  | 'Cancelled';
export type SeedPriority = 'Low' | 'Medium' | 'High';

export interface TicketSeed {
  /** `TKT-2026-9000xx`: the reserved range user-created numbers never reach. */
  ticketNumber: string;
  summary: string;
  description: string;
  status: SeedStatus;
  priority: SeedPriority;
  itPriority: SeedPriority;
  requesterEmail: string;
  /** `null` = unassigned. Always an active IT Staff email otherwise. */
  ownerEmail: string | null;
  category: string;
  relatedSystem: string;
  /** Fixed so re-running the seed leaves the queue ordering unchanged. */
  createdAt: string;
  updatedAt: string;
  requesterResolvedAt?: string;
}

/** The number a seeded ticket carries: sequence 1 → `TKT-2026-900001`. */
export function seedTicketNumber(sequence: number): string {
  return `TKT-2026-${String(900000 + sequence).padStart(6, '0')}`;
}

const JENNIFER = 'jennifer.anderson@kmutt.ac.th';
const SARAH = 'sarah.johnson@kmutt.ac.th';
const DAVID = 'david.lee@kmutt.ac.th';
const MICHAEL = 'michael.brown@kmutt.ac.th';
const NATTAPONG = 'nattapong.srisuk@kmutt.ac.th';
const PRIYA = 'priya.raman@kmutt.ac.th';
const CHEN = 'chen.wei@kmutt.ac.th';

/**
 * 24 tickets across the four active Requesters (specification.md §7): every
 * status at least twice, every priority, eight unassigned and the rest spread
 * over the three active IT Staff. Upserted by `ticketNumber`.
 */
export const TICKETS: TicketSeed[] = [
  { ticketNumber: seedTicketNumber(1), summary: 'Cannot sign in to LEB2 after password reset', description: 'Since resetting my password yesterday the LEB2 App rejects it with "invalid credentials", although the same password works for email.', status: 'New', priority: 'High', itPriority: 'High', requesterEmail: JENNIFER, ownerEmail: null, category: 'Account and Access', relatedSystem: 'LEB2 App', createdAt: '2026-09-18T08:05:00.000Z', updatedAt: '2026-09-18T08:05:00.000Z' },
  { ticketNumber: seedTicketNumber(2), summary: 'Printer on floor 3 jams on every duplex job', description: 'Single-sided printing works; any duplex job jams at the rear tray.', status: 'New', priority: 'Medium', itPriority: 'Medium', requesterEmail: SARAH, ownerEmail: null, category: 'Hardware', relatedSystem: 'Printer', createdAt: '2026-09-18T06:40:00.000Z', updatedAt: '2026-09-18T06:40:00.000Z' },
  { ticketNumber: seedTicketNumber(3), summary: 'Request access to the grade submission app for a new TA', description: 'Our new teaching assistant needs read access to Grade Submission for CPE334 section 2.', status: 'New', priority: 'Low', itPriority: 'Low', requesterEmail: DAVID, ownerEmail: null, category: 'Account and Access', relatedSystem: 'Grade Submission App', createdAt: '2026-09-17T10:20:00.000Z', updatedAt: '2026-09-17T10:20:00.000Z' },
  { ticketNumber: seedTicketNumber(4), summary: 'VPN disconnects every 10 minutes from home', description: 'The VPN client drops the tunnel roughly every ten minutes; reconnecting works but the pattern repeats.', status: 'Open', priority: 'High', itPriority: 'High', requesterEmail: MICHAEL, ownerEmail: NATTAPONG, category: 'Network', relatedSystem: 'VPN', createdAt: '2026-09-16T09:00:00.000Z', updatedAt: '2026-09-17T08:30:00.000Z' },
  { ticketNumber: seedTicketNumber(5), summary: 'Laptop battery drains from 100% to 20% in an hour', description: 'The corporate laptop no longer lasts a meeting on battery. Battery report attached in the original email.', status: 'Open', priority: 'Medium', itPriority: 'High', requesterEmail: JENNIFER, ownerEmail: PRIYA, category: 'Hardware', relatedSystem: 'Corporate Laptop', createdAt: '2026-09-15T13:10:00.000Z', updatedAt: '2026-09-17T07:45:00.000Z' },
  { ticketNumber: seedTicketNumber(6), summary: 'Campus Wi-Fi drops in the library reading room', description: 'Connection to the campus Wi-Fi is lost every few minutes on the second floor of the library.', status: 'Open', priority: 'Medium', itPriority: 'Medium', requesterEmail: MICHAEL, ownerEmail: null, category: 'Network', relatedSystem: 'Campus Wi-Fi', createdAt: '2026-09-15T02:30:00.000Z', updatedAt: '2026-09-16T11:00:00.000Z' },
  { ticketNumber: seedTicketNumber(7), summary: 'Outlook keeps asking for the password', description: 'Every hour Outlook prompts for credentials even though they are correct.', status: 'InProgress', priority: 'High', itPriority: 'High', requesterEmail: SARAH, ownerEmail: CHEN, category: 'Software', relatedSystem: 'Email', createdAt: '2026-09-14T07:15:00.000Z', updatedAt: '2026-09-17T09:20:00.000Z' },
  { ticketNumber: seedTicketNumber(8), summary: 'Grade submission app shows last semester sections', description: 'The section list has not rolled over to the current semester, so grades cannot be entered.', status: 'InProgress', priority: 'High', itPriority: 'High', requesterEmail: DAVID, ownerEmail: PRIYA, category: 'Software', relatedSystem: 'Grade Submission App', createdAt: '2026-09-14T04:00:00.000Z', updatedAt: '2026-09-16T15:40:00.000Z' },
  { ticketNumber: seedTicketNumber(9), summary: 'Shared drive mapping lost after Windows update', description: 'The department share no longer appears in Explorer after the latest update.', status: 'InProgress', priority: 'Medium', itPriority: 'Low', requesterEmail: JENNIFER, ownerEmail: NATTAPONG, category: 'Software', relatedSystem: 'Corporate Laptop', createdAt: '2026-09-13T06:00:00.000Z', updatedAt: '2026-09-16T03:15:00.000Z' },
  { ticketNumber: seedTicketNumber(10), summary: 'Need a second monitor for the registrar desk', description: 'The new enrolment workflow needs two screens; one 24-inch monitor with a DisplayPort cable would do.', status: 'WaitingForRequester', priority: 'Low', itPriority: 'Low', requesterEmail: JENNIFER, ownerEmail: CHEN, category: 'Hardware', relatedSystem: 'Corporate Laptop', createdAt: '2026-09-12T08:45:00.000Z', updatedAt: '2026-09-15T10:05:00.000Z' },
  { ticketNumber: seedTicketNumber(11), summary: 'Cannot print from the lecture theatre PC', description: 'The PC in LT-2 shows the printer as offline although it prints from other rooms.', status: 'WaitingForRequester', priority: 'Medium', itPriority: 'Medium', requesterEmail: MICHAEL, ownerEmail: PRIYA, category: 'Hardware', relatedSystem: 'Printer', createdAt: '2026-09-12T03:30:00.000Z', updatedAt: '2026-09-14T09:00:00.000Z' },
  { ticketNumber: seedTicketNumber(12), summary: 'Email quota warning every morning', description: 'A quota warning arrives daily even after archiving; the mailbox shows 40% used.', status: 'Reopened', priority: 'Low', itPriority: 'Medium', requesterEmail: SARAH, ownerEmail: NATTAPONG, category: 'Software', relatedSystem: 'Email', createdAt: '2026-09-08T05:20:00.000Z', updatedAt: '2026-09-16T08:10:00.000Z' },
  { ticketNumber: seedTicketNumber(13), summary: 'VPN certificate expired on the lab laptop', description: 'The VPN refuses to connect with "certificate expired" since Monday.', status: 'Reopened', priority: 'High', itPriority: 'High', requesterEmail: DAVID, ownerEmail: CHEN, category: 'Network', relatedSystem: 'VPN', createdAt: '2026-09-07T09:10:00.000Z', updatedAt: '2026-09-15T14:25:00.000Z' },
  { ticketNumber: seedTicketNumber(14), summary: 'LEB2 assignment upload fails for files over 20 MB', description: 'Uploads above roughly 20 MB fail with a generic error; smaller files are fine.', status: 'Resolved', priority: 'Medium', itPriority: 'Medium', requesterEmail: DAVID, ownerEmail: PRIYA, category: 'Software', relatedSystem: 'LEB2 App', createdAt: '2026-09-05T07:00:00.000Z', updatedAt: '2026-09-11T10:30:00.000Z', requesterResolvedAt: '2026-09-11T09:00:00.000Z' },
  { ticketNumber: seedTicketNumber(15), summary: 'Keyboard keys sticking on the front-desk PC', description: 'The E and R keys stick intermittently; a replacement keyboard was requested.', status: 'Resolved', priority: 'Low', itPriority: 'Low', requesterEmail: SARAH, ownerEmail: NATTAPONG, category: 'Hardware', relatedSystem: 'Corporate Laptop', createdAt: '2026-09-04T02:15:00.000Z', updatedAt: '2026-09-09T06:50:00.000Z' },
  { ticketNumber: seedTicketNumber(16), summary: 'Wi-Fi authentication loop on Android phones', description: 'Android devices are sent back to the login page after accepting the terms.', status: 'Resolved', priority: 'Medium', itPriority: 'High', requesterEmail: MICHAEL, ownerEmail: CHEN, category: 'Network', relatedSystem: 'Campus Wi-Fi', createdAt: '2026-09-03T08:40:00.000Z', updatedAt: '2026-09-10T04:20:00.000Z', requesterResolvedAt: '2026-09-10T03:00:00.000Z' },
  { ticketNumber: seedTicketNumber(17), summary: 'Mailbox migration to the new server', description: 'Please migrate my mailbox before the end of the month as announced.', status: 'Closed', priority: 'Low', itPriority: 'Low', requesterEmail: JENNIFER, ownerEmail: PRIYA, category: 'Software', relatedSystem: 'Email', createdAt: '2026-08-28T06:30:00.000Z', updatedAt: '2026-09-05T09:00:00.000Z' },
  { ticketNumber: seedTicketNumber(18), summary: 'Replace cracked laptop screen', description: 'The screen cracked in transit; the laptop still works with an external monitor.', status: 'Closed', priority: 'High', itPriority: 'Medium', requesterEmail: DAVID, ownerEmail: NATTAPONG, category: 'Hardware', relatedSystem: 'Corporate Laptop', createdAt: '2026-08-26T03:00:00.000Z', updatedAt: '2026-09-03T07:45:00.000Z' },
  { ticketNumber: seedTicketNumber(19), summary: 'Access request for the old grade archive', description: 'Read access to the pre-2024 grade archive for an audit.', status: 'Closed', priority: 'Medium', itPriority: 'Low', requesterEmail: SARAH, ownerEmail: CHEN, category: 'Account and Access', relatedSystem: 'Grade Submission App', createdAt: '2026-08-25T10:00:00.000Z', updatedAt: '2026-09-01T05:30:00.000Z' },
  { ticketNumber: seedTicketNumber(20), summary: 'Duplicate of the Wi-Fi library ticket', description: 'Raised twice by mistake; please cancel this one.', status: 'Cancelled', priority: 'Medium', itPriority: 'Medium', requesterEmail: MICHAEL, ownerEmail: null, category: 'Network', relatedSystem: 'Campus Wi-Fi', createdAt: '2026-09-15T02:35:00.000Z', updatedAt: '2026-09-15T04:00:00.000Z' },
  { ticketNumber: seedTicketNumber(21), summary: 'Software licence for a tool we no longer use', description: 'The licence request is no longer needed; the team switched tools.', status: 'Cancelled', priority: 'Low', itPriority: 'Low', requesterEmail: JENNIFER, ownerEmail: null, category: 'Software', relatedSystem: 'Corporate Laptop', createdAt: '2026-08-30T07:20:00.000Z', updatedAt: '2026-09-02T08:00:00.000Z' },
  { ticketNumber: seedTicketNumber(22), summary: 'Guest Wi-Fi vouchers for the open day', description: 'We need 200 guest Wi-Fi vouchers valid for the open day on the 26th.', status: 'New', priority: 'Medium', itPriority: 'Medium', requesterEmail: SARAH, ownerEmail: null, category: 'Network', relatedSystem: 'Campus Wi-Fi', createdAt: '2026-09-17T01:50:00.000Z', updatedAt: '2026-09-17T01:50:00.000Z' },
  { ticketNumber: seedTicketNumber(23), summary: 'Email signature not applied on mobile', description: 'The corporate signature shows on desktop but not when sending from the phone app.', status: 'Open', priority: 'Low', itPriority: 'Low', requesterEmail: DAVID, ownerEmail: null, category: 'Software', relatedSystem: 'Email', createdAt: '2026-09-16T05:05:00.000Z', updatedAt: '2026-09-16T12:30:00.000Z' },
  { ticketNumber: seedTicketNumber(24), summary: 'Projector in room 402 shows a pink tint', description: 'The projector output is tinted pink from the HDMI input; VGA looks fine.', status: 'InProgress', priority: 'Medium', itPriority: 'Medium', requesterEmail: MICHAEL, ownerEmail: NATTAPONG, category: 'Hardware', relatedSystem: 'Printer', createdAt: '2026-09-13T09:25:00.000Z', updatedAt: '2026-09-17T06:10:00.000Z' },
];

/**
 * One Public Comment or Internal Note on a seeded ticket (specification.md §7).
 *
 * Both carry a deterministic id so the seed can upsert them: the tables have
 * no natural unique key (a thread may legitimately hold two identical
 * sentences), and a random id would create a fresh row on every run. The id
 * encodes the ticket's sequence and the position in its thread, so a re-run
 * rewrites the same rows and nothing accumulates (BR-29).
 */
export interface ThreadSeed {
  id: string;
  ticketNumber: string;
  /** Email of the author; a Requester or the ticket's owner. */
  authorEmail: string;
  body: string;
  createdAt: string;
}

/**
 * `00000000-0000-4000-8000-c000000000NN` for comments and `…-n000000000NN`
 * for notes: uuid-shaped, obviously synthetic, and stable across runs.
 */
function threadId(kind: 'c' | 'n', sequence: number): string {
  return `00000000-0000-4000-8000-${kind}${String(sequence).padStart(11, '0')}`;
}

/** Minutes after the ticket's creation, so a thread always follows its ticket. */
function afterCreation(ticket: TicketSeed, minutes: number): string {
  return new Date(new Date(ticket.createdAt).getTime() + minutes * 60_000).toISOString();
}

const REQUESTER_LINES = [
  'Is there any update on this? It is still happening today.',
  'Thanks for looking into it — let me know if you need anything from my side.'
];

const STAFF_LINES = [
  'Thanks for reporting this. We have picked it up and are investigating.',
  'We have made a change on our side; please tell us whether it helps.'
];

/**
 * Public Comments: about two per non-`New` ticket, alternating Requester and
 * owner (specification.md §7). A ticket nobody has looked at yet has no thread,
 * which is what makes the `New` rows in the queue look like real new work.
 */
export const TICKET_COMMENTS: ThreadSeed[] = TICKETS.filter(
  (ticket) => ticket.status !== 'New'
).flatMap((ticket, index) => {
  const sequence = index * 2 + 1;
  const staffAuthor = ticket.ownerEmail ?? IT_STAFF[index % 3].email;

  return [
    {
      id: threadId('c', sequence),
      ticketNumber: ticket.ticketNumber,
      authorEmail: ticket.requesterEmail,
      body: REQUESTER_LINES[index % REQUESTER_LINES.length],
      createdAt: afterCreation(ticket, 90)
    },
    {
      id: threadId('c', sequence + 1),
      ticketNumber: ticket.ticketNumber,
      authorEmail: staffAuthor,
      body: STAFF_LINES[index % STAFF_LINES.length],
      createdAt: afterCreation(ticket, 180)
    }
  ];
});

const NOTE_LINES = [
  'Checked the logs; nothing unusual around the reported time.',
  'Vendor case opened, reference pending. Do not share with the requester.',
  'Waiting on the hardware swap before we move this any further.'
];

/**
 * Internal Notes: one or two on the tickets that are actually being worked —
 * `InProgress`, `WaitingForRequester` and `Resolved` (specification.md §7).
 * Authored by the owner, or by an IT Staff member when the ticket has none.
 */
export const TICKET_INTERNAL_NOTES: ThreadSeed[] = TICKETS.filter((ticket) =>
  ['InProgress', 'WaitingForRequester', 'Resolved'].includes(ticket.status)
).flatMap((ticket, index) => {
  const sequence = index * 2 + 1;
  const author = ticket.ownerEmail ?? IT_STAFF[index % 3].email;

  const notes: ThreadSeed[] = [
    {
      id: threadId('n', sequence),
      ticketNumber: ticket.ticketNumber,
      authorEmail: author,
      body: NOTE_LINES[index % NOTE_LINES.length],
      createdAt: afterCreation(ticket, 200)
    }
  ];

  // Every other ticket gets a second note, so the panel is exercised with both
  // a single entry and a short thread.
  if (index % 2 === 1) {
    notes.push({
      id: threadId('n', sequence + 1),
      ticketNumber: ticket.ticketNumber,
      authorEmail: author,
      body: NOTE_LINES[(index + 1) % NOTE_LINES.length],
      createdAt: afterCreation(ticket, 320)
    });
  }

  return notes;
});

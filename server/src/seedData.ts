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

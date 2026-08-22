/**
 * Seed data for Lab 2 (FR-08, BR-11, BR-12).
 *
 * Kept separate from the seed runner so tests can assert the contents without
 * executing any database writes.
 */

export interface CategorySeed {
  name: string;
  description: string;
}

export interface RelatedSystemSeed {
  name: string;
}

export interface RequesterSeed {
  name: string;
  email: string;
  department: string;
  isActive: boolean;
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
 * Development Requesters. Only the active ones may appear in the selector
 * (BR-11); the inactive one exists so that rule can be tested.
 */
export const REQUESTERS: RequesterSeed[] = [
  { name: 'Jennifer Anderson', email: 'jennifer.anderson@kmutt.ac.th', department: 'Registrar', isActive: true },
  { name: 'Sarah Johnson', email: 'sarah.johnson@kmutt.ac.th', department: 'Finance', isActive: true },
  { name: 'David Lee', email: 'david.lee@kmutt.ac.th', department: 'Engineering', isActive: true },
  { name: 'Michael Brown', email: 'michael.brown@kmutt.ac.th', department: 'Library', isActive: true },
  { name: 'Alex Smith', email: 'alex.smith@kmutt.ac.th', department: 'Facilities', isActive: false },
];

export const ADMIN_USER = {
  email: 'admin@toktickit.xyz',
  name: 'TokTickIT Admin',
};

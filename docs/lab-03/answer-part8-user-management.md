# Answer Part 8 — Working Administrator User Management UI

Signed in as the System Administrator. Captured by [`scripts/capture-evidence.mjs`](scripts/capture-evidence.mjs); asserted by `e2e/lab-03/user-administration.spec.ts` (E2E-06), `UserManagement.test.tsx` (UI-21 … UI-24) and `users-admin.api.test.ts` (API-40 … API-48).

Nobody is ever deleted (BR-27): there is no delete control anywhere, not even a disabled one. Deactivation is how an account is retired, and it signs that user out at once.

| Requirement from the lab sheet | Section |
| --- | --- |
| User list with Name, Email, Role, Status and Edit | §1 |
| Search by name or email | §2 |
| Optional role filtering | §2 |
| Create user with one permitted role and an initial password | §3 |
| Duplicate-email and invalid-input validation | §3 |
| Edit name, email, role and activation state | §4 |
| Set a new initial password; required change at next login | §5 |
| Self-deactivation and last-active-Administrator prevention | §6 |
| Forbidden for non-Administrators | §7 |
| Responsive Zen Green presentation and safe failure | §7, §8 |

---

## 1. The directory

Name (the signed-in Administrator marked "(you)"), Email, Role badge, Active/Inactive badge, Edit. Sorted by name; no pagination at this scale.

![Users list](../../artifacts/lab-03/screenshots/user-management/p8-01-list.png)

## 2. Search and role filter

Search matches part of a name or an email; the role filter narrows to one role.

![Search "raman"](../../artifacts/lab-03/screenshots/user-management/p8-02-search.png)

![Role = Administrator](../../artifacts/lab-03/screenshots/user-management/p8-03-role-filter.png)

## 3. Create — validation, then a new IT Staff account

Every invalid field is refused under itself: missing name, malformed email, a password that breaks BR-08. Then a valid account: one role, active, an initial password with its rules panel satisfied.

![Invalid input](../../artifacts/lab-03/screenshots/user-management/p8-04-invalid-input.png)

![Valid input](../../artifacts/lab-03/screenshots/user-management/p8-05-create-filled.png)

The new user starts with a forced password change. An email already in use — in any letter case — is refused under the Email field (`409`):

![Created](../../artifacts/lab-03/screenshots/user-management/p8-06-created.png)

![Duplicate email under the field](../../artifacts/lab-03/screenshots/user-management/users-conflict.png)

## 4. Edit name, email, role and activation

The same panel edits the four fields an Administrator may change — nothing else. Changing a role signs the user out, so their next request runs with the new role.

![Edit User](../../artifacts/lab-03/screenshots/user-management/p8-07-edit.png)

Turning Active off asks first, and says what happens:

![Deactivate this user?](../../artifacts/lab-03/screenshots/user-management/p8-09-deactivate-confirm.png)

## 5. A new initial password, and the change it forces

Setting one stores its hash, sets `mustChangePassword`, and ends every session of that user. At the next login the user goes straight to Change Password.

![Password set](../../artifacts/lab-03/screenshots/user-management/p8-08-new-initial-password.png)

![Next login goes to Change Password](../../artifacts/lab-03/screenshots/user-management/p8-12-forced-change-next-login.png)

## 6. The two safety guards

On the Administrator's own account, Active is disabled — "You cannot deactivate your own account." As the only active Administrator, Role is disabled too — "At least one active administrator is required." The disabled controls are feedback; the server enforces both with `409` (BR-25, BR-26) — see the last line of the Part 7 transcript — and the panel shows that `409` inline if it is ever reached.

![Both guards](../../artifacts/lab-03/screenshots/user-management/p8-10-self-and-last-admin-guards.png)

## 7. Forbidden for other roles; safe failure

IT Staff and Requesters get the forbidden state and no user data; the API answers `403` before a user is loaded (AC-30). With the API unreachable, the list says so plainly and offers Retry.

![Safe failure](../../artifacts/lab-03/screenshots/user-management/p8-11-safe-failure.png)

| IT Staff on /admin/users (mobile) |
| --- |
| ![](../../artifacts/lab-03/screenshots/user-management/p8-13-forbidden-non-admin.png) |

## 8. Responsive

Desktop puts the list and the panel side by side (60 / 40); tablet stacks the panel above the list; mobile shows each user as a card.

![Desktop 1280](../../artifacts/lab-03/screenshots/user-management/users-desktop.png)

| Tablet 820 | Mobile 375 |
| --- | --- |
| ![](../../artifacts/lab-03/screenshots/user-management/users-tablet.png) | ![](../../artifacts/lab-03/screenshots/user-management/users-mobile.png) |

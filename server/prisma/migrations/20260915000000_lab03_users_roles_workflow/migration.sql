-- Lab 3: users, roles, sessions and the ticket workflow
-- (specification.md §7 "Migration strategy", BR-28, AD-02, AD-13).
--
-- Written by hand so existing Lab 2 rows are transformed in place rather than
-- recreated: `RequesterUser` is renamed to `User`, so every id that
-- `Ticket.requesterId` points at is untouched and no foreign key is re-pointed.

-- 1. Drop the legacy Lab 1 `User` table. Nothing references it; its only row
--    (admin@toktickit.xyz) is re-created by the seed as the Administrator.
DROP TABLE "User";

-- 2. Rename `RequesterUser` to `User` together with its indexes, so the names
--    match what Prisma would have generated for a fresh `User` model. The
--    `Ticket_requesterId_fkey` constraint follows the table automatically
--    (PostgreSQL references it by identity, not by name) and keeps its name.
ALTER TABLE "RequesterUser" RENAME TO "User";
ALTER TABLE "User" RENAME CONSTRAINT "RequesterUser_pkey" TO "User_pkey";
ALTER INDEX "RequesterUser_email_key" RENAME TO "User_email_key";
ALTER INDEX "RequesterUser_isActive_idx" RENAME TO "User_isActive_idx";

-- 3. Roles and credentials. Every migrated row becomes a Requester that must
--    change its password. `passwordHash` is left empty: the seed writes the real
--    bcrypt hash of the documented initial password, so no hash lives in SQL and
--    an unseeded user simply cannot log in.
CREATE TYPE "Role" AS ENUM ('Requester', 'ITStaff', 'Administrator');

ALTER TABLE "User"
    ADD COLUMN "role" "Role" NOT NULL DEFAULT 'Requester',
    ADD COLUMN "passwordHash" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "lastLoginAt" TIMESTAMP(3);

CREATE INDEX "User_role_isActive_idx" ON "User"("role", "isActive");

-- 4. Extend the status enum with the seven workflow values. Existing rows stay
--    `New`. The swap-and-rename pattern is used rather than ADD VALUE, because a
--    value added inside the migration's transaction could not be used until it
--    committed.
CREATE TYPE "TicketStatus_new" AS ENUM ('New', 'Open', 'InProgress', 'WaitingForRequester', 'Resolved', 'Closed', 'Reopened', 'Cancelled');
ALTER TABLE "Ticket" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Ticket" ALTER COLUMN "status" TYPE "TicketStatus_new" USING ("status"::text::"TicketStatus_new");
ALTER TYPE "TicketStatus" RENAME TO "TicketStatus_old";
ALTER TYPE "TicketStatus_new" RENAME TO "TicketStatus";
DROP TYPE "TicketStatus_old";
ALTER TABLE "Ticket" ALTER COLUMN "status" SET DEFAULT 'New';

-- 5. Ticket workflow columns. `itPriority` starts equal to the Requested
--    Priority on every existing row (BR-16), then becomes mandatory.
ALTER TABLE "Ticket"
    ADD COLUMN "itPriority" "TicketPriority",
    ADD COLUMN "ownerId" TEXT,
    ADD COLUMN "requesterResolvedAt" TIMESTAMP(3),
    ADD COLUMN "resolvedAt" TIMESTAMP(3),
    ADD COLUMN "closedAt" TIMESTAMP(3);

UPDATE "Ticket" SET "itPriority" = "priority";
ALTER TABLE "Ticket" ALTER COLUMN "itPriority" SET NOT NULL;

ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Ticket_ownerId_status_idx" ON "Ticket"("ownerId", "status");
CREATE INDEX "Ticket_itPriority_idx" ON "Ticket"("itPriority");
CREATE INDEX "Ticket_updatedAt_idx" ON "Ticket"("updatedAt");

-- 6. Sessions, Public Comments and Internal Notes.
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TicketComment" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TicketComment_ticketId_createdAt_idx" ON "TicketComment"("ticketId", "createdAt");

ALTER TABLE "TicketComment" ADD CONSTRAINT "TicketComment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketComment" ADD CONSTRAINT "TicketComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "TicketInternalNote" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketInternalNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TicketInternalNote_ticketId_createdAt_idx" ON "TicketInternalNote"("ticketId", "createdAt");

ALTER TABLE "TicketInternalNote" ADD CONSTRAINT "TicketInternalNote_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketInternalNote" ADD CONSTRAINT "TicketInternalNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

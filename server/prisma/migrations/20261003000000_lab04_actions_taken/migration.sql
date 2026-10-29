-- Issue #53 — Lab 4 Actions Taken, status history and optimistic concurrency
-- (specification.md §7, BR-29). Purely additive: it creates two tables and an
-- enum, adds one defaulted column and one index, and drops, rewrites or
-- re-keys nothing. Legacy tickets therefore need no backfill: they get
-- version = 0 from the column default, zero Actions and no stored history.
--
-- Generated with `prisma migrate diff` from the Lab 3 schema, then extended
-- by hand with the two CHECK constraints at the end, which Prisma cannot
-- express in schema.prisma (DB-03).
--
-- Rollback: prisma/rollback/20261003000000_lab04_actions_taken.down.sql.

-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('Open', 'Completed', 'Cancelled');

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "TicketAction" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "actionAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "attachmentNotes" TEXT,
    "performedById" TEXT NOT NULL,
    "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
    "followUpNote" TEXT,
    "followUpAssigneeId" TEXT,
    "followUpStatus" "FollowUpStatus",
    "followUpClosedAt" TIMESTAMP(3),
    "followUpClosedById" TEXT,
    "clientRequestId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketStatusChange" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "fromStatus" "TicketStatus" NOT NULL,
    "toStatus" "TicketStatus" NOT NULL,
    "changedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketStatusChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TicketAction_clientRequestId_key" ON "TicketAction"("clientRequestId");

-- CreateIndex
CREATE INDEX "TicketAction_ticketId_actionAt_idx" ON "TicketAction"("ticketId", "actionAt");

-- CreateIndex
CREATE INDEX "TicketAction_performedById_createdAt_idx" ON "TicketAction"("performedById", "createdAt");

-- CreateIndex
CREATE INDEX "TicketAction_followUpAssigneeId_followUpStatus_idx" ON "TicketAction"("followUpAssigneeId", "followUpStatus");

-- CreateIndex
CREATE INDEX "TicketAction_ticketId_followUpStatus_idx" ON "TicketAction"("ticketId", "followUpStatus");

-- CreateIndex
CREATE INDEX "TicketStatusChange_ticketId_createdAt_idx" ON "TicketStatusChange"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "Ticket_requesterId_status_idx" ON "Ticket"("requesterId", "status");

-- AddForeignKey
ALTER TABLE "TicketAction" ADD CONSTRAINT "TicketAction_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketAction" ADD CONSTRAINT "TicketAction_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketAction" ADD CONSTRAINT "TicketAction_followUpAssigneeId_fkey" FOREIGN KEY ("followUpAssigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketAction" ADD CONSTRAINT "TicketAction_followUpClosedById_fkey" FOREIGN KEY ("followUpClosedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketAction" ADD CONSTRAINT "TicketAction_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketStatusChange" ADD CONSTRAINT "TicketStatusChange_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketStatusChange" ADD CONSTRAINT "TicketStatusChange_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- DB-03 / BR-06: a follow-up is all or nothing. Required ⇔ it has a status,
-- a note and an assignee, so a half-filled follow-up cannot exist whatever
-- code writes the row.
ALTER TABLE "TicketAction" ADD CONSTRAINT "TicketAction_followUp_complete_check" CHECK (
    "followUpRequired" = ("followUpStatus" IS NOT NULL)
    AND "followUpRequired" = ("followUpNote" IS NOT NULL)
    AND "followUpRequired" = ("followUpAssigneeId" IS NOT NULL)
);

-- BR-07: a closed follow-up (Completed / Cancelled) records who closed it and
-- when; an open one, or none at all, records neither. COALESCE because a NULL
-- status would make the comparison NULL, and a CHECK passes on NULL.
ALTER TABLE "TicketAction" ADD CONSTRAINT "TicketAction_followUp_closed_check" CHECK (
    COALESCE("followUpStatus" IN ('Completed', 'Cancelled'), false) = ("followUpClosedAt" IS NOT NULL)
    AND ("followUpClosedAt" IS NULL) = ("followUpClosedById" IS NULL)
);

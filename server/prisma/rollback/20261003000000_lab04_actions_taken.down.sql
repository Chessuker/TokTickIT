-- Rollback of 20261003000000_lab04_actions_taken (specification.md §7,
-- "Migration, backfill and rollback"; MIG-02).
--
-- Returns the schema to Lab 3 exactly. Everything the forward migration added
-- is removed in reverse order. Nothing Lab 3 owns is touched, so User, Ticket,
-- Attachment, TicketComment and TicketInternalNote rows and their counts are
-- unchanged. Actions Taken and status history recorded since the migration
-- ARE lost — take a pg_dump first if they matter.
--
-- Run (from server/, with DATABASE_URL pointing at the target database):
--   npx prisma db execute --file prisma/rollback/20261003000000_lab04_actions_taken.down.sql --schema prisma/schema.prisma
-- then check out the Lab 3 code (its schema.prisma no longer knows these
-- tables) and run `npx prisma migrate status` to confirm Lab 3 is current.
--
-- One transaction, so a failure part-way leaves the Lab 4 schema intact.

BEGIN;

DROP TABLE "TicketStatusChange";
DROP TABLE "TicketAction";
DROP TYPE "FollowUpStatus";

DROP INDEX "Ticket_requesterId_status_idx";
ALTER TABLE "Ticket" DROP COLUMN "version";

-- Forget that the migration was applied, so `prisma migrate deploy` would
-- apply it again (the re-apply step of MIG-02).
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261003000000_lab04_actions_taken';

COMMIT;

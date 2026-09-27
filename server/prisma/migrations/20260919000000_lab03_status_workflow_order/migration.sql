-- Issue #39: order the TicketStatus enum by workflow position so the queue's
-- `sort=status` (api-spec.md §3.9) is a plain ORDER BY on the column. Postgres
-- orders an enum by its declaration order, and the Lab 3 migration declared
-- `Reopened` after `Closed`; the spec places it between `WaitingForRequester`
-- and `Resolved`. Same value set, so no row changes; same swap-and-rename
-- pattern as the previous migration.
CREATE TYPE "TicketStatus_new" AS ENUM ('New', 'Open', 'InProgress', 'WaitingForRequester', 'Reopened', 'Resolved', 'Closed', 'Cancelled');
ALTER TABLE "Ticket" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Ticket" ALTER COLUMN "status" TYPE "TicketStatus_new" USING ("status"::text::"TicketStatus_new");
ALTER TYPE "TicketStatus" RENAME TO "TicketStatus_old";
ALTER TYPE "TicketStatus_new" RENAME TO "TicketStatus";
DROP TYPE "TicketStatus_old";
ALTER TABLE "Ticket" ALTER COLUMN "status" SET DEFAULT 'New';

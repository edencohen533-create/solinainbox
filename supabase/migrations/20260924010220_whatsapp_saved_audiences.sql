-- AlterTable
ALTER TABLE "DistributionList" ADD COLUMN     "segment" JSONB;

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "audienceExcludedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "audienceSnapshot" JSONB,
ADD COLUMN     "excludedListIds" JSONB NOT NULL DEFAULT '[]';


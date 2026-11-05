-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'MANAGER', 'EDITOR', 'BUYER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ProductionStatus" AS ENUM ('BRIEF', 'IN_PROGRESS', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PerformanceStatus" AS ENUM ('NOT_LAUNCHED', 'TESTING', 'WINNER', 'LOSER', 'INCONCLUSIVE');

-- CreateEnum
CREATE TYPE "OfferGate" AS ENUM ('OK', 'BLOCKED');

-- CreateEnum
CREATE TYPE "AssetFormat" AS ENUM ('VERTICAL', 'PORTRAIT', 'SQUARE', 'LANDSCAPE');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('VIDEO', 'IMAGE');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "VersionStatus" AS ENUM ('UPLOADING', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "QaSeverity" AS ENUM ('BLOCKING', 'WARNING');

-- CreateEnum
CREATE TYPE "QaResult" AS ENUM ('PASS', 'FAIL');

-- CreateEnum
CREATE TYPE "CommentSeverity" AS ENUM ('MUST', 'SHOULD', 'NIT');

-- CreateEnum
CREATE TYPE "DeploymentSource" AS ENUM ('TOKEN', 'MANUAL');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'EDITOR',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "geo" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "channels" TEXT[] DEFAULT ARRAY['META']::TEXT[],
    "targetCpaCents" INTEGER NOT NULL,
    "payoutCents" INTEGER NOT NULL,
    "conversionEvent" TEXT NOT NULL DEFAULT 'purchase',
    "gate" "OfferGate" NOT NULL DEFAULT 'OK',
    "gateNote" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TagDimension" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TagDimension_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TagValue" (
    "id" TEXT NOT NULL,
    "dimensionId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TagValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counter" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Concept" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "hypothesis" TEXT NOT NULL,
    "geo" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "references" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "color" TEXT NOT NULL,
    "assetCounter" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Concept_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConceptTag" (
    "conceptId" TEXT NOT NULL,
    "dimensionId" TEXT NOT NULL,
    "valueId" TEXT NOT NULL,

    CONSTRAINT "ConceptTag_pkey" PRIMARY KEY ("conceptId","dimensionId")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'META',
    "format" "AssetFormat" NOT NULL,
    "mediaType" "MediaType" NOT NULL,
    "editorId" TEXT,
    "deadline" TIMESTAMP(3),
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "brief" TEXT NOT NULL DEFAULT '',
    "primaryText" TEXT NOT NULL DEFAULT '',
    "headline" TEXT NOT NULL DEFAULT '',
    "cta" TEXT NOT NULL DEFAULT '',
    "overrideDimensionId" TEXT,
    "overrideValueId" TEXT,
    "iteratedFromId" TEXT,
    "productionStatus" "ProductionStatus" NOT NULL DEFAULT 'BRIEF',
    "performanceStatus" "PerformanceStatus" NOT NULL DEFAULT 'NOT_LAUNCHED',
    "testingSince" TIMESTAMP(3),
    "versionCounter" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "approvedVersionId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "markedLaunchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Version" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "status" "VersionStatus" NOT NULL DEFAULT 'UPLOADING',
    "originalKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "uploadId" TEXT,
    "proxyKey" TEXT,
    "thumbKey" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "fps" DOUBLE PRECISION,
    "videoCodec" TEXT,
    "audioCodec" TEXT,
    "container" TEXT,
    "hasAudio" BOOLEAN,
    "processingError" TEXT,
    "processedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QaCheck" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "severity" "QaSeverity" NOT NULL,
    "result" "QaResult" NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "QaCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "timeMs" INTEGER,
    "x" DOUBLE PRECISION,
    "y" DOUBLE PRECISION,
    "body" TEXT NOT NULL,
    "severity" "CommentSeverity" NOT NULL DEFAULT 'SHOULD',
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentReply" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentReply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusEvent" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "userId" TEXT,
    "from" "ProductionStatus",
    "to" "ProductionStatus" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaConnection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenEncrypted" TEXT NOT NULL,
    "tokenLast4" TEXT NOT NULL,
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdAccount" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncAt" TIMESTAMP(3),

    CONSTRAINT "AdAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaAd" (
    "id" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "adsetId" TEXT,
    "campaignId" TEXT,
    "ignored" BOOLEAN NOT NULL DEFAULT false,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaAd_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deployment" (
    "id" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "source" "DeploymentSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Deployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceDaily" (
    "id" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "spendCents" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "videoPlays3s" INTEGER NOT NULL DEFAULT 0,
    "thruplays" INTEGER NOT NULL DEFAULT 0,
    "p25" INTEGER NOT NULL DEFAULT 0,
    "p50" INTEGER NOT NULL DEFAULT 0,
    "p75" INTEGER NOT NULL DEFAULT 0,
    "p100" INTEGER NOT NULL DEFAULT 0,
    "actions" JSONB NOT NULL DEFAULT '{}',
    "actionValues" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "stats" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WinnerRule" (
    "id" TEXT NOT NULL,
    "offerId" TEXT,
    "winnerMaxCpaPct" INTEGER NOT NULL DEFAULT 80,
    "winnerMinConversions" INTEGER NOT NULL DEFAULT 10,
    "winnerMinSpendMult" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "loserMinSpendMult" DOUBLE PRECISION NOT NULL DEFAULT 3,
    "loserMinCpaPct" INTEGER NOT NULL DEFAULT 130,
    "loserZeroConvSpendMult" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "inconclusiveDays" INTEGER NOT NULL DEFAULT 14,
    "minHookRatePct" DOUBLE PRECISION,

    CONSTRAINT "WinnerRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WinnerEvaluation" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "previous" "PerformanceStatus" NOT NULL,
    "result" "PerformanceStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WinnerEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "href" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Offer_number_key" ON "Offer"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Offer_code_key" ON "Offer"("code");

-- CreateIndex
CREATE UNIQUE INDEX "TagDimension_key_key" ON "TagDimension"("key");

-- CreateIndex
CREATE UNIQUE INDEX "TagValue_dimensionId_value_key" ON "TagValue"("dimensionId", "value");

-- CreateIndex
CREATE UNIQUE INDEX "Concept_number_key" ON "Concept"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Concept_code_key" ON "Concept"("code");

-- CreateIndex
CREATE INDEX "Concept_offerId_idx" ON "Concept"("offerId");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_code_key" ON "Asset"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_approvedVersionId_key" ON "Asset"("approvedVersionId");

-- CreateIndex
CREATE INDEX "Asset_editorId_productionStatus_idx" ON "Asset"("editorId", "productionStatus");

-- CreateIndex
CREATE INDEX "Asset_productionStatus_idx" ON "Asset"("productionStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_conceptId_number_key" ON "Asset"("conceptId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Version_code_key" ON "Version"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Version_assetId_number_key" ON "Version"("assetId", "number");

-- CreateIndex
CREATE INDEX "QaCheck_versionId_idx" ON "QaCheck"("versionId");

-- CreateIndex
CREATE INDEX "Comment_versionId_idx" ON "Comment"("versionId");

-- CreateIndex
CREATE INDEX "StatusEvent_assetId_createdAt_idx" ON "StatusEvent"("assetId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdAccount_accountId_key" ON "AdAccount"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaAd_adId_key" ON "MetaAd"("adId");

-- CreateIndex
CREATE UNIQUE INDEX "Deployment_adId_key" ON "Deployment"("adId");

-- CreateIndex
CREATE INDEX "Deployment_assetId_idx" ON "Deployment"("assetId");

-- CreateIndex
CREATE INDEX "PerformanceDaily_date_idx" ON "PerformanceDaily"("date");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceDaily_adId_date_key" ON "PerformanceDaily"("adId", "date");

-- CreateIndex
CREATE INDEX "SyncRun_kind_startedAt_idx" ON "SyncRun"("kind", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WinnerRule_offerId_key" ON "WinnerRule"("offerId");

-- CreateIndex
CREATE INDEX "WinnerEvaluation_assetId_createdAt_idx" ON "WinnerEvaluation"("assetId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- AddForeignKey
ALTER TABLE "TagValue" ADD CONSTRAINT "TagValue_dimensionId_fkey" FOREIGN KEY ("dimensionId") REFERENCES "TagDimension"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Concept" ADD CONSTRAINT "Concept_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Concept" ADD CONSTRAINT "Concept_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptTag" ADD CONSTRAINT "ConceptTag_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptTag" ADD CONSTRAINT "ConceptTag_dimensionId_fkey" FOREIGN KEY ("dimensionId") REFERENCES "TagDimension"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptTag" ADD CONSTRAINT "ConceptTag_valueId_fkey" FOREIGN KEY ("valueId") REFERENCES "TagValue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_overrideDimensionId_fkey" FOREIGN KEY ("overrideDimensionId") REFERENCES "TagDimension"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_overrideValueId_fkey" FOREIGN KEY ("overrideValueId") REFERENCES "TagValue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_iteratedFromId_fkey" FOREIGN KEY ("iteratedFromId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_approvedVersionId_fkey" FOREIGN KEY ("approvedVersionId") REFERENCES "Version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Version" ADD CONSTRAINT "Version_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Version" ADD CONSTRAINT "Version_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QaCheck" ADD CONSTRAINT "QaCheck_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "Version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "Version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentReply" ADD CONSTRAINT "CommentReply_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentReply" ADD CONSTRAINT "CommentReply_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusEvent" ADD CONSTRAINT "StatusEvent_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusEvent" ADD CONSTRAINT "StatusEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdAccount" ADD CONSTRAINT "AdAccount_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "MetaConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_adId_fkey" FOREIGN KEY ("adId") REFERENCES "MetaAd"("adId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "Version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WinnerRule" ADD CONSTRAINT "WinnerRule_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WinnerEvaluation" ADD CONSTRAINT "WinnerEvaluation_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

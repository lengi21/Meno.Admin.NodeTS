ALTER TABLE "RestaurantPosSettings"
  ADD COLUMN IF NOT EXISTS "defaultLanguage" "LanguageCode" NOT NULL DEFAULT 'ka',
  ADD COLUMN IF NOT EXISTS "paymentBanks" JSONB;

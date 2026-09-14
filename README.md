# Solina Inbox

תיבת וואטסאפ פנימית לצוות המכירות והתמיכה של סולינה — לוח בקרה משותף לניהול שיחות וואטסאפ, עם ספק וואטסאפ מדומה (mock) שמוכן להתחלף בהמשך בחיבור אמיתי ל-Meta WhatsApp Cloud API / Telnyx.

## טכנולוגיות

Next.js 16 (App Router) · TypeScript · PostgreSQL (Supabase) + Prisma ORM · Tailwind CSS + shadcn/ui · Supabase Realtime · NextAuth v5 (Credentials) · Vitest.

## הרצה מקומית

### 1. יצירת פרויקט Supabase

1. היכנס ל-[supabase.com](https://supabase.com) → New Project.
2. לאחר היצירה, עבור ל-**Project Settings → API** והעתק את `Project URL`, `anon public key` ו-`service_role key`.
3. עבור ל-**Project Settings → Database → Connection string**, ובחר בטאב **Transaction pooler**. העתק את מחרוזת החיבור המלאה (היא מכילה את שם ה-host הנכון עם ה-region של הפרויקט שלך).

### 2. התקנה

```bash
npm install
cp .env.example .env
```

מלא ב-`.env`:

- `DATABASE_URL` — מחרוזת ה-Transaction pooler שהעתקת (port 6543), עם `?pgbouncer=true` בסוף.
- `DIRECT_URL` — אותה מחרוזת בדיוק אך עם port 5432 (או ה-Session pooler / Direct connection דרך אותו host), משמש רק ל-migrations.
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — מ-Settings → API.
- `NEXTAUTH_SECRET` — הרץ `openssl rand -base64 32`.
- `CRON_SECRET` — מחרוזת אקראית כלשהי.

> אם אתה נתקל בבעיית timeout/SSL בחיבור למסד הנתונים (קורה ברשתות מסוימות), נסה להוסיף `&sslmode=disable` לסוף `DATABASE_URL`/`DIRECT_URL` — אך זאת רק לצורך פיתוח מקומי, **לא** בסביבת production.

### 3. סכמה ונתוני דמו

```bash
npx prisma db push      # יוצר את כל הטבלאות ב-Supabase
npm run prisma:seed     # מאכלס 7 משתמשים, 150 אנשי קשר, 80 שיחות, תבניות ועוד
```

סקריפט ה-seed הוא אידמפוטנטי — אפשר להריץ אותו שוב בבטחה אם הוא נקטע (למשל בגלל רשת לא יציבה); הוא ימשיך מהנקודה שבה עצר.

### 4. הרצה

```bash
npm run dev
```

גלוש ל-[http://localhost:3000](http://localhost:3000) — תועבר אוטומטית ל-`/login`.

**משתמשי דמו** (כל המשתמשים חולקים את אותה סיסמה — **לפיתוח בלבד**, אין להשתמש בזה ב-production):

| תפקיד | אימייל | סיסמה |
|---|---|---|
| מנהל מערכת | admin@solina.test | Password123! |
| מנהל צוות | manager@solina.test | Password123! |
| נציג | agent1@solina.test ... agent5@solina.test | Password123! |

### 5. בדיקת שליחת הודעות בזמן אמת

היכנס כ-Admin או Manager → **הגדרות → סימולטור וואטסאפ (Demo)** → בחר איש קשר → שלח הודעה נכנסת מדומה. פתח את תיבת ההודעות בכרטיסייה נוספת (או התחבר כנציג אחר) — ההודעה תופיע שם מיידית דרך Supabase Realtime, ללא רענון.

## בדיקות

```bash
npm test
```

## Docker (אופציונלי)

ברירת המחדל היא Supabase מנוהל, אבל אם ברצונך Postgres מקומי:

```bash
docker compose -f docker/docker-compose.yml --profile local-db up postgres
# עדכן DATABASE_URL/DIRECT_URL ב-.env ל-postgresql://solina:solina@localhost:5432/solinainbox
```

להרצת כל האפליקציה בתוך קונטיינר:

```bash
docker compose -f docker/docker-compose.yml --profile full up
```

## פריסה ל-Vercel

הפרויקט כולל `vercel.json` עם Cron Job (כל 2 דקות) לעיבוד אוטומציות מתעכבות (`NO_REPLY_TIMEOUT`) — דורש תוכנית Vercel Pro ומעלה. יש להגדיר את כל משתני הסביבה מ-`.env.example` כ-Environment Variables בפרויקט ב-Vercel.

## איפה מתחברים ספק וואטסאפ אמיתי

היום האפליקציה עובדת מול `MockWhatsAppProvider` (`src/server/providers/mock-whatsapp-provider.ts`), שמדמה הודעות נכנסות/יוצאות וסטטוסי מסירה. כדי לחבר Meta WhatsApp Cloud API או Telnyx בעתיד:

1. מימוש מחלקה חדשה שמממשת את הממשק `WhatsAppProvider` (`src/server/providers/whatsapp-provider.ts`) — לדוגמה `meta-whatsapp-provider.ts`.
2. רישום הספק החדש ב-`src/server/providers/provider-registry.ts`.
3. מימוש ה-endpoint הקיים `src/app/api/webhooks/whatsapp/route.ts` כך שיאמת את ה-webhook (`verifyWebhook`) ויעביר את ההודעה הנכנסת ל-`receiveWebhook`, אשר קורא לאותה פונקציה `messageService.createInboundMessage()` שגם ה-mock משתמש בה — כך שקוד ה-UI, ה-realtime וה-DB לא צריכים להשתנות כלל.
4. הפעלה: יצירת רשומת `ProviderCredential` עם `provider: "meta_whatsapp_cloud_api"` ו-`isActive: true`, או עדכון `WHATSAPP_PROVIDER` ב-env.

## פישוטי היקף מכוונים

- קיצורי מקלדת: מענה/חיפוש/סגירה בלבד.
- ייבוא CSV: מיפוי עמודות קבוע, ללא זיהוי חכם.
- דיוק "אין מענה תוך X דקות" תלוי בתדירות ה-cron (כל 1-5 דקות), לא מדויק לשנייה.
- אין Redis/Upstash — תור המשימות מבוסס טבלת `AutomationRun` + polling.
- @mentions בהערות פנימיות — הדגשה חזותית בלבד, ללא נוטיפיקציה.
- מדיה בספק המדומה — קישורים לדוגמה קבועים, לא אחסון אמיתי.

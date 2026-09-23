import { PrismaClient, Role, ConsentStatus, ConversationStatus, MessageStatus, AutomationTrigger, AutomationActionType, AutomationRunStatus } from "@prisma/client";
import { faker } from "@faker-js/faker";
import bcrypt from "bcryptjs";
import { buildFullName } from "./seed-data/hebrew-names";
import { SOLINA_PRODUCTS, generateOrderNumber } from "./seed-data/solina-products";
import { CONVERSATION_TOPICS, buildConversationScript, CANNED_REPLIES, TEMPLATE_SEEDS } from "./seed-data/hebrew-messages";
import { normalizePhone } from "../src/lib/phone";

const prisma = new PrismaClient();

// Dev-only shared password for all seeded accounts. Never used outside local/demo environments.
const DEV_PASSWORD = "Password123!";

const TAG_NAMES = [
  "VIP",
  "לקוח חוזר",
  "תלונה",
  "עגלה נטושה",
  "ליד חם",
  "ממתין לתשלום",
  "משלוח מעוכב",
  "שדרוג",
  "פרימיום",
  "לקוח עסקי",
  "פנייה טכנית",
  "החזר כספי",
  "אחריות",
  "מבצע",
  "חידוש",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * This sandbox's network path to the Supabase pooler occasionally drops a
 * long-lived connection mid-run; retry transient connection errors a few
 * times with backoff rather than losing the whole seed run.
 */
async function withRetry<T>(fn: () => Promise<T>, label: string, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const delayMs = attempt * 3000;
      console.warn(`[seed] ${label} failed (attempt ${attempt}/${attempts}), retrying in ${delayMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

function weightedStatus(): ConversationStatus {
  const roll = Math.random();
  if (roll < 0.4) return ConversationStatus.OPEN;
  if (roll < 0.6) return ConversationStatus.PENDING;
  if (roll < 0.95) return ConversationStatus.RESOLVED;
  return ConversationStatus.CLOSED;
}

async function seedUsers() {
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 12);

  const team = await prisma.team.upsert({
    where: { id: "seed-team-support" },
    update: {},
    create: { id: "seed-team-support", name: "צוות תמיכה ומכירות" },
  });

  const userSeeds: Array<{ email: string; name: string; role: Role }> = [
    { email: "admin@solina.test", name: "אדמין ראשי", role: Role.ADMIN },
    { email: "manager@solina.test", name: "מנהלת צוות", role: Role.MANAGER },
    { email: "agent1@solina.test", name: "נועה כהן", role: Role.AGENT },
    { email: "agent2@solina.test", name: "יובל לוי", role: Role.AGENT },
    { email: "agent3@solina.test", name: "מאיה ברק", role: Role.AGENT },
    { email: "agent4@solina.test", name: "עידן שפירא", role: Role.AGENT },
    { email: "agent5@solina.test", name: "תמר אזולאי", role: Role.AGENT },
  ];

  const users = [];
  for (const seed of userSeeds) {
    const user = await prisma.user.upsert({
      where: { email: seed.email },
      update: { name: seed.name, role: seed.role, teamId: team.id, isActive: true },
      create: {
        email: seed.email,
        name: seed.name,
        role: seed.role,
        teamId: team.id,
        passwordHash,
      },
    });
    users.push(user);
  }

  return users;
}

async function seedTags() {
  const tags = [];
  for (const name of TAG_NAMES) {
    const tag = await prisma.tag.upsert({
      where: { name },
      update: {},
      create: { name, color: faker.color.rgb() },
    });
    tags.push(tag);
  }
  return tags;
}

async function seedTemplates() {
  for (const template of TEMPLATE_SEEDS) {
    await prisma.template.upsert({
      where: { name_language: { name: template.name, language: "he" } },
      update: {
        category: template.category,
        body: template.body,
        variables: template.variables,
      },
      create: {
        name: template.name,
        language: "he",
        category: template.category,
        body: template.body,
        variables: template.variables,
      },
    });
  }
}

async function seedCannedReplies(adminUserId: string) {
  for (const reply of CANNED_REPLIES) {
    await prisma.cannedReply.upsert({
      where: { shortcut: reply.shortcut },
      update: { title: reply.title, body: reply.body },
      create: {
        title: reply.title,
        body: reply.body,
        shortcut: reply.shortcut,
        createdByUserId: adminUserId,
      },
    });
  }
}

async function seedContacts(tags: { id: string }[]) {
  const usedPhones = new Set<string>();
  const contacts = [];

  for (let i = 0; i < 150; i++) {
    const { name } = buildFullName(i);

    let phone: string | null = null;
    for (let attempt = 0; attempt < 5 && !phone; attempt++) {
      const candidate = `05${faker.number.int({ min: 0, max: 9 })}${faker.string.numeric(7)}`;
      const normalized = normalizePhone(candidate);
      if (normalized && !usedPhones.has(normalized)) {
        phone = normalized;
      }
    }
    if (!phone) continue;
    usedPhones.add(phone);

    const consentRoll = Math.random();
    const consentStatus =
      consentRoll < 0.7 ? ConsentStatus.OPTED_IN : consentRoll < 0.9 ? ConsentStatus.UNKNOWN : ConsentStatus.OPTED_OUT;

    const contactTags = faker.helpers.arrayElements(tags, { min: 0, max: 3 });

    const contact = await withRetry(
      () =>
        prisma.contact.upsert({
          where: { phone },
          update: {},
          create: {
            name,
            phone,
            email: Math.random() < 0.6 ? faker.internet.email({ firstName: "customer", lastName: `${i}` }).toLowerCase() : null,
            source: pick(["whatsapp", "manual", "import"]),
            consentStatus,
            tags: {
              create: contactTags.map((tag) => ({ tag: { connect: { id: tag.id } } })),
            },
            customFields:
              Math.random() < 0.5
                ? {
                    create: [
                      { key: "עיר", value: pick(["תל אביב", "חיפה", "ירושלים", "באר שבע", "ראשון לציון", "נתניה"]) },
                    ],
                  }
                : undefined,
          },
        }),
      `seedContacts[${i}]`
    );

    if ((i + 1) % 25 === 0) {
      console.log(`[seed] contacts: ${i + 1}/150`);
    }
    contacts.push(contact);
  }

  return contacts;
}

async function seedConversations(
  contacts: { id: string; name: string }[],
  agents: { id: string }[],
  admin: { id: string },
  tags: { id: string }[]
) {
  for (let i = 0; i < 80; i++) {
    const contact = pick(contacts);
    const topic = CONVERSATION_TOPICS[i % CONVERSATION_TOPICS.length];
    const product = pick(SOLINA_PRODUCTS);
    const script = buildConversationScript(topic, {
      product: product.name,
      orderNumber: generateOrderNumber(i),
      customerName: contact.name.split(" ")[0],
    });

    // Occasionally repeat the script to vary conversation length.
    const repeats = Math.random() < 0.3 ? 2 : 1;
    const fullScript = Array.from({ length: repeats }, () => script).flat();

    const status = weightedStatus();
    const isAssigned = Math.random() < 0.6;
    const assignedAgent = isAssigned ? pick(agents) : null;

    const daysAgo = faker.number.int({ min: 0, max: 30 });
    const baseTime = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

    let cursor = baseTime.getTime();
    const messageRows = fullScript.map((message) => {
      cursor += faker.number.int({ min: 2, max: 40 }) * 60 * 1000;
      const createdAt = new Date(cursor);
      const isOutbound = message.direction === "OUTBOUND";
      const deliveryRoll = Math.random();
      const messageStatus: MessageStatus = !isOutbound
        ? MessageStatus.SENT
        : deliveryRoll < 0.1
          ? MessageStatus.SENT
          : deliveryRoll < 0.3
            ? MessageStatus.DELIVERED
            : MessageStatus.READ;

      return {
        direction: message.direction,
        type: "TEXT" as const,
        body: message.body,
        status: messageStatus,
        sentByUserId: isOutbound ? (assignedAgent?.id ?? admin.id) : null,
        createdAt,
        deliveredAt: isOutbound && messageStatus !== MessageStatus.SENT ? new Date(cursor + 60_000) : null,
        readAt: isOutbound && messageStatus === MessageStatus.READ ? new Date(cursor + 5 * 60_000) : null,
      };
    });

    const lastMessage = messageRows[messageRows.length - 1];
    const lastInbound = [...messageRows].reverse().find((m) => m.direction === "INBOUND");
    const trailingInbound = [...messageRows].reverse();
    let unreadCount = 0;
    for (const m of trailingInbound) {
      if (m.direction !== "INBOUND") break;
      unreadCount++;
    }

    const conversation = await withRetry(
      () =>
        prisma.conversation.create({
          data: {
            contactId: contact.id,
            assignedAgentId: assignedAgent?.id ?? null,
            status,
            source: "MOCK",
            lastMessageAt: lastMessage.createdAt,
            lastInboundAt: lastInbound?.createdAt ?? null,
            unreadCount: status === ConversationStatus.OPEN ? unreadCount : 0,
            createdAt: baseTime,
            messages: { create: messageRows },
            tags:
              Math.random() < 0.4
                ? {
                    create: faker.helpers
                      .arrayElements(tags, { min: 1, max: 2 })
                      .map((tag) => ({ tag: { connect: { id: tag.id } } })),
                  }
                : undefined,
          },
        }),
      `seedConversations[${i}]`
    );

    if ((i + 1) % 10 === 0) {
      console.log(`[seed] conversations: ${i + 1}/80`);
    }

    await withRetry(
      () =>
        prisma.contact.update({
          where: { id: contact.id },
          data: { lastActivityAt: lastMessage.createdAt },
        }),
      `seedConversations[${i}].contactUpdate`
    );

    if (Math.random() < 0.3) {
      const author = assignedAgent ?? admin;
      const mentioned = Math.random() < 0.3 ? faker.helpers.arrayElements(agents.map((a) => a.id), { min: 1, max: 1 }) : [];
      await withRetry(
        () =>
          prisma.note.create({
            data: {
              conversationId: conversation.id,
              authorId: author.id,
              body: pick([
                "לקוח VIP, לטפל בעדיפות גבוהה.",
                "צריך לבדוק מול המחסן לגבי זמינות המוצר.",
                "הלקוח ציין שהוא לקוח חוזר - כדאי להציע הטבה.",
                "לוודא מעקב משלוח עד סוף היום.",
              ]),
              mentionedUserIds: mentioned,
            },
          }),
        `seedConversations[${i}].note`
      );
    }

    await withRetry(
      () =>
        prisma.auditLog.create({
          data: {
            actorUserId: assignedAgent?.id ?? admin.id,
            action: "conversation.created",
            entityType: "Conversation",
            entityId: conversation.id,
            conversationId: conversation.id,
            metadata: { source: "seed", topic },
            createdAt: baseTime,
          },
        }),
      `seedConversations[${i}].auditLog`
    );

    if (assignedAgent) {
      await withRetry(
        () =>
          prisma.auditLog.create({
            data: {
              actorUserId: admin.id,
              action: "conversation.assigned",
              entityType: "Conversation",
              entityId: conversation.id,
              conversationId: conversation.id,
              metadata: { assignedAgentId: assignedAgent.id },
              createdAt: lastMessage.createdAt,
            },
          }),
        `seedConversations[${i}].auditLogAssigned`
      );
    }
  }
}

async function seedAutomations(agents: { id: string; email: string }[], manager: { id: string }) {
  const rules = [
    {
      name: "תיוג VIP -> שיוך למנהלת",
      trigger: AutomationTrigger.TAG_ADDED,
      triggerConfig: { tagName: "VIP" },
      actionType: AutomationActionType.ASSIGN_AGENT,
      actionConfig: { agentId: manager.id },
    },
    {
      name: "שיחה חדשה -> שיוך אוטומטי",
      trigger: AutomationTrigger.NEW_CONVERSATION,
      triggerConfig: {},
      actionType: AutomationActionType.ASSIGN_AGENT,
      actionConfig: { agentId: agents[0]?.id },
    },
    {
      name: "אין מענה 30 דקות -> תזכורת פנימית",
      trigger: AutomationTrigger.NO_REPLY_TIMEOUT,
      triggerConfig: { minutes: 30 },
      actionType: AutomationActionType.ADD_INTERNAL_NOTE,
      actionConfig: { body: "עברו 30 דקות ללא מענה - נא לטפל בדחיפות." },
    },
    {
      name: "פנייה חדשה -> תיוג ליד חם",
      trigger: AutomationTrigger.NEW_INBOUND_MESSAGE,
      triggerConfig: {},
      actionType: AutomationActionType.ADD_TAG,
      actionConfig: { tagName: "ליד חם" },
    },
  ];

  const createdRules = [];
  for (const rule of rules) {
    const existing = await prisma.automationRule.findFirst({ where: { name: rule.name } });
    const created =
      existing ??
      (await prisma.automationRule.create({
        data: {
          name: rule.name,
          trigger: rule.trigger,
          triggerConfig: rule.triggerConfig,
          actionType: rule.actionType,
          actionConfig: rule.actionConfig,
        },
      }));
    createdRules.push(created);
  }

  for (const rule of createdRules.slice(0, 2)) {
    await prisma.automationRun.create({
      data: {
        ruleId: rule.id,
        status: AutomationRunStatus.COMPLETED,
        scheduledFor: new Date(),
        triggerPayload: { seed: true },
        result: { success: true },
        completedAt: new Date(),
      },
    });
  }
}

async function main() {
  faker.seed(42);

  const users = await seedUsers();
  const admin = users.find((u) => u.role === Role.ADMIN)!;
  const manager = users.find((u) => u.role === Role.MANAGER)!;
  const agents = users.filter((u) => u.role === Role.AGENT);

  const tags = await seedTags();
  await seedTemplates();
  await seedCannedReplies(admin.id);
  await seedAutomations(agents, manager);

  // seedContacts is upsert-based (keyed by phone), so it's safe to re-run
  // and resumes correctly after a partial/interrupted previous run.
  const contacts = await seedContacts(tags);
  console.log(`[seed] ${contacts.length} contacts ready.`);

  const existingConversationCount = await prisma.conversation.count();
  if (existingConversationCount > 0) {
    console.log(`[seed] ${existingConversationCount} conversations already exist — skipping conversation generation.`);
  } else {
    await seedConversations(contacts, agents, admin, tags);
    console.log(`[seed] Seeded 80 conversations.`);
  }

  console.log(`Done. Dev login password for all seeded users: ${DEV_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

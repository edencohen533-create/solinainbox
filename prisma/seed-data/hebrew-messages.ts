export type ConversationTopic =
  | "product_question"
  | "order_status"
  | "abandoned_checkout"
  | "delivery"
  | "renewal";

export const CONVERSATION_TOPICS: ConversationTopic[] = [
  "product_question",
  "order_status",
  "abandoned_checkout",
  "delivery",
  "renewal",
];

export interface MessageContext {
  product: string;
  orderNumber: string;
  customerName: string;
}

function fill(template: string, ctx: MessageContext): string {
  return template
    .replaceAll("{{product}}", ctx.product)
    .replaceAll("{{order}}", ctx.orderNumber)
    .replaceAll("{{name}}", ctx.customerName);
}

// Each topic is a script of alternating INBOUND/OUTBOUND messages, in order.
const SCRIPTS: Record<ConversationTopic, Array<{ direction: "INBOUND" | "OUTBOUND"; body: string }>> = {
  product_question: [
    { direction: "INBOUND", body: "שלום, רציתי לשאול לגבי ה{{product}} - מה מידת המוצק שלו?" },
    { direction: "OUTBOUND", body: "שלום {{name}}, תודה שפנית! ה{{product}} מגיע בשתי דרגות מוצקות - בינוני וקשיח. איזו דרגה מתאימה לך?" },
    { direction: "INBOUND", body: "אני חושב שבינוני יתאים לי יותר. יש אחריות על המוצר?" },
    { direction: "OUTBOUND", body: "בהחלט, יש אחריות יצרן ל-10 שנים על כל מוצרי סולינה. אשמח לעזור להשלים הזמנה אם תרצה." },
    { direction: "INBOUND", body: "מעולה, אשמח לשמוע גם על אפשרויות המשלוח." },
  ],
  order_status: [
    { direction: "INBOUND", body: "היי, רציתי לבדוק מה קורה עם הזמנה מספר {{order}}?" },
    { direction: "OUTBOUND", body: "שלום {{name}}, בודקת עבורך כרגע... ההזמנה {{order}} נמצאת בשלב אריזה ותצא למשלוח היום." },
    { direction: "INBOUND", body: "תודה רבה! מתי בערך אפשר לצפות שזה יגיע?" },
    { direction: "OUTBOUND", body: "המשלוח אמור להגיע תוך 2-3 ימי עסקים. תקבל הודעת SMS עם מעקב." },
  ],
  abandoned_checkout: [
    { direction: "INBOUND", body: "שלום, ניסיתי להזמין {{product}} באתר אבל לא הצלחתי להשלים את התשלום." },
    { direction: "OUTBOUND", body: "שלום {{name}}, מצטערים על אי הנוחות! אשמח לעזור לך להשלים את ההזמנה כאן בוואטסאפ. רוצה שאשלח קישור לתשלום מאובטח?" },
    { direction: "INBOUND", body: "כן בבקשה, זה יעזור מאוד." },
    { direction: "OUTBOUND", body: "שלחתי אליך קישור לתשלום עבור ה{{product}}. יש גם הנחה של 10% שתקפה ל-24 שעות הקרובות." },
  ],
  delivery: [
    { direction: "INBOUND", body: "אני מחכה למשלוח של הזמנה {{order}} כבר שלושה ימים, מה קורה?" },
    { direction: "OUTBOUND", body: "מתנצלים על העיכוב {{name}}. בודקת מול חברת השילוח ומעדכנת אותך תוך שעה." },
    { direction: "INBOUND", body: "תודה, אשמח לעדכון בהקדם." },
    { direction: "OUTBOUND", body: "עדכון: המשלוח יצא הבוקר ואמור להגיע היום עד השעה 18:00." },
    { direction: "INBOUND", body: "מעולה, תודה על הטיפול המהיר!" },
  ],
  renewal: [
    { direction: "OUTBOUND", body: "שלום {{name}}, ה{{product}} שרכשת לפני כשלוש שנים מתקרב לסוף חיי המדף המומלצים. נשמח להציע לך שדרוג במחיר מועדף." },
    { direction: "INBOUND", body: "תודה על התזכורת, אשמח לשמוע פרטים נוספים." },
    { direction: "OUTBOUND", body: "אפשר להציע לך מזרן חדש עם 15% הנחה ומשלוח חינם, כולל פינוי הישן." },
    { direction: "INBOUND", body: "נשמע טוב, אני צריך לחשוב על זה ואחזור אליכם." },
  ],
};

export function buildConversationScript(
  topic: ConversationTopic,
  ctx: MessageContext
): Array<{ direction: "INBOUND" | "OUTBOUND"; body: string }> {
  return SCRIPTS[topic].map((message) => ({
    direction: message.direction,
    body: fill(message.body, ctx),
  }));
}

export const CANNED_REPLIES: Array<{ title: string; body: string; shortcut: string }> = [
  { title: "ברכת פתיחה", body: "שלום! תודה שפנית לסולינה, איך אפשר לעזור? 😊", shortcut: "/שלום" },
  { title: "בקשת המתנה", body: "רק רגע, בודק/ת עבורך את הפרטים ומיד חוזר/ת אליך.", shortcut: "/רגע" },
  { title: "תודה וסיום", body: "תודה שפנית אלינו! נשמח לעזור גם בעתיד. יום נעים 🙏", shortcut: "/תודה" },
  { title: "בקשת פרטי הזמנה", body: "כדי שאוכל לבדוק את ההזמנה, אפשר לקבל את מספר ההזמנה או את מספר הטלפון שאיתו הוזמן?", shortcut: "/הזמנה" },
  { title: "העברה לאחראי", body: "אני מעביר/ה את הפנייה לעמית/ה שיטפל/תטפל בזה בהקדם.", shortcut: "/העברה" },
];

export const TEMPLATE_SEEDS: Array<{
  name: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  body: string;
  variables: string[];
}> = [
  {
    name: "עגלה נטושה",
    category: "MARKETING",
    body: "שלום {{1}}, שמנו לב ששכחת להשלים את ההזמנה שלך ל{{2}}. לחץ כאן להשלמת הרכישה עם 10% הנחה: {{3}}",
    variables: ["שם לקוח", "מוצר", "קישור"],
  },
  {
    name: "עדכון סטטוס הזמנה",
    category: "UTILITY",
    body: "שלום {{1}}, הזמנתך מספר {{2}} עודכנה לסטטוס: {{3}}.",
    variables: ["שם לקוח", "מספר הזמנה", "סטטוס"],
  },
  {
    name: "כשל בתשלום",
    category: "UTILITY",
    body: "שלום {{1}}, התשלום עבור הזמנה {{2}} לא הושלם בהצלחה. ניתן להשלים את התשלום כאן: {{3}}",
    variables: ["שם לקוח", "מספר הזמנה", "קישור"],
  },
  {
    name: "תזכורת חידוש",
    category: "MARKETING",
    body: "שלום {{1}}, ה{{2}} שרכשת מתקרב לסוף חיי המדף המומלצים. מעוניין בהצעת שדרוג במחיר מיוחד?",
    variables: ["שם לקוח", "מוצר"],
  },
  {
    name: "הודעת ברוכים הבאים",
    category: "UTILITY",
    body: "שלום {{1}}, ברוך הבא לסולינה! אנחנו כאן בשבילך בכל שאלה על המוצרים שלנו.",
    variables: ["שם לקוח"],
  },
];

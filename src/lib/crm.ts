export const CRM_STAGES = ["NEW", "CONTACTED", "QUALIFIED", "CUSTOMER", "LOST"] as const;
export const CRM_STAGE_LABELS: Record<string, string> = { NEW: "ליד חדש", CONTACTED: "נוצר קשר", QUALIFIED: "ליד מתאים", CUSTOMER: "לקוח", LOST: "לא רלוונטי" };

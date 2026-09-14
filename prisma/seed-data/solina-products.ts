export const SOLINA_PRODUCTS = [
  { name: "מזרן זוגי אורתופדי סולינה פרימיום", sku: "SOL-MAT-200" },
  { name: "כרית תמיכה אנטומית סולינה", sku: "SOL-PIL-110" },
  { name: "מיטה מתכווננת חשמלית דגם קומפורט", sku: "SOL-BED-450" },
  { name: "מזרן יחיד לילדים סולינה סופט", sku: "SOL-MAT-100" },
  { name: "מגן מזרן אימפרביוס סולינה", sku: "SOL-PRO-030" },
  { name: "כרית צוואר מקצף זיכרון", sku: "SOL-PIL-120" },
  { name: "מארז מצעים 100% כותנה מצרית", sku: "SOL-LIN-060" },
  { name: "מזרן קפיצים בוניל דגם קלאסיק", sku: "SOL-MAT-210" },
];

export function generateOrderNumber(seedIndex: number): string {
  return `SOL-${100000 + seedIndex}`;
}

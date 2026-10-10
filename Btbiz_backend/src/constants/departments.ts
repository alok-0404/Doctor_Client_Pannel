export interface DepartmentDefinition {
  id: string;
  label: string;
  /** Short line shown in lists (WhatsApp row description is capped at 72 chars). */
  description: string;
  /** Lowercase words/phrases a patient may type (English + common Hindi/Hinglish). */
  keywords: string[];
}

/** Doctors without a department are treated as General Medicine. */
export const DEFAULT_DEPARTMENT_ID = "general";

export const DEPARTMENTS: DepartmentDefinition[] = [
  {
    id: "general",
    label: "General Medicine",
    description: "Fever, cold, cough, body pain, weakness",
    keywords: [
      "general", "fever", "bukhar", "cold", "sardi", "cough", "khansi", "khasi", "flu", "viral",
      "body pain", "weakness", "kamzori", "headache", "sir dard", "bp", "sugar", "diabetes", "infection",
    ],
  },
  {
    id: "orthopedics",
    label: "Orthopedics",
    description: "Bones, joints, back pain, fracture",
    keywords: [
      "ortho", "bone", "bones", "haddi", "joint", "knee", "ghutna", "back pain", "kamar", "fracture",
      "spine", "shoulder", "arthritis",
    ],
  },
  {
    id: "gastroenterology",
    label: "Gastroenterology",
    description: "Gas, acidity, stomach pain, digestion",
    keywords: [
      "gastro", "gas", "acidity", "stomach", "pet", "pait", "digestion", "constipation", "kabj",
      "loose motion", "vomiting", "ulcer",
    ],
  },
  {
    id: "hepatology",
    label: "Liver (Hepatology)",
    description: "Liver, jaundice, fatty liver, hepatitis",
    keywords: ["liver", "jigar", "jaundice", "piliya", "fatty liver", "hepatitis", "hepato"],
  },
  {
    id: "pulmonology",
    label: "Lungs (Pulmonology)",
    description: "Breathing, asthma, chest congestion",
    keywords: [
      "lung", "lungs", "fefde", "breathing", "saans", "asthma", "dama", "tb", "chest congestion",
      "pulmo", "wheezing",
    ],
  },
  {
    id: "urology",
    label: "Kidney & Stone (Urology)",
    description: "Kidney stone, urine problems, prostate",
    keywords: [
      "stone", "pathri", "kidney", "urine", "peshab", "urology", "uro", "prostate", "nephro",
    ],
  },
  {
    id: "ophthalmology",
    label: "Eye (Ophthalmology)",
    description: "Vision, eye pain, cataract, redness",
    keywords: ["eye", "eyes", "aankh", "ankh", "vision", "cataract", "spectacles", "chashma", "ophthal"],
  },
  {
    id: "cardiology",
    label: "Heart (Cardiology)",
    description: "Chest pain, heart, high BP follow-up",
    keywords: ["heart", "dil", "cardio", "chest pain", "palpitation", "ghabrahat"],
  },
  {
    id: "dermatology",
    label: "Skin (Dermatology)",
    description: "Skin, hair, allergy, rashes",
    keywords: ["skin", "twacha", "hair", "baal", "rash", "allergy", "itching", "khujli", "acne", "derma"],
  },
  {
    id: "ent",
    label: "ENT",
    description: "Ear, nose, throat, sinus",
    keywords: ["ent", "ear", "kaan", "nose", "naak", "throat", "gala", "sinus", "tonsil"],
  },
  {
    id: "gynecology",
    label: "Gynecology",
    description: "Women's health, pregnancy",
    keywords: ["gynae", "gyne", "gynec", "pregnancy", "period", "women", "mahila"],
  },
  {
    id: "pediatrics",
    label: "Child (Pediatrics)",
    description: "Children's health and vaccination",
    keywords: ["child", "children", "baby", "bachcha", "baccha", "kids", "pediatric", "vaccination"],
  },
];

const DEPARTMENT_IDS = new Set(DEPARTMENTS.map((d) => d.id));

export function isValidDepartmentId(id: unknown): id is string {
  return typeof id === "string" && DEPARTMENT_IDS.has(id);
}

export function getDepartmentLabel(id: string | undefined | null): string {
  const found = DEPARTMENTS.find((d) => d.id === (id || DEFAULT_DEPARTMENT_ID));
  return found?.label ?? "General Medicine";
}

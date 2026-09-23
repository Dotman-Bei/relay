/** Public capsule templates (Explore). A template only pre-fills the rule form; nothing is on-chain until you create. */
export interface Template {
  id: string;
  emoji: string;
  title: string;
  category: "Friends" | "Family" | "Teams" | "Milestones";
  blurb: string;
  years: number;
  collectDays: number;
  capacity: number;
  minContributions: number;
  unanimous: boolean;
  fill: string;
}

export const TEMPLATES: Template[] = [
  { id: "graduation", emoji: "🎓", title: "Class letters", category: "Milestones", blurb: "Everyone writes to who they'll be in five years. Opens at the reunion.", years: 5, collectDays: 14, capacity: 30, minContributions: 10, unanimous: false, fill: "bg-yellow" },
  { id: "wedding", emoji: "💍", title: "First anniversary", category: "Family", blurb: "Guests seal a note on the day; the couple opens them together a year later.", years: 1, collectDays: 3, capacity: 64, minContributions: 5, unanimous: false, fill: "bg-pink" },
  { id: "newborn", emoji: "🍼", title: "For their 18th", category: "Family", blurb: "Family voice memos and photos for a child to open at eighteen. Everyone who joins must agree.", years: 18, collectDays: 60, capacity: 20, minContributions: 3, unanimous: true, fill: "bg-blue" },
  { id: "team-retro", emoji: "🧭", title: "Team retro, next year", category: "Teams", blurb: "Predictions and worries before a big launch. Open them at the one-year retro.", years: 1, collectDays: 7, capacity: 15, minContributions: 4, unanimous: false, fill: "bg-orange" },
  { id: "new-year", emoji: "🎆", title: "Next New Year", category: "Friends", blurb: "Resolutions and one honest prediction each. Opened at midnight, twelve months on.", years: 1, collectDays: 2, capacity: 12, minContributions: 3, unanimous: false, fill: "bg-purple" },
  { id: "trip", emoji: "🏕️", title: "The trip, ten years on", category: "Friends", blurb: "One photo and one sentence from each of you. Only opens if everyone who came agrees.", years: 10, collectDays: 10, capacity: 10, minContributions: 2, unanimous: true, fill: "bg-lime" },
];

export const templateById = (id: string | null | undefined) => TEMPLATES.find((t) => t.id === id) ?? null;

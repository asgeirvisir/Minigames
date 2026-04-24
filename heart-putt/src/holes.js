// Course data. Coordinates in the 420x640 virtual space.
// Walls: { x, y, w, h } rectangles. Zones: { x, y, r, kind }.

export const HOLES = [
  {
    id: 1,
    name: "First Coffee",
    par: 2,
    tee: { x: 210, y: 560 },
    hole: { x: 210, y: 90 },
    walls: [
      { x: 80, y: 320, w: 260, h: 14 },
      { x: 80, y: 320, w: 14, h: 60 },
      { x: 326, y: 320, w: 14, h: 60 },
    ],
    zones: [],
    quips: {
      intro: "They suggested coffee. ☕ Keep it casual.",
      birdie: "They laughed at your joke. Second date?",
      par: "Pleasant. Not electric, but pleasant.",
      bogey: "Mid. They'll ghost later.",
      miss: "You overshared. They're calling an Uber.",
    },
  },
  {
    id: 2,
    name: "Small Talk",
    par: 3,
    tee: { x: 80, y: 570 },
    hole: { x: 340, y: 80 },
    walls: [
      { x: 0, y: 260, w: 260, h: 12 },
      { x: 160, y: 400, w: 260, h: 12 },
    ],
    zones: [
      { x: 260, y: 200, r: 70, kind: "silence" },
    ],
    quips: {
      intro: "An awkward silence blooms. Steer around it.",
      birdie: "You asked about their dog. Unlocked: eye contact.",
      par: "Survived. Barely.",
      bogey: "That lull. Ugh.",
      miss: "You talked about crypto. Over.",
    },
  },
  {
    id: 3,
    name: "The Ex Patch",
    par: 3,
    tee: { x: 70, y: 560 },
    hole: { x: 350, y: 80 },
    walls: [
      { x: 120, y: 240, w: 12, h: 200 },
      { x: 280, y: 180, w: 12, h: 200 },
    ],
    zones: [
      { x: 205, y: 330, r: 60, kind: "ex" },
    ],
    quips: {
      intro: "They bring up their ex. DO NOT touch the red zone.",
      birdie: "You pivoted gracefully. They're into it.",
      par: "Bumpy but survivable.",
      bogey: "Oof. The ex came up three times.",
      miss: "You met the ex. Literally. In person.",
    },
  },
  {
    id: 4,
    name: "Full Date",
    par: 4,
    tee: { x: 70, y: 570 },
    hole: { x: 350, y: 80 },
    walls: [
      { x: 40, y: 460, w: 240, h: 12 },
      { x: 140, y: 320, w: 240, h: 12 },
      { x: 40, y: 180, w: 200, h: 12 },
    ],
    zones: [
      { x: 330, y: 420, r: 50, kind: "phone" },
      { x: 110, y: 260, r: 44, kind: "silence" },
    ],
    quips: {
      intro: "Dinner. They keep checking their phone.",
      birdie: "Magic. You're in their story already.",
      par: "A good date. Respectable.",
      bogey: "They're 'gonna text you' but won't.",
      miss: "They left at the entrée. Lonely dessert.",
    },
  },
];

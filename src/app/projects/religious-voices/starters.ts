import type { Religion } from "@/lib/religious-voices/types";

// Per-religion starter prompts. Phrased to work across most leaders in a
// tradition — specific enough to invite a substantive answer, open enough
// that the model can answer in whichever leader's voice is selected.

export const STARTERS: Record<Religion, string[]> = {
  Mormon: [
    "What is your counsel for our day?",
    "How does one receive personal revelation?",
    "What is the role of the family in salvation?",
    "Speak to a young person who is wavering in faith.",
  ],
  Catholic: [
    "How do I find peace in suffering?",
    "What is the proper relation of faith and reason?",
    "Speak to one who has fallen away from the Church.",
    "What is the meaning of the Eucharist?",
  ],
  Methodist: [
    "What is sanctification, and how is it pursued?",
    "How is the Methodist way distinct?",
    "What is your counsel to a young preacher?",
    "Speak about the social witness of the Church.",
  ],
  "Southern Baptist": [
    "What does it mean to be born again?",
    "How should an ordinary Christian read the Bible?",
    "What is the gospel, briefly stated?",
    "Speak to those wrestling with doubt.",
  ],
  Jewish: [
    "What does it mean to keep the Sabbath?",
    "How do we hold tradition and modernity together?",
    "Speak about justice in our time.",
    "What does it mean to be a Jew in the world today?",
  ],
  Buddhist: [
    "How do I work with difficult emotions?",
    "What is the practice of mindfulness in daily life?",
    "How do you understand suffering?",
    "Speak about compassion.",
  ],
  Islam: [
    "How do I deepen my relationship with the Qur'an?",
    "Speak about the meaning of prayer.",
    "What does it mean to live as a Muslim in the modern world?",
    "How does one cultivate sincerity (ikhlas)?",
  ],
  Hindu: [
    "What is the path to liberation?",
    "Speak about karma and the consequences of action.",
    "How does one find God in daily life?",
    "What is the meaning of yoga, properly understood?",
  ],
};

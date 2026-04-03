// ─────────────────────────────────────────────────────────────────────────────
// Number Guessor — Trivia Prompt Bank
//
// Edit this file in VS Code to update questions and answers.
// Rules:
//   • correctAnswer must be ≤ 100
//   • Prefer answers in the 8–90 range (estimatable, not trivially obvious)
// ─────────────────────────────────────────────────────────────────────────────

export type NumberPromptCategory = 'geography' | 'sports' | 'science' | 'history' | 'math';

export type NumberPrompt = {
  id: string;
  text: string;
  correctAnswer: number;
  category: string;
};

export const NUMBER_GUESSOR_PROMPTS: NumberPrompt[] = [
  // Geography
  { id: 'ng_1',  text: 'How many countries are in Europe?',                              correctAnswer: 44, category: 'geography' },
  { id: 'ng_2',  text: 'How many countries are in Africa?',                              correctAnswer: 54, category: 'geography' },
  { id: 'ng_3',  text: 'How many countries are in South America?',                       correctAnswer: 12, category: 'geography' },
  { id: 'ng_4',  text: 'How many countries share a border with Russia?',                 correctAnswer: 14, category: 'geography' },
  { id: 'ng_5',  text: 'How many countries border China?',                               correctAnswer: 14, category: 'geography' },
  { id: 'ng_6',  text: 'How many stars are on the US flag?',                             correctAnswer: 50, category: 'geography' },
  { id: 'ng_7',  text: 'How many stripes are on the US flag?',                           correctAnswer: 13, category: 'geography' },
  { id: 'ng_8',  text: 'How many provinces does Canada have?',                           correctAnswer: 10, category: 'geography' },
  // Sports & Games
  { id: 'ng_9',  text: 'How many squares are on a standard chessboard?',                correctAnswer: 64, category: 'sports' },
  { id: 'ng_10', text: 'How many cards are in a standard deck (no jokers)?',             correctAnswer: 52, category: 'sports' },
  { id: 'ng_11', text: 'How many holes are on a standard golf course?',                  correctAnswer: 18, category: 'sports' },
  { id: 'ng_12', text: 'How many innings are in a standard baseball game?',              correctAnswer:  9, category: 'sports' },
  { id: 'ng_13', text: 'How many seconds are on the NBA shot clock?',                    correctAnswer: 24, category: 'sports' },
  { id: 'ng_14', text: 'How many points is a bullseye worth in darts?',                  correctAnswer: 50, category: 'sports' },
  { id: 'ng_15', text: 'How many players are on the field per team in soccer?',          correctAnswer: 11, category: 'sports' },
  { id: 'ng_16', text: 'How many pins are set up in bowling?',                           correctAnswer: 10, category: 'sports' },
  { id: 'ng_17', text: 'How many events were in the first modern Olympic Games (1896)?', correctAnswer: 43, category: 'sports' },
  { id: 'ng_18', text: 'How many minutes are in a college (NCAA) basketball game?',      correctAnswer: 40, category: 'sports' },
  { id: 'ng_19', text: 'How many countries have won the FIFA World Cup?',                correctAnswer:  8, category: 'sports' },
  // Science
  { id: 'ng_20', text: "What percentage of Earth's surface is covered by water?",        correctAnswer: 71, category: 'science' },
  { id: 'ng_21', text: 'How many days does the Moon take to orbit Earth?',               correctAnswer: 27, category: 'science' },
  { id: 'ng_22', text: 'How many days does Mercury take to orbit the Sun?',              correctAnswer: 88, category: 'science' },
  { id: 'ng_23', text: 'What is the atomic number of gold?',                             correctAnswer: 79, category: 'science' },
  { id: 'ng_24', text: 'How many teeth does a healthy adult human have?',                correctAnswer: 32, category: 'science' },
  { id: 'ng_25', text: 'How many ribs does a human have in total?',                      correctAnswer: 24, category: 'science' },
  { id: 'ng_26', text: 'How many bones are in a human hand?',                            correctAnswer: 27, category: 'science' },
  { id: 'ng_27', text: 'How many bones are in the human spine?',                         correctAnswer: 33, category: 'science' },
  // History & Culture
  { id: 'ng_28', text: 'How many symphonies did Beethoven complete?',                    correctAnswer:  9, category: 'history' },
  { id: 'ng_29', text: 'How many Oscars did Titanic win at the 1998 Academy Awards?',    correctAnswer: 11, category: 'history' },
  { id: 'ng_30', text: 'How many books are in the Harry Potter series?',                 correctAnswer:  7, category: 'history' },
  { id: 'ng_31', text: 'How many seasons did Friends run?',                              correctAnswer: 10, category: 'history' },
  { id: 'ng_32', text: 'How many books are in the New Testament?',                       correctAnswer: 27, category: 'history' },
  { id: 'ng_33', text: 'How many films are in the main Star Wars saga (Episodes I-IX)?', correctAnswer:  9, category: 'history' },
  { id: 'ng_34', text: 'How many seasons did The Office (US) run?',                      correctAnswer:  9, category: 'history' },
  { id: 'ng_35', text: 'How many countries competed in the 1896 Olympic Games?',         correctAnswer: 14, category: 'history' },
  // Math & Misc
  { id: 'ng_36', text: 'How many degrees are in a right angle?',                         correctAnswer: 90, category: 'math' },
  { id: 'ng_37', text: 'How many letters are in the English alphabet?',                  correctAnswer: 26, category: 'math' },
  { id: 'ng_38', text: 'How many weeks are in a year?',                                  correctAnswer: 52, category: 'math' },
  { id: 'ng_39', text: 'How many days are in February during a leap year?',              correctAnswer: 29, category: 'math' },
  { id: 'ng_40', text: 'How many white keys are on a standard piano?',                   correctAnswer: 52, category: 'math' },
];

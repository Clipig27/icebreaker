// ─────────────────────────────────────────────────────────────────────────────
// Game Prompt Banks
// Each game has its own structured prompt array.
// Add more prompts to each array in the same style — they're picked randomly.
// ─────────────────────────────────────────────────────────────────────────────

// ─── STAND OUT ────────────────────────────────────────────────────────────────

export type StandOutDifficulty = 'easy' | 'medium' | 'hard';

export interface StandOutPrompt {
  id: string;
  text: string;
  difficulty: StandOutDifficulty;
}

export const STAND_OUT_PROMPTS: StandOutPrompt[] = [
  // Easy — common, high-overlap expected (tests uniqueness with simple categories)
  { id: 'so_e1',  text: 'Name a fruit',                            difficulty: 'easy' },
  { id: 'so_e2',  text: 'Name a color',                            difficulty: 'easy' },
  { id: 'so_e3',  text: 'Name a fast food chain',                  difficulty: 'easy' },
  { id: 'so_e4',  text: 'Name a pet',                              difficulty: 'easy' },
  { id: 'so_e5',  text: 'Name a movie genre',                      difficulty: 'easy' },
  { id: 'so_e6',  text: 'Name a sport',                            difficulty: 'easy' },
  { id: 'so_e7',  text: 'Name a country',                          difficulty: 'easy' },
  { id: 'so_e8',  text: 'Name a superhero',                        difficulty: 'easy' },
  { id: 'so_e9',  text: 'Name a school subject',                   difficulty: 'easy' },
  { id: 'so_e10', text: 'Name a breakfast food',                   difficulty: 'easy' },
  { id: 'so_e11', text: 'Name a soft drink',                       difficulty: 'easy' },
  { id: 'so_e12', text: 'Name a social media app',                 difficulty: 'easy' },
  { id: 'so_e13', text: 'Name a pizza topping',                    difficulty: 'easy' },
  { id: 'so_e14', text: 'Name a type of music',                    difficulty: 'easy' },
  { id: 'so_e15', text: 'Name a type of car',                      difficulty: 'easy' },

  // Medium — more personal, fewer obvious answers
  { id: 'so_m1',  text: 'Name something you bring to a party',            difficulty: 'medium' },
  { id: 'so_m2',  text: 'Name something people lose all the time',        difficulty: 'medium' },
  { id: 'so_m3',  text: 'Name a reason someone would be late',            difficulty: 'medium' },
  { id: 'so_m4',  text: 'Name something you should not forget on vacation', difficulty: 'medium' },
  { id: 'so_m5',  text: 'Name something people do when they are nervous',  difficulty: 'medium' },
  { id: 'so_m6',  text: 'Name something you always find at a birthday party', difficulty: 'medium' },
  { id: 'so_m7',  text: 'Name something you check before leaving the house', difficulty: 'medium' },
  { id: 'so_m8',  text: 'Name something that always ends up on the floor', difficulty: 'medium' },
  { id: 'so_m9',  text: 'Name something you do when you are bored',       difficulty: 'medium' },
  { id: 'so_m10', text: 'Name a reason someone would cancel plans',       difficulty: 'medium' },
  { id: 'so_m11', text: 'Name something you eat when you are sad',        difficulty: 'medium' },
  { id: 'so_m12', text: 'Name something people say they will do but never do', difficulty: 'medium' },
  { id: 'so_m13', text: 'Name something you would bring to a deserted island', difficulty: 'medium' },
  { id: 'so_m14', text: 'Name something people argue about at family dinners', difficulty: 'medium' },
  { id: 'so_m15', text: 'Name something you do right before bed',         difficulty: 'medium' },

  // Hard — spicy, social, more open-ended
  { id: 'so_h1',  text: 'Name something people lie about',                difficulty: 'hard' },
  { id: 'so_h2',  text: 'Name a reason someone gets ghosted',             difficulty: 'hard' },
  { id: 'so_h3',  text: 'Name something awkward to say on a first date',  difficulty: 'hard' },
  { id: 'so_h4',  text: 'Name something people pretend to understand',    difficulty: 'hard' },
  { id: 'so_h5',  text: "Name something you would not want your parents to find", difficulty: 'hard' },
  { id: 'so_h6',  text: 'Name a red flag in a new friend',                difficulty: 'hard' },
  { id: 'so_h7',  text: 'Name something people do but will not admit',    difficulty: 'hard' },
  { id: 'so_h8',  text: 'Name a reason someone unfollows you',            difficulty: 'hard' },
  { id: 'so_h9',  text: 'Name something people judge you for silently',   difficulty: 'hard' },
  { id: 'so_h10', text: 'Name something that ruins a first impression',   difficulty: 'hard' },
  { id: 'so_h11', text: 'Name a lie you tell yourself',                   difficulty: 'hard' },
  { id: 'so_h12', text: 'Name something people fake laugh at',            difficulty: 'hard' },
  { id: 'so_h13', text: 'Name something you hide from your friends',      difficulty: 'hard' },
  { id: 'so_h14', text: 'Name a personality trait people deny having',    difficulty: 'hard' },
  { id: 'so_h15', text: 'Name something you do that would surprise people', difficulty: 'hard' },
];

// ─── NUMBER GUESSOR ───────────────────────────────────────────────────────────

export type NumberPromptCategory = 'phone' | 'habits' | 'travel' | 'possessions' | 'social' | 'scores';

export interface NumberPrompt {
  id: string;
  text: string;
  category: NumberPromptCategory;
  /** If true, answers above 100 are allowed and display as "100+" */
  openRange?: boolean;
}

export const NUMBER_GUESSOR_PROMPTS: NumberPrompt[] = [
  // Phone
  { id: 'ng_p1', text: 'How many apps do you have on your phone?',           category: 'phone' },
  { id: 'ng_p2', text: 'How many times do you check your phone per day?',    category: 'phone' },
  { id: 'ng_p3', text: 'How many unread emails do you have?',                category: 'phone' },
  { id: 'ng_p4', text: 'How many photos do you have in your camera roll?',   category: 'phone' },
  { id: 'ng_p5', text: 'How many tabs do you usually have open?',            category: 'phone' },
  { id: 'ng_p6', text: 'How many unread texts do you currently have?',       category: 'phone' },
  { id: 'ng_p7', text: 'How many times a week do you post on social media?', category: 'phone' },
  { id: 'ng_p8', text: 'How many people have you muted on social media?',    category: 'phone' },

  // Habits
  { id: 'ng_h1', text: 'How many hours of screen time do you average per day?', category: 'habits' },
  { id: 'ng_h2', text: 'How many hours of sleep do you get on a typical night?', category: 'habits' },
  { id: 'ng_h3', text: 'How many cups of coffee or tea do you drink per day?',   category: 'habits' },
  { id: 'ng_h4', text: 'How many times a week do you eat out?',                  category: 'habits' },
  { id: 'ng_h5', text: 'How many times have you hit snooze this week?',          category: 'habits' },
  { id: 'ng_h6', text: 'How many minutes does your morning routine take?',       category: 'habits' },
  { id: 'ng_h7', text: 'How many times do you wash your hair per week?',         category: 'habits' },

  // Travel
  { id: 'ng_t1', text: 'How many times have you been to the airport?',   category: 'travel' },
  { id: 'ng_t2', text: 'How many concerts have you been to?',            category: 'travel' },
  { id: 'ng_t3', text: 'How many countries have you visited?',           category: 'travel' },
  { id: 'ng_t4', text: 'How many road trips have you been on?',          category: 'travel' },
  { id: 'ng_t5', text: 'How many times have you moved in your life?',    category: 'travel' },
  { id: 'ng_t6', text: 'How many hours is the longest flight you took?', category: 'travel' },

  // Possessions
  { id: 'ng_pos1', text: 'How many pairs of shoes do you own?',              category: 'possessions' },
  { id: 'ng_pos2', text: 'How many hoodies do you own?',                     category: 'possessions' },
  { id: 'ng_pos3', text: 'How many books do you own?',                       category: 'possessions' },
  { id: 'ng_pos4', text: 'How many plants do you have?',                     category: 'possessions' },
  { id: 'ng_pos5', text: 'How many hats do you own?',                        category: 'possessions' },
  { id: 'ng_pos6', text: 'How many streaming subscriptions do you pay for?', category: 'possessions' },
  { id: 'ng_pos7', text: 'How many unfinished projects do you have at home?', category: 'possessions' },

  // Social
  { id: 'ng_s1', text: 'How many contacts do you actually text regularly?',  category: 'social' },
  { id: 'ng_s2', text: 'How many people would you call in an emergency?',    category: 'social' },
  { id: 'ng_s3', text: 'How many close friends do you have?',                category: 'social' },
  { id: 'ng_s4', text: 'How many people have you blocked?',                  category: 'social' },
  { id: 'ng_s5', text: 'How many first dates have you been on?',             category: 'social' },
  { id: 'ng_s6', text: 'How many weddings have you attended?',               category: 'social' },
  { id: 'ng_s7', text: 'How many group chats are you in right now?',         category: 'social' },

  // Scores — typically 0–100 or slightly above
  { id: 'ng_sc1', text: 'What grade (out of 100) did you get on your last test?',          category: 'scores' },
  { id: 'ng_sc2', text: 'What percentage of your battery do you usually plug in at?',      category: 'scores' },
  { id: 'ng_sc3', text: 'What is your average GPA score (out of 100)?',                    category: 'scores' },
  { id: 'ng_sc4', text: 'What is your highest bowling score ever?',                        category: 'scores' },
  { id: 'ng_sc5', text: 'How many days in a row is your longest workout streak?',          category: 'scores' },
  { id: 'ng_sc6', text: 'Out of 100, how would you rate your cooking skills?',             category: 'scores' },
  { id: 'ng_sc7', text: 'Out of 100, how risky of a person are you?',                     category: 'scores' },

  // Open range — answers commonly exceed 100
  { id: 'ng_or1', text: 'How many Instagram followers do you have?',                      category: 'social',      openRange: true },
  { id: 'ng_or2', text: 'What is your longest Snapchat streak?',                          category: 'social',      openRange: true },
  { id: 'ng_or3', text: 'How many songs are in your most-played playlist?',               category: 'phone',       openRange: true },
  { id: 'ng_or4', text: 'How many unread notifications do you have right now?',           category: 'phone',       openRange: true },
  { id: 'ng_or5', text: 'How many days has your Duolingo streak been?',                   category: 'habits',      openRange: true },
  { id: 'ng_or6', text: 'How many people have you followed on TikTok?',                   category: 'social',      openRange: true },
  { id: 'ng_or7', text: 'How many YouTube videos have you watched in your life (estimate)?', category: 'phone',    openRange: true },
  { id: 'ng_or8', text: 'How many hours of Netflix have you watched this year?',          category: 'habits',      openRange: true },
  { id: 'ng_or9', text: 'How many items are in your Amazon wish list?',                   category: 'possessions', openRange: true },
  { id: 'ng_or10', text: 'How many photos are in your Screenshots folder?',               category: 'phone',       openRange: true },
];

// ─── PIE CHARTS ───────────────────────────────────────────────────────────────

export interface PieChartPrompt {
  id: string;
  text: string;
  isCustom?: boolean;
}

export const PIE_CHARTS_PROMPTS: PieChartPrompt[] = [
  { id: 'pc1',  text: 'Who is most likely to go viral?' },
  { id: 'pc2',  text: 'Who is most likely to ghost someone?' },
  { id: 'pc3',  text: 'Who is most likely to get rich?' },
  { id: 'pc4',  text: 'Who is most likely to embarrass themselves in public?' },
  { id: 'pc5',  text: 'Who is most likely to survive a zombie apocalypse?' },
  { id: 'pc6',  text: 'Who is most likely to forget their own birthday plans?' },
  { id: 'pc7',  text: 'Who is most likely to become famous for something weird?' },
  { id: 'pc8',  text: 'Who is most likely to start drama by accident?' },
  { id: 'pc9',  text: 'Who is most likely to end up on reality TV?' },
  { id: 'pc10', text: 'Who is most likely to get canceled first?' },
  { id: 'pc11', text: 'Who is most likely to cry at a movie?' },
  { id: 'pc12', text: 'Who is most likely to be the last one to know something?' },
  { id: 'pc13', text: 'Who is most likely to accidentally text the wrong person?' },
  { id: 'pc14', text: 'Who is most likely to show up late to their own event?' },
  { id: 'pc15', text: 'Who is most likely to spend their savings in one weekend?' },
  { id: 'pc16', text: 'Who is most likely to start a cult?' },
  { id: 'pc17', text: 'Who is most likely to be on a podcast?' },
  { id: 'pc18', text: 'Who is most likely to get into an argument with a stranger?' },
  { id: 'pc19', text: 'Who is most likely to forget your birthday?' },
  { id: 'pc20', text: 'Who is most likely to move to another country?' },
  { id: 'pc21', text: 'Who is most likely to invent something?' },
  { id: 'pc22', text: 'Who is most likely to go skydiving?' },
  { id: 'pc23', text: 'Who is most likely to have a secret second life?' },
  { id: 'pc24', text: 'Who is most likely to say something they immediately regret?' },
  { id: 'pc25', text: 'Who is most likely to be the group parent?' },
  { id: 'pc26', text: 'Who is most likely to become a hermit?' },
  { id: 'pc27', text: 'Who is most likely to date someone they met online?' },
  { id: 'pc28', text: 'Who is most likely to quit their job on the spot?' },
  { id: 'pc29', text: 'Who is most likely to win a random game show?' },
  { id: 'pc30', text: 'Who is most likely to be overly dramatic about nothing?' },
];

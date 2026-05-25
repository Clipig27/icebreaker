export interface PotLuckQuestion {
  id: string;
  text: string;
  choices: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  difficulty: 'easy' | 'medium' | 'hard';
  startingPot: 1 | 2 | 3;
  custom?: boolean;
}

export const DEFAULT_QUESTIONS: PotLuckQuestion[] = [
  // ── EASY ──────────────────────────────────────────────────────────────────
  { id: 'e01', text: "Which planet is closest to the Sun?", choices: ["Venus", "Earth", "Mercury", "Mars"], correctIndex: 2, difficulty: 'easy', startingPot: 1 },
  { id: 'e02', text: "What sport is Wimbledon associated with?", choices: ["Cricket", "Tennis", "Badminton", "Squash"], correctIndex: 1, difficulty: 'easy', startingPot: 1 },
  { id: 'e03', text: "What currency does Japan use?", choices: ["Won", "Yuan", "Baht", "Yen"], correctIndex: 3, difficulty: 'easy', startingPot: 1 },
  { id: 'e04', text: "How many colors are in a rainbow?", choices: ["5", "6", "7", "8"], correctIndex: 2, difficulty: 'easy', startingPot: 1 },
  { id: 'e05', text: "How many sides does a hexagon have?", choices: ["4", "6", "8", "10"], correctIndex: 1, difficulty: 'easy', startingPot: 1 },
  { id: 'e06', text: "Who wrote Romeo and Juliet?", choices: ["Shakespeare", "Dickens", "Chaucer", "Marlowe"], correctIndex: 0, difficulty: 'easy', startingPot: 1 },
  { id: 'e07', text: "What is the largest ocean on Earth?", choices: ["Pacific", "Atlantic", "Indian", "Arctic"], correctIndex: 0, difficulty: 'easy', startingPot: 1 },
  { id: 'e08', text: "How many planets are in our solar system?", choices: ["7", "8", "9", "10"], correctIndex: 1, difficulty: 'easy', startingPot: 1 },
  { id: 'e09', text: "How many days are in a leap year?", choices: ["354", "364", "365", "366"], correctIndex: 3, difficulty: 'easy', startingPot: 1 },
  { id: 'e10', text: "What element does 'O' represent on the periodic table?", choices: ["Gold", "Osmium", "Oxygen", "Oxide"], correctIndex: 2, difficulty: 'easy', startingPot: 1 },
  { id: 'e11', text: "What is the capital of France?", choices: ["London", "Paris", "Madrid", "Rome"], correctIndex: 1, difficulty: 'easy', startingPot: 1 },
  { id: 'e12', text: "How many legs does a spider have?", choices: ["4", "6", "8", "10"], correctIndex: 2, difficulty: 'easy', startingPot: 1 },
  { id: 'e13', text: "What is the largest planet in our solar system?", choices: ["Saturn", "Jupiter", "Neptune", "Uranus"], correctIndex: 1, difficulty: 'easy', startingPot: 1 },
  { id: 'e14', text: "How many sides does a triangle have?", choices: ["2", "3", "4", "5"], correctIndex: 1, difficulty: 'easy', startingPot: 1 },
  { id: 'e15', text: "How many continents are there on Earth?", choices: ["5", "6", "7", "8"], correctIndex: 2, difficulty: 'easy', startingPot: 1 },
  { id: 'e16', text: "What is the capital of the USA?", choices: ["New York", "Boston", "Washington D.C.", "Los Angeles"], correctIndex: 2, difficulty: 'easy', startingPot: 1 },
  { id: 'e17', text: "Which country invented pizza?", choices: ["Greece", "France", "Italy", "Spain"], correctIndex: 2, difficulty: 'easy', startingPot: 1 },
  { id: 'e18', text: "How many players are on a basketball team on the court?", choices: ["4", "5", "6", "7"], correctIndex: 1, difficulty: 'easy', startingPot: 1 },
  { id: 'e19', text: "What year did World War II end?", choices: ["1943", "1944", "1945", "1946"], correctIndex: 2, difficulty: 'easy', startingPot: 1 },
  { id: 'e20', text: "What is the chemical symbol for gold?", choices: ["Au", "Ag", "Go", "Gd"], correctIndex: 0, difficulty: 'easy', startingPot: 1 },
  { id: 'e21', text: "What is the boiling point of water in Celsius?", choices: ["75°C", "90°C", "100°C", "120°C"], correctIndex: 2, difficulty: 'easy', startingPot: 1 },
  { id: 'e22', text: "How many players are on a soccer team on the field?", choices: ["9", "10", "11", "13"], correctIndex: 2, difficulty: 'easy', startingPot: 1 },
  { id: 'e23', text: "What is the capital of Japan?", choices: ["Beijing", "Seoul", "Bangkok", "Tokyo"], correctIndex: 3, difficulty: 'easy', startingPot: 1 },
  { id: 'e24', text: "How many months are in a year?", choices: ["10", "11", "12", "13"], correctIndex: 2, difficulty: 'easy', startingPot: 1 },
  { id: 'e25', text: "What color is chlorophyll, the pigment in plants?", choices: ["Blue", "Yellow", "Green", "Red"], correctIndex: 2, difficulty: 'easy', startingPot: 1 },

  // ── MEDIUM ────────────────────────────────────────────────────────────────
  { id: 'm01', text: "What's the only mammal that can't jump?", choices: ["Sloth", "Elephant", "Rhino", "Hippo"], correctIndex: 1, difficulty: 'medium', startingPot: 2 },
  { id: 'm02', text: "How many hearts does an octopus have?", choices: ["1", "2", "3", "5"], correctIndex: 2, difficulty: 'medium', startingPot: 2 },
  { id: 'm03', text: "What year was the first iPhone released?", choices: ["2005", "2007", "2009", "2010"], correctIndex: 1, difficulty: 'medium', startingPot: 2 },
  { id: 'm04', text: "Which planet spins on its side?", choices: ["Venus", "Neptune", "Uranus", "Saturn"], correctIndex: 2, difficulty: 'medium', startingPot: 2 },
  { id: 'm05', text: "Most abundant gas in Earth's atmosphere?", choices: ["Oxygen", "Carbon Dioxide", "Nitrogen", "Argon"], correctIndex: 2, difficulty: 'medium', startingPot: 2 },
  { id: 'm06', text: "A group of flamingos is called a what?", choices: ["Flock", "Flamboyance", "Pride", "Murder"], correctIndex: 1, difficulty: 'medium', startingPot: 2 },
  { id: 'm07', text: "What's the smallest country in the world?", choices: ["Monaco", "Nauru", "Vatican City", "San Marino"], correctIndex: 2, difficulty: 'medium', startingPot: 2 },
  { id: 'm08', text: "How many strings does a standard violin have?", choices: ["4", "5", "6", "7"], correctIndex: 0, difficulty: 'medium', startingPot: 2 },
  { id: 'm09', text: "What is the hardest natural substance on Earth?", choices: ["Quartz", "Diamond", "Titanium", "Graphene"], correctIndex: 1, difficulty: 'medium', startingPot: 2 },
  { id: 'm10', text: "How many bones are in the adult human body?", choices: ["180", "206", "230", "256"], correctIndex: 1, difficulty: 'medium', startingPot: 2 },
  { id: 'm11', text: "What language has the most native speakers?", choices: ["Mandarin Chinese", "Spanish", "English", "Hindi"], correctIndex: 0, difficulty: 'medium', startingPot: 2 },
  { id: 'm12', text: "What is the capital city of Australia?", choices: ["Sydney", "Melbourne", "Adelaide", "Canberra"], correctIndex: 3, difficulty: 'medium', startingPot: 2 },
  { id: 'm13', text: "How many teeth do adult humans typically have?", choices: ["28", "30", "32", "36"], correctIndex: 2, difficulty: 'medium', startingPot: 2 },
  { id: 'm14', text: "What gas do plants absorb during photosynthesis?", choices: ["Oxygen", "Carbon Dioxide", "Nitrogen", "Hydrogen"], correctIndex: 1, difficulty: 'medium', startingPot: 2 },
  { id: 'm15', text: "What is the longest river in the world?", choices: ["Amazon", "Nile", "Yangtze", "Mississippi"], correctIndex: 1, difficulty: 'medium', startingPot: 2 },
  { id: 'm16', text: "Who invented the telephone?", choices: ["Thomas Edison", "Alexander Graham Bell", "Nikola Tesla", "Samuel Morse"], correctIndex: 1, difficulty: 'medium', startingPot: 2 },
  { id: 'm17', text: "How many valves does the human heart have?", choices: ["2", "3", "4", "6"], correctIndex: 2, difficulty: 'medium', startingPot: 2 },
  { id: 'm18', text: "What is the largest organ in the human body?", choices: ["Heart", "Brain", "Liver", "Skin"], correctIndex: 3, difficulty: 'medium', startingPot: 2 },
  { id: 'm19', text: "What year did the Berlin Wall fall?", choices: ["1985", "1987", "1989", "1991"], correctIndex: 2, difficulty: 'medium', startingPot: 2 },
  { id: 'm20', text: "Which planet has the most moons?", choices: ["Jupiter", "Saturn", "Uranus", "Neptune"], correctIndex: 1, difficulty: 'medium', startingPot: 2 },
  { id: 'm21', text: "What does DNA stand for?", choices: ["Deoxyribonucleic Acid", "Dynamic Nucleic Array", "Dual Nitrogen Acid", "Dextro Nucleic Acid"], correctIndex: 0, difficulty: 'medium', startingPot: 2 },
  { id: 'm22', text: "In which country is the Amazon rainforest mostly located?", choices: ["Colombia", "Peru", "Brazil", "Venezuela"], correctIndex: 2, difficulty: 'medium', startingPot: 2 },
  { id: 'm23', text: "What is the most-visited country in the world?", choices: ["USA", "France", "Spain", "China"], correctIndex: 1, difficulty: 'medium', startingPot: 2 },
  { id: 'm24', text: "Which country is the largest by land area?", choices: ["China", "Canada", "Russia", "USA"], correctIndex: 2, difficulty: 'medium', startingPot: 2 },
  { id: 'm25', text: "How many chambers does the human heart have?", choices: ["2", "3", "4", "6"], correctIndex: 2, difficulty: 'medium', startingPot: 2 },

  // ── HARD ──────────────────────────────────────────────────────────────────
  { id: 'h01', text: "Which country has the most time zones?", choices: ["Russia", "USA", "France", "China"], correctIndex: 2, difficulty: 'hard', startingPot: 3 },
  { id: 'h02', text: "What is the most abundant element in the universe?", choices: ["Helium", "Hydrogen", "Carbon", "Oxygen"], correctIndex: 1, difficulty: 'hard', startingPot: 3 },
  { id: 'h03', text: "What is the smallest bone in the human body?", choices: ["Malleus", "Incus", "Stapes", "Pisiform"], correctIndex: 2, difficulty: 'hard', startingPot: 3 },
  { id: 'h04', text: "How many chromosomes do humans have?", choices: ["23", "44", "46", "48"], correctIndex: 2, difficulty: 'hard', startingPot: 3 },
  { id: 'h05', text: "In what year did the French Revolution begin?", choices: ["1776", "1789", "1799", "1804"], correctIndex: 1, difficulty: 'hard', startingPot: 3 },
  { id: 'h06', text: "How many bones does a shark have?", choices: ["0", "12", "50", "200"], correctIndex: 0, difficulty: 'hard', startingPot: 3 },
  { id: 'h07', text: "What element has the highest melting point?", choices: ["Carbon", "Platinum", "Titanium", "Tungsten"], correctIndex: 3, difficulty: 'hard', startingPot: 3 },
  { id: 'h08', text: "What is the atomic number of carbon?", choices: ["4", "6", "8", "12"], correctIndex: 1, difficulty: 'hard', startingPot: 3 },
  { id: 'h09', text: "Which planet has a day longer than its year?", choices: ["Mercury", "Venus", "Mars", "Jupiter"], correctIndex: 1, difficulty: 'hard', startingPot: 3 },
  { id: 'h10', text: "How many moons does Mars have?", choices: ["0", "1", "2", "4"], correctIndex: 2, difficulty: 'hard', startingPot: 3 },
  { id: 'h11', text: "What is the longest bone in the human body?", choices: ["Tibia", "Humerus", "Femur", "Radius"], correctIndex: 2, difficulty: 'hard', startingPot: 3 },
  { id: 'h12', text: "How many letters are in the Hawaiian alphabet?", choices: ["10", "13", "18", "26"], correctIndex: 1, difficulty: 'hard', startingPot: 3 },
  { id: 'h13', text: "What is the rarest blood type?", choices: ["O positive", "B negative", "AB negative", "A negative"], correctIndex: 2, difficulty: 'hard', startingPot: 3 },
  { id: 'h14', text: "What is the capital of Kazakhstan?", choices: ["Almaty", "Astana", "Bishkek", "Tashkent"], correctIndex: 1, difficulty: 'hard', startingPot: 3 },
  { id: 'h15', text: "What is the most common element in the Earth's crust?", choices: ["Silicon", "Oxygen", "Iron", "Aluminum"], correctIndex: 1, difficulty: 'hard', startingPot: 3 },
  { id: 'h16', text: "In what year was the Eiffel Tower completed?", choices: ["1879", "1889", "1899", "1909"], correctIndex: 1, difficulty: 'hard', startingPot: 3 },
  { id: 'h17', text: "What is the chemical symbol for silver?", choices: ["Si", "Ag", "Au", "Fe"], correctIndex: 1, difficulty: 'hard', startingPot: 3 },
  { id: 'h18', text: "How many eyes does a bee have?", choices: ["2", "3", "5", "8"], correctIndex: 2, difficulty: 'hard', startingPot: 3 },
  { id: 'h19', text: "What is the name for the fear of long words?", choices: ["Logophobia", "Hippopotomonstrosesquipedaliophobia", "Verbaphobia", "Megalophobia"], correctIndex: 1, difficulty: 'hard', startingPot: 3 },
  { id: 'h20', text: "What is the only naturally occurring liquid metal at room temperature?", choices: ["Lead", "Mercury", "Gallium", "Cesium"], correctIndex: 1, difficulty: 'hard', startingPot: 3 },
];

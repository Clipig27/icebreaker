import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Dimensions,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { useGame } from '../context/GameContext';
import socket from '../socket';
import AsyncStorage from '@react-native-async-storage/async-storage';
import PrimaryButton from '../components/PrimaryButton';
import SecondaryButton from '../components/SecondaryButton';
import { COLORS, FONTS } from '../constants/theme';
import GameIntro from '../components/GameIntro';
import PhaseTransition from '../components/PhaseTransition';
import { KeyboardDoneBar, KB_DONE_ID } from '../components/KeyboardDoneBar';

// ── Accent colour for Blind Ranking ──────────────────────────────────────────
const ACCENT = '#e8927c';

// ── Types ────────────────────────────────────────────────────────────────────

interface BRGameState {
  game: 'blindRanking';
  phase: 'intro' | 'setup' | 'playing' | 'reveal' | 'voting' | 'vote-results';
  categoryKey: string;
  categoryLabel: string;
  categoryEmoji: string;
  size: 5 | 10;
  draw: string[];                          // items in the order everyone sees them
  currentRound: number;                    // 0-indexed, which item from draw is being placed
  placements: Record<string, (string | null)[]>;  // playerId -> their slot array
  roundSubmitted: string[];                // who has placed for current round
  rankings: Record<string, string[]>;      // final rankings (filled at end)
  votes?: Record<string, string>;
  votedPlayerIds?: string[];
  // Multi-game series
  totalGames: number;                      // 1, 3, or 5
  currentGame: number;                     // 1-indexed, which game in the series
  brScores?: Record<string, number>;       // BR-internal scores (not global)
}

interface CustomCategory {
  id: string;
  label: string;
  items: string[];
}

const CUSTOM_CATEGORIES_KEY = 'br_custom_categories';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'BlindRanking'>;
};

// ── Shuffle utility (Fisher-Yates) ───────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Banks ────────────────────────────────────────────────────────────────────

const BANKS: Record<string, { label: string; emoji: string; items: string[] }> = {
  artists: { label: "Legendary pop artists", emoji: "★", items: ["Michael Jackson","Madonna","Prince","Whitney Houston","Beyoncé","Mariah Carey","Elton John","David Bowie","Stevie Wonder","Freddie Mercury","Lady Gaga","Rihanna","Adele","Bruno Mars","Taylor Swift","Janet Jackson","George Michael","Tina Turner","Cher","Diana Ross","Britney Spears","Justin Timberlake","Usher","Katy Perry","Christina Aguilera","Elvis Presley","The Beatles","Stevie Nicks","Dolly Parton","Lionel Richie","Phil Collins","Billy Joel","Paul McCartney","Donna Summer","Aretha Franklin","Marvin Gaye","Sade","Annie Lennox","Kate Bush","Robbie Williams","Shakira","Céline Dion","Barbra Streisand","Gloria Estefan","Sting","Boy George","Cyndi Lauper","Lenny Kravitz","Seal","Sam Smith"] },
  sports: { label: "Sports to watch live", emoji: "◈", items: ["Soccer","Basketball","American Football","Tennis","Boxing","MMA","Baseball","Ice Hockey","Formula 1","Golf","Cricket","Rugby","Volleyball","Table Tennis","Badminton","Swimming","Track & Field","Gymnastics","Figure Skating","Skiing","Snowboarding","Surfing","Skateboarding","Cycling","Marathon","Wrestling","Fencing","Archery","Rowing","Sailing","Horse Racing","Darts","Snooker","Bowling","Climbing","Beach Volleyball","Handball","Water Polo","Diving","Curling","Lacrosse","Field Hockey","Sumo","Polo","Squash","Triathlon","Motocross","Drag Racing","Esports","Bull Riding"] },
  fastfood: { label: "Fast food items", emoji: "▣", items: ["Big Mac","Chicken nuggets","French fries","Whopper","Chicken sandwich","Cheeseburger","Tacos","Burrito","Pizza slice","Hot dog","Onion rings","Mozzarella sticks","Chicken wings","Quesadilla","Fish sandwich","Milkshake","Soft serve cone","Apple pie","Curly fries","Loaded nachos","Spicy chicken sandwich","Double cheeseburger","Bacon burger","Chili cheese fries","Breakfast burrito","Hash browns","Egg McMuffin","Pancakes","Waffle fries","Crispy chicken tenders","Sliders","Corn dog","Cheese pizza","Pepperoni pizza","Garlic bread","Cinnamon rolls","Donuts","Frozen lemonade","Iced coffee","Sweet tea","Coleslaw","Mac and cheese","Mashed potatoes","Biscuits","Jalapeño poppers","Cheese curds","Poutine","Churros","Soft pretzel","Fountain soda"] },
  movies: { label: "Movies to rewatch forever", emoji: "▶", items: ["The Godfather","Pulp Fiction","The Dark Knight","Forrest Gump","Inception","The Matrix","Goodfellas","Fight Club","Shawshank Redemption","Interstellar","Gladiator","Titanic","Jurassic Park","Back to the Future","Star Wars","Lord of the Rings","Harry Potter","The Lion King","Toy Story","Finding Nemo","Avengers","Spider-Man","Joker","Parasite","Whiplash","La La Land","The Departed","Django Unchained","Inglourious Basterds","No Country for Old Men","Mad Max: Fury Road","Blade Runner","Alien","The Shining","Jaws","Rocky","Die Hard","Terminator 2","The Truman Show","Eternal Sunshine","Good Will Hunting","Catch Me If You Can","The Wolf of Wall Street","Scarface","Casino","Heat","Se7en","The Silence of the Lambs","Saving Private Ryan","Schindler's List"] },
  travel: { label: "Dream travel destinations", emoji: "✈", items: ["Tokyo","Paris","Rome","New York","Bali","Santorini","Maldives","Iceland","Kyoto","Barcelona","London","Dubai","Sydney","Cape Town","Rio de Janeiro","Bangkok","Amsterdam","Venice","Prague","Marrakech","Istanbul","Singapore","Hawaii","Swiss Alps","Patagonia","Banff","Machu Picchu","Petra","Great Barrier Reef","Serengeti","Norwegian Fjords","Grand Canyon","Vienna","Lisbon","Seoul","Hong Kong","Queenstown","Reykjavik","Florence","Dubrovnik","Phuket","Maui","Tuscany","Greek Islands","Costa Rica","New Zealand","Scotland Highlands","Kenya Safari","Antarctica","Galápagos"] },
  snacks: { label: "Best snacks of all time", emoji: "◉", items: ["Doritos","Cheetos","Pringles","Oreos","Lay's chips","Goldfish","Pretzels","Popcorn","Trail mix","Cheez-Its","Ruffles","Takis","Sour Patch Kids","Skittles","M&Ms","Reese's","Kit Kat","Snickers","Twix","Gummy bears","Beef jerky","String cheese","Granola bars","Fruit snacks","Pop-Tarts","Rice Krispies Treats","Chips Ahoy","Nutter Butters","Animal crackers","Saltines","Ritz crackers","Wheat Thins","Triscuits","Veggie straws","Pita chips","Hummus","Guacamole","Salsa","Nachos","Ice cream sandwich","Push pop","Fruit Roll-Ups","Dunkaroos","Combos","Bugles","Funyuns","Sun Chips","Tostitos","Chex Mix","Hot Fries"] },
  decades: { label: "Decades of music", emoji: "♪", items: ["1950s rock & roll","1960s Motown","1960s British Invasion","1970s disco","1970s funk","1970s punk","1980s synth-pop","1980s hair metal","1980s hip-hop","1990s grunge","1990s R&B","1990s boy bands","1990s gangsta rap","2000s pop-punk","2000s crunk","2000s emo","2000s indie rock","2010s EDM","2010s trap","2010s bedroom pop","2010s K-pop","2020s hyperpop","2020s drill","Classic jazz","Bebop","Smooth jazz","Reggae","Ska","Bossa nova","Classic country","Outlaw country","Bluegrass","Delta blues","Soul","Gospel","New wave","Post-punk","Shoegaze","Britpop","Nu-metal","Garage rock","Folk revival","Psychedelic rock","Surf rock","Doo-wop","Glam rock","Dance-pop","Afrobeats","Reggaeton","Lo-fi"] },
  apps: { label: "Apps you can't live without", emoji: "▢", items: ["Instagram","TikTok","YouTube","Spotify","Netflix","WhatsApp","Snapchat","X (Twitter)","Reddit","Discord","Google Maps","Gmail","Notion","Pinterest","LinkedIn","Twitch","Facebook","Telegram","BeReal","Threads","Venmo","Cash App","Uber","DoorDash","Amazon","Duolingo","Apple Music","Audible","Kindle","Pocket","Shazam","Calm","Headspace","Strava","MyFitnessPal","Robinhood","Coinbase","Slack","Zoom","Google Drive","Dropbox","Canva","CapCut","Photoshop","Procreate","GarageBand","Letterboxd","Goodreads","Spotify Wrapped","WeChat"] },
  candy: { label: "Candy & chocolate", emoji: "✦", items: ["Reese's Cups","Snickers","Kit Kat","Twix","M&Ms","Hershey's bar","Milky Way","3 Musketeers","Butterfinger","Skittles","Starburst","Sour Patch Kids","Swedish Fish","Gummy bears","Haribo","Sour Worms","Jolly Ranchers","Twizzlers","Red Vines","Nerds","Warheads","Airheads","Laffy Taffy","Tootsie Roll","Werther's","Lindt truffles","Ferrero Rocher","Toblerone","Kinder Bueno","Crunch bar","100 Grand","Almond Joy","Mounds","Whoppers","Junior Mints","Milk Duds","Hot Tamales","Mike and Ike","Dots","Now and Later","Pixy Stix","Pop Rocks","Ring Pop","Push Pop","Candy corn","Peeps","Cadbury Egg","York Peppermint","Andes Mints","Reese's Pieces"] },
  superpowers: { label: "Superpowers to have", emoji: "⚡", items: ["Flight","Invisibility","Super strength","Telepathy","Teleportation","Time travel","Mind reading","Super speed","Healing factor","Telekinesis","Shapeshifting","Immortality","X-ray vision","Invulnerability","Elemental control","Fire control","Ice control","Weather control","Force fields","Phasing through walls","Duplication","Size changing","Animal communication","Plant control","Electricity control","Magnetism","Gravity control","Dream walking","Memory manipulation","Luck manipulation","Probability control","Super intelligence","Photographic memory","Night vision","Echolocation","Underwater breathing","Regeneration","Energy blasts","Sound manipulation","Light manipulation","Portal creation","Astral projection","Empathy","Precognition","Mind control","Technopathy","Super agility","Adhesion (wall-crawling)","Density control","Time stop"] },
  breakfast: { label: "Breakfast foods", emoji: "☕", items: ["Pancakes","Waffles","French toast","Bacon","Scrambled eggs","Fried eggs","Omelette","Bagel & cream cheese","Avocado toast","Cereal","Oatmeal","Yogurt parfait","Croissant","Cinnamon roll","Hash browns","Breakfast burrito","Eggs Benedict","Biscuits & gravy","Sausage links","Toast & jam","Muffin","Donut","Smoothie","Granola","Fruit bowl","Breakfast sandwich","Quiche","Frittata","Crepes","Shakshuka","Congee","Dim sum","Chilaquiles","Huevos rancheros","Grits","English muffin","Danish pastry","Pop-Tarts","Cottage cheese","Smoked salmon bagel","Breakfast pizza","Scones","Churros","Pain au chocolat","Acai bowl","Protein shake","Bacon egg & cheese","Steel-cut oats","Banana bread","Coffee cake"] },
  bucketlist: { label: "Things to do before you die", emoji: "✺", items: ["See the Northern Lights","Skydive","Visit all 7 continents","Learn an instrument","Run a marathon","Swim with dolphins","See the pyramids","Go scuba diving","Learn a language","Write a book","Start a business","Fall in love","Travel solo","See a total eclipse","Climb a mountain","Ride in a hot air balloon","Visit the Grand Canyon","See Machu Picchu","Go on safari","Learn to surf","Plant a tree","Volunteer abroad","See a Broadway show","Go bungee jumping","Visit Japan","Drive Route 66","See the Great Wall","Go whitewater rafting","Sleep under the stars","Attend a music festival","Take a cooking class","Adopt a pet","Get a tattoo","Visit a rainforest","See the Mona Lisa","Try skydiving","Go ziplining","Ride a gondola in Venice","Hike a famous trail","Learn to dance","Master a recipe","See a volcano","Snorkel a reef","Cross something off forever","Visit Iceland","Go camping","Watch a sunrise & sunset same day","See the ocean","Forgive someone","Tell someone you love them"] },
  villains: { label: "Iconic movie villains", emoji: "☠", items: ["Darth Vader","The Joker","Hannibal Lecter","Thanos","Voldemort","Sauron","Michael Myers","Freddy Krueger","Jason Voorhees","Norman Bates","Anton Chigurh","Hans Gruber","The Terminator","Agent Smith","Pennywise","Loki","Magneto","Scar","Maleficent","Cruella de Vil","Jafar","Ursula","Gollum","Bane","Dr. Octopus","Green Goblin","Killmonger","Nurse Ratched","Patrick Bateman","Amon Goeth","Bill the Butcher","The Predator","Xenomorph","Sephiroth","Bowser","Ganondorf","Dolores Umbridge","Cersei Lannister","Walter White","Tony Soprano","Gus Fring","Frank Underwood","Keyser Söze","Annie Wilkes","Immortan Joe","Lord Farquaad","Hela","Ego","Davy Jones"] },
  dreamjobs: { label: "Dream jobs", emoji: "✸", items: ["Astronaut","Pro athlete","Movie star","Musician","Video game designer","Pilot","Marine biologist","Chef","Travel blogger","Architect","Surgeon","Lawyer","Veterinarian","Photographer","Author","Film director","Fashion designer","Entrepreneur","Software engineer","Pro gamer","DJ","Stunt performer","Wildlife photographer","Sommelier","Race car driver","Archaeologist","Animator","Voice actor","Comedian","Talk show host","News anchor","Diplomat","Detective","Firefighter","Park ranger","Brewmaster","Tattoo artist","Set designer","Special effects artist","Theme park designer","Toy designer","Perfumer","Yacht captain","Ski instructor","Dive instructor","Food critic","Art curator","Interior designer","Landscape architect","Inventor"] },
  cereals: { label: "Breakfast cereals", emoji: "◐", items: ["Lucky Charms","Frosted Flakes","Froot Loops","Cinnamon Toast Crunch","Honey Nut Cheerios","Cap'n Crunch","Cocoa Puffs","Cookie Crisp","Reese's Puffs","Trix","Honeycomb","Corn Pops","Apple Jacks","Rice Krispies","Frosted Mini-Wheats","Raisin Bran","Special K","Cheerios","Honey Bunches of Oats","Golden Grahams","Cinnamon Life","Cocoa Pebbles","Fruity Pebbles","Cinnamon Crunch","Grape-Nuts","Wheaties","Corn Flakes","Shredded Wheat","Krave","Cracklin' Oat Bran","Cap'n Crunch Berries","Smacks","Boo Berry","Count Chocula","Franken Berry","Kix","Chex","Life","Total","Müesli","Granola","Oatmeal Squares","Frosted Cheerios","Multigrain Cheerios","Quaker Oat Squares","Honey Smacks","Puffins","Mini Spooners","Marshmallow Mateys","Cocoa Krispies"] },
  hobbies: { label: "Hobbies to pick up", emoji: "✿", items: ["Photography","Painting","Cooking","Baking","Gardening","Hiking","Rock climbing","Yoga","Meditation","Reading","Writing","Playing guitar","Playing piano","Singing","Dancing","Pottery","Knitting","Woodworking","Calligraphy","Drawing","Chess","Video games","Board games","Cycling","Running","Swimming","Surfing","Skateboarding","Skiing","Fishing","Camping","Birdwatching","Astronomy","Coding","3D printing","Drone flying","Podcasting","DJing","Music production","Film making","Journaling","Scrapbooking","Coin collecting","Wine tasting","Coffee roasting","Home brewing","Bonsai","Origami","Magic tricks","Stand-up comedy"] },
  cars: { label: "Dream cars", emoji: "◎", items: ["Ferrari","Lamborghini","Porsche 911","McLaren","Bugatti","Tesla Model S","Aston Martin","Rolls-Royce","Bentley","Maserati","Corvette","Mustang","Camaro","Dodge Challenger","Jeep Wrangler","Range Rover","G-Wagon","Audi R8","BMW M3","Mercedes AMG","Nissan GT-R","Toyota Supra","Mazda Miata","Subaru WRX","Ford GT","Lexus LFA","Pagani","Koenigsegg","Lotus","Jaguar F-Type","Alfa Romeo","Cadillac Escalade","Hummer","Ford Bronco","Land Cruiser","DeLorean","VW Bus","Mini Cooper","Fiat 500","Shelby Cobra","Pontiac Firebird","Plymouth Barracuda","Lincoln Continental","Tesla Cybertruck","Rivian R1T","Lucid Air","Polestar","Genesis G90","Acura NSX","Dodge Viper"] },
  pizzas: { label: "Pizza toppings", emoji: "▲", items: ["Pepperoni","Mushroom","Sausage","Extra cheese","Bacon","Onion","Green pepper","Black olives","Pineapple","Ham","Jalapeño","Spinach","Tomato","Garlic","Basil","Anchovies","Chicken","Ground beef","Salami","Prosciutto","Artichoke","Sun-dried tomato","Feta","Goat cheese","Ricotta","Arugula","Red onion","Banana pepper","Pesto drizzle","Hot honey","Buffalo chicken","BBQ chicken","Meatball","Capicola","Pancetta","Roasted red pepper","Caramelized onion","Truffle oil","Fresh mozzarella","Parmesan","Cheddar","Corn","Egg","Shrimp","Clams","Eggplant","Zucchini","Pickles","Pulled pork","Chili flakes"] },
};

const BANK_KEYS = Object.keys(BANKS);
const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ── Component ────────────────────────────────────────────────────────────────

export default function BlindRankingScreen({ navigation }: Props) {
  const { room, players, isHost, currentUser, sendGameState, sendPlayerAction } = useGame();

  const myId = (() => {
    if (currentUser?.id) {
      const byPersistent = players.find(
        p => p.persistentId === currentUser.id || p.id === currentUser.id,
      );
      if (byPersistent) return byPersistent.id;
    }
    const bySocket = players.find(p => p.id === socket.id);
    if (bySocket) return bySocket.id;
    return currentUser?.id ?? socket.id ?? '';
  })();

  const gs = (room?.gameState?.game === 'blindRanking' ? room.gameState : null) as BRGameState | null;
  const gsRef = useRef(gs);
  useEffect(() => { gsRef.current = gs; }, [gs]);

  const sendGameStateRef = useRef(sendGameState);
  useEffect(() => { sendGameStateRef.current = sendGameState; }, [sendGameState]);

  const allPlayers = room?.players ?? players;

  // ── Local playing state ─────────────────────────────────────────────────────
  const [hasPlacedThisRound, setHasPlacedThisRound] = useState(false);
  const [showPeek, setShowPeek] = useState(false);

  // Animate the "now placing" card
  const popAnim = useRef(new Animated.Value(0)).current;
  const prevRoundRef = useRef(-1);

  // Reset placed flag when round advances
  useEffect(() => {
    if (!gs || gs.phase !== 'playing') return;
    if (gs.currentRound !== prevRoundRef.current) {
      prevRoundRef.current = gs.currentRound;
      setHasPlacedThisRound(false);
      // Trigger pop animation
      popAnim.setValue(0);
      Animated.spring(popAnim, {
        toValue: 1,
        speed: 20,
        bounciness: 14,
        useNativeDriver: true,
      }).start();
    }
  }, [gs?.currentRound, gs?.phase]); // eslint-disable-line

  // Check if I've already submitted for this round (reconnect safety)
  useEffect(() => {
    if (gs?.phase === 'playing' && (gs.roundSubmitted ?? []).includes(myId)) {
      setHasPlacedThisRound(true);
    }
  }, [gs?.roundSubmitted?.length]); // eslint-disable-line

  // ── Custom categories (persisted locally) ────────────────────────────────
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  const [showCustomEditor, setShowCustomEditor] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customItems, setCustomItems] = useState('');

  useEffect(() => {
    AsyncStorage.getItem(CUSTOM_CATEGORIES_KEY).then(raw => {
      if (raw) setCustomCategories(JSON.parse(raw));
    }).catch(() => {});
  }, []);

  const saveCustomCategory = async () => {
    const items = customItems.split('\n').map(s => s.trim()).filter(Boolean);
    if (!customName.trim() || items.length < 5) return;
    const cat: CustomCategory = { id: `c${Date.now()}`, label: customName.trim(), items };
    const next = [...customCategories, cat];
    setCustomCategories(next);
    await AsyncStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(next));
    setCustomName('');
    setCustomItems('');
    setShowCustomEditor(false);
  };

  const deleteCustomCategory = async (id: string) => {
    const next = customCategories.filter(c => c.id !== id);
    setCustomCategories(next);
    await AsyncStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(next));
  };

  // ── Voting state ────────────────────────────────────────────────────────────
  const [myVote, setMyVote] = useState<string | null>(null);

  // Reset vote when phase changes
  useEffect(() => {
    if (gs?.phase !== 'voting') setMyVote(null);
  }, [gs?.phase]);

  // ── Setup timeout ──────────────────────────────────────────────────────────
  const [setupTimedOut, setSetupTimedOut] = useState(false);
  const setupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (gs) {
      if (setupTimerRef.current) clearTimeout(setupTimerRef.current);
      return;
    }
    setupTimerRef.current = setTimeout(() => setSetupTimedOut(true), 8_000);
    return () => { if (setupTimerRef.current) clearTimeout(setupTimerRef.current); };
  }, [!!gs]);

  // ── Setup: host picks category, size, then rounds ──────────────────────────
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<5 | 10 | null>(null);

  const launchGame = (totalGames: number, currentGame: number) => {
    if (!isHost || !selectedCategory || !selectedSize) return;
    const size = selectedSize;
    const isCustom = selectedCategory.startsWith('custom:');
    let pool: string[], label: string, emoji: string;
    if (isCustom) {
      const cat = customCategories.find(c => c.id === selectedCategory.replace('custom:', ''));
      if (!cat) return;
      pool = cat.items;
      label = cat.label;
      emoji = '✎';
    } else {
      const bank = BANKS[selectedCategory];
      if (!bank) return;
      pool = bank.items;
      label = bank.label;
      emoji = bank.emoji;
    }
    if (pool.length < size) return;
    const draw = shuffle(pool).slice(0, size);
    const placements: Record<string, (string | null)[]> = {};
    for (const p of allPlayers) {
      placements[p.id] = new Array(size).fill(null);
    }
    const next: BRGameState = {
      game: 'blindRanking',
      phase: 'playing',
      categoryKey: selectedCategory,
      categoryLabel: label,
      categoryEmoji: emoji,
      size,
      draw,
      currentRound: 0,
      placements,
      roundSubmitted: [],
      rankings: {},
      votes: {},
      votedPlayerIds: [],
      totalGames,
      currentGame,
    };
    gsRef.current = next;
    sendGameStateRef.current(next);
  };

  // ── Auto-launch mid-series rounds once category+size are picked ────────────
  const launchedRef = useRef(false);
  useEffect(() => {
    if (!isHost || !gs || gs.phase !== 'setup') { launchedRef.current = false; return; }
    if ((gs.currentGame ?? 1) <= 1) return;
    if (!selectedCategory || !selectedSize) return;
    if (launchedRef.current) return;
    launchedRef.current = true;
    launchGame(gs.totalGames ?? 1, gs.currentGame ?? 1);
  }, [gs?.phase, gs?.currentGame, selectedCategory, selectedSize]); // eslint-disable-line

  // ── Playing: place current round's item into a slot ─────────────────────────
  const handlePlaceItem = (slotIndex: number) => {
    if (!gs || gs.phase !== 'playing') return;
    const mySlots = gs.placements?.[myId];
    if (!mySlots || mySlots[slotIndex] !== null) return; // already filled
    if (hasPlacedThisRound) return;

    const currentItem = gs.draw[gs.currentRound];
    if (!currentItem) return;

    setHasPlacedThisRound(true);
    sendPlayerAction('br-place', { slotIndex, item: currentItem });
  };

  // ── Reveal helpers ─────────────────────────────────────────────────────────
  const computeRevealStats = () => {
    if (!gs || !['reveal', 'voting', 'vote-results'].includes(gs.phase)) return { divisive: [], agreed: [] };
    // Use placements as the final rankings
    const rankings = gs.placements ?? {};
    const playerIds = Object.keys(rankings);
    if (playerIds.length === 0) return { divisive: [], agreed: [] };

    const items = gs.draw ?? [];
    const threshold = gs.size === 10 ? 4 : 2;

    const itemStats = items.map(item => {
      const ranks: number[] = [];
      for (const pid of playerIds) {
        const ranking = rankings[pid];
        if (!ranking) continue;
        const idx = ranking.indexOf(item);
        if (idx >= 0) ranks.push(idx + 1); // 1-based rank
      }
      const minRank = Math.min(...ranks);
      const maxRank = Math.max(...ranks);
      const spread = maxRank - minRank;
      const avgRank = ranks.reduce((a, b) => a + b, 0) / ranks.length;
      return { item, spread, avgRank, ranks };
    });

    // Top 3 most divisive (spread >= threshold)
    const divisive = itemStats
      .filter(s => s.spread >= threshold)
      .sort((a, b) => b.spread - a.spread)
      .slice(0, 3);

    // Top 3 everyone agrees (spread <= 1)
    const agreed = itemStats
      .filter(s => s.spread <= 1)
      .sort((a, b) => a.spread - b.spread || a.avgRank - b.avgRank)
      .slice(0, 3);

    return { divisive, agreed };
  };

  // ── Intro ──────────────────────────────────────────────────────────────────
  if (!gs || gs.phase === 'intro') {
    return (
      <GameIntro
        emoji="≣"
        title="Blind Ranking"
        tagline="Rank items blind — lock each one in as it appears. No take-backs."
        rules={[
          { emoji: '🎲', text: 'Items from a category appear one at a time in random order.' },
          { emoji: '📌', text: 'Place each item into a rank slot. Once placed, it\'s locked.' },
          { emoji: '👀', text: 'You can\'t see what\'s coming next — trust your gut!' },
          { emoji: '📊', text: 'After everyone finishes, rankings are compared side-by-side.' },
        ]}
        isHost={isHost}
        onStart={() => sendPlayerAction('advanceFromIntro', {})}
      />
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (!gs) {
    return (
      <SafeAreaView style={styles.safe}>
        <PhaseTransition phaseKey="loading">
          <View style={styles.centered}>
            {setupTimedOut ? (
              <>
                <Text style={styles.waitTitle}>Could not load game</Text>
                <Text style={styles.waitSub}>Lost connection to the server.</Text>
                <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 20 }}>
                  <Text style={[styles.waitSub, { textDecorationLine: 'underline' }]}>Go back</Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={styles.waitTitle}>Setting up...</Text>
            )}
          </View>
        </PhaseTransition>
      </SafeAreaView>
    );
  }

  // ── Phase: setup ───────────────────────────────────────────────────────────
  if (gs.phase === 'setup') {
    if (isHost) {
      // Custom category editor
      if (showCustomEditor) {
        const itemCount = customItems.split('\n').map(s => s.trim()).filter(Boolean).length;
        const canSave = customName.trim().length > 0 && itemCount >= 5;
        return (
          <SafeAreaView style={styles.safe}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
              <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                <Text style={styles.setupTitle}>New Category</Text>
                <Text style={styles.setupSub}>Create your own ranking category.</Text>
                <Text style={styles.editorLabel}>CATEGORY NAME</Text>
                <TextInput
                  style={styles.editorInput}
                  placeholder="e.g. Best Marvel movies"
                  placeholderTextColor={COLORS.text3}
                  value={customName}
                  onChangeText={setCustomName}
                  inputAccessoryViewID={KB_DONE_ID}
                />
                <Text style={styles.editorLabel}>ITEMS (one per line, min 5)</Text>
                <TextInput
                  style={[styles.editorInput, { height: 180, textAlignVertical: 'top' }]}
                  placeholder={"Iron Man\nEndgame\nSpider-Man\n..."}
                  placeholderTextColor={COLORS.text3}
                  value={customItems}
                  onChangeText={setCustomItems}
                  multiline
                  inputAccessoryViewID={KB_DONE_ID}
                />
                <Text style={styles.editorCount}>{itemCount} items</Text>
                <PrimaryButton
                  title="Save Category"
                  onPress={saveCustomCategory}
                  style={{ opacity: canSave ? 1 : 0.4 }}
                  disabled={!canSave}
                />
                <TouchableOpacity onPress={() => setShowCustomEditor(false)} style={{ marginTop: 8, alignSelf: 'center' }}>
                  <Text style={styles.backLink}>Cancel</Text>
                </TouchableOpacity>
              </ScrollView>
            </KeyboardAvoidingView>
            <KeyboardDoneBar />
          </SafeAreaView>
        );
      }

      // If category not yet selected, show category grid
      if (!selectedCategory) {
        return (
          <SafeAreaView style={styles.safe}>
            <PhaseTransition phaseKey="setup-category">
              <ScrollView contentContainerStyle={styles.scroll}>
                <Text style={styles.setupEmoji}>≣</Text>
                <Text style={styles.setupTitle}>Pick a Category</Text>
                <Text style={styles.setupSub}>
                  {(gs.totalGames ?? 1) > 1
                    ? `Round ${gs.currentGame ?? 1} of ${gs.totalGames} — pick a category.`
                    : 'Choose what everyone will rank.'}
                </Text>
                <View style={styles.categoryGrid}>
                  {BANK_KEYS.map(key => {
                    const bank = BANKS[key];
                    return (
                      <TouchableOpacity
                        key={key}
                        style={styles.categoryCard}
                        onPress={() => setSelectedCategory(key)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.categoryEmoji}>{bank.emoji}</Text>
                        <Text style={styles.categoryLabel} numberOfLines={2}>{bank.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Custom categories */}
                {customCategories.length > 0 && (
                  <>
                    <Text style={styles.customSectionTitle}>Your Categories</Text>
                    <View style={styles.categoryGrid}>
                      {customCategories.map(cat => (
                        <TouchableOpacity
                          key={cat.id}
                          style={[styles.categoryCard, { borderColor: ACCENT + '66' }]}
                          onPress={() => setSelectedCategory(`custom:${cat.id}`)}
                          onLongPress={() => deleteCustomCategory(cat.id)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.categoryEmoji}>✎</Text>
                          <Text style={styles.categoryLabel} numberOfLines={2}>{cat.label}</Text>
                          <Text style={styles.customItemCount}>{cat.items.length} items</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                {/* Make your own button */}
                <TouchableOpacity
                  style={styles.makeOwnBtn}
                  onPress={() => setShowCustomEditor(true)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.makeOwnText}>+ Make Your Own</Text>
                </TouchableOpacity>
              </ScrollView>
            </PhaseTransition>
          </SafeAreaView>
        );
      }

      // Category selected — pick size, then rounds
      const isCustom = selectedCategory.startsWith('custom:');
      const bankLabel = isCustom
        ? customCategories.find(c => c.id === selectedCategory.replace('custom:', ''))?.label ?? 'Custom'
        : BANKS[selectedCategory]?.label ?? '';
      const bankEmoji = isCustom ? '✎' : (BANKS[selectedCategory]?.emoji ?? '');

      // Step 2: pick size
      const isMidSeries = (gs.currentGame ?? 1) > 1;
      if (!selectedSize) {
        return (
          <SafeAreaView style={styles.safe}>
            <PhaseTransition phaseKey="setup-size">
              <View style={styles.centered}>
                <Text style={styles.setupEmoji}>{bankEmoji}</Text>
                <Text style={styles.setupTitle}>{bankLabel}</Text>
                <Text style={styles.setupSub}>How many items to rank?</Text>
                <View style={styles.sizeRow}>
                  {([5, 10] as const).map(size => (
                    <TouchableOpacity
                      key={size}
                      style={styles.sizeCard}
                      onPress={() => setSelectedSize(size)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.sizeNum}>{size}</Text>
                      <Text style={styles.sizeLabel}>Top {size}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity onPress={() => setSelectedCategory(null)} style={{ marginTop: 12 }}>
                  <Text style={styles.backLink}>Change category</Text>
                </TouchableOpacity>
              </View>
            </PhaseTransition>
          </SafeAreaView>
        );
      }

      // Mid-series: skip rounds picker, auto-launch via effect
      if (isMidSeries) {
        return (
          <SafeAreaView style={styles.safe}>
            <View style={styles.centered}>
              <Text style={styles.waitTitle}>Starting round {gs.currentGame}...</Text>
            </View>
          </SafeAreaView>
        );
      }

      // Step 3: pick number of rounds (first game only)
      return (
        <SafeAreaView style={styles.safe}>
          <PhaseTransition phaseKey="setup-rounds">
            <View style={styles.centered}>
              <Text style={styles.setupEmoji}>{bankEmoji}</Text>
              <Text style={styles.setupTitle}>{bankLabel}</Text>
              <Text style={[styles.setupSub, { marginBottom: 4 }]}>Top {selectedSize} · How many rounds?</Text>
              <View style={styles.sizeRow}>
                {([1, 3, 5] as const).map(n => (
                  <TouchableOpacity
                    key={n}
                    style={styles.sizeCard}
                    onPress={() => launchGame(n, 1)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.sizeNum}>{n}</Text>
                    <Text style={styles.sizeLabel}>{n === 1 ? 'Round' : 'Rounds'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity onPress={() => setSelectedSize(null)} style={{ marginTop: 12 }}>
                <Text style={styles.backLink}>Change size</Text>
              </TouchableOpacity>
            </View>
          </PhaseTransition>
        </SafeAreaView>
      );
    }

    // Non-host: waiting
    return (
      <SafeAreaView style={styles.safe}>
        <PhaseTransition phaseKey={gs.phase}>
          <View style={styles.centered}>
            <Text style={styles.waitEmoji}>≣</Text>
            <Text style={styles.waitTitle}>Waiting for host...</Text>
            <Text style={styles.waitSub}>Host is choosing the category and size.</Text>
          </View>
        </PhaseTransition>
      </SafeAreaView>
    );
  }

  // ── Phase: playing ─────────────────────────────────────────────────────────
  if (gs.phase === 'playing') {
    const currentItem = gs.draw[gs.currentRound];
    const mySlots = gs.placements?.[myId] ?? new Array(gs.size).fill(null);
    const submittedCount = (gs.roundSubmitted ?? []).length;
    const totalPlayers = allPlayers.length;
    const waitingForOthers = hasPlacedThisRound;

    const popScale = popAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.8, 1],
    });
    const popOpacity = popAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
    });

    // Peek modal — see everyone's lists
    if (showPeek) {
      const placements = gs.placements ?? {};
      return (
        <SafeAreaView style={styles.safe}>
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <View style={styles.playingHeader}>
              <Text style={styles.revealTitle}>Everyone's Lists</Text>
              <TouchableOpacity onPress={() => setShowPeek(false)}>
                <Text style={[styles.peekBtnText, { fontSize: 14 }]}>Close</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.revealCategoryLabel}>
              Round {gs.currentRound + 1} / {gs.size}
            </Text>
            {allPlayers.map(p => {
              const pSlots = placements[p.id] ?? [];
              const isMe = p.id === myId;
              return (
                <View key={p.id} style={[styles.peekPlayerCard, isMe && { borderColor: ACCENT + '66' }]}>
                  <Text style={[styles.peekPlayerName, isMe && { color: ACCENT }]}>
                    {p.name}{isMe ? ' (you)' : ''}
                  </Text>
                  {pSlots.map((item, i) => (
                    <View key={i} style={styles.peekSlotRow}>
                      <Text style={styles.peekSlotRank}>#{i + 1}</Text>
                      <Text style={styles.peekSlotItem}>{item ?? '—'}</Text>
                    </View>
                  ))}
                </View>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={styles.safe}>
        <PhaseTransition phaseKey={`playing-${gs.currentRound}`}>
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.playingHeader}>
              <Text style={styles.playingCategoryLabel}>
                {gs.categoryEmoji} {gs.categoryLabel}
                {(gs.totalGames ?? 1) > 1 ? ` · Game ${gs.currentGame}/${gs.totalGames}` : ''}
              </Text>
              <TouchableOpacity onPress={() => setShowPeek(true)} style={styles.peekBtn}>
                <Text style={styles.peekBtnText}>👀 Peek</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.playingProgress}>
              Round {gs.currentRound + 1} / {gs.size} · {submittedCount}/{totalPlayers} placed
            </Text>

            {/* Current item card */}
            {waitingForOthers ? (
              <View style={[styles.nowPlacingCard, { borderColor: COLORS.success + '66' }]}>
                <Text style={[styles.nowPlacingLabel, { color: COLORS.success }]}>PLACED!</Text>
                <Text style={styles.nowPlacingItem}>{currentItem}</Text>
                <Text style={styles.nowPlacingHint}>
                  Waiting for others... {submittedCount}/{totalPlayers}
                </Text>
              </View>
            ) : (
              <Animated.View
                style={[
                  styles.nowPlacingCard,
                  { transform: [{ scale: popScale }], opacity: popOpacity },
                ]}
              >
                <Text style={styles.nowPlacingLabel}>NOW PLACING</Text>
                <Text style={styles.nowPlacingItem}>{currentItem}</Text>
                <Text style={styles.nowPlacingHint}>
                  Tap a slot below · {gs.size - gs.currentRound} items left
                </Text>
              </Animated.View>
            )}

            {/* Slots */}
            <Text style={styles.slotsHeader}>
              Your Top {gs.size} Ranking
            </Text>
            <View style={styles.slotsContainer}>
              {mySlots.map((slotItem: string | null, idx: number) => {
                const isFilled = slotItem !== null;
                const canPlace = !isFilled && !waitingForOthers;
                return (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      styles.slot,
                      isFilled && styles.slotFilled,
                      canPlace && styles.slotOpen,
                    ]}
                    onPress={() => canPlace && handlePlaceItem(idx)}
                    activeOpacity={canPlace ? 0.6 : 1}
                    disabled={!canPlace}
                  >
                    <Text style={[styles.slotRank, isFilled && styles.slotRankFilled]}>
                      #{idx + 1}
                    </Text>
                    {isFilled ? (
                      <Text style={styles.slotItemText} numberOfLines={1}>
                        {slotItem}
                      </Text>
                    ) : (
                      <Text style={styles.slotEmpty}>
                        {canPlace ? 'Tap to place here' : '—'}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </PhaseTransition>
      </SafeAreaView>
    );
  }

  // ── Shared reveal UI (used in reveal + voting + vote-results) ──────────────
  const renderRevealContent = () => {
    const rankings = gs!.placements ?? {};
    const playerIds = Object.keys(rankings);
    const { divisive, agreed } = computeRevealStats();
    const colWidth = Math.max(120, (SCREEN_WIDTH - 40 - 36) / playerIds.length);

    return (
      <>
        {/* Title */}
        <Text style={styles.revealTitle}>Results</Text>
        <Text style={styles.revealCategoryLabel}>
          {gs!.categoryEmoji} {gs!.categoryLabel} — Top {gs!.size}
        </Text>

        {/* Divisive callout */}
        {divisive.length > 0 && (
          <View style={styles.calloutCard}>
            <Text style={styles.calloutTitle}>Most Divisive</Text>
            <Text style={styles.calloutSub}>Biggest disagreements</Text>
            {divisive.map((stat, i) => (
              <View key={`${i}-${stat.item}`} style={styles.calloutRow}>
                <Text style={styles.calloutIndex}>{i + 1}.</Text>
                <Text style={styles.calloutItem} numberOfLines={1}>{stat.item}</Text>
                <Text style={styles.calloutSpread}>spread: {stat.spread}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Agreed callout */}
        {agreed.length > 0 && (
          <View style={[styles.calloutCard, styles.calloutCardAgreed]}>
            <Text style={[styles.calloutTitle, { color: COLORS.success }]}>Everyone Agrees</Text>
            <Text style={styles.calloutSub}>Nearly identical rankings</Text>
            {agreed.map((stat, i) => (
              <View key={`${i}-${stat.item}`} style={styles.calloutRow}>
                <Text style={styles.calloutIndex}>{i + 1}.</Text>
                <Text style={styles.calloutItem} numberOfLines={1}>{stat.item}</Text>
                <Text style={[styles.calloutSpread, { color: COLORS.success }]}>
                  spread: {stat.spread}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Side-by-side comparison — fixed-width columns */}
        <Text style={styles.comparisonTitle}>Side-by-Side</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            {/* Header row */}
            <View style={styles.comparisonHeaderRow}>
              <View style={styles.comparisonRankCol}>
                <Text style={styles.comparisonHeaderText}>#</Text>
              </View>
              {playerIds.map(pid => {
                const player = allPlayers.find(p => p.id === pid);
                return (
                  <View key={pid} style={[styles.comparisonPlayerCol, { width: colWidth }]}>
                    <Text style={[
                      styles.comparisonHeaderText,
                      pid === myId && { color: ACCENT },
                    ]} numberOfLines={1}>
                      {player?.name ?? 'Player'}
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* Data rows */}
            {Array.from({ length: gs!.size }).map((_, rowIdx) => (
              <View
                key={rowIdx}
                style={[
                  styles.comparisonDataRow,
                  rowIdx % 2 === 0 && styles.comparisonDataRowAlt,
                ]}
              >
                <View style={styles.comparisonRankCol}>
                  <Text style={styles.comparisonRankNum}>{rowIdx + 1}</Text>
                </View>
                {playerIds.map(pid => {
                  const ranking = rankings[pid] ?? [];
                  const item = ranking[rowIdx] ?? '—';
                  return (
                    <View key={pid} style={[styles.comparisonPlayerCol, { width: colWidth }]}>
                      <Text style={styles.comparisonItemText} numberOfLines={2}>
                        {item}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
      </>
    );
  };

  // ── Phase: reveal ──────────────────────────────────────────────────────────
  if (gs.phase === 'reveal') {
    return (
      <SafeAreaView style={styles.safe}>
        <PhaseTransition phaseKey={gs.phase}>
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            {renderRevealContent()}
            {/* Host advances to voting */}
            <View style={styles.actions}>
              {isHost ? (
                <PrimaryButton
                  title="Vote for Best List"
                  onPress={() => {
                    const next: BRGameState = { ...gs, phase: 'voting', votes: {}, votedPlayerIds: [] };
                    gsRef.current = next;
                    sendGameStateRef.current(next);
                  }}
                />
              ) : (
                <Text style={styles.waitSub}>Waiting for host...</Text>
              )}
            </View>
          </ScrollView>
        </PhaseTransition>
      </SafeAreaView>
    );
  }

  // ── Phase: voting ─────────────────────────────────────────────────────────
  if (gs.phase === 'voting') {
    const votedIds = gs.votedPlayerIds ?? [];
    const hasVoted = votedIds.includes(myId);

    return (
      <SafeAreaView style={styles.safe}>
        <PhaseTransition phaseKey="voting">
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            {renderRevealContent()}

            <View style={styles.voteSection}>
              <Text style={styles.voteTitle}>
                {hasVoted ? 'Vote submitted!' : 'Who had the best list?'}
              </Text>
              <Text style={styles.voteSub}>
                {hasVoted
                  ? `${votedIds.length} / ${allPlayers.length} voted`
                  : 'Vote for the player with the best ranking.'}
              </Text>

              {!hasVoted && (
                <View style={styles.voteGrid}>
                  {allPlayers.map(p => (
                    <TouchableOpacity
                      key={p.id}
                      style={[
                        styles.voteCard,
                        myVote === p.id && styles.voteCardSelected,
                      ]}
                      onPress={() => setMyVote(p.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={[
                        styles.voteCardName,
                        myVote === p.id && { color: ACCENT },
                      ]}>{p.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {!hasVoted && myVote && (
                <PrimaryButton
                  title={`Vote for ${allPlayers.find(p => p.id === myVote)?.name}`}
                  onPress={() => {
                    sendPlayerAction('br-vote', { voteeId: myVote });
                  }}
                />
              )}

              {hasVoted && (
                <Text style={styles.waitSub}>Waiting for others...</Text>
              )}
            </View>
          </ScrollView>
        </PhaseTransition>
      </SafeAreaView>
    );
  }

  // ── Phase: vote-results ───────────────────────────────────────────────────
  if (gs.phase === 'vote-results') {
    const votes = gs.votes ?? {};
    // Tally votes
    const tally: Record<string, number> = {};
    for (const voteeId of Object.values(votes)) {
      tally[voteeId] = (tally[voteeId] ?? 0) + 1;
    }
    const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    const winnerId = sorted[0]?.[0];

    const hasMoreGames = (gs.currentGame ?? 1) < (gs.totalGames ?? 1);

    return (
      <SafeAreaView style={styles.safe}>
        <PhaseTransition phaseKey="vote-results">
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.revealTitle}>Best List</Text>
            <Text style={styles.revealCategoryLabel}>
              {gs.categoryEmoji} {gs.categoryLabel}
              {(gs.totalGames ?? 1) > 1 ? ` · Round ${gs.currentGame ?? 1} / ${gs.totalGames}` : ''}
            </Text>

            <View style={styles.voteResultsContainer}>
              {sorted.map(([pid, count], i) => {
                const player = allPlayers.find(p => p.id === pid);
                const isWinner = i === 0;
                return (
                  <View key={pid} style={[styles.voteResultRow, isWinner && styles.voteResultWinner]}>
                    <Text style={[styles.voteResultName, isWinner && { color: ACCENT }]}>
                      {isWinner ? '👑 ' : ''}{player?.name ?? 'Player'}
                    </Text>
                    <Text style={[styles.voteResultCount, isWinner && { color: ACCENT }]}>
                      {count} vote{count !== 1 ? 's' : ''} · {gs.brScores?.[pid] ?? 0} pts total
                    </Text>
                  </View>
                );
              })}
              {allPlayers.filter(p => !tally[p.id]).map(p => (
                <View key={p.id} style={styles.voteResultRow}>
                  <Text style={styles.voteResultName}>{p.name}</Text>
                  <Text style={styles.voteResultCount}>0 votes · {gs.brScores?.[p.id] ?? 0} pts total</Text>
                </View>
              ))}
            </View>

            <View style={styles.actions}>
              {isHost ? (
                hasMoreGames ? (
                  <PrimaryButton
                    title={`Next Round (${(gs.currentGame ?? 1) + 1} / ${gs.totalGames})`}
                    onPress={() => {
                      setSelectedCategory(null);
                      setSelectedSize(null);
                      const next: BRGameState = {
                        game: 'blindRanking',
                        phase: 'setup',
                        categoryKey: '',
                        categoryLabel: '',
                        categoryEmoji: '',
                        size: 5,
                        draw: [],
                        currentRound: 0,
                        placements: {},
                        roundSubmitted: [],
                        rankings: {},
                        votes: {},
                        votedPlayerIds: [],
                        totalGames: gs.totalGames ?? 1,
                        currentGame: (gs.currentGame ?? 1) + 1,
                        brScores: gs.brScores ?? {},
                      };
                      gsRef.current = next;
                      sendGameStateRef.current(next);
                    }}
                  />
                ) : (
                  <>
                    <PrimaryButton
                      title="New Series"
                      onPress={() => {
                        setSelectedCategory(null);
                        setSelectedSize(null);
                        const next: BRGameState = {
                          game: 'blindRanking',
                          phase: 'setup',
                          categoryKey: '',
                          categoryLabel: '',
                          categoryEmoji: '',
                          size: 5,
                          draw: [],
                          currentRound: 0,
                          placements: {},
                          roundSubmitted: [],
                          rankings: {},
                          votes: {},
                          votedPlayerIds: [],
                          totalGames: 1,
                          currentGame: 1,
                        };
                        gsRef.current = next;
                        sendGameStateRef.current(next);
                      }}
                    />
                    <SecondaryButton
                      title="Choose New Game"
                      onPress={() => navigation.navigate('GameSelect')}
                    />
                  </>
                )
              ) : (
                <Text style={styles.waitSub}>Waiting for host...</Text>
              )}
            </View>
          </ScrollView>
        </PhaseTransition>
      </SafeAreaView>
    );
  }

  // ── Fallback ───────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      <PhaseTransition phaseKey="fallback">
        <View style={styles.centered}>
          <Text style={styles.waitTitle}>Setting up...</Text>
        </View>
      </PhaseTransition>
    </SafeAreaView>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const CARD_GAP = 10;
const CARD_WIDTH = (SCREEN_WIDTH - 40 - CARD_GAP) / 2;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
    gap: 16,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 14,
  },
  waitEmoji: { fontSize: 52 },
  waitTitle: {
    fontSize: 22,
    fontFamily: FONTS.bold,
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 30,
  },
  waitSub: {
    fontSize: 14,
    color: COLORS.text2,
    textAlign: 'center',
    lineHeight: 20,
  },

  // ── Setup ────────────────────────────────────────────────────────────────
  setupEmoji: { fontSize: 52, textAlign: 'center' },
  setupTitle: {
    fontSize: 28,
    fontFamily: FONTS.extrabold,
    color: COLORS.text,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  setupSub: {
    fontSize: 14,
    color: COLORS.text2,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
    alignSelf: 'center',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CARD_GAP,
    marginTop: 8,
  },
  categoryCard: {
    width: CARD_WIDTH,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORS.borderHi,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 6,
  },
  categoryEmoji: { fontSize: 24 },
  categoryLabel: {
    fontSize: 13,
    fontFamily: FONTS.semibold,
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 18,
  },
  sizeRow: { flexDirection: 'row', gap: 16, marginTop: 12 },
  sizeCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: COLORS.borderHi,
    paddingVertical: 24,
    paddingHorizontal: 30,
    alignItems: 'center',
    minWidth: 100,
  },
  sizeNum: {
    fontSize: 40,
    fontFamily: FONTS.extrabold,
    color: ACCENT,
    letterSpacing: -1,
  },
  sizeLabel: {
    fontSize: 13,
    color: COLORS.text2,
    fontFamily: FONTS.semibold,
    marginTop: 4,
  },
  backLink: {
    fontSize: 14,
    color: COLORS.text2,
    textDecorationLine: 'underline',
  },

  // ── Playing ──────────────────────────────────────────────────────────────
  playingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  playingCategoryLabel: {
    fontSize: 14,
    fontFamily: FONTS.bold,
    color: COLORS.text2,
  },
  playingProgress: {
    fontSize: 13,
    fontFamily: FONTS.semibold,
    color: COLORS.text3,
  },
  nowPlacingCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: ACCENT,
    paddingVertical: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 8,
  },
  nowPlacingLabel: {
    fontSize: 11,
    fontFamily: FONTS.bold,
    color: ACCENT,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  nowPlacingItem: {
    fontSize: 24,
    fontFamily: FONTS.extrabold,
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 32,
  },
  nowPlacingHint: {
    fontSize: 12,
    fontFamily: FONTS.medium,
    color: COLORS.text2,
    textAlign: 'center',
  },
  slotsHeader: {
    fontSize: 16,
    fontFamily: FONTS.bold,
    color: COLORS.text,
    marginTop: 4,
  },
  slotsContainer: { gap: 6 },
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
  },
  slotFilled: {
    borderColor: ACCENT + '66',
    backgroundColor: ACCENT + '12',
  },
  slotOpen: {
    borderColor: ACCENT,
    borderStyle: 'dashed',
  },
  slotRank: {
    fontSize: 16,
    fontFamily: FONTS.extrabold,
    color: COLORS.text3,
    width: 36,
  },
  slotRankFilled: {
    color: ACCENT,
  },
  slotItemText: {
    flex: 1,
    fontSize: 16,
    fontFamily: FONTS.semibold,
    color: COLORS.text,
  },
  slotEmpty: {
    flex: 1,
    fontSize: 14,
    fontFamily: FONTS.medium,
    color: COLORS.text3,
    fontStyle: 'italic',
  },

  // ── Reveal ───────────────────────────────────────────────────────────────
  revealTitle: {
    fontSize: 30,
    fontFamily: FONTS.extrabold,
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  revealCategoryLabel: {
    fontSize: 14,
    fontFamily: FONTS.semibold,
    color: COLORS.text2,
  },
  calloutCard: {
    backgroundColor: ACCENT + '14',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: ACCENT + '55',
    padding: 16,
    gap: 8,
  },
  calloutCardAgreed: {
    backgroundColor: COLORS.success + '14',
    borderColor: COLORS.success + '55',
  },
  calloutTitle: {
    fontSize: 18,
    fontFamily: FONTS.extrabold,
    color: ACCENT,
  },
  calloutSub: {
    fontSize: 12,
    fontFamily: FONTS.medium,
    color: COLORS.text2,
    marginBottom: 4,
  },
  calloutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  calloutIndex: {
    fontSize: 14,
    fontFamily: FONTS.bold,
    color: COLORS.text2,
    width: 20,
  },
  calloutItem: {
    flex: 1,
    fontSize: 15,
    fontFamily: FONTS.semibold,
    color: COLORS.text,
  },
  calloutSpread: {
    fontSize: 12,
    fontFamily: FONTS.medium,
    color: ACCENT,
  },
  comparisonTitle: {
    fontSize: 18,
    fontFamily: FONTS.bold,
    color: COLORS.text,
    marginTop: 4,
  },
  comparisonHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 8,
    marginBottom: 4,
  },
  comparisonRankCol: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  comparisonPlayerCol: {
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  comparisonHeaderText: {
    fontSize: 13,
    fontFamily: FONTS.bold,
    color: COLORS.text2,
    textAlign: 'center',
  },
  comparisonDataRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border + '44',
  },
  comparisonDataRowAlt: {
    backgroundColor: COLORS.surface + '88',
  },
  comparisonRankNum: {
    fontSize: 14,
    fontFamily: FONTS.extrabold,
    color: ACCENT,
  },
  comparisonItemText: {
    fontSize: 13,
    fontFamily: FONTS.medium,
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 18,
  },
  actions: { gap: 10, marginTop: 8, alignItems: 'center' },

  // ── Peek ─────────────────────────────────────────────────────────────────
  peekBtn: {
    backgroundColor: COLORS.surface2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  peekBtnText: {
    fontSize: 13,
    fontFamily: FONTS.bold,
    color: ACCENT,
  },
  peekPlayerCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    gap: 4,
  },
  peekPlayerName: {
    fontSize: 15,
    fontFamily: FONTS.bold,
    color: COLORS.text,
    marginBottom: 4,
  },
  peekSlotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  peekSlotRank: {
    fontSize: 12,
    fontFamily: FONTS.bold,
    color: COLORS.text3,
    width: 28,
  },
  peekSlotItem: {
    fontSize: 13,
    fontFamily: FONTS.medium,
    color: COLORS.text2,
  },

  // ── Custom categories ───────────────────────────────────────────────────
  customSectionTitle: {
    fontSize: 16,
    fontFamily: FONTS.bold,
    color: COLORS.text,
    marginTop: 12,
  },
  customItemCount: {
    fontSize: 10,
    fontFamily: FONTS.medium,
    color: COLORS.text3,
  },
  makeOwnBtn: {
    borderWidth: 2,
    borderColor: ACCENT + '55',
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  makeOwnText: {
    fontSize: 15,
    fontFamily: FONTS.bold,
    color: ACCENT,
  },
  editorLabel: {
    fontSize: 11,
    fontFamily: FONTS.bold,
    color: ACCENT,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  editorInput: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.borderHi,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    fontFamily: FONTS.medium,
    color: COLORS.text,
  },
  editorCount: {
    fontSize: 11,
    fontFamily: FONTS.medium,
    color: COLORS.text3,
    textAlign: 'right',
    marginTop: 2,
  },

  // ── Voting ────────────────────────────────────────────────────────────────
  voteSection: {
    gap: 12,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 16,
  },
  voteTitle: {
    fontSize: 20,
    fontFamily: FONTS.extrabold,
    color: COLORS.text,
    textAlign: 'center',
  },
  voteSub: {
    fontSize: 13,
    fontFamily: FONTS.medium,
    color: COLORS.text2,
    textAlign: 'center',
  },
  voteGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  voteCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.borderHi,
    paddingVertical: 14,
    paddingHorizontal: 20,
    minWidth: 100,
    alignItems: 'center',
  },
  voteCardSelected: {
    borderColor: ACCENT,
    backgroundColor: ACCENT + '14',
  },
  voteCardName: {
    fontSize: 16,
    fontFamily: FONTS.bold,
    color: COLORS.text,
  },

  // ── Vote results ──────────────────────────────────────────────────────────
  voteResultsContainer: {
    gap: 8,
    marginTop: 8,
  },
  voteResultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  voteResultWinner: {
    borderColor: ACCENT + '66',
    backgroundColor: ACCENT + '12',
  },
  voteResultName: {
    fontSize: 16,
    fontFamily: FONTS.bold,
    color: COLORS.text,
  },
  voteResultCount: {
    fontSize: 14,
    fontFamily: FONTS.semibold,
    color: COLORS.text2,
  },
});

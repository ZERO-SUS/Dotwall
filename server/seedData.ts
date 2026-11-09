export interface SeedPixel {
  x: number;
  y: number;
  color: string;
  ownerId: string;
  ownerUsername: string;
  version: number;
  updatedAt: number;
}

export interface TaskDef {
  id: string;
  title: string;
  description: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  category: string;
  rewardPoints: number;
  gridSize: number;
  isDaily: boolean;
  palette: string[];
  referencePixels: { x: number; y: number; color: string }[];
}

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon: string;
  badgeColor: string;
  xpReward: number;
}

export const ACHIEVEMENTS_CATALOG: AchievementDef[] = [
  {
    id: 'first_dot',
    title: 'First Dot Energy',
    description: 'Place your very first permanent pixel on the 1,000,000-pixel global wall.',
    icon: '✨',
    badgeColor: '#6B3DFF',
    xpReward: 25,
  },
  {
    id: 'pixel_modifier',
    title: 'Layer Modifier',
    description: 'Modify upon an existing pixel on the global wall with a new color.',
    icon: '🎨',
    badgeColor: '#D8FF4A',
    xpReward: 35,
  },
  {
    id: 'pixel_ten',
    title: 'Pixel Architect',
    description: 'Contribute 10+ pixels to the shared global canvas.',
    icon: '🧱',
    badgeColor: '#5CF2B2',
    xpReward: 75,
  },
  {
    id: 'pixel_fifty',
    title: 'Wall Legend',
    description: 'Place 50+ pixels on the global Dotwall.',
    icon: '👑',
    badgeColor: '#FFD93B',
    xpReward: 250,
  },
  {
    id: 'task_rookie',
    title: 'Object 1/5 Cleared',
    description: 'Complete your first random object in the Daily 5-Task Gauntlet.',
    icon: '🎯',
    badgeColor: '#FF84CB',
    xpReward: 60,
  },
  {
    id: 'daily_five_sweep',
    title: 'Daily 5/5 Sweep',
    description: 'Complete all 5 sequential random object tasks in a single day!',
    icon: '🔥',
    badgeColor: '#FF8A3C',
    xpReward: 250,
  },
  {
    id: 'community_voice',
    title: 'Vibe Check Passed',
    description: 'Post a comment or reply in the Dotwall community.',
    icon: '💬',
    badgeColor: '#6FD6FF',
    xpReward: 30,
  },
  {
    id: 'art_critic',
    title: 'Hype Curator',
    description: 'Like 5 community artworks in Explore.',
    icon: '💜',
    badgeColor: '#E0229B',
    xpReward: 40,
  },
];

function parseAsciiSprite(
  lines: string[],
  colorMap: Record<string, string>,
  offsetX = 0,
  offsetY = 0
): { x: number; y: number; color: string }[] {
  const out: { x: number; y: number; color: string }[] = [];
  for (let y = 0; y < lines.length; y++) {
    const row = lines[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch !== '.' && ch !== ' ' && colorMap[ch]) {
        out.push({ x: offsetX + x, y: offsetY + y, color: colorMap[ch] });
      }
    }
  }
  return out;
}

// 15 Curated Random Objects for the 1-by-1 5-Task Daily Gauntlet
export const INITIAL_TASKS: TaskDef[] = [
  {
    id: 'task-apple',
    title: 'Glossy Pixel Apple',
    description: 'Draw a crisp 16×16 red apple with a fresh emerald leaf and white shine pixel.',
    difficulty: 'Easy',
    category: 'Everyday Objects',
    rewardPoints: 60,
    gridSize: 16,
    isDaily: true,
    palette: ['#E53935', '#FF6F60', '#8E0000', '#5CF2B2', '#0E9F68', '#6D4C41', '#FFFFFF'],
    referencePixels: parseAsciiSprite(
      [
        '.......BB.......',
        '......B..GG.....',
        '.......BGGG.....',
        '....RRRRRRRR....',
        '...RRRRRRRRRR...',
        '..RRWWRRRRRRRR..',
        '..RRWRRRRRRRRR..',
        '..RRRRRRRRRRRR..',
        '..RRRRRRRRRRRR..',
        '..RRRRRRRRRRRR..',
        '...RRRRRRRRDD...',
        '...RRRRRRRRDD...',
        '....RRRRDDDD....',
        '.....RR..DD.....',
        '................',
        '................',
      ],
      { B: '#6D4C41', G: '#0E9F68', R: '#E53935', W: '#FFFFFF', D: '#8E0000' }
    ),
  },
  {
    id: 'task-mushroom',
    title: 'Neon Power Mushroom',
    description: 'Draw a spotted arcade toadstool mushroom with a glowing cap.',
    difficulty: 'Easy',
    category: 'Everyday Objects',
    rewardPoints: 65,
    gridSize: 16,
    isDaily: true,
    palette: ['#E53935', '#FFFFFF', '#FFD93B', '#16151D', '#FF84CB'],
    referencePixels: parseAsciiSprite(
      [
        '.....RRRRRR.....',
        '...RRRRWWWRRR...',
        '..RRRRWWWWWRRR..',
        '.RRWWRRRRRRRWWR.',
        '.RWWWRRRRRRRWWWR',
        '.RRRRRRRRRRRRRRR',
        '..RRRRRRRRRRRRR.',
        '....YYYYYYYY....',
        '....YYKKKKYY....',
        '....YYKKKKYY....',
        '....YYYYYYYY....',
        '.....YYYYYY.....',
        '................',
        '................',
        '................',
        '................',
      ],
      { R: '#E53935', W: '#FFFFFF', Y: '#FFD93B', K: '#16151D' }
    ),
  },
  {
    id: 'task-gamepad',
    title: 'Retro Arcade Controller',
    description: 'Draw a handheld game controller with a D-pad and neon action buttons.',
    difficulty: 'Medium',
    category: 'Gaming & Tech',
    rewardPoints: 85,
    gridSize: 16,
    isDaily: true,
    palette: ['#6B3DFF', '#16151D', '#D8FF4A', '#FF84CB', '#6FD6FF', '#FFFFFF'],
    referencePixels: parseAsciiSprite(
      [
        '................',
        '................',
        '................',
        '...VVVVVVVVVV...',
        '..VVVVVVVVVVVV..',
        '.VVVKKVVVVPPVVV.',
        '.VVKKKKVVGGPPVV.',
        '.VVVKKVVVVGGVVV.',
        '.VVVVVVVVVVVVVV.',
        '..VVVV....VVVV..',
        '..VVV......VVV..',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { V: '#6B3DFF', K: '#D8FF4A', P: '#FF84CB', G: '#6FD6FF' }
    ),
  },
  {
    id: 'task-pizza',
    title: 'Hot Pepperoni Pizza Slice',
    description: 'Draw a cheesy triangular pizza slice with crispy crust and pepperoni dots.',
    difficulty: 'Easy',
    category: 'Food & Drink',
    rewardPoints: 70,
    gridSize: 16,
    isDaily: true,
    palette: ['#FFD93B', '#FF8A3C', '#E53935', '#6D4C41', '#5CF2B2'],
    referencePixels: parseAsciiSprite(
      [
        '................',
        '..CCCCCCCCCCCC..',
        '..OOOOOOOOOOOO..',
        '...YYYYYYYYYY...',
        '...YYRRYYYYYY...',
        '....YYYYYYRR....',
        '....YYRRYYYY....',
        '.....YYYYYY.....',
        '.....YYRRYY.....',
        '......YYYY......',
        '......YYYY......',
        '.......YY.......',
        '.......YY.......',
        '................',
        '................',
        '................',
      ],
      { C: '#6D4C41', O: '#FF8A3C', Y: '#FFD93B', R: '#E53935' }
    ),
  },
  {
    id: 'task-boba',
    title: 'Taro Boba Milk Tea',
    description: 'Draw a Gen-Z bubble tea cup with tapioca pearls and a striped straw.',
    difficulty: 'Medium',
    category: 'Food & Drink',
    rewardPoints: 80,
    gridSize: 16,
    isDaily: true,
    palette: ['#A08BFF', '#6B3DFF', '#16151D', '#FF84CB', '#FFFFFF', '#6FD6FF'],
    referencePixels: parseAsciiSprite(
      [
        '........PP......',
        '........PP......',
        '........PP......',
        '....WWWWWWWW....',
        '...LLLLLLLLLL...',
        '....VVVVVVVV....',
        '....VVVVVVVV....',
        '....VVVVVVVV....',
        '....VVVVVVVV....',
        '....VKVVVKVV....',
        '....KVKVKVKV....',
        '.....KKKKKK.....',
        '................',
        '................',
        '................',
        '................',
      ],
      { P: '#FF84CB', W: '#FFFFFF', L: '#6FD6FF', V: '#A08BFF', K: '#16151D' }
    ),
  },
  {
    id: 'task-house',
    title: 'Cozy Pixel Cottage',
    description: 'Build a warm neighborhood house with a pitched roof, chimney, and glowing window.',
    difficulty: 'Easy',
    category: 'Architecture',
    rewardPoints: 70,
    gridSize: 16,
    isDaily: false,
    palette: ['#FF8A3C', '#E53935', '#FFD93B', '#F5F4F9', '#6B3DFF', '#6D4C41', '#5CF2B2'],
    referencePixels: parseAsciiSprite(
      [
        '...........CC...',
        '.......RRRRCC...',
        '......RRRRRR....',
        '.....RRRRRRRR...',
        '....RRRRRRRRRR..',
        '...RRRRRRRRRRRR.',
        '..RRRRRRRRRRRRRR',
        '...WWWWWWWWWWWW.',
        '...WWYYWWWWBBWW.',
        '...WWYYWWWWBBWW.',
        '...WWWWWWWWWWWW.',
        '...WWWWDDDDWWWW.',
        '...WWWWDDDDWWWW.',
        '...WWWWDDDDWWWW.',
        '..GGGGGGGGGGGGGG',
        '................',
      ],
      { R: '#E53935', C: '#6D4C41', W: '#F5F4F9', Y: '#FFD93B', B: '#6FD6FF', D: '#6B3DFF', G: '#5CF2B2' }
    ),
  },
  {
    id: 'task-tree',
    title: 'Emerald Forest Tree',
    description: 'Design a lush layered canopy tree with a sturdy trunk and sunlit foliage.',
    difficulty: 'Easy',
    category: 'Nature',
    rewardPoints: 65,
    gridSize: 16,
    isDaily: false,
    palette: ['#0E9F68', '#5CF2B2', '#D8FF4A', '#6D4C41'],
    referencePixels: parseAsciiSprite(
      [
        '......GGGG......',
        '....GGGGGGGG....',
        '...GLLGGGGGGG...',
        '..GLLGGGGGGGGG..',
        '..GGGGGGGGGGGG..',
        '...GGGGGGGGGG...',
        '..GGGGGGGGGGGG..',
        '.GLLGGGGGGGGGGG.',
        '.GGGGGGGGGGGGGG.',
        '..GGGGGGGGGGGG..',
        '....TTTTTTTT....',
        '......TTTT......',
        '......TTTT......',
        '......TTTT......',
        '....TTTTTTTT....',
        '................',
      ],
      { G: '#0E9F68', L: '#5CF2B2', T: '#6D4C41' }
    ),
  },
  {
    id: 'task-cat',
    title: 'Cyber Neon Cat',
    description: 'Sketch an iconic pixel kitten with pointy ears, bright whiskers, and glowing eyes.',
    difficulty: 'Medium',
    category: 'Characters',
    rewardPoints: 90,
    gridSize: 16,
    isDaily: false,
    palette: ['#16151D', '#6B3DFF', '#FF84CB', '#D8FF4A', '#FFFFFF'],
    referencePixels: parseAsciiSprite(
      [
        '................',
        '...KK......KK...',
        '...KPK....KPK...',
        '...KKKKKKKKKK...',
        '..KKKKKKKKKKKK..',
        '..KKGGKKKKGGKK..',
        '..KKGGKKKKGGKK..',
        '..KKKKKPPKKKKK..',
        '...KKKKKKKKKK...',
        '....KKKKKKKK....',
        '...KKKKKKKKKK..T',
        '...KKKKKKKKKK.TT',
        '...KKKKKKKKKKTT.',
        '...KK..KK..KK...',
        '................',
        '................',
      ],
      { K: '#6B3DFF', P: '#FF84CB', G: '#D8FF4A', T: '#6B3DFF' }
    ),
  },
  {
    id: 'task-rocket',
    title: 'Orbital Launch Rocket',
    description: 'Launch an interstellar pixel rocket with crimson fins and a blazing thruster plume.',
    difficulty: 'Medium',
    category: 'Sci-Fi',
    rewardPoints: 100,
    gridSize: 16,
    isDaily: false,
    palette: ['#FFFFFF', '#E53935', '#6FD6FF', '#FFD93B', '#FF8A3C', '#6B6980'],
    referencePixels: parseAsciiSprite(
      [
        '.......RR.......',
        '......RRRR......',
        '.....WWWWWW.....',
        '.....WWWWWW.....',
        '....WWBBBBWW....',
        '....WWBBBBWW....',
        '....WWWWWWWW....',
        '...RWWWWWWWWR...',
        '..RRWWWWWWWWRR..',
        '..RRWWWWWWWWRR..',
        '..RRRWWWWWWWRRR.',
        '.....DDDDDD.....',
        '.....FOYYOF.....',
        '......FYYF......',
        '.......FF.......',
        '................',
      ],
      { R: '#E53935', W: '#FFFFFF', B: '#6FD6FF', D: '#6B6980', F: '#FF8A3C', O: '#E53935', Y: '#FFD93B' }
    ),
  },
  {
    id: 'task-car',
    title: 'Retro Synthwave Car',
    description: 'Draw a sleek side-profile pixel sports car with alloy wheels and neon headlights.',
    difficulty: 'Medium',
    category: 'Vehicles',
    rewardPoints: 85,
    gridSize: 16,
    isDaily: false,
    palette: ['#E0229B', '#FF84CB', '#6FD6FF', '#16151D', '#FFD93B', '#FFFFFF'],
    referencePixels: parseAsciiSprite(
      [
        '................',
        '................',
        '................',
        '................',
        '.....PPPPPPP....',
        '....PPBBBBBBP...',
        '...PPPBBBBBBPP..',
        '.PPPPPPPPPPPPPP.',
        '.PPPPPPPPPPPPPY.',
        '.PPPPPPPPPPPPPP.',
        '..KKKK....KKKK..',
        '..KWWK....KWWK..',
        '..KKKK....KKKK..',
        '................',
        '................',
        '................',
      ],
      { P: '#E0229B', B: '#6FD6FF', Y: '#FFD93B', K: '#16151D', W: '#FFFFFF' }
    ),
  },
  {
    id: 'task-flower',
    title: 'Sunburst Pixel Flower',
    description: 'Brighten the wall with a vibrant blooming flower, golden center, and emerald stem.',
    difficulty: 'Easy',
    category: 'Nature',
    rewardPoints: 60,
    gridSize: 16,
    isDaily: false,
    palette: ['#FF84CB', '#E0229B', '#FFD93B', '#0E9F68', '#5CF2B2'],
    referencePixels: parseAsciiSprite(
      [
        '......PPPP......',
        '....PPPPPPPP....',
        '...PPPYYYYPPP...',
        '..PPPPYYYYPPPP..',
        '..PPPYYYYYYPPP..',
        '..PPPPYYYYPPPP..',
        '...PPPYYYYPPP...',
        '....PPPPPPPP....',
        '......PPPP......',
        '.......GG.......',
        '....LL.GG.......',
        '.....LLGG.LL....',
        '.......GGLL.....',
        '.......GG.......',
        '.......GG.......',
        '................',
      ],
      { P: '#FF84CB', Y: '#FFD93B', G: '#0E9F68', L: '#5CF2B2' }
    ),
  },
  {
    id: 'task-spaceship',
    title: 'Arcade UFO Spaceship',
    description: 'Create a classic arcade flying saucer with a glass cockpit dome and tractor beam.',
    difficulty: 'Hard',
    category: 'Sci-Fi',
    rewardPoints: 120,
    gridSize: 16,
    isDaily: false,
    palette: ['#6FD6FF', '#6B3DFF', '#D8FF4A', '#FF84CB', '#5CF2B2'],
    referencePixels: parseAsciiSprite(
      [
        '................',
        '................',
        '......BBBB......',
        '....BBBBBBBB....',
        '....BBBBBBBB....',
        '..VVVVVVVVVVVV..',
        '.VVYYVVYYVVYYVV.',
        '.VVVVVVVVVVVVVV.',
        '...PPPPPPPPPP...',
        '.....L....L.....',
        '....L......L....',
        '...L........L...',
        '................',
        '................',
        '................',
        '................',
      ],
      { B: '#6FD6FF', V: '#6B3DFF', Y: '#D8FF4A', P: '#FF84CB', L: '#5CF2B2' }
    ),
  },
  {
    id: 'task-computer',
    title: 'Vintage CRT Computer',
    description: 'Pay homage to retro computing with a monitor, green terminal screen, and keyboard.',
    difficulty: 'Medium',
    category: 'Gaming & Tech',
    rewardPoints: 95,
    gridSize: 16,
    isDaily: false,
    palette: ['#ECEAF3', '#9A98AE', '#16151D', '#5CF2B2', '#6B3DFF'],
    referencePixels: parseAsciiSprite(
      [
        '................',
        '..CCCCCCCCCCCC..',
        '..CKKKKKKKKKKC..',
        '..CKGGGKKKKKKC..',
        '..CKKKKKGGGGKC..',
        '..CKGGKKKKKKKC..',
        '..CKKKKKKKKKKC..',
        '..CCCCCCCCCCCC..',
        '.....CCCCCC.....',
        '....CCCCCCCC....',
        '..CCCCCCCCCCCC..',
        '.CCCCCCCCCCCCCC.',
        '................',
        '................',
        '................',
        '................',
      ],
      { C: '#9A98AE', K: '#16151D', G: '#5CF2B2' }
    ),
  },
  {
    id: 'task-mountain',
    title: 'Snowy Alpine Mountain',
    description: 'Draw a majestic twin-peak mountain with snow caps against a twilight sky.',
    difficulty: 'Easy',
    category: 'Nature',
    rewardPoints: 75,
    gridSize: 16,
    isDaily: true,
    palette: ['#6B3DFF', '#FFFFFF', '#6FD6FF', '#6B6980', '#16151D', '#5CF2B2'],
    referencePixels: parseAsciiSprite(
      [
        '................',
        '.......WW.......',
        '......WWWW......',
        '.....WWWWWW.....',
        '....WWSSSSWW..WW',
        '...SSSSSSSSS.WWW',
        '..SSSSSSSSSSWWWW',
        '.SSSSSSSSSSSSSSS',
        '.SSSSSSSSSSSSSSS',
        'SSSSSSSSSSSSSSSS',
        'GGGGGGGGGGGGGGGG',
        'GGGGGGGGGGGGGGGG',
        '................',
        '................',
        '................',
        '................',
      ],
      { W: '#FFFFFF', S: '#6B6980', G: '#0E9F68' }
    ),
  },
  {
    id: 'task-sun',
    title: 'Radiant Golden Sun',
    description: 'Draw a glowing sunburst with warm golden rays and a bright core.',
    difficulty: 'Easy',
    category: 'Nature',
    rewardPoints: 65,
    gridSize: 16,
    isDaily: false,
    palette: ['#FFD93B', '#FF8A3C', '#E53935', '#FFFFFF'],
    referencePixels: parseAsciiSprite(
      [
        '.......YY.......',
        '..Y....YY....Y..',
        '...Y..OOOO..Y...',
        '....OOOOOOOO....',
        '..YOOYYYYYYOOY..',
        '..OOYYYYYYYYOO..',
        'YYOOYYYYYYYYOOYY',
        'YYOOYYYYYYYYOOYY',
        '..OOYYYYYYYYOO..',
        '..YOOYYYYYYOOY..',
        '....OOOOOOOO....',
        '...Y..OOOO..Y...',
        '..Y....YY....Y..',
        '.......YY.......',
        '................',
        '................',
      ],
      { Y: '#FFD93B', O: '#FF8A3C' }
    ),
  },
  {
    id: 'task-fish',
    title: 'Tropical Coral Fish',
    description: 'Draw an ocean fish with vibrant fins, scales, and water bubbles.',
    difficulty: 'Easy',
    category: 'Nature',
    rewardPoints: 70,
    gridSize: 16,
    isDaily: false,
    palette: ['#6FD6FF', '#FF8A3C', '#FFD93B', '#16151D', '#FFFFFF'],
    referencePixels: parseAsciiSprite(
      [
        '............BB..',
        '..........BB....',
        '.....OOOOO......',
        '....OOOOOOO.....',
        '..OOOOOOOOOO..O.',
        '.OOKWOOOOOOOOOO.',
        '.OOOOYYYYOOOOOO.',
        '.OOOOYYYYOOOOOO.',
        '..OOOOOOOOOO..O.',
        '....OOOOOOO.....',
        '.....OOOOO......',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { B: '#6FD6FF', O: '#FF8A3C', Y: '#FFD93B', K: '#16151D', W: '#FFFFFF' }
    ),
  },
  {
    id: 'task-heart',
    title: 'Pixel Arcade Heart',
    description: 'Draw a classic 16-bit health heart with a specular shine and deep shadow.',
    difficulty: 'Easy',
    category: 'Everyday Objects',
    rewardPoints: 60,
    gridSize: 16,
    isDaily: false,
    palette: ['#E53935', '#FF84CB', '#8E0000', '#FFFFFF'],
    referencePixels: parseAsciiSprite(
      [
        '................',
        '................',
        '..RRRR....RRRR..',
        '.RRRRRR..RRRRRR.',
        'RRWWRRRRRRRRRRRR',
        'RRWRRRRRRRRRRRRR',
        'RRRRRRRRRRRRRRDD',
        '.RRRRRRRRRRRRDD.',
        '..RRRRRRRRRRDD..',
        '...RRRRRRRRDD...',
        '....RRRRRRDD....',
        '.....RRRRDD.....',
        '......RRDD......',
        '.......RD.......',
        '................',
        '................',
      ],
      { R: '#E53935', W: '#FFFFFF', D: '#8E0000' }
    ),
  },
  {
    id: 'task-character',
    title: '8-Bit Cyber Hero',
    description: 'Create an iconic pixel adventurer wearing a purple visor helmet and neon armor.',
    difficulty: 'Hard',
    category: 'Characters',
    rewardPoints: 130,
    gridSize: 16,
    isDaily: false,
    palette: ['#6B3DFF', '#5CF2B2', '#FFD93B', '#FF84CB', '#16151D'],
    referencePixels: parseAsciiSprite(
      [
        '....VVVVVVVV....',
        '...VVVVVVVVVV...',
        '...VVGGGGGGVV...',
        '...VVGGGGGGVV...',
        '...VVVVVVVVVV...',
        '.....YYYYYY.....',
        '...VVVVVVVVVV...',
        '..VVVPPPPPPVVV..',
        '..VV.VVVVVV.VV..',
        '.....VVVVVV.....',
        '....VVV..VVV....',
        '....VV....VV....',
        '....KK....KK....',
        '................',
        '................',
        '................',
      ],
      { V: '#6B3DFF', G: '#5CF2B2', Y: '#FFD93B', P: '#FF84CB', K: '#16151D' }
    ),
  },
];

export function createInitialDatabaseSeed() {
  const users: Record<string, any> = {};
  const pixels: Record<string, SeedPixel> = {};
  const history: any[] = [];
  const artworks: any[] = [];
  const comments: {
    id: string;
    artworkId: string | null;
    parentId: string | null;
    userId: string;
    username: string;
    avatarEmoji: string;
    avatarColor: string;
    content: string;
    likes: string[];
    reported: boolean;
    reportReason: string | null;
    hidden: boolean;
    createdAt: number;
  }[] = [];

  return {
    users,
    pixels,
    history,
    tasks: INITIAL_TASKS,
    taskSubmissions: [],
    artworks,
    comments,
  };
}

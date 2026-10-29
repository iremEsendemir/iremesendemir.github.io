export const profile = {
  name: 'Emine İrem Esendemir',
  shortName: 'E. İrem Esendemir',
  tagline: 'Computer Science senior at Bilkent University',
  intro:
    'Most recently a software engineering intern at Microsoft on the Citus team, with earlier work in NLP at ASELSAN and in computational biology at CICEKLAB.',
  location: 'Ankara, Türkiye',
  email: 'iremesendemir48@gmail.com',
  links: {
    github: 'https://github.com/iremesendemir',
    linkedin: 'https://www.linkedin.com/in/emine-irem-esendemir/',
  },
  photo: '/images/irem.jpg',
  photoAlt: 'İrem Esendemir in Hallstatt, Austria',
};

export type Sketch = 'shards' | 'waveform' | 'query-to-code' | 'impact-graph' | 'canvas' | 'schedule';

export type Experience = {
  company: string;
  role: string;
  location: string;
  period: string;
  bullets: string[];
  tags?: string[];
  images?: Img[];
  sketch?: Sketch;
};

export type Img = { src: string; full?: string; alt: string; title?: string; width?: number; height?: number };

export const experience: Experience[] = [
  {
    company: 'Microsoft',
    role: 'Software Engineering Intern, Citus',
    location: 'Istanbul',
    period: 'Jun 2026 – Aug 2026',
    bullets: [
      'Built a VS Code dashboard for inspecting and managing Azure PostgreSQL Elastic Clusters.',
      'Added shard-skew analysis to identify uneven data distribution and recommend tenant isolation or shard splitting.',
    ],
    tags: ['TypeScript', 'React', 'PostgreSQL / Citus', 'Azure'],
    sketch: 'shards',
    images: [
      { src: '/images/projects/citus-shards.jpg', full: '/images/projects/citus-shards-full.jpg', width: 1000, height: 564, title: 'Shard analysis', alt: 'Shard analysis panel showing tenant distribution across nodes and a tenant isolation recommendation with generated SQL' },
      { src: '/images/projects/citus-dashboard.jpg', full: '/images/projects/citus-dashboard-full.jpg', width: 1000, height: 568, title: 'Cluster overview', alt: 'Elastic Cluster Management dashboard showing connection endpoints and node management' },
      { src: '/images/projects/citus-tables.jpg', full: '/images/projects/citus-tables-full.jpg', width: 1000, height: 586, title: 'Table management', alt: 'Table management view listing distributed and reference tables with shard counts' },
    ],
  },
  {
    company: 'ASELSAN',
    role: 'Candidate Engineer, AI/NLP',
    location: 'Ankara',
    period: 'Feb 2026 – May 2026',
    bullets: [
      'Deployed and benchmarked Turkish ASR models (Turkish-fine-tuned Whisper variants, faster-whisper, Wav2Vec2, Qwen3-ASR, Meta MMS).',
      'Evaluated accuracy and real-time inference with WER, CER, and RTF on FLEURS and domain-specific Turkish speech recordings.',
    ],
    tags: ['Python', 'ASR', 'Benchmarking'],
    sketch: 'waveform',
  },
  {
    company: 'ASELSAN',
    role: 'NLP Intern',
    location: 'Ankara',
    period: 'Jun 2025 – Jul 2025',
    bullets: [
      'Built an AI chatbot with Flask and LangGraph that translated natural-language dataset queries into executable Python/Pandas code through an agentic RAG pipeline.',
      'Containerized and deployed the stack with PostgreSQL, GPU support, and Docker Compose.',
    ],
    tags: ['Flask', 'LangGraph', 'RAG', 'Docker'],
    sketch: 'query-to-code',
  },
  {
    company: 'Bilkent University',
    role: 'CS101 Tutor – Algorithms and Programming I',
    location: 'Ankara',
    period: 'Oct 2023 – May 2024',
    bullets: [
      'Supported students with Java lab assignments covering programming fundamentals, object-oriented programming, and introductory data structures.',
    ],
    tags: ['Java', 'Teaching'],
  },
];

export const research = {
  lab: 'CICEKLAB, Bilkent University',
  url: 'http://ciceklab.cs.bilkent.edu.tr',
  role: 'Undergraduate Researcher',
  advisor: 'Assoc. Prof. Ercüment Çiçek',
  period: 'Jan 2026 – Present',
  bullets: [
    'Developed an RNA–protein interaction prediction pipeline using RNA-FM, ESM2-650M, convolutional projections, bidirectional cross-attention, and an MLP classifier.',
    'Trained on ~3M RNA–protein pairs; evaluated generalization with cross-validation and a cluster-disjoint test set built with CD-HIT-EST and MMseqs2.',
    'Found that 56.9% of a nominally novel evaluation set (673 of 1,182 NPInter5 pairs) contained an RNA or protein cluster already represented in training data.',
  ],
  tags: ['PyTorch', 'Protein LMs', 'Bioinformatics'],
};

export type Project = {
  name: string;
  subtitle: string;
  period: string;
  description: string;
  highlights: string[];
  stack: string[];
  links?: { label: string; href: string }[];
  images?: Img[];
  featured?: boolean;
  compact?: boolean;
  icon?: 'recipe' | 'uart';
  sketch?: Sketch;
};

export const projects: Project[] = [
  {
    name: 'PRISM',
    subtitle: 'Pull Request Intelligence for Software Maintenance',
    period: '2026 – 2027 · Bilkent CS491 · In progress',
    description:
      'A pull request intelligence layer that combines deterministic change-impact analysis with repository history and AI-assisted review, so reviewers can see what changed, what may be affected, and where attention matters most.',
    highlights: [
      'Change impact made explicit: trace directly changed and potentially affected entities through a deterministic analysis layer.',
      'Risk signals from repository history: churn, bug frequency, and co-change patterns.',
      'AI review grounded in structured analysis rather than the diff alone; the final decision stays with the reviewer.',
    ],
    stack: ['Change Impact Analysis', 'Repository Mining', 'LLM Review'],
    sketch: 'impact-graph',
    links: [
      { label: 'prismdevtools.com', href: 'https://prismdevtools.com' },
    ],
    featured: true,
  },
  {
    name: 'CanvasPilot',
    subtitle: 'AI-powered visual HTML editor',
    period: 'Mar 2025 – Sep 2025 · Amazon University Engagement Program',
    description:
      'A full-stack editor that connects natural-language generation with a live canvas: generate an interface from a prompt, refine it conversationally, then edit visually or through code.',
    highlights: [
      'Prompt-based generation with conversational follow-up modifications.',
      'Live preview and split code/preview editing with an element inspector and component palette.',
      'User-scoped projects with saved versions and chat history.',
      'Containerized FastAPI backend with Docker and GitHub Actions CI/CD.',
    ],
    stack: ['React 19', 'FastAPI', 'PostgreSQL', 'OpenAI API', 'Docker'],
    sketch: 'canvas',
    links: [
      { label: 'GitHub', href: 'https://github.com/Gall-ardo/CanvasPilot' },
    ],
    images: [
      { src: '/images/projects/canvaspilot-1.jpg', full: '/images/projects/canvaspilot-1-full.jpg', width: 1000, height: 650, title: 'Prompt workspace', alt: 'CanvasPilot: a prompt on the left generates a live landing page preview on the right' },
      { src: '/images/projects/canvaspilot-2.jpg', full: '/images/projects/canvaspilot-2-full.jpg', width: 1000, height: 650, title: 'Code / preview split', alt: 'CanvasPilot visual editor with code on the left and rendered page on the right' },
    ],
  },
  {
    name: 'ProctorHub',
    subtitle: 'Web-based TA management system',
    period: 'Feb 2025 – May 2025 · 5-person team',
    description:
      'Proctor assignment and workload tracking for roughly 600 teaching assistants across four engineering departments.',
    highlights: [
      'Full SDLC deliverables: requirements analysis, UML designs, design patterns, UI mockups.',
      'Workload approval flows, proctoring schedules, leave of absence and swap requests.',
    ],
    stack: ['React', 'Node.js', 'Express', 'MySQL'],
    sketch: 'schedule',
    links: [
      { label: 'GitHub', href: 'https://github.com/Gall-ardo/ProctorHub' },
    ],
  },
  {
    name: 'Recipeasy',
    icon: 'recipe',
    subtitle: 'Android app for home cooks',
    period: 'Sep 2023 – Dec 2023',
    description:
      'An Android app with a virtual fridge, recipe recommendations, shopping lists, and weekly meal planning.',
    highlights: [],
    stack: ['Java', 'Android', 'Firebase'],
    links: [
      { label: 'GitHub', href: 'https://github.com/RuveydaBilir/Recipeasy' },
    ],
    compact: true,
  },
  {
    name: 'UART',
    icon: 'uart',
    subtitle: 'Serial communication',
    period: '',
    description: 'A serial communication project based on the UART protocol.',
    highlights: [],
    stack: [],
    links: [
      { label: 'GitHub', href: 'https://github.com/iremEsendemir/CS223/tree/main/Project' },
    ],
    compact: true,
  },
];

export type Education = {
  school: string;
  degree: string;
  period: string;
  location: string;
  facts?: { label: string; value: string }[];
  note?: string;
};

export const education: Education[] = [
  {
    school: 'Bilkent University',
    degree: 'B.S. in Computer Science',
    period: 'Sep 2022 – Jun 2027 (expected)',
    location: 'Ankara',
    facts: [
      { label: 'CGPA', value: '3.84 / 4.00' },
      { label: 'Rank', value: '12 / 257' },
      { label: 'Standing', value: 'Top 5%' },
    ],
    note: 'Full comprehensive scholarship, awarded for ranking 344th among ~3.2 million candidates in the 2022 national university entrance exam (YKS).',
  },
  {
    school: 'Kingston University',
    degree: 'Erasmus exchange, Computer Science',
    period: 'Sep 2025 – Dec 2025',
    location: 'London',
    note: 'One semester abroad through the Erasmus student exchange programme.',
  },
];

export const awards = [
  { title: 'HUPROG Algorithm Competition – 6th place', by: 'Hacettepe University ACM', year: '2026' },
  { title: 'Spring Boot Development Camp', by: 'Commencis, Istanbul · 8-week backend program', year: '2025' },
  { title: 'Algorithm Competition Summer Camp', by: 'inzva, Istanbul · competitive programming in C++', year: '2024' },
];

export const volunteering = {
  org: 'TDP – Toplumsal Duyarlılık Projeleri',
  items: [
    'GEP: educational assistance and social activities for underprivileged children in Ankara.',
    'K1L0 (Kalpler 1 Lösemi 0): supporting children with leukemia through volunteer clown activities, educational support, and awareness events.',
  ],
};

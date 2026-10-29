import { education, experience, projects, research, type Education, type Img, type Sketch } from './profile';

export type AlbumPanel = {
  kind?: 'images' | 'education';
  school?: Education;
  kicker: string;
  title: string;
  subtitle?: string;
  meta?: string;
  paragraphs?: string[];
  bullets?: string[];
  tags?: string[];
  sketch?: Sketch;
  images?: Img[];
  links?: { label: string; href: string }[];
};

export type AlbumSpread = {
  label: string;
  left: AlbumPanel;
  right: AlbumPanel;
};

const microsoft = experience[0];
const candidate = experience[1];
const intern = experience[2];
const prism = projects[0];
const canvas = projects[1];
const proctor = projects[2];

const jobPanel = (job: typeof microsoft): AlbumPanel => ({
  kicker: 'Experience / ASELSAN',
  title: job.role,
  meta: `${job.period} · ${job.location}`,
  bullets: job.bullets,
  tags: job.tags,
  sketch: job.sketch,
});

const projectSpread = (project: typeof canvas): AlbumSpread => ({
  label: project.name,
  left: {
    kind: 'images',
    kicker: 'Selected project',
    title: project.name,
    images: project.images,
  },
  right: {
    kicker: 'Project notes',
    title: project.name,
    subtitle: project.subtitle,
    meta: project.period,
    paragraphs: [project.description],
    bullets: project.highlights,
    tags: project.stack,
  },
});

export const albumSpreads: AlbumSpread[] = [
  {
    label: 'Microsoft',
    left: {
      kind: 'images',
      kicker: '01 / Experience',
      title: 'A closer look at Citus',
      images: microsoft.images,
    },
    right: {
      kicker: 'Microsoft',
      title: 'Making distributed data visible.',
      subtitle: microsoft.role,
      meta: `${microsoft.period} · ${microsoft.location}`,
      bullets: microsoft.bullets,
      tags: microsoft.tags,
    },
  },
  {
    label: 'ASELSAN',
    left: jobPanel(candidate),
    right: jobPanel(intern),
  },
  {
    label: 'Research / PRISM',
    left: {
      kicker: '02 / Research',
      title: 'RNA meets protein.',
      subtitle: research.lab,
      meta: `${research.period} · ${research.role}`,
      paragraphs: [`Advised by ${research.advisor}.`],
      bullets: research.bullets,
      tags: research.tags,
    },
    right: {
      kicker: '03 / Senior design',
      title: prism.name,
      subtitle: prism.subtitle,
      meta: prism.period,
      paragraphs: [prism.description],
      bullets: prism.highlights.slice(0, 2),
      tags: prism.stack,
      links: prism.links,
    },
  },
  projectSpread(canvas),
  projectSpread(proctor),
  {
    label: 'Education',
    left: {
      kind: 'education',
      kicker: '06 / Undergraduate degree',
      title: education[0].school,
      school: education[0],
    },
    right: {
      kind: 'education',
      kicker: 'Education / Exchange semester',
      title: education[1].school,
      school: education[1],
    },
  },
];

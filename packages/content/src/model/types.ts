export type StudyType = 'materia' | 'questoes';
export type QuestionType = 'multipla_escolha' | 'discursiva';
export type Difficulty = 'Fácil' | 'Médio' | 'Difícil';
export type SubjectStatus = 'active' | 'coming_soon';

export interface SectionRef {
  id: string;
  title: string;
}

/** Frontmatter-derived metadata of a summary chapter (`resumos/**`). */
export interface ChapterMeta {
  id: string;
  /** Path relative to the subject directory, e.g. `resumos/materia/01-intro.mdx`. */
  path: string;
  materia: string;
  title: string;
  topic: string;
  chapter: number;
  order: number;
  description: string;
  type: StudyType;
  tags: string[];
  sections: SectionRef[];
  relatedQuestions: string[];
}

export interface QuestionOption {
  label: string;
  text: string;
}

export interface QuestionImage {
  /** Image reference as written in the frontmatter (relative paths start with `./`). */
  src: string;
  caption: string;
}

/** Frontmatter-derived metadata of a question (`questoes/**`). */
export interface QuestionMeta {
  id: string;
  path: string;
  materia: string;
  title: string;
  exam: string;
  year: number;
  topic: string;
  topicSlug: string;
  tags: string[];
  difficulty: Difficulty;
  type: QuestionType;
  statement: string;
  options: QuestionOption[];
  correctOption?: string;
  expectedAnswer: string;
  images: QuestionImage[];
}

/** Subject metadata (`materia.json` plus counters derived from the files on disk). */
export interface Subject {
  slug: string;
  name: string;
  code: string;
  institution: string;
  period: string;
  description: string;
  status: SubjectStatus;
  chaptersCount: number;
  questionsCount: number;
  topics: string[];
}

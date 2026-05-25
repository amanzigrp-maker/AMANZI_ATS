CREATE TABLE IF NOT EXISTS question_papers (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  created_by INTEGER REFERENCES users(userid) ON DELETE SET NULL,
  organization_id INTEGER,
  assessment_id INTEGER REFERENCES assessments(assessment_id) ON DELETE SET NULL,
  total_questions INTEGER DEFAULT 0,
  difficulty_distribution JSONB DEFAULT '{}'::jsonb,
  tags TEXT[] DEFAULT '{}',
  subject TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  is_template BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'active',
  visibility TEXT DEFAULT 'private',
  usage_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS question_paper_questions (
  id SERIAL PRIMARY KEY,
  question_paper_id INTEGER NOT NULL REFERENCES question_papers(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  difficulty TEXT DEFAULT 'medium',
  topic TEXT,
  explanation TEXT,
  correct_option TEXT NOT NULL,
  options JSONB NOT NULL,
  difficulty_score NUMERIC(6,4) DEFAULT 0.5,
  order_index INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_question_papers_created_by ON question_papers (created_by);
CREATE INDEX IF NOT EXISTS idx_question_papers_subject ON question_papers (subject);
CREATE INDEX IF NOT EXISTS idx_question_paper_questions_paper_id ON question_paper_questions (question_paper_id);

# Semantic Search In Amanzi ATS

## Simple Summary

Semantic search means the system looks for the `meaning` of text, not just exact words.

Example:

- `React Developer`
- `Frontend Engineer`

These may use different words, but they can mean similar things. Semantic search helps the system understand that.

In this project, semantic logic is now used in interview question selection too.

## Core Idea

The system converts text into `embeddings`.

An embedding is a list of numbers that represents the meaning of a piece of text.

Then the system compares two embeddings using `cosine similarity`.

Formula:

```text
cosine similarity = 1 - cosine distance
```

In `pgvector`, this is done like this:

```sql
1 - (embedding_a <=> embedding_b)
```

Meaning:

- smaller cosine distance = closer meaning
- higher cosine similarity = better semantic match

## Where Semantic Search Is Used

### 1. Candidate To Job Matching

This was already added earlier.

What happens:

1. Candidate resume sections are embedded.
2. Job sections are embedded.
3. Similarity is calculated section by section.
4. The system gets a semantic score.
5. That score is used in recommendation and ranking.

Main files:

- [db.py](D:\AMANZI_ATS\python-worker\database\db.py)
- [enhanced_matching_service.py](D:\AMANZI_ATS\python-worker\services\enhanced_matching_service.py)

### 2. Uploaded Question Bank Interviews

This is now applied to question banks used in interviews.

When an assessment/question bank is created from:

- AI
- CSV
- PDF
- DOCX
- DOC
- TXT

the system now stores embeddings for those questions too.

What happens:

1. Questions are saved into the database.
2. Each question is converted into an embedding.
3. The embedding is stored in `question_embeddings`.
4. During the interview, the system builds a semantic query from:
   - role
   - candidate skill focus
   - target difficulty
   - recent questions already asked
5. The system searches the uploaded bank by semantic similarity.
6. It combines that with `theta/difficulty fit`.
7. The best next question is selected.

So now uploaded-bank questions are not chosen only by difficulty.

They are chosen by:

- `semantic relevance`
- plus `adaptive difficulty`

### 3. AI Generated Interview Questions

This is also now semantic.

Before:

- AI questions were mainly based on skill name and difficulty.

Now:

1. The system first gets semantic grounding.
2. If a question bank is attached, it retrieves semantically similar bank questions.
3. It also retrieves semantically relevant candidate resume/profile sections.
4. That context is sent into Gemini.
5. Gemini generates a new question based on:
   - right topic
   - candidate skill context
   - target difficulty

So AI-generated questions are now meaning-aware too.

## New Database Support

A new table is used:

```text
question_embeddings
```

It stores:

- `question_id`
- `assessment_id`
- `topic`
- `content`
- `embedding`
- `model_name`

This lets the system search questions semantically later.

Main backend DB file:

- [database.ts](D:\AMANZI_ATS\backend\src\lib\database.ts)

## Backend Flow In Easy Steps

### Step 1. Assessment Questions Are Embedded

When an assessment is created or uploaded:

1. Questions are stored.
2. The backend calls the Python worker.
3. The Python worker embeds each question.
4. The vectors are saved in `question_embeddings`.

Files:

- [assessment.controller.ts](D:\AMANZI_ATS\backend\src\controllers\assessment.controller.ts)
- [ai-worker.service.ts](D:\AMANZI_ATS\backend\src\services\ai-worker.service.ts)
- [main.py](D:\AMANZI_ATS\python-worker\main.py)

### Step 2. Semantic Search Finds The Right Bank Questions

During interview question selection:

1. The system builds a query using role, skill focus, target difficulty, and recent questions.
2. It sends that query to the Python worker.
3. The Python worker converts the query into an embedding.
4. It compares that query embedding with stored question embeddings using cosine similarity.
5. It returns the most semantically relevant bank questions.

Files:

- [interview.controller.ts](D:\AMANZI_ATS\backend\src\controllers\interview.controller.ts)
- [main.py](D:\AMANZI_ATS\python-worker\main.py)
- [db.py](D:\AMANZI_ATS\python-worker\database\db.py)

### Step 3. Theta Chooses The Right Depth

After semantic retrieval finds the right topic area, the interview logic still uses `theta` to decide how hard the next question should be.

So the final logic becomes:

- semantic search finds the `right topic`
- theta finds the `right difficulty`

This is exactly the idea shown in your architecture diagram.

## How Each Interview Mode Works

### Doc Only

The question comes from the uploaded bank.

The system:

1. semantically searches the bank
2. finds the most relevant question
3. uses difficulty/theta to choose the best one

### Bank + Skills

This is stronger than plain bank mode.

The system:

1. uses uploaded bank questions as the source
2. uses parsed candidate skills/resume context to guide relevance
3. runs semantic search to find the right topic/question
4. uses theta to keep difficulty adaptive

So it becomes:

- bank-based
- skill-aware
- semantic
- adaptive

## How AI Questions Use Semantic Grounding

When AI question generation is used in the flow:

1. semantically similar bank questions are retrieved if available
2. semantically relevant candidate resume/profile sections are retrieved
3. those are passed to Gemini as grounding
4. Gemini creates a new question aligned to the same meaning/topic

This means generated questions are no longer just random prompts around a skill name.

They are guided by semantic context from your actual ATS data.

## Important Files

### Backend

- [interview.controller.ts](D:\AMANZI_ATS\backend\src\controllers\interview.controller.ts)
- [assessment.controller.ts](D:\AMANZI_ATS\backend\src\controllers\assessment.controller.ts)
- [ai-interview.service.ts](D:\AMANZI_ATS\backend\src\services\ai-interview.service.ts)
- [ai-worker.service.ts](D:\AMANZI_ATS\backend\src\services\ai-worker.service.ts)
- [database.ts](D:\AMANZI_ATS\backend\src\lib\database.ts)

### Python Worker

- [main.py](D:\AMANZI_ATS\python-worker\main.py)
- [db.py](D:\AMANZI_ATS\python-worker\database\db.py)

## Why This Is Better

Before:

- question bank selection was mostly difficulty-based
- AI question generation was mostly prompt-based

Now:

- uploaded questions are selected by meaning
- AI-generated questions are grounded by meaning
- candidate skills/resume help guide relevance
- theta still keeps the interview adaptive

So the system now asks:

- the `right topic`
- at the `right depth`

## Final One-Line Summary

Semantic search in this project now helps the interview engine choose or generate questions based on `meaning`, while `theta` still controls `difficulty`.
